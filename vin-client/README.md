# @vin/client

Simple client SDK for VIN (Verifiable Inference Network).

## Installation

```bash
bun add @vin/client viem
```

## Usage

```typescript
import { VINClient } from '@vin/client';
import { privateKeyToAccount } from 'viem/accounts';

// Create account for x402 payments
const account = privateKeyToAccount('0x...');

// Initialize client
const client = new VINClient({
  nodeUrl: 'https://your-vin-node.com',
  account,
});

// Make a confidential LLM call
const result = await client.generate({
  provider_url: 'https://api.anthropic.com/v1/messages',
  api_key: 'sk-ant-...', // Your API key - encrypted before sending
  model: 'claude-3-opus-20240229',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.text);       // LLM response
console.log(result.receipt);    // Signed proof of generation
console.log(result.usage);      // Token usage
```

## How it Works

1. **Encryption**: Your API key and messages are ECIES-encrypted for the VIN node's TEE
2. **Payment**: x402 micropayment is made via USDC on Base
3. **Generation**: VIN node decrypts, calls the LLM, and signs a receipt
4. **Decryption**: Response is encrypted back to you and decrypted locally

## Features

- 🔒 **Confidential** - API keys never leave your machine unencrypted
- 💸 **Paid** - x402 micropayments via USDC on Base
- 📜 **Verifiable** - Signed receipts prove generation occurred in TEE
- 🔗 **Multi-provider** - Works with any OpenAI-compatible or Anthropic API

## API

### `VINClient`

```typescript
new VINClient({
  nodeUrl: string,     // VIN node URL
  account: Account,    // Viem account for payments
  fetch?: typeof fetch // Custom fetch (optional)
})
```

### `client.generate(request)`

Make a confidential LLM call.

```typescript
interface LLMRequest {
  provider_url: string;
  api_key: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

interface GenerateResult {
  text: string;
  usage?: { input_tokens: number; output_tokens: number };
  receipt: VINReceipt;
  request_nonce: string;
}
```

### `client.computeCommitment(request)`

Compute the commitment hash for receipt verification.

```typescript
const commitment = client.computeCommitment({
  provider_url: 'https://api.anthropic.com/v1/messages',
  model: 'claude-3-opus-20240229',
  messages: [{ role: 'user', content: 'Hello!' }],
});

// Compare with receipt.inputs_commitment (which contains [commitment:...])
```

## License

MIT
