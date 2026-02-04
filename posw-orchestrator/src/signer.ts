/**
 * PoSw Orchestrator - Score Signing
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import canonicalize from 'canonicalize';

// Configure ed25519
ed.hashes.sha512 = sha512;

export interface OrchestratorKeys {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateOrchestratorKeys(): OrchestratorKeys {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function canonicalJson(obj: unknown): string {
  // RFC 8785 JSON Canonicalization Scheme (JCS)
  const result = canonicalize(obj);
  if (!result) throw new Error('Failed to canonicalize JSON');
  return result;
}

/**
 * Sign a score report
 */
export function signScore<T extends Record<string, unknown>>(
  score: T,
  keys: OrchestratorKeys
): T & { orchestrator_pubkey: string; sig: string } {
  const pubkey = toBase64Url(keys.publicKey);
  
  // Build payload (without sig)
  const payload = {
    ...score,
    orchestrator_pubkey: pubkey,
  };
  
  // Sign canonical JSON
  const payloadBytes = new TextEncoder().encode(canonicalJson(payload));
  const signature = ed.sign(payloadBytes, keys.privateKey);
  
  return {
    ...payload,
    sig: toBase64Url(signature),
  };
}

/**
 * Verify a signed score report
 */
export function verifyScore<T extends { orchestrator_pubkey: string; sig: string }>(
  score: T
): boolean {
  try {
    const { sig, ...rest } = score;
    
    const payloadBytes = new TextEncoder().encode(canonicalJson(rest));
    const signature = Buffer.from(sig, 'base64url');
    const publicKey = Buffer.from(score.orchestrator_pubkey, 'base64url');
    
    return ed.verify(signature, payloadBytes, publicKey);
  } catch {
    return false;
  }
}
