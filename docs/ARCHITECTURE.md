# VIN Confidential Proxy Architecture

## Overview

VIN is a **Confidential LLM Proxy** — a TEE-based service that lets users call any LLM provider while keeping their API keys private, and receiving cryptographically signed receipts proving the generation happened inside an attested environment.

**Key insight**: VIN node needs ZERO secrets. Users bring their own API keys, encrypted for the TEE.

## Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER AGENT                                   │
├─────────────────────────────────────────────────────────────────────┤
│ 1. GET /v1/tee-pubkey                                               │
│    ← { encryption_pubkey, signing_pubkey, attestation }             │
│                                                                      │
│ 2. Generate user keypair (secp256k1)                                │
│                                                                      │
│ 3. Encrypt payload with TEE pubkey (ECIES):                         │
│    {                                                                 │
│      provider_url: "https://api.anthropic.com/v1/messages",         │
│      api_key: "sk-ant-...",                                         │
│      model: "claude-3-haiku-20240307",                              │
│      messages: [{ role: "user", content: "..." }],                  │
│      max_tokens: 1024                                                │
│    }                                                                 │
│                                                                      │
│ 4. POST /v1/generate                                                │
│    {                                                                 │
│      encrypted_payload: "<base64>",                                 │
│      ephemeral_pubkey: "<hex>",                                     │
│      nonce: "<hex>",                                                │
│      user_pubkey: "<hex>"                                           │
│    }                                                                 │
│    + X-Payment header (x402)                                        │
│                                                                      │
│ 5. ← { encrypted_response, response_nonce, receipt }                │
│                                                                      │
│ 6. Decrypt response with user private key                           │
│ 7. Verify receipt signature                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         VIN NODE (TEE)                               │
├─────────────────────────────────────────────────────────────────────┤
│ On startup:                                                          │
│ - Derive encryption keypair from dstack KMS (or generate ephemeral) │
│ - Derive signing keypair (ed25519) for receipts                     │
│                                                                      │
│ On /v1/generate:                                                     │
│ 1. Verify x402 payment                                              │
│ 2. ECIES decrypt payload with TEE secret key                        │
│ 3. Call user's LLM provider with user's API key                     │
│ 4. ECIES encrypt response with user's pubkey                        │
│ 5. Sign receipt with node's ed25519 key                             │
│ 6. Return encrypted_response + receipt                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Encryption: secp256k1 ECIES

Using EVM-compatible cryptography (same curve as Ethereum wallets):

1. **ECDH**: Ephemeral keypair + recipient pubkey → shared secret
2. **HKDF**: Derive AES-256 key from shared secret
3. **AES-GCM**: Encrypt/decrypt with derived key

```typescript
// User encrypts for TEE
const encrypted = encrypt(payload, teePubkey);
// → { ciphertext, ephemeralPubkey, nonce }

// TEE decrypts
const payload = decrypt(ciphertext, ephemeralPubkey, nonce, teeSecretKey);
```

## LLM Provider Support

VIN proxies to any LLM with OpenAI-compatible or Anthropic API:

| Provider | URL | Detection |
|----------|-----|-----------|
| Anthropic | `api.anthropic.com` | Auto |
| OpenAI | `api.openai.com` | Auto |
| Groq | `api.groq.com` | OpenAI-compat |
| Together | `api.together.xyz` | OpenAI-compat |
| Local | `localhost:*` | OpenAI-compat |

## Receipt Schema (ReceiptV0)

```typescript
interface ReceiptV0 {
  schema: "vin.receipt.v0";
  node_pubkey: string;          // ed25519 pubkey (base64url)
  issued_at: string;            // ISO timestamp
  expires_at: string;           // ISO timestamp
  nonce: string;                // Replay protection
  
  inputs_hash: string;          // SHA-256 of canonicalized request
  output_hash: string;          // SHA-256 of canonicalized output
  
  signature: string;            // ed25519 signature (base64url)
  
  attestation?: {               // Present when in TEE
    type: "tdx.dstack.v0";
    report: string;
    measurement: string;
  };
  
  payment?: {                   // Present when x402 paid
    type: "x402.v0";
    commitment: string;
  };
}
```

## Security Properties

| Property | Guarantee | Mechanism |
|----------|-----------|-----------|
| API key confidentiality | Keys never leave TEE | ECIES encryption |
| Response integrity | Output matches signed hash | SHA-256 + ed25519 |
| Replay protection | Nonces rejected after use | In-memory cache |
| TEE binding | Receipt tied to attested runtime | TDX attestation |
| Provider flexibility | Works with any LLM | Generic HTTP proxy |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Node status + pubkeys |
| GET | `/v1/tee-pubkey` | Encryption pubkey + attestation |
| GET | `/v1/policies` | Supported action types |
| GET | `/v1/attestation` | Full TEE attestation report |
| POST | `/v1/generate` | Confidential LLM proxy (x402 gated) |
| POST | `/v1/verify` | Verify a receipt |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VIN_PORT` | Server port | 3402 |
| `VIN_KEY_PATH` | Persistent signing key path | (ephemeral) |
| `VIN_TEST_MODE` | Allow `?paid=true` bypass | 0 |
| `VIN_PAY_TO` | x402 payment address | node operator |
| `VIN_PRICE_USD` | Price per generation | $0.001 |
| `DSTACK_SIMULATOR_ENDPOINT` | dstack agent URL | localhost:8090 |

## Deployment

### Local Docker
```bash
docker build -t vin-node -f vin-node/Dockerfile .
docker run -p 3402:3402 -e VIN_TEST_MODE=1 vin-node
```

### Phala Cloud (TEE)
```bash
npx phala deploy -n vin-node -c docker-compose.yml
```

## Testing

```bash
# Unit tests
cd vin-node && bun test

# E2E test (requires running container)
bun test-e2e.ts
```
