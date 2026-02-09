# ISM Implementation Red-Team (2026-02-09)

## Findings

### P0 — Critical TODOs
1. **Source signature not verified** (line ~108): `api_signed` sources with pubkeys only check if signature exists, never verify it. An attacker can pass any string as `source_signature`.
2. **Block hash not verified** (line ~115): `blockchain_event` sources only check if `block_hash` is present, never verify the block exists on-chain. Fake block hashes accepted.

### P1 — Design Gaps
3. **Global sequence counter**: `sequenceCounter` is module-level, shared across all ISM instances in the same process. If two ISM instances run in one process, sequences interleave. Should be per-instance.
4. **No replay protection**: Same input can be attested multiple times. No check for duplicate `input_hash` + `source_id` pairs.
5. **No timestamp validation**: `received_at` is set from `Date.now()` with no bounds checking. Attacker controlling system clock can backdate attestations.
6. **No input size limit**: Large inputs (100MB+) will be hashed but could DoS the ISM.

### P2 — Hardening
7. **Error messages leak source IDs**: Error messages expose which sources are approved, aiding attacker enumeration.
8. **Private key in memory**: `config.private_key` stored as plain Uint8Array. In TEE this is fine; outside TEE it's a risk.
9. **JSON serialization for hashing**: Object key ordering in `JSON.stringify` is deterministic in V8 but not guaranteed by spec. Could cause cross-runtime verification failures.

## Recommended Fix Priority
1. Implement Ed25519 signature verification for `api_signed` (P0)
2. Move `sequenceCounter` to per-instance (P1)
3. Add replay detection with bounded cache (P1)
4. Add input size limit (P1)
5. Block hash verification needs RPC call — design decision on whether ISM should have network access

## Status
- Prototype: 210+ LOC, 27 tests (was 20)
- **P0 #1 FIXED**: Ed25519 source signature verification implemented
- **P1 #3 FIXED**: Sequence counter moved to per-instance
- **P1 #4 FIXED**: Replay detection with bounded Set (10k max)
- **P1 #6 FIXED**: Input size limit (1MB default, configurable)
- **P2 #7 FIXED**: Generic "Input rejected" errors prevent source enumeration
- Remaining: P0 #2 (block hash RPC verification — design decision), P2 #8, P2 #9
