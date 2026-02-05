# VIN Project Plan

## Current Status: Confidential LLM Proxy ✅

VIN is now a **Confidential LLM Proxy**

### 🎯 NEXT TASK: Document key compromise recovery

**File:** `docs/SECURITY.md`
**Add section:** "Key Compromise Recovery"
- What to do if node's ed25519 key is exposed
- Revocation mechanism (or lack thereof)
- Recommendation for key rotation schedule

**Acceptance:** SECURITY.md updated, commit pushed — users encrypt their API keys and prompts with the TEE pubkey, VIN decrypts inside TEE, calls the user's LLM provider, and returns an encrypted response with a signed receipt.

---

## Today's Progress (2026-02-05)

### Trust Model Work
- Added SECURITY.md documenting trust assumptions + limitations
- Added P3 trust hardening tasks from challenge review
- Fixed leaked API key (now uses env var)
- Pushed 3 commits: 28a5c9b, f8d86ae, 67d1e66

### Blocked
- Real API key test — waiting for new OpenRouter key

---

## Yesterday's Progress (2026-02-04)

### Architecture Pivot
- Shifted from "hardcoded LLM provider" to "confidential proxy"
- User brings their own API keys (BYOK)
- VIN node needs ZERO secrets
- Works with ANY LLM provider

### Commits (23 total)
- `f1f1a65` RFC 8785 canonicalization (JCS)
- `9f7302c` Real LLM inference (Anthropic adapter)
- `b9d1ccf` PoSw verifies receipts cryptographically
- `d6ba678` Persistent node identity
- `e8ebfa7` Honest README positioning
- `483ed20` x402 test mode gate
- `28c1ff7` dstack TEE integration
- `7bf2652` Confidential Proxy architecture (NaCl)
- `1201b71` Switch to secp256k1 ECIES (EVM compatible)
- `e7fc82a` E2E test passing in Docker
- `2f6e42c` Updated docs with architecture

### E2E Test Results
- ✅ Docker container runs
- ✅ secp256k1 ECIES encryption/decryption works
- ✅ LLM proxy call works (401 with fake key = decryption succeeded)
- ⏳ Need real API key to test full response encryption

---

## Completed Phases

### P0 — Makes VIN Meaningful ✅
- [x] RFC 8785 canonicalization
- [x] Real LLM inference
- [x] PoSw verifies receipts

### P1 — Makes VIN Credible ✅
- [x] Persistent node identity
- [x] Honest README
- [x] x402 test mode gate

### P2 — Makes VIN Strong ✅
- [x] dstack TEE integration
- [x] Confidential Proxy (secp256k1 ECIES)
- [x] E2E Docker test

---

## Remaining Work

### P3 — Trust Model Hardening

**P0 — Documentation Gaps (from 12:00 challenge)**
- [ ] Document key compromise recovery process (what if ed25519 key leaks?)
- [ ] Clarify receipt semantics: "proves node processing, NOT upstream model authenticity"
- [x] ✅ Nonce generation verified: crypto.getRandomValues (128-bit)

**P1 — TEE Trust Assumption**
- [ ] Document reproducible build process
- [ ] Publish container image hashes
- [ ] Add code hash to attestation endpoint

**P2 — Response Verification**
- [ ] Research model fingerprinting (token probabilities?)
- [ ] Consider cross-node verification design

**P2 — Economic Incentives**
- [ ] Design stake/slash mechanism
- [ ] Plan reputation system based on posw challenges
- [ ] Define quality tiers

**P4 — Privacy Hardening**
- [ ] Optional response padding (hide token count)
- [ ] Artificial latency jitter (hide processing patterns)

### For Production
- [ ] Test with real Anthropic API key
- [ ] Deploy to Phala Cloud
- [ ] Add more LLM providers (OpenAI, Groq)
- [ ] Real x402 facilitator integration

### Nice to Have
- [ ] Encypher layer (invisible watermarking)
- [ ] Persistent replay cache (sqlite)
- [ ] Response encryption for user
- [ ] Multi-node discovery via ERC-8004 registry

---

## Key Files

| File | Purpose |
|------|---------|
| `vin-node/src/server.ts` | HTTP server, endpoints |
| `vin-node/src/crypto.ts` | secp256k1 ECIES encryption |
| `vin-node/src/llm-proxy.ts` | Generic LLM caller |
| `vin-node/src/receipt.ts` | Receipt creation/verification |
| `vin-node/src/tee.ts` | dstack TEE integration |
| `docs/ARCHITECTURE.md` | Full architecture docs |

---

## Tests

```bash
cd vin-node
bun test           # 12 tests
bun test-e2e.ts    # E2E (needs running container)
```
