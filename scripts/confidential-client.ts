/**
 * VIN Confidential Client - Test encrypted API key flow
 * 
 * Usage: WALLET_PASSWORD=xxx bun scripts/confidential-client.ts
 */

import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { gcm } from '@noble/ciphers/webcrypto.js';
import { randomBytes } from 'crypto';

const VIN_ENDPOINT = process.env.VIN_ENDPOINT || 'https://d2614dddf56f87bc44bb87818090fcadfd8fcecb-3402.dstack-pha-prod5.phala.network';

// ECIES encrypt (same as VIN's crypto.ts)
async function eciesEncrypt(
  data: string | object,
  recipientPubkeyHex: string,
): Promise<{ ciphertext: string; ephemeralPubkey: string; nonce: string }> {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  const messageBytes = new TextEncoder().encode(message);
  
  const recipientPubkey = Buffer.from(recipientPubkeyHex, 'hex');
  
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
  const encrypted = await cipher.encrypt(messageBytes);
  
  return {
    ciphertext: Buffer.from(encrypted).toString('base64'),
    ephemeralPubkey: Buffer.from(ephemeralPub).toString('hex'),
    nonce: Buffer.from(nonce).toString('hex'),
  };
}

// ECIES decrypt for response
async function eciesDecrypt(
  ciphertext: string,
  ephemeralPubkeyHex: string,
  nonceHex: string,
  secretKey: Uint8Array
): Promise<string> {
  const ciphertextBytes = Buffer.from(ciphertext, 'base64');
  const ephemeralPub = Buffer.from(ephemeralPubkeyHex, 'hex');
  const nonce = Buffer.from(nonceHex, 'hex');
  
  // ECDH shared secret
  const sharedPoint = secp.getSharedSecret(secretKey, ephemeralPub);
  
  // Derive AES key via HKDF
  const aesKey = hkdf(sha256, sharedPoint.slice(1), undefined, new TextEncoder().encode('vin-ecies-v1'), 32);
  
  // AES-GCM decrypt
  const cipher = gcm(aesKey, nonce);
  const decrypted = await cipher.decrypt(ciphertextBytes);
  
  return new TextDecoder().decode(decrypted);
}

// Load wallet from keystore
async function loadWallet() {
  const password = process.env.WALLET_PASSWORD;
  if (!password) {
    throw new Error('WALLET_PASSWORD required');
  }
  
  const proc = Bun.spawn(['/home/clawn/.foundry/bin/cast', 'wallet', 'decrypt-keystore', 'clawn', '--unsafe-password', password], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  const match = output.match(/0x[a-fA-F0-9]{64}/);
  if (!match) {
    throw new Error('Could not parse private key');
  }
  const privateKey = match[0] as `0x${string}`;
  
  const account = privateKeyToAccount(privateKey);
  return { account, privateKey };
}

// Load OpenRouter API key from vault
async function loadApiKey(): Promise<string> {
  const secrets = await Bun.file('/home/clawn/.openclaw/workspace/.vault/secrets.json').json();
  return secrets.OPENROUTER_API_KEY;
}

async function main() {
  console.log('=== VIN Confidential Client ===\n');
  
  // 1. Get node's encryption pubkey
  console.log('1. Fetching node encryption pubkey...');
  const teePubkeyRes = await fetch(`${VIN_ENDPOINT}/v1/tee-pubkey`);
  const teePubkey = await teePubkeyRes.json();
  console.log('   Encryption pubkey:', teePubkey.encryption_pubkey.slice(0, 20) + '...');
  console.log();
  
  // 2. Load API key and wallet
  console.log('2. Loading credentials...');
  const apiKey = await loadApiKey();
  console.log('   API key loaded:', apiKey.slice(0, 15) + '...');
  
  const { account } = await loadWallet();
  console.log('   Wallet:', account.address);
  console.log();
  
  // 3. Generate user keypair for encrypted response
  console.log('3. Generating ephemeral user keypair...');
  const userSecretKey = secp.utils.randomSecretKey();
  const userPubkey = secp.getPublicKey(userSecretKey, true);
  const userPubkeyHex = Buffer.from(userPubkey).toString('hex');
  console.log('   User pubkey:', userPubkeyHex.slice(0, 20) + '...');
  console.log();
  
  // 4. Build encrypted payload
  console.log('4. Encrypting payload with node pubkey...');
  const llmRequest = {
    provider_url: 'https://openrouter.ai/api/v1/chat/completions',
    api_key: apiKey,
    model: 'meta-llama/llama-3.2-3b-instruct',
    messages: [{ role: 'user', content: 'Say hello in exactly one word.' }],
  };
  
  const encrypted = await eciesEncrypt(llmRequest, teePubkey.encryption_pubkey);
  console.log('   Encrypted payload length:', encrypted.ciphertext.length);
  console.log();
  
  // 5. Create x402 client
  console.log('5. Setting up x402 payment...');
  const evmSigner = toClientEvmSigner(account);
  const client = new x402Client()
    .register('eip155:8453', new ExactEvmScheme(evmSigner));
  const paidFetch = wrapFetchWithPayment(fetch, client);
  console.log();
  
  // 6. Make confidential request with payment
  console.log('6. Making paid confidential request...');
  try {
    const response = await paidFetch(`${VIN_ENDPOINT}/v1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encrypted_payload: encrypted.ciphertext,
        ephemeral_pubkey: encrypted.ephemeralPubkey,
        nonce: encrypted.nonce,
        user_pubkey: userPubkeyHex,
      }),
    });
    
    console.log('   Status:', response.status);
    const result = await response.json();
    
    if (result.encrypted_response) {
      console.log('\n7. Decrypting response...');
      const decrypted = await eciesDecrypt(
        result.encrypted_response,
        result.response_ephemeral_pubkey,
        result.response_nonce,
        userSecretKey
      );
      console.log('   Decrypted:', decrypted);
      console.log('\n   Receipt:', JSON.stringify(result.receipt, null, 2));
    } else if (result.error) {
      console.log('   Error:', result.error);
      console.log('   Message:', result.message);
    } else {
      console.log('   Result:', JSON.stringify(result, null, 2));
    }
  } catch (error: any) {
    console.log('   Error:', error.message);
  }
}

main().catch(console.error);
