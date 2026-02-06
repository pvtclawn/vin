/**
 * ISM - Input Sanitization Module
 * 
 * Minimal TEE component for input gating.
 * Proves inputs came from approved non-human sources.
 */

import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

// Configure ed25519 to use sha512
// @ts-ignore
ed.hashes.sha512 = sha512;

// Input types that can be attested
export type InputType = 
  | 'blockchain_event'   // On-chain event (self-attesting)
  | 'api_signed'         // API with signature
  | 'ism_chain'          // Output from another ISM
  | 'cron'               // Time-triggered
  | 'vrf_challenge';     // VRF-generated challenge

export interface InputAttestation {
  schema: 'ism.input.v0';
  ism_id: string;
  ism_pubkey: string;
  
  // Input data
  input_hash: string;
  input_type: InputType;
  input_source: string;
  
  // Temporal
  received_at: number;
  sequence: number;
  
  // Source verification
  source_signature?: string;
  source_pubkey?: string;
  block_hash?: string;
  
  // TEE attestation
  tee_attestation: {
    type: 'tdx' | 'sgx' | 'nitro' | 'none';
    report?: string;
    measurement?: string;
  };
  
  // ISM signature
  sig: string;
}

export interface ISMConfig {
  ism_id: string;
  private_key: Uint8Array;
  approved_sources: ApprovedSource[];
}

export interface ApprovedSource {
  id: string;
  type: InputType;
  pubkey?: string;        // For signed APIs
  contract?: string;      // For blockchain events
  chain_id?: number;
}

export interface RawInput {
  data: string | object;
  source_id: string;
  source_type: InputType;
  source_signature?: string;
  block_hash?: string;
  block_number?: number;
}

// Sequence counter (monotonic)
let sequenceCounter = 0;

/**
 * Create ISM instance
 */
export function createISM(config: ISMConfig) {
  const pubkey = ed.getPublicKey(config.private_key);
  const pubkeyHex = Buffer.from(pubkey).toString('hex');
  
  return {
    ism_id: config.ism_id,
    pubkey: pubkeyHex,
    
    /**
     * Attest an input
     */
    async attest(input: RawInput): Promise<InputAttestation | { error: string }> {
      // 1. Verify source is approved
      const source = config.approved_sources.find(s => s.id === input.source_id);
      if (!source) {
        return { error: `Source not approved: ${input.source_id}` };
      }
      
      // 2. Verify source type matches
      if (source.type !== input.source_type) {
        return { error: `Source type mismatch: expected ${source.type}, got ${input.source_type}` };
      }
      
      // 3. Verify source signature if required
      if (source.type === 'api_signed' && source.pubkey) {
        if (!input.source_signature) {
          return { error: 'Signed API requires source_signature' };
        }
        // TODO: Verify signature
      }
      
      // 4. Verify blockchain event if applicable
      if (source.type === 'blockchain_event') {
        if (!input.block_hash) {
          return { error: 'Blockchain event requires block_hash' };
        }
        // TODO: Verify block exists on chain
      }
      
      // 5. Compute input hash
      const inputData = typeof input.data === 'string' 
        ? input.data 
        : JSON.stringify(input.data);
      const inputHash = Buffer.from(sha256(new TextEncoder().encode(inputData))).toString('hex');
      
      // 6. Build attestation
      const attestation: Omit<InputAttestation, 'sig'> = {
        schema: 'ism.input.v0',
        ism_id: config.ism_id,
        ism_pubkey: pubkeyHex,
        input_hash: inputHash,
        input_type: input.source_type,
        input_source: input.source_id,
        received_at: Date.now(),
        sequence: ++sequenceCounter,
        source_signature: input.source_signature,
        block_hash: input.block_hash,
        tee_attestation: {
          type: 'none', // TODO: Get real TEE attestation
        },
      };
      
      // 7. Sign attestation
      const payload = JSON.stringify(attestation);
      const payloadHash = sha256(new TextEncoder().encode(payload));
      const signature = await ed.signAsync(payloadHash, config.private_key);
      
      return {
        ...attestation,
        sig: Buffer.from(signature).toString('base64url'),
      };
    },
    
    /**
     * Verify an attestation
     */
    async verify(attestation: InputAttestation): Promise<{ valid: boolean; reason?: string }> {
      try {
        // Extract signature
        const { sig, ...payload } = attestation;
        const payloadStr = JSON.stringify(payload);
        const payloadHash = sha256(new TextEncoder().encode(payloadStr));
        
        // Verify ISM signature
        const sigBytes = Buffer.from(sig, 'base64url');
        const pubkeyBytes = Buffer.from(attestation.ism_pubkey, 'hex');
        
        const valid = await ed.verifyAsync(sigBytes, payloadHash, pubkeyBytes);
        
        if (!valid) {
          return { valid: false, reason: 'Invalid ISM signature' };
        }
        
        return { valid: true };
      } catch (error) {
        return { valid: false, reason: (error as Error).message };
      }
    },
  };
}

// Export types
export type ISM = ReturnType<typeof createISM>;
