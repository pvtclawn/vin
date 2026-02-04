/**
 * Crypto layer tests (secp256k1 ECIES)
 */

import { describe, test, expect } from 'bun:test';
import * as secp from '@noble/secp256k1';
import { encrypt, decrypt, encodePublicKey, parsePublicKey, pubkeyToAddress } from './crypto';

describe('ECIES Encryption', () => {
  test('encrypt and decrypt roundtrip', () => {
    // Simulate TEE keypair (secp256k1)
    const teePriv = secp.utils.randomSecretKey();
    const teePub = secp.getPublicKey(teePriv, true);
    
    const payload = {
      provider_url: 'https://api.anthropic.com/v1/messages',
      api_key: 'sk-ant-test123',
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Hello!' }],
    };
    
    // User encrypts for TEE
    const encrypted = encrypt(payload, teePub);
    
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.ephemeralPubkey).toBeTruthy();
    expect(encrypted.nonce).toBeTruthy();
    
    // TEE decrypts
    const decrypted = decrypt(
      encrypted.ciphertext,
      encrypted.ephemeralPubkey,
      encrypted.nonce,
      teePriv
    );
    
    const parsed = JSON.parse(decrypted);
    expect(parsed.api_key).toBe('sk-ant-test123');
    expect(parsed.messages[0].content).toBe('Hello!');
  });
  
  test('wrong key fails decryption', () => {
    const teePriv = secp.utils.randomSecretKey();
    const teePub = secp.getPublicKey(teePriv, true);
    const wrongPriv = secp.utils.randomSecretKey();
    
    const encrypted = encrypt('secret', teePub);
    
    expect(() => {
      decrypt(encrypted.ciphertext, encrypted.ephemeralPubkey, encrypted.nonce, wrongPriv);
    }).toThrow();
  });
  
  test('pubkey encode/decode roundtrip', () => {
    const priv = secp.utils.randomSecretKey();
    const pub = secp.getPublicKey(priv, true);
    
    const encoded = encodePublicKey(pub);
    const decoded = parsePublicKey(encoded);
    
    expect(decoded).toEqual(pub);
  });
  
  test('pubkey to eth address', () => {
    const priv = secp.utils.randomSecretKey();
    const pub = secp.getPublicKey(priv, true);
    
    const addr = pubkeyToAddress(pub);
    
    expect(addr).toMatch(/^0x[a-f0-9]{40}$/);
  });
});
