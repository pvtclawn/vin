/**
 * VIN Node - Encryption Layer
 * 
 * NaCl box encryption for confidential proxy flow:
 * - TEE has a keypair derived from dstack KMS (or generated)
 * - User encrypts payload with TEE pubkey
 * - TEE encrypts response with user's pubkey
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

export interface EncryptionKeys {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

let cachedKeys: EncryptionKeys | null = null;

/**
 * Get or generate TEE encryption keypair
 * In TEE: derived from dstack KMS (call deriveKeyForEncryption)
 * Outside TEE: generated randomly (ephemeral)
 */
export async function getTeeEncryptionKeys(derivedSeed?: Uint8Array | null): Promise<EncryptionKeys> {
  if (cachedKeys) return cachedKeys;
  
  if (derivedSeed) {
    console.log('[crypto] Using TEE-derived encryption keys');
    cachedKeys = nacl.box.keyPair.fromSecretKey(derivedSeed);
  } else {
    console.warn('[crypto] TEE not available, using ephemeral encryption keys');
    cachedKeys = nacl.box.keyPair();
  }
  
  return cachedKeys;
}

/**
 * Encrypt data for a recipient's public key
 */
export function encrypt(
  data: string | object,
  recipientPubkey: Uint8Array,
  senderSecretKey: Uint8Array
): { ciphertext: string; nonce: string } {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  const messageBytes = decodeUTF8(message);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  const encrypted = nacl.box(messageBytes, nonce, recipientPubkey, senderSecretKey);
  
  if (!encrypted) {
    throw new Error('Encryption failed');
  }
  
  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt data from a sender's public key
 */
export function decrypt(
  ciphertext: string,
  nonce: string,
  senderPubkey: Uint8Array,
  recipientSecretKey: Uint8Array
): string {
  const ciphertextBytes = decodeBase64(ciphertext);
  const nonceBytes = decodeBase64(nonce);
  
  const decrypted = nacl.box.open(ciphertextBytes, nonceBytes, senderPubkey, recipientSecretKey);
  
  if (!decrypted) {
    throw new Error('Decryption failed - invalid ciphertext or wrong keys');
  }
  
  return encodeUTF8(decrypted);
}

/**
 * Parse base64 public key
 */
export function parsePublicKey(base64: string): Uint8Array {
  return decodeBase64(base64);
}

/**
 * Encode public key to base64
 */
export function encodePublicKey(key: Uint8Array): string {
  return encodeBase64(key);
}
