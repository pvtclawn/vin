/**
 * VIN Node - HTTP Server (Confidential Proxy)
 * 
 * Endpoints:
 * - GET /health
 * - GET /v1/tee-pubkey (TEE encryption pubkey + attestation)
 * - GET /v1/policies
 * - GET /v1/attestation
 * - POST /v1/generate (confidential proxy - encrypted payload)
 * - POST /v1/verify
 */

import { z } from 'zod';
import { createReceipt, verifyReceipt } from './services/receipt';
import { loadOrGenerateKeys, type NodeKeys } from './services/keys';
import type { ActionRequestV0, OutputV0, GenerateResponse, VerifyRequest, VerifyResponse } from './types/index';
import { hasValidPayment, build402Response } from './services/x402';
import { getAttestation, deriveKey } from './services/tee';
import { getTeeEncryptionKeys, decrypt, encrypt, parsePublicKey, encodePublicKey, hashForCommitment } from './services/crypto';
import { callLLM, type LLMRequest } from './services/llm-proxy';
import { rateLimiter, RateLimiter } from './services/rate-limit';
import { PORT, LLM_URL, ANTHROPIC_API_KEY, LLM_MODEL } from './config';

// Node configuration
const NODE_KEYS: NodeKeys = loadOrGenerateKeys();

// Initialize encryption keys (try TEE first)
const teeSeed = await deriveKey('vin-encryption-v1');
const ENC_KEYS = await getTeeEncryptionKeys(teeSeed);

// Encrypted payload nonce cache (prevents replay attacks)
// Map of nonce -> expiry timestamp
const encryptedNonces = new Map<string, number>();
const NONCE_EXPIRY_MS = 600_000; // 10 minutes

// Strict schema for LLM request (P1 Fix: Post-decryption validation)
const LLMRequestSchema = z.object({
  provider_url: z.string().url(),
  api_key: z.string().min(1, 'api_key is required'),
  model: z.string().min(1, 'model is required'),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(1_000_000), // Prevent memory abuse
  })).min(1, 'messages must have at least one entry').max(100),
  max_tokens: z.number().int().positive().max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  headers: z.record(z.string()).optional(),
}).strict();

function checkAndCacheNonce(nonce: string): boolean {
  // Clean expired nonces
  const now = Date.now();
  for (const [key, expiry] of encryptedNonces) {
    if (expiry < now) encryptedNonces.delete(key);
  }
  
  // Check if nonce was seen
  if (encryptedNonces.has(nonce)) {
    return false; // Replay detected
  }
  
  // Cache the nonce
  encryptedNonces.set(nonce, now + NONCE_EXPIRY_MS);
  return true;
}

console.log('🔑 Node signing pubkey:', Buffer.from(NODE_KEYS.publicKey).toString('base64url').slice(0, 16) + '...');
console.log('🔐 Encryption pubkey:', encodePublicKey(ENC_KEYS.publicKey).slice(0, 16) + '...');

// Supported policies
const POLICIES = [
  { policy_id: 'P0_COMPOSE_POST_V1', action_type: 'compose_post' },
  { policy_id: 'P1_CHALLENGE_RESP_V1', action_type: 'challenge_response' },
  { policy_id: 'P2_CONFIDENTIAL_PROXY_V1', action_type: 'confidential_llm_call' },
];

const server = Bun.serve({
  port: PORT,
  
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Payment',
    };
    
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    
    // Rate limiting (skip for health checks)
    if (path !== '/health') {
      const clientKey = RateLimiter.getKey(req);
      if (!rateLimiter.check(clientKey)) {
        return Response.json({
          error: 'rate_limited',
          message: 'Too many requests. Please slow down.',
          retry_after_ms: 1000,
        }, { 
          status: 429, 
          headers: { ...headers, 'Retry-After': '1' } 
        });
      }
    }
    
    // Health check
    if (path === '/health' && req.method === 'GET') {
      const encKeys = ENC_KEYS;
      return Response.json({
        ok: true,
        node_pubkey: Buffer.from(NODE_KEYS.publicKey).toString('base64url'),
        encryption_pubkey: encodePublicKey(encKeys.publicKey),
        version: '0.2',
        x402: true,
        confidential_proxy: true,
      }, { headers });
    }
    
    // TEE pubkey for encryption
    if (path === '/v1/tee-pubkey' && req.method === 'GET') {
      const encKeys = ENC_KEYS;
      const attestation = await getAttestation('vin-encryption-pubkey', encodePublicKey(encKeys.publicKey));
      
      return Response.json({
        encryption_pubkey: encodePublicKey(encKeys.publicKey),
        signing_pubkey: Buffer.from(NODE_KEYS.publicKey).toString('base64url'),
        attestation,
      }, { headers });
    }
    
    // List policies
    if (path === '/v1/policies' && req.method === 'GET') {
      return Response.json({ policies: POLICIES }, { headers });
    }
    
    // Attestation
    if (path === '/v1/attestation' && req.method === 'GET') {
      const nodePubkey = Buffer.from(NODE_KEYS.publicKey).toString('base64url');
      const attestation = await getAttestation('vin-node-attestation', nodePubkey);
      return Response.json(attestation, { headers });
    }
    
    // Generate (confidential proxy)
    if (path === '/v1/generate' && req.method === 'POST') {
      // Check payment
      if (!hasValidPayment(req)) {
        return build402Response(path, req.url);
      }
      
      try {
        const body = await req.json() as {
          // New confidential mode (ECIES)
          encrypted_payload?: string;
          ephemeral_pubkey?: string;
          nonce?: string;
          user_pubkey?: string;
          // Legacy mode (for testing)
          request?: ActionRequestV0;
        };
        
        const encKeys = ENC_KEYS;
        let llmRequest: LLMRequest;
        let userPubkey: Uint8Array | null = null;
        let isConfidential = false;
        let inputsCommitment: string | null = null;  // For verifiable receipts
        
        if (body.encrypted_payload && body.ephemeral_pubkey && body.nonce && body.user_pubkey) {
          // Confidential proxy mode (ECIES)
          isConfidential = true;
          
          // P0 FIX: Check nonce for replay protection
          if (!checkAndCacheNonce(body.nonce)) {
            return Response.json({ error: 'replay_detected', message: 'Nonce already used' }, { status: 400, headers });
          }
          
          userPubkey = parsePublicKey(body.user_pubkey);
          
          const decrypted = decrypt(
            body.encrypted_payload,
            body.ephemeral_pubkey,
            body.nonce,
            encKeys.secretKey
          );
          
          // P1 FIX: Post-decryption validation with Zod
          let rawRequest: unknown;
          try {
            rawRequest = JSON.parse(decrypted);
          } catch {
            return Response.json({ error: 'invalid_payload', message: 'Decrypted payload is not valid JSON' }, { status: 400, headers });
          }
          
          const parseResult = LLMRequestSchema.safeParse(rawRequest);
          if (!parseResult.success) {
            console.warn('[proxy] Validation failed:', parseResult.error.format());
            return Response.json({
              error: 'invalid_payload',
              message: 'Payload validation failed',
              details: parseResult.error.flatten(),
            }, { status: 400, headers });
          }
          
          llmRequest = parseResult.data;
          
          // Create verifiable commitment: hash of the decrypted request
          // User can independently compute this to verify receipt
          inputsCommitment = hashForCommitment({
            provider_url: llmRequest.provider_url,
            model: llmRequest.model,
            messages: llmRequest.messages,
            // Note: api_key intentionally excluded from commitment for privacy
          });
          
          console.log('[proxy] Confidential mode - calling', llmRequest.provider_url);
        } else if (body.request) {
          // Legacy mode - DISABLED in production
          // This mode uses server-side API keys which contradicts the "zero secrets" model
          if (process.env.VIN_ALLOW_LEGACY !== '1') {
            return Response.json({ 
              error: 'legacy_mode_disabled', 
              message: 'Legacy mode is disabled. Use encrypted_payload for confidential requests.' 
            }, { status: 400, headers });
          }
          console.warn('[proxy] ⚠️ Legacy mode enabled - using server-side API key');
          llmRequest = {
            provider_url: LLM_URL,
            api_key: ANTHROPIC_API_KEY || '',
            model: LLM_MODEL,
            messages: [{ role: 'user', content: body.request.prompt || '' }],
          };
        } else {
          return Response.json({ error: 'Missing encrypted_payload or request' }, { status: 400, headers });
        }
        
        // Call LLM (Validation/SSRF/Timeouts happen inside)
        const llmResponse = await callLLM(llmRequest);
        
        // Create output
        const output: OutputV0 = {
          schema: 'vin.output.v0',
          format: 'plain',
          text: llmResponse.text,
          clean_text: llmResponse.text,
        };
        
        // Build request object for receipt
        // In confidential mode, use the commitment hash instead of '[encrypted]'
        const actionRequest: ActionRequestV0 = {
          schema: 'vin.action_request.v0',
          policy_id: isConfidential ? 'P2_CONFIDENTIAL_PROXY_V1' : 'P0_COMPOSE_POST_V1',
          action_type: isConfidential ? 'confidential_llm_call' : 'compose_post',
          // For confidential: include commitment hash (user can verify)
          // For non-confidential: include actual prompt
          prompt: isConfidential ? `[commitment:${inputsCommitment}]` : (body.request?.prompt || ''),
        };
        
        // Create receipt
        const receipt = createReceipt(actionRequest, output, NODE_KEYS);
        
        // Prepare response
        let responsePayload: GenerateResponse;
        
        if (isConfidential && userPubkey) {
          // Encrypt response for user
          // Include request nonce to bind response to specific request
          const encrypted = encrypt(
            { 
              text: llmResponse.text, 
              usage: llmResponse.usage,
              request_nonce: body.nonce,  // Bind response to request
            },
            userPubkey
          );
          
          responsePayload = {
            encrypted_response: encrypted.ciphertext,
            response_ephemeral_pubkey: encrypted.ephemeralPubkey,
            response_nonce: encrypted.nonce,
            receipt,
          };
        } else {
          responsePayload = { output, receipt };
        }
        
        return Response.json(responsePayload, { headers });
        
      } catch (error) {
        console.error('[generate] Error:', error);
        return Response.json({
          error: 'generation_failed',
          message: (error as Error).message,
        }, { status: 500, headers });
      }
    }
    
    // Verify receipt
    if (path === '/v1/verify' && req.method === 'POST') {
      try {
        const body = await req.json() as VerifyRequest;
        const result = verifyReceipt(body.request ?? {} as ActionRequestV0, body.output, body.receipt);
        
        const response: VerifyResponse = {
          valid: result.valid,
          checks: result.checks,
          error: result.error,
        };
        
        return Response.json(response, { headers });
      } catch (error) {
        return Response.json({
          valid: false,
          error: (error as Error).message,
        }, { status: 400, headers });
      }
    }
    
    return Response.json({ error: 'Not found' }, { status: 404, headers });
  },
});

console.log(`🚀 VIN Node (Confidential Proxy) running on http://localhost:${PORT}`);
