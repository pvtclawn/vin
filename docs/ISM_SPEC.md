# Input Sanitization Module (ISM) - Technical Spec (DRAFT)

## Overview

A minimal TEE component that gates agent inputs, proving they came from approved non-human sources.

## Core Principle

Instead of running the full agent in TEE (high adoption barrier), run only the input validation layer in TEE. The agent can run anywhere, but must route inputs through ISM to get autonomy attestation.

## Architecture

```
                    ┌─────────────────────────────────┐
                    │  ISM (TEE)                      │
                    │  ┌───────────────────────────┐  │
Approved Sources ──▶│  │ Input Validator           │  │
(APIs, contracts,   │  │ - Verify source signature │  │
 other ISMs)        │  │ - Check allowlist         │  │
                    │  │ - Timestamp + sequence    │  │
                    │  │ - Block human patterns    │  │
                    │  └───────────────────────────┘  │
                    │              │                  │
                    │              ▼                  │
                    │  ┌───────────────────────────┐  │
                    │  │ Attestation Signer        │  │
                    │  │ - Sign sanitized input    │  │
                    │  │ - Include TEE attestation │  │
                    │  └───────────────────────────┘  │
                    └──────────────┬──────────────────┘
                                   │
                                   ▼ Signed Input Attestation
                    ┌─────────────────────────────────┐
                    │  Agent (runs anywhere)          │
                    │  - Receives attested input      │
                    │  - Processes with LLM (via VIN) │
                    │  - Output bound to input hash   │
                    └─────────────────────────────────┘
```

## Input Attestation Schema

```typescript
interface InputAttestation {
  // Core fields
  schema: "ism.input.v0";
  ism_id: string;              // ISM instance identifier
  ism_pubkey: string;          // Ed25519 pubkey for verification
  
  // Input data
  input_hash: string;          // SHA-256 of raw input
  input_type: InputType;       // "blockchain_event" | "api_signed" | "ism_chain" | "cron"
  input_source: string;        // Source identifier
  
  // Temporal
  received_at: number;         // Unix timestamp (ms)
  sequence: number;            // Monotonic counter for this source
  
  // Source verification
  source_signature?: string;   // Signature from input source
  source_pubkey?: string;      // Pubkey of input source
  block_hash?: string;         // For blockchain events
  
  // TEE attestation
  tee_attestation: {
    type: "tdx" | "sgx" | "nitro" | "none";
    report?: string;           // Base64 attestation report
    measurement?: string;      // Code measurement hash
  };
  
  // ISM signature
  sig: string;                 // Ed25519 signature over all above
}

type InputType = 
  | "blockchain_event"   // On-chain event (self-attesting)
  | "api_signed"         // API with signature (e.g., exchange data feed)
  | "ism_chain"          // Output from another ISM
  | "cron"               // Time-triggered (ISM-internal)
  | "vrf_challenge";     // VRF-generated challenge
```

## Approved Input Sources

### Tier 1: Self-Attesting (Highest Trust)
- **Blockchain events**: Verified via block hash + merkle proof
- **Other ISMs**: Chain of ISM attestations
- **VRF challenges**: ISM-generated unpredictable challenges

### Tier 2: Signed APIs (High Trust)
- Data feeds with cryptographic signatures
- Must be from pre-registered pubkeys
- Example: Chainlink price feeds, signed exchange data

### Tier 3: Time-Based (Medium Trust)
- Cron triggers (ISM-internal timer)
- Must include recent block hash for freshness

### Blocked (Never Approved)
- Direct HTTP without signature
- WebSocket messages without auth
- Any input matching human typing patterns

## Human Detection Heuristics

ISM applies heuristics to detect human-authored input:

```typescript
interface HumanDetection {
  // Timing patterns
  keystroke_variance: boolean;     // Human typing has irregular timing
  too_slow: boolean;               // < 10 chars/sec suggests human
  pause_patterns: boolean;         // Human pauses to think
  
  // Content patterns  
  typo_corrections: boolean;       // Backspace patterns
  natural_language_prompt: boolean; // "Please do X" style
  copy_paste_markers: boolean;     // Large instant chunks
  
  // Behavioral
  interactive_session: boolean;    // Back-and-forth pattern
  time_of_day_human: boolean;      // Active during human hours only
}

function isLikelyHuman(input: RawInput): boolean {
  const detection = analyzeInput(input);
  const score = computeHumanScore(detection);
  return score > HUMAN_THRESHOLD; // e.g., 0.7
}
```

## ISM Endpoints

```
POST /v1/attest
  Body: { input, source_type, source_signature?, ... }
  Returns: InputAttestation
  
GET /v1/sources
  Returns: List of approved input sources
  
POST /v1/sources/register
  Body: { source_type, pubkey, metadata }
  Returns: Registration confirmation
  
GET /v1/attestation/:hash
  Returns: Stored attestation by input hash
  
GET /v1/health
  Returns: ISM status + TEE attestation
```

## Integration with VIN

VIN receipts can optionally include ISM attestation:

```typescript
interface ReceiptV1 extends ReceiptV0 {
  input_attestation?: {
    ism_id: string;
    attestation_hash: string;  // Hash of full InputAttestation
    attestation_sig: string;   // ISM signature
  };
}
```

When present, verifiers can:
1. Fetch full attestation from ISM
2. Verify ISM signature
3. Verify TEE attestation
4. Confirm input came from approved source

## Deployment Options

### Option A: VIN-Integrated
ISM runs as a module within VIN node (same TEE).
- Simpler deployment
- Single attestation covers both

### Option B: Standalone ISM
ISM runs as separate TEE service.
- Can serve multiple agents
- More flexible architecture
- Higher availability

### Option C: Client-Side ISM
Lightweight ISM runs on agent's machine (with TEE).
- Lowest latency
- Requires client TEE hardware

## Trust Levels

| Configuration | Confidence Level |
|---------------|------------------|
| No ISM | 0% (anyone can fake) |
| ISM + blockchain inputs only | 80-85% |
| ISM + multiple sources + VRF challenges | 85-90% |
| ISM + reputation + behavioral analysis | 90-95% |
| ISM + economic stakes | 95%+ |

## Implementation Phases

### Phase 1: Core ISM
- [ ] Input validation logic
- [ ] Ed25519 signing
- [ ] Blockchain event verification
- [ ] Basic TEE attestation

### Phase 2: Source Integration
- [ ] Signed API support
- [ ] ISM chaining protocol
- [ ] VRF challenge generation

### Phase 3: Human Detection
- [ ] Typing pattern analysis
- [ ] Content heuristics
- [ ] Behavioral scoring

### Phase 4: VIN Integration
- [ ] Receipt extension
- [ ] Verification flow
- [ ] Client SDK updates

---

*DRAFT - Awaiting Egor's go-ahead*
