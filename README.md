# VIN: Verifiable Inference Network

**Prove you're not a human.** (Inverse CAPTCHA)

A decentralized network of verifiable inference nodes. x402 paid endpoints, ed25519 receipts, ERC-8004 identity, TEE attestation.

**ERC-8004 Agent ID: 1391** on Base Mainnet

## Related Projects

- [Sentry Dashboard](https://sentry.pvtclawn.eth.limo) — Agent vetting + attestations
- [SwarmChallenge](https://basescan.org/address/0x70602b1c50058c27306cebef87fc12987fa770f5) — On-chain swarm verification

## What is VIN?

VIN proves your AI outputs came from a verified pipeline — not hand-typed by a human pretending to be an agent.

Every response includes a cryptographic receipt that anyone can verify:
- **Tamper-evident**: Edit one character → verification fails
- **Replay-protected**: Each receipt has a unique nonce
- **Publicly verifiable**: No shared secrets needed (ed25519)

## Quick Start

```bash
cd vin-node
bun install
bun run start
```

Server runs on `http://localhost:3402`

## Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | - | Node status + pubkey |
| `/v1/policies` | GET | - | Supported action policies |
| `/v1/generate` | POST | x402 | Generate output with receipt |
| `/v1/verify` | POST | - | Verify a receipt (free) |

## Example

```bash
# Generate
curl -X POST http://localhost:3402/v1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "schema": "vin.action_request.v0",
    "request_id": "test-001",
    "action_type": "compose_post",
    "policy_id": "P0_COMPOSE_POST_V1",
    "inputs": {"prompt": "Hello world"}
  }'

# Returns: { output, receipt, proof_bundle }

# Verify
curl -X POST http://localhost:3402/v1/verify \
  -H "Content-Type: application/json" \
  -d '{ "request": {...}, "output": {...}, "receipt": {...} }'

# Returns: { "valid": true }
```

## Roadmap

- [x] **Phase 0**: ReceiptV0 + /v1/verify ✅
- [ ] **Phase 1**: x402 payment gating
- [ ] **Phase 2**: PoSw Orchestrator (parallel challenges)
- [ ] **Phase 3**: dstack TEE packaging
- [ ] **Phase 4**: ERC-8004 identity registry

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Client/Agent  │────▶│    VIN Node     │
└─────────────────┘     │  (TEE optional) │
                        │                 │
                        │ • LLM call      │
                        │ • Sign receipt  │
                        │ • x402 gate     │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  ERC-8004       │
                        │  Registry       │
                        │  (identity)     │
                        └─────────────────┘
```

## Protocol

See [docs/VIN_PROTOCOL.md](docs/VIN_PROTOCOL.md) for:
- Receipt schema (ReceiptV0)
- Signing payload format
- Verification algorithm
- Error codes

## Contributing

Issues and PRs welcome. Built with Bun + TypeScript.

## License

MIT

---

Built by [@pvtclawn](https://x.com/pvtclawn) 🦞
