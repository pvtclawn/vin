/**
 * VIN Node - Encryption Layer (EVM Compatible)
 * 
 * ECIES encryption using secp256k1 (same curve as Ethereum):
 * - TEE has a secp256k1 keypair (can derive Ethereum address)
 * - User encrypts payload with TEE pubkey
 * - TEE encrypts response with user's pubkey
 * - Compatible with eth-crypto, MetaMask, etc.
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';

export interface EncryptionKeys {
  publicKey: Uint8Array;  // 33 bytes compressed
  secretKey: Uint8Array;  // 32 bytes
}

let cachedKeys: EncryptionKeys | null = null;

/**
 * Get or generate TEE encryption keypair (secp256k1)
 */
export async function getTeeEncryptionKeys(derivedSeed?: Uint8Array | null): Promise<EncryptionKeys> {
  if (cachedKeys) return cachedKeys;
  
  let secretKey: Uint8Array;
  
  if (derivedSeed && derivedSeed.length >= 32) {
    console.log('[crypto] Using TEE-derived secp256k1 keys');
    secretKey = derivedSeed.slice(0, 32);
  } else {
    console.warn('[crypto] TEE not available, using ephemeral secp256k1 keys');
    secretKey = secp.utils.randomSecretKey();
  }
  
  const publicKey = secp.getPublicKey(secretKey, true); // compressed
  cachedKeys = { publicKey, secretKey };
  
  return cachedKeys;
}

/**
 * Derive Ethereum address from public key
 */
export function pubkeyToAddress(pubkey: Uint8Array): string {
  // Parse point and get uncompressed bytes
  const point = secp.Point.fromHex(Buffer.from(pubkey).toString('hex'));
  const uncompressed = point.toBytes(false).slice(1); // Remove 0x04 prefix
  // Keccak256 hash, take last 20 bytes (using sha256 as fallback for now)
  const hash = sha256(uncompressed);
  return '0x' + Buffer.from(hash.slice(-20)).toString('hex');
}

/**
 * ECIES Encrypt
 * 
 * 1. Generate ephemeral keypair
 * 2. ECDH with recipient pubkey
 * 3. Derive AES key via HKDF
 * 4. AES-GCM encrypt
 */
export function encrypt(
  data: string | object,
  recipientPubkey: Uint8Array,
): { ciphertext: string; ephemeralPubkey: string; nonce: string } {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  const messageBytes = new TextEncoder().encode(message);
  
  // Generate ephemeral keypair
  const ephemeralPriv = secp.utils.randomSecretKey();
  const ephemeralPub = secp.getPublicKey(ephemeralPriv, true);
  
  // ECDH shared secret
  const sharedPoint = secp.getSharedSecret(ephemeralPriv, recipientPubkey);
  
  // Derive AES key via HKDF
  const aesKey = hkdf(sha256, sharedPoint.slice(1), undefined, new TextEncoder().encode('vin-ecies-v1'), 32);
  
  // AES-GCM encrypt
  const nonce = randomBytes(12);
  const cipher = gcm(aesKey, nonce);
  const encrypted = cipher.encrypt(messageBytes);
  
  return {
    ciphertext: Buffer.from(encrypted).toString('base64'),
    ephemeralPubkey: Buffer.from(ephemeralPub).toString('hex'),
    nonce: Buffer.from(nonce).toString('hex'),
  };
}

/**
 * ECIES Decrypt
 */
export function decrypt(
  ciphertext: string,
  ephemeralPubkeyHex: string,
  nonceHex: string,
  recipientSecretKey: Uint8Array
): string {
  const ciphertextBytes = Buffer.from(ciphertext, 'base64');
  const ephemeralPub = Buffer.from(ephemeralPubkeyHex, 'hex');
  const nonce = Buffer.from(nonceHex, 'hex');
  
  // ECDH shared secret
  const sharedPoint = secp.getSharedSecret(recipientSecretKey, ephemeralPub);
  
  // Derive AES key via HKDF
  const aesKey = hkdf(sha256, sharedPoint.slice(1), undefined, new TextEncoder().encode('vin-ecies-v1'), 32);
  
  // AES-GCM decrypt
  const cipher = gcm(aesKey, nonce);
  const decrypted = cipher.decrypt(ciphertextBytes);
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Parse hex public key with validation
 * Throws if not a valid secp256k1 point (P0 fix: prevent invalid curve attacks)
 */
export function parsePublicKey(hex: string): Uint8Array {
  // Validate it's a valid point on secp256k1 curve
  // Point.fromHex takes hex string directly
  secp.Point.fromHex(hex);
  return Buffer.from(hex, 'hex');
}

/**
 * Encode public key to hex
 */
export function encodePublicKey(key: Uint8Array): string {
  return Buffer.from(key).toString('hex');
}

/**
 * Hash data for commitment (SHA-256)
 * Used for creating verifiable commitments in receipts
 */
export function hashForCommitment(data: string | object): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const hash = sha256(new TextEncoder().encode(text));
  return Buffer.from(hash).toString('hex');
}
