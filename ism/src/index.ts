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

// Max input size (1MB) to prevent DoS
const MAX_INPUT_SIZE = 1_048_576;

// Replay cache size
const REPLAY_CACHE_MAX = 10_000;

// Timestamp drift tolerance (5 minutes)
const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000;

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
  /** Max input size in bytes (default: 1MB) */
  maxInputSize?: number;
  /** Max allowed clock drift in ms (default: 5 min) */
  maxClockDriftMs?: number;
  /** Clock source for testing (default: Date.now) */
  clockSource?: () => number;
}

export interface ApprovedSource {
  id: string;
  type: InputType;
  pubkey?: string;        // Ed25519 hex pubkey for signed APIs
  contract?: string;      // For blockchain events
  chain_id?: number;
}

export interface RawInput {
  data: string | object;
  source_id: string;
  source_type: InputType;
  source_signature?: string;  // base64url Ed25519 signature over input data
  block_hash?: string;
  block_number?: number;
}

/**
 * Create ISM instance
 */
export function createISM(config: ISMConfig) {
  const pubkey = ed.getPublicKey(config.private_key);
  const pubkeyHex = Buffer.from(pubkey).toString('hex');
  const maxSize = config.maxInputSize ?? MAX_INPUT_SIZE;
  const maxDrift = config.maxClockDriftMs ?? MAX_CLOCK_DRIFT_MS;
  const clock = config.clockSource ?? Date.now;
  
  // Per-instance sequence counter (P1 fix: was global)
  let sequenceCounter = 0;
  
  // Replay detection: track recent input_hash+source pairs
  const replayCache = new Set<string>();
  
  return {
    ism_id: config.ism_id,
    pubkey: pubkeyHex,
    
    /**
     * Attest an input — validates source, verifies signatures, signs attestation
     */
    async attest(input: RawInput): Promise<InputAttestation | { error: string }> {
      // 1. Verify source is approved (generic error to prevent enumeration)
      const source = config.approved_sources.find(s => s.id === input.source_id);
      if (!source) {
        return { error: 'Input rejected' };
      }
      
      // 2. Verify source type matches
      if (source.type !== input.source_type) {
        return { error: 'Input rejected' };
      }
      
      // 3. Compute input data string + check size
      const inputData = typeof input.data === 'string' 
        ? input.data 
        : JSON.stringify(input.data);
      
      if (new TextEncoder().encode(inputData).byteLength > maxSize) {
        return { error: 'Input too large' };
      }
      
      // 4. Compute input hash
      const inputBytes = new TextEncoder().encode(inputData);
      const inputHash = Buffer.from(sha256(inputBytes)).toString('hex');
      
      // 5. Check replay (same input from same source)
      const replayKey = `${input.source_id}:${inputHash}`;
      if (replayCache.has(replayKey)) {
        return { error: 'Duplicate input rejected' };
      }
      
      // 6. Verify source signature if required (P0 fix: actually verify Ed25519)
      if (source.type === 'api_signed' && source.pubkey) {
        if (!input.source_signature) {
          return { error: 'Input rejected' };
        }
        try {
          const sigBytes = Buffer.from(input.source_signature, 'base64url');
          const pubkeyBytes = Buffer.from(source.pubkey, 'hex');
          const valid = await ed.verifyAsync(sigBytes, inputBytes, pubkeyBytes);
          if (!valid) {
            return { error: 'Input rejected' };
          }
        } catch {
          return { error: 'Input rejected' };
        }
      }
      
      // 7. Verify blockchain event if applicable
      if (source.type === 'blockchain_event') {
        if (!input.block_hash) {
          return { error: 'Input rejected' };
        }
        // Note: on-chain verification requires RPC — deferred to integration layer
        // ISM records the claimed block_hash; verifier can check it independently
      }
      
      // 8. Record in replay cache (bounded)
      if (replayCache.size >= REPLAY_CACHE_MAX) {
        // Evict oldest (first inserted)
        const first = replayCache.values().next().value;
        if (first) replayCache.delete(first);
      }
      replayCache.add(replayKey);
      
      // 9. Build attestation with timestamp bounds check
      const now = clock();
      if (now < 0 || !Number.isFinite(now)) {
        return { error: 'Clock error' };
      }
      
      const attestation: Omit<InputAttestation, 'sig'> = {
        schema: 'ism.input.v0',
        ism_id: config.ism_id,
        ism_pubkey: pubkeyHex,
        input_hash: inputHash,
        input_type: input.source_type,
        input_source: input.source_id,
        received_at: now,
        sequence: ++sequenceCounter,
        source_signature: input.source_signature,
        block_hash: input.block_hash,
        tee_attestation: {
          type: 'none', // Populated by TEE runtime integration
        },
      };
      
      // 10. Sign attestation
      const payload = JSON.stringify(attestation);
      const payloadHash = sha256(new TextEncoder().encode(payload));
      const signature = await ed.signAsync(payloadHash, config.private_key);
      
      return {
        ...attestation,
        sig: Buffer.from(signature).toString('base64url'),
      };
    },
    
    /**
     * Verify an attestation's ISM signature and timestamp bounds
     */
    async verify(attestation: InputAttestation): Promise<{ valid: boolean; reason?: string }> {
      try {
        // Check timestamp bounds: not in the future beyond drift tolerance
        const now = clock();
        if (attestation.received_at > now + maxDrift) {
          return { valid: false, reason: 'Attestation timestamp is in the future' };
        }
        
        const { sig, ...payload } = attestation;
        const payloadStr = JSON.stringify(payload);
        const payloadHash = sha256(new TextEncoder().encode(payloadStr));
        
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
