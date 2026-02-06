# VIN Project Plan

## Current Status: PRODUCTION READY v0.3.1 ✅

All P0/P1 security issues addressed. Deployed to ghcr.io, ready for Phala redeploy.

### 🟡 STRATEGIC DIRECTION: Input Sanitization Module (ISM)

**Problem:** VIN proves LLM invocation, not autonomous operation. Human can still inject prompts.

**Solution identified:** Input Sanitization Module (ISM) — tiny TEE that only gates inputs:
1. Timestamps all inputs
2. Verifies inputs from approved sources (APIs, contracts)
3. Blocks direct human text injection
4. Signs sanitized input

**Why ISM over full agent TEE:**
- Orders of magnitude simpler
- No adoption barrier (agents run anywhere)
- ~90% confidence achievable with ISM + reputation + economic signals

**Red-teamed (5 attack vectors):** See `memory/challenges/2026-02-06--ism-red-team.md`

**Status:** Awaiting Egor's go-ahead to build ISM prototype

---

## v0.3.1 Shipped (Feb 6)

### Security Hardening (Opus 4.6 Review)
- [x] SSRF bypass chain fixed (IPv4-mapped IPv6, DNS caching)
- [x] Receipt commitment now verifiable (hash of decrypted request)
- [x] Response binding (request_nonce in encrypted response)
- [x] Legacy mode gated (requires VIN_ALLOW_LEGACY=1)
- [x] Rate limiting (100 burst, 10 req/s sustained)
- [x] Memory leak fixed (LRU cache with 10k max)
- [x] Error sanitization (no internal detail leakage)
- [x] TEE attestation fixed (HTTP instead of broken SDK)
- [x] x402 Coinbase facilitator integrated (real payment verification)

### Client SDK
- [x] `@vin/client` package created
- [x] Handles ECIES encryption, x402 payments, receipts
- [x] Simple API: `client.generate(request)`

### Commits
- `2d6ef75` - Critical Opus 4.6 fixes
- `84550e3` - Rate limiting
- `02937dc` - LRU cache
- `4677b5f` - Error sanitization
- `b78d0e8` - TEE attestation HTTP
- `f897bc6` - x402 facilitator
- `cef13a1` - Client SDK

---

## Deployment

### Current (Phala)
- **Image:** ghcr.io/pvtclawn/vin-node:v0.3.1 (needs redeploy)
- **Running:** v0.2 (outdated)
- **Endpoint:** https://d2614dddf56f87bc44bb87818090fcadfd8fcecb-3402.dstack-pha-prod5.phala.network

### To redeploy:
1. Update CVM with new docker-compose.phala.yml
2. Verify attestation endpoint returns `type: tdx.dstack.v0`

---

## Next Steps (Pending Direction)

### If continuing VIN as-is:
- [ ] Redeploy v0.3.1 to Phala
- [ ] Test attestation works with HTTP approach
- [ ] Publish `@vin/client` to npm
- [ ] Write docs/examples

### If pivoting to full agent attestation:
- [ ] Research continuous TEE attestation
- [ ] Design "verifiable agent runtime" spec
- [ ] Integrate with OpenClaw execution model

---

## Architecture

```
Client → ECIES encrypt(API key + prompt) → VIN Node (TEE)
                                              ↓
                                         Decrypt in TEE
                                              ↓
                                         Call LLM provider
                                              ↓
                                         Sign receipt
                                              ↓
                                         ECIES encrypt response
                                              ↓
Client ← { encrypted_response, receipt } ←───┘
```

**What receipt proves:** This text came from [model] at [time] in response to [commitment hash].

**What receipt does NOT prove:** The prompt was AI-generated or no human was involved.
