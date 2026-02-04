# VIN Protocol (v0.1)

Verifiable Inference Network (VIN): receipts + optional TEE attestation + paid HTTP (x402) + ERC-8004 identity.

## What VIN CAN Prove

- **Tamper-evidence**: the visible output text matches what the node signed.
- **Pipeline integrity signal**: the output flowed through a specific node implementation (optionally inside a TEE).
- **(Optional) Environment integrity**: with remote attestation, the receipt-signing key is bound to a measured TEE runtime.

## What VIN CANNOT Prove (by design)

- That "no human ever influenced the prompt."
- That the model "truly reasoned" vs. retrieved/copied.
- That the node used a specific proprietary model unless proven by attestation + policy controls.

> **VIN's honest claim**: "this text was produced and signed by an attested generation pipeline."
> Not: "a human definitely wasn't involved."

---

## 0. Roles

- **Client/Agent**: requests a paid generation and receives `(output, receipt, proof_bundle)`.
- **VIN Node**: performs the generation, signs a receipt, optionally runs in a TEE.
- **Verifier**: any party that checks `(request, output, receipt)` and returns `valid/invalid`.
- **Orchestrator (PoSw)**: runs parallel challenge rounds across nodes and computes a score.
- **Registry (ERC-8004)**: identity/discovery layer for nodes/agents and their endpoints.

---

## 1. Trust Levels (normative)

VIN supports multiple trust levels. Verifiers MUST treat them differently.

### L0 — Receipt-only (no TEE)
- Proof: ed25519 receipt binds `inputs -> output`.
- Guarantees: tamper-evidence after signing.
- Does NOT guarantee node software wasn't modified.

### L1 — Receipt + payment binding
- Adds: x402 payment verified/settled; receipt commits to payment payload/tx hash.
- Guarantees: request had an economic cost; reduces spam/fake swarms.

### L2 — TEE-attested receipt
- Adds: remote attestation report; node signing key bound to a measured runtime.
- Guarantees: the signer key lived inside a verified TEE running expected code/config.

### L3 — TEE-attested + PoSw scoring
- Adds: repeated successful rounds with verified receipts under timing constraints.
- Guarantees: sustained, scalable non-human operation signal.

---

## 2. Cryptography & Encoding

### 2.1 Canonicalization (MUST)
All signed payloads MUST be canonicalized using **RFC 8785 JSON Canonicalization Scheme (JCS)**.

- Hash input = UTF-8 bytes of JCS output.
- Any implementation that does not use RFC 8785 MUST be treated as non-conformant.

### 2.2 Hash (MUST)
- `sha256` over canonical bytes.
- Hex encoding: lowercase, no `0x` prefix.

### 2.3 Signatures (MUST)
- Algorithm: **Ed25519**.
- Signature over canonical receipt payload bytes.
- Signature encoding: base64url (no padding).

### 2.4 Base64url (MUST)
RFC 4648 URL-safe base64 without `=` padding.

---

## 3. Data Model

### 3.1 ActionRequest (vin.action_request.v0)

```json
{
  "schema": "vin.action_request.v0",
  "request_id": "uuid-or-client-nonce",
  "action_type": "compose_post",
  "policy_id": "P0_COMPOSE_POST_V1",
  "inputs": { "prompt": "..." },
  "constraints": { "max_chars": 280 },
  "llm": { "provider": "anthropic", "model": "claude-..." }
}
```

### 3.2 Output (vin.output.v0)

```json
{
  "schema": "vin.output.v0",
  "format": "plain",
  "text": "string as returned (may include watermark)",
  "clean_text": "canonical visible text without transport metadata"
}
```

### 3.3 Receipt (vin.receipt.v0)

```json
{
  "schema": "vin.receipt.v0",
  "version": "0.1",
  "node_pubkey": "base64url(ed25519_pubkey)",
  "request_id": "same as request",
  "action_type": "compose_post",
  "policy_id": "P0_COMPOSE_POST_V1",
  "inputs_commitment": "hex(sha256(JCS(inputs)))",
  "constraints_commitment": "hex(sha256(JCS(constraints)))",
  "llm_commitment": "hex(sha256(JCS(llm)))",
  "output_clean_hash": "hex(sha256(utf8(clean_text)))",
  "output_transport_hash": "hex(sha256(utf8(text)))",
  "iat": 1730000000,
  "exp": 1730000600,
  "nonce": "128-bit random or UUID",
  "payment": { "type": "none" },
  "attestation": { "type": "none" },
  "sig": "base64url(ed25519_sig_over_payload)"
}
```

---

## 4. Verification Algorithm (MUST)

Given `(request, output, receipt)`:

1. Check schemas and required fields.
2. Check time:
   - `iat` MUST NOT be in future by more than 60s clock skew.
   - `exp` MUST be >= now.
3. Recompute commitments:
   - `inputs_commitment == sha256(JCS(request.inputs))`
   - `constraints_commitment == sha256(JCS(request.constraints || {}))`
   - `llm_commitment == sha256(JCS(request.llm || {}))`
4. Recompute output hashes:
   - `output_clean_hash == sha256(utf8(output.clean_text))`
   - `output_transport_hash == sha256(utf8(output.text))`
5. Verify signature:
   - Construct receipt payload, JCS canonicalize, verify Ed25519 against `node_pubkey`.
6. Apply anti-replay policy:
   - Verifiers SHOULD keep nonce cache keyed by `node_pubkey:nonce` until `exp`.
   - If nonce seen => reject `replay_detected`.

---

## 5. x402 Payment Binding

### 5.1 Flow
1. Client calls protected endpoint.
2. Server replies 402 with payment requirements.
3. Client pays and retries with `X-PAYMENT` header.
4. Server verifies, settles, returns 200.

### 5.2 Receipt.payment (MUST for L1+)

```json
{
  "type": "x402.v0",
  "network": "eip155:8453",
  "asset": "USDC",
  "amount": "1000",
  "pay_to": "0x...",
  "payment_payload_hash": "hex(sha256(raw_payment_bytes))",
  "settlement_tx": "0x...optional"
}
```

---

## 6. TEE Attestation Binding

### 6.1 Attestation object (vin.attestation.v0)

```json
{
  "type": "tdx.dstack.v0",
  "report": "base64url(attestation_report_bytes)",
  "measurement": "hex(image_measurement)",
  "signer_pubkey": "base64url(ed25519_pubkey)"
}
```

Rules:
- `signer_pubkey` MUST equal `receipt.node_pubkey`.
- Verifiers MUST validate report and confirm measurement matches allowlist.

---

## 7. Proof-of-Swarm (PoSw)

### 7.1 Scoring (MUST)
Orchestrator MUST only score responses with **valid receipts** per Section 4.

Metrics:
- `receipt_valid_rate`
- `p95_latency_ms`
- `uptime_over_window`

### 7.2 Score object (vin.posw_score.v0)

```json
{
  "schema": "vin.posw_score.v0",
  "round_id": "uuid",
  "iat": 1730000000,
  "nodes": [
    { "node_pubkey": "...", "receipt_valid_rate": 0.97, "p95_latency_ms": 1800 }
  ],
  "sig": "orchestrator_signature"
}
```

---

## 8. Conformance Tests (MUST)

A compliant implementation MUST ship tests for:
1. Edit one character in clean_text => verify fails.
2. Edit one character in text => verify fails.
3. Change inputs => verify fails.
4. Signature mismatch => verify fails.
5. Replay nonce => verifier rejects.
6. Canonicalization vector => identical bytes across impls.
7. (x402) payment hash mismatch => verify fails.
8. (TEE) attestation pubkey mismatch => reject.

---

## 9. Safety / Acceptable Use

VIN is intended for: agent marketplaces, DAOs, reputation systems, paid agent services.

VIN MUST NOT be used to:
- Bypass "human required" policies
- Impersonate humans
- Evade platform security controls

---

*Protocol version: 0.1 | Last updated: 2026-02-04*
