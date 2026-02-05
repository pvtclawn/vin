import * as secp from '@noble/secp256k1';
import { encrypt, parsePublicKey, decrypt } from './src/services/crypto';

// OpenRouter API key - set via environment variable
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
if (!OPENROUTER_KEY) {
  console.error('❌ Set OPENROUTER_API_KEY environment variable');
  process.exit(1);
}

// Get TEE pubkey from server
const health = await fetch('http://localhost:3402/health').then(r => r.json()) as any;
console.log('✅ Health check passed');

// Generate user keypair
const userPriv = secp.utils.randomSecretKey();
const userPub = secp.getPublicKey(userPriv, true);
console.log('✅ Generated user keypair');

// Create REAL LLM request using OpenRouter
const payload = {
  provider_url: 'https://openrouter.ai/api/v1/chat/completions',
  api_key: OPENROUTER_KEY,
  model: 'openai/gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Say hello in exactly 5 words. No extra text.' }],
  max_tokens: 50,
};

// Encrypt for TEE
const teePub = parsePublicKey(health.encryption_pubkey);
const encrypted = encrypt(payload, teePub);
console.log('✅ Encrypted payload for TEE');

console.log('⏳ Sending to VIN node...');

// Send to VIN node
const response = await fetch('http://localhost:3402/v1/generate?paid=true', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    encrypted_payload: encrypted.ciphertext,
    ephemeral_pubkey: encrypted.ephemeralPubkey,
    nonce: encrypted.nonce,
    user_pubkey: Buffer.from(userPub).toString('hex'),
  }),
});

const result = await response.json() as any;
console.log('Status:', response.status);

if (result.encrypted_response && result.response_ephemeral_pubkey) {
  console.log('✅ Got encrypted response!');
  
  // Decrypt with user private key using ephemeral pubkey from response
  const decrypted = decrypt(
    result.encrypted_response,
    result.response_ephemeral_pubkey,
    result.response_nonce,
    userPriv
  );
  
  const parsed = JSON.parse(decrypted);
  console.log('✅ Decrypted LLM response:', parsed.text);
  console.log('Usage:', parsed.usage);
  console.log('Receipt node_pubkey:', result.receipt?.node_pubkey?.slice(0, 20) + '...');
  console.log('Receipt sig:', result.receipt?.sig?.slice(0, 30) + '...');
} else if (result.output) {
  console.log('✅ Got plaintext response');
  console.log('Output:', result.output.text);
} else if (result.error) {
  console.log('❌ Error:', result.message);
} else {
  console.log('Result:', JSON.stringify(result, null, 2).slice(0, 800));
}

console.log('\n=== FULL E2E SUCCESS ===');
