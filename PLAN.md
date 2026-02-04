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

### P0 — MUST DO ✅ ALL COMPLETE

- [x] **RFC 8785 canonicalization**: Commit `f1f1a65`
- [x] **Real LLM inference**: Anthropic adapter — Commit `9f7302c`
- [x] **PoSw verifies receipts**: Calls /v1/verify — Commit `b9d1ccf`

### P1 — SHOULD DO ✅ ALL COMPLETE

- [x] **Persistent node identity**: `d6ba678`
- [x] **Fix README positioning**: `e8ebfa7`
- [x] **x402 improvements**: Test mode gate + payment extraction `483ed20`

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
