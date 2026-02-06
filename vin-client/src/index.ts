/**
 * VIN Client SDK
 * 
 * Simple client for making confidential LLM calls through VIN nodes.
 * Handles encryption, payment, and receipt verification.
 * 
 * @example
 * ```typescript
 * import { VINClient } from '@vin/client';
 * import { privateKeyToAccount } from 'viem/accounts';
 * 
 * const account = privateKeyToAccount('0x...');
 * const client = new VINClient({
 *   nodeUrl: 'https://vin-node.example.com',
 *   account,
 * });
 * 
 * const result = await client.generate({
 *   provider_url: 'https://api.anthropic.com/v1/messages',
 *   api_key: 'sk-ant-...',
 *   model: 'claude-3-opus-20240229',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * 
 * console.log(result.text);
 * console.log(result.receipt);
 * ```
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import type { Account } from 'viem';

export interface VINClientConfig {
  /** VIN node URL */
  nodeUrl: string;
  /** Viem account for x402 payments */
  account: Account;
  /** Custom fetch function (optional) */
  fetch?: typeof fetch;
}

export interface LLMRequest {
  /** LLM provider URL (e.g., https://api.anthropic.com/v1/messages) */
  provider_url: string;
  /** Your API key for the provider */
  api_key: string;
  /** Model name */
  model: string;
  /** Chat messages */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** Max tokens (optional) */
  max_tokens?: number;
  /** Temperature (optional) */
  temperature?: number;
}

export interface VINReceipt {
  schema: string;
  version: string;
  node_pubkey: string;
  request_id: string;
  inputs_commitment: string;
  output_clean_hash: string;
  iat: number;
  exp: number;
  nonce: string;
  sig: string;
  attestation?: {
    type: string;
    available: boolean;
    report?: string;
  };
}

export interface GenerateResult {
  /** The LLM response text */
  text: string;
  /** Token usage (if available) */
  usage?: { input_tokens: number; output_tokens: number };
  /** Signed receipt proving the generation */
  receipt: VINReceipt;
  /** Request nonce (for binding) */
  request_nonce: string;
}

export interface NodeInfo {
  ok: boolean;
  node_pubkey: string;
  encryption_pubkey: string;
  version: string;
  x402: boolean;
  confidential_proxy: boolean;
}

/**
 * VIN Client - Make confidential LLM calls with payment and receipts
 */
export class VINClient {
  private config: VINClientConfig;
  private paidFetch: typeof fetch;
  private encryptionPubkey: string | null = null;
  private userSecretKey: Uint8Array;
  private userPubkey: string;

  constructor(config: VINClientConfig) {
    this.config = config;
    
    // Generate ephemeral keypair for response encryption
    this.userSecretKey = secp.utils.randomSecretKey();
    const pubkeyBytes = secp.getPublicKey(this.userSecretKey, true);
    this.userPubkey = Buffer.from(pubkeyBytes).toString('hex');
    
    // Set up x402 payment client
    const evmSigner = toClientEvmSigner(config.account);
    const client = new x402Client().register('eip155:8453', new ExactEvmScheme(evmSigner));
    this.paidFetch = wrapFetchWithPayment(config.fetch ?? fetch, client);
  }

  /**
   * Get node health and info
   */
  async getNodeInfo(): Promise<NodeInfo> {
    const response = await fetch(`${this.config.nodeUrl}/health`);
    return response.json();
  }

  /**
   * Get the node's encryption public key (cached)
   */
  async getEncryptionPubkey(): Promise<string> {
    if (this.encryptionPubkey) return this.encryptionPubkey;
    
    const response = await fetch(`${this.config.nodeUrl}/v1/tee-pubkey`);
    const data = await response.json() as { encryption_pubkey: string };
    this.encryptionPubkey = data.encryption_pubkey;
    return this.encryptionPubkey;
  }

  /**
   * ECIES encrypt data for the node
   */
  private async encrypt(data: object, recipientPubkeyHex: string): Promise<{
    ciphertext: string;
    ephemeralPubkey: string;
    nonce: string;
  }> {
    const message = JSON.stringify(data);
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
    const encrypted = cipher.encrypt(messageBytes);
    
    return {
      ciphertext: Buffer.from(encrypted).toString('base64'),
      ephemeralPubkey: Buffer.from(ephemeralPub).toString('hex'),
      nonce: Buffer.from(nonce).toString('hex'),
    };
  }

  /**
   * ECIES decrypt data from the node
   */
  private decrypt(ciphertext: string, ephemeralPubkeyHex: string, nonceHex: string): string {
    const ciphertextBytes = Buffer.from(ciphertext, 'base64');
    const ephemeralPub = Buffer.from(ephemeralPubkeyHex, 'hex');
    const nonce = Buffer.from(nonceHex, 'hex');
    
    // ECDH shared secret
    const sharedPoint = secp.getSharedSecret(this.userSecretKey, ephemeralPub);
    
    // Derive AES key via HKDF
    const aesKey = hkdf(sha256, sharedPoint.slice(1), undefined, new TextEncoder().encode('vin-ecies-v1'), 32);
    
    // AES-GCM decrypt
    const cipher = gcm(aesKey, nonce);
    const decrypted = cipher.decrypt(ciphertextBytes);
    
    return new TextDecoder().decode(decrypted);
  }

  /**
   * Generate LLM response through VIN
   * 
   * @param request - LLM request with provider URL, API key, and messages
   * @returns Response text, usage, and signed receipt
   */
  async generate(request: LLMRequest): Promise<GenerateResult> {
    // Get node's encryption pubkey
    const nodePubkey = await this.getEncryptionPubkey();
    
    // Encrypt the request (including API key)
    const encrypted = await this.encrypt(request, nodePubkey);
    
    // Make paid request
    const response = await this.paidFetch(`${this.config.nodeUrl}/v1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encrypted_payload: encrypted.ciphertext,
        ephemeral_pubkey: encrypted.ephemeralPubkey,
        nonce: encrypted.nonce,
        user_pubkey: this.userPubkey,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }));
      throw new Error(`VIN request failed: ${response.status} ${JSON.stringify(error)}`);
    }

    const result = await response.json() as {
      encrypted_response: string;
      response_ephemeral_pubkey: string;
      response_nonce: string;
      receipt: VINReceipt;
    };

    // Decrypt the response
    const decrypted = this.decrypt(
      result.encrypted_response,
      result.response_ephemeral_pubkey,
      result.response_nonce
    );
    
    const responseData = JSON.parse(decrypted) as {
      text: string;
      usage?: { input_tokens: number; output_tokens: number };
      request_nonce: string;
    };

    // Verify request nonce matches
    if (responseData.request_nonce !== encrypted.nonce) {
      throw new Error('Response nonce mismatch - possible tampering');
    }

    return {
      text: responseData.text,
      usage: responseData.usage,
      receipt: result.receipt,
      request_nonce: encrypted.nonce,
    };
  }

  /**
   * Compute the commitment hash for receipt verification
   * 
   * @param request - The original LLM request (without api_key)
   * @returns Commitment hash that should match receipt.inputs_commitment
   */
  computeCommitment(request: Omit<LLMRequest, 'api_key'>): string {
    const commitmentData = {
      provider_url: request.provider_url,
      model: request.model,
      messages: request.messages,
    };
    const hash = sha256(new TextEncoder().encode(JSON.stringify(commitmentData)));
    return Buffer.from(hash).toString('hex');
  }
}

export default VINClient;
