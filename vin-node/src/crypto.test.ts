/**
 * Crypto layer tests
 */

import { describe, test, expect } from 'bun:test';
import nacl from 'tweetnacl';
import { encrypt, decrypt, encodePublicKey, parsePublicKey } from './crypto';

describe('Encryption', () => {
  test('encrypt and decrypt roundtrip', () => {
    // Simulate TEE keypair
    const teeKeys = nacl.box.keyPair();
    // Simulate user keypair
    const userKeys = nacl.box.keyPair();
    
    const payload = {
      provider_url: 'https://api.anthropic.com/v1/messages',
      api_key: 'sk-ant-test123',
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Hello!' }],
    };
    
    // User encrypts for TEE
    const encrypted = encrypt(payload, teeKeys.publicKey, userKeys.secretKey);
    
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.nonce).toBeTruthy();
    
    // TEE decrypts
    const decrypted = decrypt(
      encrypted.ciphertext,
      encrypted.nonce,
      userKeys.publicKey,
      teeKeys.secretKey
    );
    
    const parsed = JSON.parse(decrypted);
    expect(parsed.api_key).toBe('sk-ant-test123');
    expect(parsed.messages[0].content).toBe('Hello!');
  });
  
  test('wrong key fails decryption', () => {
    const teeKeys = nacl.box.keyPair();
    const userKeys = nacl.box.keyPair();
    const wrongKeys = nacl.box.keyPair();
    
    const encrypted = encrypt('secret', teeKeys.publicKey, userKeys.secretKey);
    
    expect(() => {
      decrypt(encrypted.ciphertext, encrypted.nonce, wrongKeys.publicKey, teeKeys.secretKey);
    }).toThrow('Decryption failed');
  });
  
  test('pubkey encode/decode roundtrip', () => {
    const keys = nacl.box.keyPair();
    const encoded = encodePublicKey(keys.publicKey);
    const decoded = parsePublicKey(encoded);
    
    expect(decoded).toEqual(keys.publicKey);
  });
});
