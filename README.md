# VIN: Verifiable Inference Network

**Proof of Untampered AI Generation**

> *"Inverse CAPTCHA"* — prove your output came from an AI pipeline, not hand-typed by a human.

A **Confidential LLM Proxy** running in TEE. Users encrypt their API keys and prompts; VIN decrypts inside the trusted environment, calls the LLM, and returns a signed receipt proving the generation happened inside an attested runtime.

**ERC-8004 Agent ID: 1391** on Base Mainnet

## What VIN Proves

- ✅ **Tamper-evidence**: output text matches what the node signed
- ✅ **Pipeline integrity**: output flowed through a specific node implementation
- ✅ **Key confidentiality**: your API keys never leave the TEE
- ✅ **Environment integrity** (with TEE): signing key bound to measured runtime

## What VIN Does NOT Prove

- ❌ "No human ever influenced the prompt"
- ❌ The model "truly reasoned" vs. retrieved/copied
- ❌ A specific proprietary model was used (unless TEE + policy enforced)

> **Honest claim**: "this text was produced and signed by an attested generation pipeline, using credentials that never left the TEE."

## Quick Start

```bash
# Get TEE encryption pubkey
curl http://localhost:3402/v1/tee-pubkey

# Encrypt your payload (see docs/ARCHITECTURE.md)
# POST to /v1/generate with encrypted_payload
```

## Architecture

VIN is a **Confidential LLM Proxy**:

1. User encrypts `{ api_key, provider_url, messages }` with TEE pubkey
2. TEE decrypts, calls user's LLM provider
3. TEE encrypts response, signs receipt
4. User decrypts response, verifies receipt

**VIN node needs ZERO secrets** — users bring their own API keys.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Features

- **secp256k1 ECIES encryption** — EVM-compatible, same curve as Ethereum wallets
- **Any LLM provider** — Anthropic, OpenAI, Groq, local, self-hosted
- **x402 payment gating** — micropayments for each generation
- **ed25519 receipts** — cryptographic proof of generation
- **dstack TEE** — Intel TDX attestation when deployed to Phala

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Node status + pubkeys |
| GET | `/v1/tee-pubkey` | Encryption pubkey + attestation |
| POST | `/v1/generate` | Confidential LLM proxy (x402 gated) |
| POST | `/v1/verify` | Verify a receipt |

## Development

```bash
cd vin-node
bun install
bun test          # 12 tests
bun run dev       # Start server
bun test-e2e.ts   # E2E test (needs running server)
```

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

## Related Projects

- [Sentry Dashboard](https://sentry.pvtclawn.eth.limo) — Agent vetting + attestations
- [SwarmChallenge](https://basescan.org/address/0x70602b1c50058c27306cebef87fc12987fa770f5) — On-chain swarm verification

## License

MIT
