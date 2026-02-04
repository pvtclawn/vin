# Protocol: Verifiable Inference Node (VIN) + Proof-of-Swarm (PoSw)
Version: **v0.1 (MVP)**  
Status: **draft, implement-first**  
Scope: Defines **wire formats**, **receipt signing**, and **verification rules** for:
- a **VIN Node** (paid inference boundary + receipts)
- a **PoSw Orchestrator** (parallel challenges + scoring)
- optional integrity add-ons: **TEE attestation** and **Encypher-style invisible manifests**

This protocol proves **tamper-evidence** (post-edit detection) and **pipeline integrity signals**, not metaphysical “no-human-involvement”.

---

## 0. Terminology

- **VIN Node**: a service run by an operator (potentially inside TEE) that executes LLM calls and emits verifiable receipts.
- **Orchestrator**: a challenger/verifier service that runs swarm rounds, verifies receipts, and scores nodes.
- **Receipt**: a signed, tamper-evident record binding **inputs → output** with anti-replay fields.
- **Policy**: a declared rule-set constraining which actions and inputs are valid (e.g., `compose_post`).
- **TEE Attestation**: optional proof binding the node signing key to a measured runtime (e.g., dstack CVM).
- **Encypher Manifest**: optional invisible metadata embedded into returned text; treated as a **bonus** signal.

---

## 1. Design Goals

### Must-haves (v0.1)
1. **Offline verifiability**: Anyone can verify a receipt using public keys.
2. **Tamper-evidence**: If published text is edited after receipt issuance, verification fails.
3. **LLM-agnostic**: Works with any provider/model; model info is carried as metadata.
4. **Operator-agnostic**: Anyone can run a node; orchestrator can score many nodes.
5. **Payment-agnostic envelope**: Supports x402 paywalling, but receipt format does not depend on payment vendor.

### Non-goals (v0.1)
- Proving “AI authored this idea”.
- Proving the prompt was not human-crafted.
- Preventing re-rolls (“generate until you like it”).
- ZK proof of inference for large LLMs.

---

## 2. Cryptography & Encoding

### 2.1 Hashing
- `sha256` over UTF-8 bytes
- output as lowercase hex (`0-9a-f`)
- field name: `*_hash`

### 2.2 Signatures
- Algorithm: **Ed25519**
- Public key encoding: `base64url` (no padding)
- Signature encoding: `base64url` (no padding)

### 2.3 Canonical JSON
All `*_commitment` fields are computed from **canonical JSON** of the relevant object.

**MVP rule**: Use a deterministic canonicalization implementation (recommend RFC 8785 JCS).
If JCS is unavailable, enforce:
- UTF-8
- object keys sorted lexicographically
- no insignificant whitespace
- numbers as JSON numbers (no strings)
- arrays preserve order

**Important**: Canonicalization MUST be consistent across node and verifier.

### 2.4 Nonce
- `nonce`: 16 random bytes, `base64url` encoded

### 2.5 Time
- `iat`, `exp`: Unix epoch seconds (integer)

---

## 3. Identities & Keys

### 3.1 Node signer key
Each VIN node has a long-lived Ed25519 keypair:
- `node_pubkey`: published
- `node_sig`: signatures over receipts

Key storage:
- MVP: local keystore / encrypted file
- v2: sealed inside a TEE, with attestation binding the key to the measured runtime

### 3.2 Optional onchain registry
This protocol does not mandate a registry, but recommends:
- mapping `node_pubkey` → endpoint URL + metadata URI
- later: ERC-8004 identity/validation registries

---

## 4. Core Objects

### 4.1 Policy ID
Policies are referenced by string, e.g.:
- `P0_COMPOSE_POST_V1`
- `P1_CHALLENGE_RESP_V1`

### 4.2 Action Request (node input)
`ActionRequestV0`:

```json
{
  "schema": "vin.action_request.v0",
  "request_id": "string",
  "action_type": "compose_post | challenge_response | generic",
  "policy_id": "string",
  "inputs": { "any": "json" },
  "constraints": {
    "max_chars": 280,
    "language": "en|ru|hy|any",
    "style_tags": ["string"]
  },
  "llm": {
    "provider": "string",
    "model_id": "string",
    "params": { "any": "json" }
  },
  "client": {
    "agent_id": "string",
    "callback": "string"
  }
}
Rules:

request_id MUST be unique per node for the replay window.

inputs SHOULD be structured (avoid raw free-text if you want stronger “not hand-edited” posture).

llm.params can include temperature, max_tokens, system prompt hash, etc.

4.3 Output object
OutputV0:

{
  "schema": "vin.output.v0",
  "format": "plain",
  "text": "string",
  "clean_text": "string"
}
text: may include invisible metadata (e.g., variation selectors).

clean_text: MUST be the “visible” version (node-defined normalization), intended for publishing.

Verification binds primarily to clean_text (portable across platforms).

4.4 Receipt (the key artifact)
ReceiptV0:

{
  "schema": "vin.receipt.v0",
  "version": "0.1",
  "node_pubkey": "base64url(ed25519_pubkey)",
  "request_id": "string",
  "action_type": "string",
  "policy_id": "string",

  "inputs_commitment": "hex(sha256(canon_json(request.inputs)))",
  "constraints_commitment": "hex(sha256(canon_json(request.constraints)))",

  "llm_commitment": "hex(sha256(canon_json({provider, model_id, params})))",

  "output_clean_hash": "hex(sha256(output.clean_text))",
  "output_transport_hash": "hex(sha256(output.text))",

  "iat": 1730000000,
  "exp": 1730000600,
  "nonce": "base64url(16 bytes)",

  "attestation": {
    "type": "none | dstack | other",
    "report_hash": "hex(sha256(report_bytes))",
    "measurement": "string"
  },

  "payment": {
    "type": "none | x402 | other",
    "payment_ref": "string",
    "payment_commitment": "hex(sha256(canon_json(payment_details)))"
  },

  "sig": "base64url(ed25519_signature)"
}
Notes:

output_transport_hash lets you verify the exact returned string (including invisible metadata) when it survives.

output_clean_hash is the portable anchor for publication and scoring.

attestation is optional in MVP; when present, report_hash MUST match the bytes returned by /v1/attestation or embedded report.

4.5 Receipt signing payload
To sign a receipt, the node constructs a canonical payload:

{
  "schema": "vin.receipt_payload.v0",
  "node_pubkey": "...",
  "request_id": "...",
  "action_type": "...",
  "policy_id": "...",
  "inputs_commitment": "...",
  "constraints_commitment": "...",
  "llm_commitment": "...",
  "output_clean_hash": "...",
  "output_transport_hash": "...",
  "iat": 1730000000,
  "exp": 1730000600,
  "nonce": "...",
  "attestation": { "type": "...", "report_hash": "...", "measurement": "..." },
  "payment": { "type": "...", "payment_ref": "...", "payment_commitment": "..." }
}
Then:

payload_bytes = UTF8(canon_json(payload))

sig = ed25519_sign(node_privkey, payload_bytes)

Verifiers MUST ignore any fields not present in the payload schema.

5. Verification Algorithm
Given:

ActionRequestV0 request

OutputV0 output

ReceiptV0 receipt

Steps:

Schema check: required fields present, types correct.

Time check:

receipt.iat <= now <= receipt.exp

reject if expired

Replay check:

(receipt.node_pubkey, receipt.nonce) must not have been seen within a configured window

optional: also enforce request_id uniqueness

Commitment recompute:

inputs_commitment == sha256(canon_json(request.inputs))

constraints_commitment == sha256(canon_json(request.constraints))

llm_commitment == sha256(canon_json(request.llm subset))

Output hash recompute:

output_clean_hash == sha256(output.clean_text)

output_transport_hash == sha256(output.text)

If the platform strips invisible metadata, verifiers MAY accept a missing/altered output_transport_hash only if output_clean_hash matches and policy allows it.

Attestation check (optional):

If attestation.type != "none", verify report integrity and measurement according to that attestation type.

Signature check:

Rebuild canonical payload

Verify ed25519_verify(node_pubkey, payload_bytes, sig)

Return:

{ valid: true } or { valid: false, reason: "..." }

6. HTTP API (VIN Node)
All endpoints are JSON over HTTPS.

6.1 GET /health
Returns:

{ "ok": true, "node_pubkey": "...", "version": "0.1" }
6.2 GET /v1/policies
Returns supported policies:

{
  "policies": [
    { "policy_id": "P0_COMPOSE_POST_V1", "action_type": "compose_post" },
    { "policy_id": "P1_CHALLENGE_RESP_V1", "action_type": "challenge_response" }
  ]
}
6.3 POST /v1/generate (PAID)
Input: ActionRequestV0

Output:

{
  "output": { ...OutputV0 },
  "receipt": { ...ReceiptV0 },
  "proof_bundle": {
    "attestation_report": "base64url(bytes) | null",
    "encypher": {
      "enabled": true,
      "details": { "any": "json" }
    }
  }
}
Payment:

If unpaid, server returns HTTP 402 with payment instructions (x402-compatible).

On paid request, server returns 200.

6.4 POST /v1/verify (FREE)
Input:

{ "request": {...}, "output": {...}, "receipt": {...} }
Output:

{ "valid": true }
or

{ "valid": false, "reason": "signature_invalid" }
6.5 GET /v1/attestation (FREE, OPTIONAL)
Returns:

{
  "type": "dstack",
  "measurement": "string",
  "report": "base64url(bytes)"
}
If not supported:

{ "type": "none" }
7. Payment (x402) Integration Notes (non-normative)
/v1/generate is expected to be gated via an HTTP 402 flow.

receipt.payment.payment_ref SHOULD reference the payment proof/tx-id/order-id.

payment_commitment MAY bind additional payment details into the receipt for auditability.

The receipt stays payment-agnostic so you can swap x402 implementations without breaking verification.

8. Proof-of-Swarm (PoSw) Round Format
PoSw is orchestrator-driven. Nodes simply respond to generate requests.
Orchestrator defines a round as a bundle of tasks.

8.1 Round definition
PoSwRoundV0:

{
  "schema": "posw.round.v0",
  "round_id": "string",
  "issued_at": 1730000000,
  "expires_at": 1730000060,
  "tasks": [
    {
      "task_id": "string",
      "action_type": "challenge_response",
      "policy_id": "P1_CHALLENGE_RESP_V1",
      "inputs": { "any": "json" },
      "constraints": { "any": "json" }
    }
  ]
}
Orchestrator sends each task as an ActionRequestV0 to each node (parallel blast).

8.2 Round result
PoSwScoreV0:

{
  "schema": "posw.score.v0",
  "round_id": "string",
  "nodes_tested": 128,
  "confidence": 0.93,
  "signals": {
    "completion_rate": 0.91,
    "latency_p50_ms": 320,
    "latency_p90_ms": 780,
    "latency_p99_ms": 1400,
    "receipt_valid_rate": 0.99
  },
  "valid_until": 1730003600,
  "orchestrator_pubkey": "base64url(ed25519_pubkey)",
  "sig": "base64url(ed25519_signature)"
}
9. Error Codes (recommended)
Node errors (/v1/generate)
400 invalid_request

403 policy_not_supported

409 replay_detected

429 rate_limited

500 generation_failed

Verify errors (/v1/verify)
signature_invalid

expired

commitment_mismatch

output_hash_mismatch

replay_detected

attestation_invalid (if required)

10. Backwards Compatibility
schema fields are versioned.

Additive fields allowed; verifiers must ignore unknown fields unless explicitly required by a newer schema version.

Breaking changes require new schema identifiers.

11. Minimal Compliance (MVP)
A VIN node is v0.1 compliant if it:

Implements ReceiptV0 signing and /v1/verify

Implements /v1/generate returning OutputV0 + ReceiptV0

Enforces nonce replay protection for at least the receipt validity window

Provides node_pubkey via /health

Everything else (TEE attestation, Encypher manifests, onchain registry) is optional.

::contentReference[oaicite:0]{index=0}
