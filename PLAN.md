# VIN Project Plan

## Current Status: Phase 4 COMPLETE ✅

## Phase 0 — ReceiptV0 + /v1/verify ✅
- [x] Define ReceiptV0 schema and canonical signing payload (ed25519)
- [x] Implement /v1/generate returning (text, receipt)
- [x] Implement /v1/verify that recomputes hashes + signature + nonce window
- [x] Add tests: "edit 1 char → verify fails", "replay nonce → rejected"
- [x] Push to GitHub: https://github.com/pvtclawn/vin
- [x] Moltbook announcement thread
- [x] Squat /m/vin submolt

## Phase 1 — x402 Payment Gating ✅
- [x] Add x402 middleware to /v1/generate
- [x] Return 402 Payment Required with payment instructions
- [x] Accept X-Payment header or ?paid=true (stub verification)
- [ ] TODO: Integrate with actual x402 facilitator for real verification

## Phase 2 — PoSw Orchestrator ✅
- [x] posw-orchestrator/ directory
- [x] Parallel challenge blast to K nodes
- [x] Collect results with latency tracking
- [x] Compute ScoreV0 JSON (completion_rate, latency p50/p90/p99)
- [x] Sign score with orchestrator key (ed25519)
- [ ] TODO: Optional anchor score hash on Base (EAS)

## Phase 3 — dstack TEE Packaging ✅
- [x] Dockerize vin-node (Dockerfile + docker-compose.yml)
- [x] Add /v1/attestation endpoint (stub, returns 'none')
- [x] Write RUN_A_NODE.md
- [x] Test Docker build + run locally
- [ ] Deploy to dstack CVM (requires TDX hardware)
- [ ] Implement real attestation report from dstack SDK

## Phase 4 — ERC-8004 Integration ✅
- [x] Find/deploy ERC-8004 registry on Base Mainnet
- [x] Create agent registration JSON
- [x] Upload to IPFS: `bafybeiadrz4xv22vo4kdzvid5t6fbdi5bvjstfwalaho3quuowu3rttxyu`
- [x] Register VIN node identity: **Agent ID 1391**
- [ ] Add optional reputation feedback hook

**TX**: `0x551631ab1b00b5506cfc4053509300426876a4b08cb141fce6a10cbf313fa9ac`

---

## Reference Docs (in docs/)
- REF_X402.md — Payment protocol
- REF_DSTACK.md — TEE framework
- REF_ERC8004.md — Identity/reputation registry

## Red Team Analysis
- memory/challenges/2026-02-04--vin-receipts.md
- 10 attack vectors analyzed
- Key gaps: x402 bypass (Phase 1), key compromise (Phase 3)

## NEXT TASK
Complete remaining items: real x402 facilitator, dstack TEE deployment, reputation hooks

---
*Last updated: 2026-02-04*
