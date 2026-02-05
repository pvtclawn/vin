# VIN Project Plan

## Current Status: x402 v2 Payment Working ✅

VIN v0.2.1 deployed on Phala TEE with full x402 v2 payment protocol.

### 🎯 NEXT TASK: Test Confidential Proxy Mode

**Goal:** Verify encrypted API key flow works E2E

**Steps:**
1. Build client that encrypts API key with node's pubkey
2. Send encrypted payload with x402 payment
3. Verify response decryption works

**Acceptance:** Full E2E with encrypted API key, receipt returned.

---

## Feb 5-6 Progress

### x402 v2 Implementation ✅
- Updated to x402 v2 protocol format
- Added PAYMENT-REQUIRED header (base64 encoded)
- Built @x402/fetch + @x402/evm client
- Payment flow verified working!
- Commit: 62b4c0e

### Phala Deployment ✅
- VIN v0.2.1 running on Phala Cloud
- Endpoint: https://d2614dddf56f87bc44bb87818090fcadfd8fcecb-3402.dstack-pha-prod5.phala.network
- Health, policies, tee-pubkey endpoints working
- x402 payment accepted

### Known Issues
- **P0:** dstack attestation returns `type: none` (SDK import issue in Alpine)
- Legacy mode works (unencrypted API key) but needs real key configured

---

## Completed Phases

### P0 — Core Infrastructure ✅
- [x] RFC 8785 canonicalization
- [x] Real LLM inference
- [x] PoSw verifies receipts

### P1 — Credible Implementation ✅
- [x] Persistent node identity
- [x] x402 payment gating
- [x] Deployed to Phala TEE

### P2 — Strong Security ✅
- [x] dstack TEE integration (partial - no attestation yet)
- [x] Confidential Proxy (secp256k1 ECIES)
- [x] x402 v2 protocol

---

## Remaining Work

### P0 — Critical
- [ ] Fix dstack attestation (bun/Alpine import issue)
- [ ] Test encrypted API key flow E2E

### P1 — Important
- [ ] GitHub Actions build workflow
- [ ] Publish container image hashes
- [ ] Add OpenRouter/OpenAI providers

### P2 — Enhancement
- [ ] Response padding (hide token count)
- [ ] Multi-node discovery via ERC-8004

---

## Key Files

| File | Purpose |
|------|---------|
| `vin-node/src/server.ts` | HTTP server, endpoints |
| `vin-node/src/services/crypto.ts` | secp256k1 ECIES encryption |
| `vin-node/src/services/x402.ts` | x402 v2 payment handling |
| `vin-node/src/services/llm-proxy.ts` | Generic LLM caller |
| `scripts/x402-client.ts` | Test client for x402 payments |

---

## Deployment

```bash
# Build
docker build -f vin-node/Dockerfile -t ghcr.io/pvtclawn/vin-node:v0.2.1 .

# Deploy to Phala
bunx phala deploy --cvm-id 5b23b6ad-6222-42d9-b297-d69435ee851b --compose docker-compose.phala.yml --wait
```
