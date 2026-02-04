/**
 * VIN Node - HTTP Server
 * 
 * Endpoints:
 * - GET /health
 * - GET /v1/policies
 * - GET /v1/attestation
 * - POST /v1/generate (x402 gated)
 * - POST /v1/verify
 */

import { createReceipt, verifyReceipt } from './receipt';
import { loadOrGenerateKeys, type NodeKeys } from './keys';
import type { ActionRequestV0, OutputV0, GenerateResponse, VerifyRequest, VerifyResponse } from './types';
import { hasValidPayment, build402Response } from './x402';
import { createProvider, type LLMProvider } from './llm';
import { getAttestation } from './tee';

// Node configuration
const PORT = process.env.VIN_PORT ?? 3402;
const NODE_KEYS: NodeKeys = loadOrGenerateKeys();
const LLM_PROVIDER: LLMProvider = createProvider();

console.log('🔑 Node pubkey:', Buffer.from(NODE_KEYS.publicKey).toString('base64url').slice(0, 16) + '...');
console.log('🤖 LLM provider:', process.env.VIN_LLM_PROVIDER || 'echo');

// Supported policies
const POLICIES = [
  { policy_id: 'P0_COMPOSE_POST_V1', action_type: 'compose_post' },
  { policy_id: 'P1_CHALLENGE_RESP_V1', action_type: 'challenge_response' },
];

// Generate output using configured LLM provider
async function generateOutput(request: ActionRequestV0): Promise<OutputV0> {
  const response = await LLM_PROVIDER.generate(request);
  return {
    schema: 'vin.output.v0',
    format: 'plain',
    text: response.text,
    clean_text: response.text,
  };
}

const server = Bun.serve({
  port: PORT,
  
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };
    
    // Health check
    if (path === '/health' && req.method === 'GET') {
      return Response.json({
        ok: true,
        node_pubkey: Buffer.from(NODE_KEYS.publicKey).toString('base64url'),
        version: '0.1',
        x402: true,
      }, { headers });
    }
    
    // List policies
    if (path === '/v1/policies' && req.method === 'GET') {
      return Response.json({ policies: POLICIES }, { headers });
    }
    
    // Attestation (real TEE when available)
    if (path === '/v1/attestation' && req.method === 'GET') {
      const nodePubkey = Buffer.from(NODE_KEYS.publicKey).toString('base64url');
      const attestation = await getAttestation('vin-node-attestation', nodePubkey);
      return Response.json(attestation, { headers });
    }
    
    // Generate (x402 gated)
    if (path === '/v1/generate' && req.method === 'POST') {
      // Check payment
      if (!hasValidPayment(req)) {
        return build402Response(path);
      }
      
      try {
        const request = await req.json() as ActionRequestV0;
        
        // Validate schema
        if (request.schema !== 'vin.action_request.v0') {
          return Response.json({ error: 'invalid_request', message: 'Invalid schema' }, { status: 400, headers });
        }
        
        // Check policy support
        const policySupported = POLICIES.some(p => p.policy_id === request.policy_id);
        if (!policySupported) {
          return Response.json({ error: 'policy_not_supported', message: `Unknown policy: ${request.policy_id}` }, { status: 403, headers });
        }
        
        // Generate output
        const output = await generateOutput(request);
        
        // Create receipt
        const receipt = createReceipt(request, output, NODE_KEYS);
        
        const response: GenerateResponse = {
          output,
          receipt,
          proof_bundle: {
            attestation_report: null,
            encypher: { enabled: false },
          },
        };
        
        return Response.json(response, { headers });
        
      } catch (error) {
        return Response.json({ error: 'generation_failed', message: String(error) }, { status: 500, headers });
      }
    }
    
    // Verify (free)
    if (path === '/v1/verify' && req.method === 'POST') {
      try {
        const body = await req.json() as VerifyRequest;
        const result = verifyReceipt(body.request, body.output, body.receipt);
        return Response.json(result, { headers });
        
      } catch (error) {
        return Response.json({ valid: false, reason: `parse_error: ${error}` }, { headers });
      }
    }
    
    // 404
    return Response.json({ error: 'not_found' }, { status: 404, headers });
  },
});

console.log(`🚀 VIN Node running on http://localhost:${server.port}`);
console.log('Endpoints: /health, /v1/policies, /v1/generate (x402), /v1/verify');
