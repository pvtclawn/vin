# VIN Project Plan

## Current Status: Phase 4 COMPLETE ✅ (but with critical gaps per VIN_REVIEW_001)

---

## Critical Review Summary (VIN_REVIEW_001)

**What's working:**
- ✅ Receipt primitive (ed25519, tamper-evident)
- ✅ /v1/verify with tests (6 passing)
- ✅ PoSw orchestrator exists
- ✅ Docker packaging
- ✅ ERC-8004 registration (Agent ID 1391)

**What breaks the promise:**
1. ❌ LLM call is stubbed (just echoes)
2. ❌ x402 is bypassable flag (not real payment)
3. ❌ Attestation stubbed (returns 'none')
4. ❌ Canonical JSON not RFC 8785 (can break cross-impl)
5. ❌ Replay protection in-memory only
6. ❌ PoSw doesn't verify receipts (just checks sig exists)
7. ⚠️ README claim too strong ("prove not human")
8. ❌ Keys regenerate on boot (breaks identity)

---

## Priority Tasks (from review)

### P0 — MUST DO (makes VIN meaningful)

- [x] **RFC 8785 canonicalization**: ✅ Implemented in node + orchestrator
  - Added `canonicalize` library (RFC 8785 JCS)
  - 8 tests passing (2 new canonicalization tests)
  - Commit: f1f1a65

- [ ] **Real LLM inference**: Implement Anthropic adapter
  - VIN_LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY
  - Wire into generateOutput()
  - Add mock tests (no network in unit tests)

- [ ] **PoSw must verify receipts**: Orchestrator calls /v1/verify or implements locally
  - Currently just checks "sig exists"
  - Score should include receipt_valid_rate from real verification

### P1 — SHOULD DO (makes VIN credible)

- [ ] **Real x402 verification**: Implement facilitator verify/settle
  - Include payment_ref + payment_commitment in receipt
  - Remove ?paid=true (keep behind VIN_TEST_MODE=1)

- [ ] **Persistent node identity**: Save keys to disk
  - VIN_KEY_PATH=./data/node.key
  - Derive from seed or persist encrypted

- [ ] **Fix README positioning**: 
  - "Proof of Untampered AI Generation" not "prove not human"
  - Keep "inverse captcha" as tagline only

### P2 — NICE TO HAVE (makes VIN strong)

- [ ] **dstack attestation for real**: Deploy to TDX, return real report
  - Bind report_hash into receipt
  - Update verifier to optionally require attestation

- [ ] **Encypher layer**: Invisible manifest embedding
  - ENCYPHER_ENABLE=1 path
  - Survivability matrix testing

- [ ] **Persistent replay cache**: sqlite/leveldb instead of in-memory

---

## Completed Phases

### Phase 0 — ReceiptV0 + /v1/verify ✅
- [x] ReceiptV0 schema, ed25519 signing, tests

### Phase 1 — x402 Payment Gating ✅ (stub)
- [x] 402 response + X-Payment header check
- [ ] TODO: Real facilitator integration (P1)

### Phase 2 — PoSw Orchestrator ✅ (needs fix)
- [x] Parallel blast + latency tracking
- [ ] TODO: Real receipt verification (P0)

### Phase 3 — Docker + TEE Prep ✅
- [x] Dockerfile, docker-compose, tested
- [ ] TODO: Real dstack deployment (P2)

### Phase 4 — ERC-8004 ✅
- [x] Agent ID 1391 registered
- [x] IPFS: bafybeiadrz4xv22vo4kdzvid5t6fbdi5bvjstfwalaho3quuowu3rttxyu

---

## NEXT TASK
**P0: Implement RFC 8785 canonicalization** (smallest P0, unblocks others)

---

## Reference Docs
- docs/VIN_REVIEW_001.txt — Critical review with all findings
- docs/VIN_PROTOCOL.md — Updated protocol spec
- docs/REF_X402.md, REF_DSTACK.md, REF_ERC8004.md

*Last updated: 2026-02-04*
