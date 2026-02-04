/**
 * VIN Node - Key Management
 * 
 * Persistent ed25519 key storage for node identity.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Configure ed25519
ed.hashes.sha512 = sha512;

export interface NodeKeys {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Generate new random keypair
 */
export function generateNodeKeys(): NodeKeys {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Save keys to file (base64 encoded private key)
 */
export function saveKeys(keys: NodeKeys, path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  const data = Buffer.from(keys.privateKey).toString('base64');
  writeFileSync(path, data, { mode: 0o600 }); // Owner read/write only
  console.log(`🔑 Keys saved to ${path}`);
}

/**
 * Load keys from file
 */
export function loadKeys(path: string): NodeKeys {
  const data = readFileSync(path, 'utf8').trim();
  const privateKey = new Uint8Array(Buffer.from(data, 'base64'));
  const publicKey = ed.getPublicKey(privateKey);
  console.log(`🔑 Keys loaded from ${path}`);
  return { privateKey, publicKey };
}

/**
 * Load or generate keys based on environment
 * 
 * If VIN_KEY_PATH is set and file exists, load from file.
 * If VIN_KEY_PATH is set and file doesn't exist, generate and save.
 * If VIN_KEY_PATH is not set, generate ephemeral keys (warning).
 */
export function loadOrGenerateKeys(): NodeKeys {
  const keyPath = process.env.VIN_KEY_PATH;
  
  if (!keyPath) {
    console.warn('⚠️  VIN_KEY_PATH not set - using ephemeral keys (identity will change on restart)');
    return generateNodeKeys();
  }
  
  if (existsSync(keyPath)) {
    return loadKeys(keyPath);
  }
  
  // Generate and save new keys
  console.log(`🔑 No key file found at ${keyPath}, generating new identity...`);
  const keys = generateNodeKeys();
  saveKeys(keys, keyPath);
  return keys;
}
