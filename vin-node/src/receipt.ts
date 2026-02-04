/**
 * VIN Node - Receipt signing and verification
 * 
 * Uses Ed25519 for signatures, SHA-256 for hashing.
 */

import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import canonicalize from 'canonicalize';
import type { 
  ActionRequestV0, 
  OutputV0, 
  ReceiptV0, 
  VerifyResponse 
} from './types';

// Configure ed25519 with sha512
ed.hashes.sha512 = sha512;

// ============ Utilities ============

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function canonicalJson(obj: unknown): string {
  // RFC 8785 JSON Canonicalization Scheme (JCS)
  const result = canonicalize(obj);
  if (!result) throw new Error('Failed to canonicalize JSON');
  return result;
}

function hashJson(obj: unknown): string {
  const json = canonicalJson(obj);
  const bytes = new TextEncoder().encode(json);
  return toHex(sha256(bytes));
}

function hashText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return toHex(sha256(bytes));
}

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toBase64Url(bytes);
}

// ============ Receipt Creation ============

// Re-export NodeKeys type from keys module
export type { NodeKeys } from './keys';

// For tests only - use loadOrGenerateKeys() in production
export { generateNodeKeys } from './keys';

export function createReceipt(
  request: ActionRequestV0,
  output: OutputV0,
  keys: NodeKeys,
  options?: {
    validitySeconds?: number;
    attestation?: ReceiptV0['attestation'];
    payment?: ReceiptV0['payment'];
  }
): ReceiptV0 {
  const now = Math.floor(Date.now() / 1000);
  const validitySeconds = options?.validitySeconds ?? 600; // 10 minutes default
  
  // Build receipt without signature
  const receiptPayload = {
    schema: 'vin.receipt_payload.v0' as const,
    node_pubkey: toBase64Url(keys.publicKey),
    request_id: request.request_id,
    action_type: request.action_type,
    policy_id: request.policy_id,
    inputs_commitment: hashJson(request.inputs),
    constraints_commitment: hashJson(request.constraints ?? {}),
    llm_commitment: hashJson(request.llm ?? {}),
    output_clean_hash: hashText(output.clean_text),
    output_transport_hash: hashText(output.text),
    iat: now,
    exp: now + validitySeconds,
    nonce: generateNonce(),
    attestation: options?.attestation ?? { type: 'none' as const },
    payment: options?.payment ?? { type: 'none' as const },
  };
  
  // Sign the canonical payload
  const payloadBytes = new TextEncoder().encode(canonicalJson(receiptPayload));
  const signature = ed.sign(payloadBytes, keys.privateKey);
  
  // Build final receipt
  const receipt: ReceiptV0 = {
    schema: 'vin.receipt.v0',
    version: '0.1',
    node_pubkey: receiptPayload.node_pubkey,
    request_id: receiptPayload.request_id,
    action_type: receiptPayload.action_type,
    policy_id: receiptPayload.policy_id,
    inputs_commitment: receiptPayload.inputs_commitment,
    constraints_commitment: receiptPayload.constraints_commitment,
    llm_commitment: receiptPayload.llm_commitment,
    output_clean_hash: receiptPayload.output_clean_hash,
    output_transport_hash: receiptPayload.output_transport_hash,
    iat: receiptPayload.iat,
    exp: receiptPayload.exp,
    nonce: receiptPayload.nonce,
    attestation: receiptPayload.attestation,
    payment: receiptPayload.payment,
    sig: toBase64Url(signature),
  };
  
  return receipt;
}

// ============ Receipt Verification ============

// Nonce cache for replay detection (in-memory for MVP)
const seenNonces = new Map<string, number>(); // nonce -> expiry time

export function verifyReceipt(
  request: ActionRequestV0,
  output: OutputV0,
  receipt: ReceiptV0
): VerifyResponse {
  try {
    // 1. Schema check
    if (receipt.schema !== 'vin.receipt.v0') {
      return { valid: false, reason: 'invalid_schema' };
    }
    
    // 2. Time check
    const now = Math.floor(Date.now() / 1000);
    if (receipt.iat > now + 60) { // Allow 60s clock skew
      return { valid: false, reason: 'issued_in_future' };
    }
    if (receipt.exp < now) {
      return { valid: false, reason: 'expired' };
    }
    
    // 3. Replay check
    const nonceKey = `${receipt.node_pubkey}:${receipt.nonce}`;
    if (seenNonces.has(nonceKey)) {
      return { valid: false, reason: 'replay_detected' };
    }
    // Record nonce with expiry
    seenNonces.set(nonceKey, receipt.exp);
    // Cleanup old nonces (simple approach)
    for (const [key, exp] of seenNonces) {
      if (exp < now) seenNonces.delete(key);
    }
    
    // 4. Commitment recompute
    if (receipt.inputs_commitment !== hashJson(request.inputs)) {
      return { valid: false, reason: 'inputs_commitment_mismatch' };
    }
    if (receipt.constraints_commitment !== hashJson(request.constraints ?? {})) {
      return { valid: false, reason: 'constraints_commitment_mismatch' };
    }
    if (receipt.llm_commitment !== hashJson(request.llm ?? {})) {
      return { valid: false, reason: 'llm_commitment_mismatch' };
    }
    
    // 5. Output hash recompute
    if (receipt.output_clean_hash !== hashText(output.clean_text)) {
      return { valid: false, reason: 'output_clean_hash_mismatch' };
    }
    if (receipt.output_transport_hash !== hashText(output.text)) {
      return { valid: false, reason: 'output_transport_hash_mismatch' };
    }
    
    // 6. Signature check
    const receiptPayload = {
      schema: 'vin.receipt_payload.v0',
      node_pubkey: receipt.node_pubkey,
      request_id: receipt.request_id,
      action_type: receipt.action_type,
      policy_id: receipt.policy_id,
      inputs_commitment: receipt.inputs_commitment,
      constraints_commitment: receipt.constraints_commitment,
      llm_commitment: receipt.llm_commitment,
      output_clean_hash: receipt.output_clean_hash,
      output_transport_hash: receipt.output_transport_hash,
      iat: receipt.iat,
      exp: receipt.exp,
      nonce: receipt.nonce,
      attestation: receipt.attestation,
      payment: receipt.payment,
    };
    
    const payloadBytes = new TextEncoder().encode(canonicalJson(receiptPayload));
    const signature = fromBase64Url(receipt.sig);
    const publicKey = fromBase64Url(receipt.node_pubkey);
    
    const validSig = ed.verify(signature, payloadBytes, publicKey);
    if (!validSig) {
      return { valid: false, reason: 'signature_invalid' };
    }
    
    return { valid: true };
    
  } catch (error) {
    return { valid: false, reason: `verification_error: ${error}` };
  }
}
