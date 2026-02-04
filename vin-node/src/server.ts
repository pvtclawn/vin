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

import { createReceipt, verifyReceipt } from './receipt';
import { loadOrGenerateKeys, type NodeKeys } from './keys';
import type { ActionRequestV0, OutputV0, GenerateResponse, VerifyRequest, VerifyResponse } from './types';
import { hasValidPayment, build402Response } from './x402';
import { getAttestation } from './tee';
import { getTeeEncryptionKeys, decrypt, encrypt, parsePublicKey, encodePublicKey } from './crypto';
import { callLLM, type LLMRequest } from './llm-proxy';
import { deriveKey } from './tee';

// Node configuration
const PORT = process.env.VIN_PORT ?? 3402;
const NODE_KEYS: NodeKeys = loadOrGenerateKeys();

// Initialize encryption keys (try TEE first)
const teeSeed = await deriveKey('vin-encryption-v1');
const ENC_KEYS = await getTeeEncryptionKeys(teeSeed);

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
        return build402Response(path);
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
        
        if (body.encrypted_payload && body.ephemeral_pubkey && body.nonce && body.user_pubkey) {
          // Confidential proxy mode (ECIES)
          isConfidential = true;
          userPubkey = parsePublicKey(body.user_pubkey);
          
          const decrypted = decrypt(
            body.encrypted_payload,
            body.ephemeral_pubkey,
            body.nonce,
            userPubkey,
            encKeys.secretKey
          );
          
          llmRequest = JSON.parse(decrypted) as LLMRequest;
          console.log('[proxy] Confidential mode - calling', llmRequest.provider_url);
        } else if (body.request) {
          // Legacy mode (for testing without encryption)
          console.warn('[proxy] Legacy mode - no encryption');
          llmRequest = {
            provider_url: process.env.VIN_LLM_URL || 'https://api.anthropic.com/v1/messages',
            api_key: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-haiku-20240307',
            messages: [{ role: 'user', content: body.request.prompt }],
          };
        } else {
          return Response.json({ error: 'Missing encrypted_payload or request' }, { status: 400, headers });
        }
        
        // Call LLM
        const llmResponse = await callLLM(llmRequest);
        
        // Create output
        const output: OutputV0 = {
          schema: 'vin.output.v0',
          format: 'plain',
          text: llmResponse.text,
          clean_text: llmResponse.text,
        };
        
        // Build request object for receipt
        const actionRequest: ActionRequestV0 = {
          schema: 'vin.action_request.v0',
          policy_id: isConfidential ? 'P2_CONFIDENTIAL_PROXY_V1' : 'P0_COMPOSE_POST_V1',
          action_type: isConfidential ? 'confidential_llm_call' : 'compose_post',
          prompt: isConfidential ? '[encrypted]' : (body.request?.prompt || ''),
          context: {},
        };
        
        // Create receipt
        const receipt = createReceipt(actionRequest, output, NODE_KEYS);
        
        // Prepare response
        let responsePayload: GenerateResponse;
        
        if (isConfidential && userPubkey) {
          // Encrypt response for user
          const encrypted = encrypt(
            { text: llmResponse.text, usage: llmResponse.usage },
            userPubkey,
            encKeys.secretKey
          );
          
          responsePayload = {
            encrypted_response: encrypted.ciphertext,
            response_nonce: encrypted.nonce,
            receipt,
          } as GenerateResponse;
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
        const result = verifyReceipt(body.receipt, body.output);
        
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
