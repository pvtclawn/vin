# VIN Security Model

## Trust Assumptions

VIN is a **Confidential LLM Proxy** that runs inside a Trusted Execution Environment (TEE). This document describes what VIN can and cannot guarantee.

### What VIN Guarantees

1. **Prompt/Response Encryption**: Your prompts and API keys are encrypted with the TEE's public key. Only the TEE can decrypt them.

2. **Receipt Signing**: Every response includes a cryptographic receipt signed by the node's ed25519 key, proving the response passed through this specific node.

3. **No Persistent Storage**: VIN nodes are stateless. Your prompts and keys are not logged or stored.

### What VIN Does NOT Guarantee

1. **Model Verification**: VIN cannot prove which model actually generated the response. A malicious node could theoretically substitute a cheaper model.

2. **Code Integrity**: TEE attestation proves code ran in an enclave, but users must verify the code hash matches the published version.

3. **Side-Channel Resistance**: TEE enclaves have known side-channel vulnerabilities. For extremely sensitive workloads, additional precautions may be needed.

## Recommendations for Users

### API Key Hygiene

- **Create VIN-specific API keys** with usage limits
- **Rotate keys regularly** if using VIN frequently  
- **Monitor usage** on your LLM provider dashboard

### Verifying Node Integrity

1. Check the node's attestation at `/v1/tee-pubkey`
2. Verify the code hash matches our published builds
3. Use nodes operated by entities you trust

### Published Build Hashes

| Version | Container Hash | Code Hash |
|---------|----------------|-----------|
| v0.1.0  | (pending)      | (pending) |

*We are working on reproducible builds to enable independent verification.*

## Threat Model

| Threat | Mitigated? | Notes |
|--------|------------|-------|
| Network eavesdropping | ✅ | HTTPS + payload encryption |
| Malicious node logging | ✅ | TEE prevents access to decrypted data |
| Model substitution | ⚠️ | No verification yet |
| Replay attacks | ✅ | Nonce + timestamp in receipts |
| TEE side-channels | ⚠️ | Known limitation of TEE technology |

## Key Compromise Recovery

### What Happens if a Node's Signing Key is Compromised?

Each VIN node has an ed25519 signing key used to sign receipts. If this key is exposed:

1. **Past receipts remain valid** — There is no revocation mechanism. Receipts signed before compromise cannot be distinguished from legitimate ones.

2. **Attacker can forge receipts** — With the key, an attacker could sign fake receipts claiming responses came from that node.

3. **User API keys are NOT exposed** — API keys are encrypted with the TEE pubkey, not the signing key. Key compromise doesn't leak user secrets.

### Recommended Response

1. **Rotate the node identity** — Generate a new ed25519 keypair, which creates a new node identity (new pubkey).

2. **Update ERC-8004 registration** — If registered on-chain, update the agent's metadata to point to the new pubkey.

3. **Notify users** — If you operate a public node, inform users that receipts signed by the old pubkey should not be trusted after the compromise date.

4. **Investigate the breach** — TEE key extraction is difficult; compromise likely indicates either physical access or a TEE vulnerability.

### Key Rotation Schedule

For high-value nodes, consider rotating keys periodically (e.g., quarterly) even without known compromise. This limits the window of exposure if a key is silently extracted.

### Receipt Semantics

**Important:** VIN receipts prove that a response passed through a specific node. They do NOT prove:
- Which LLM model generated the response
- That the upstream provider was honest
- That the response content is accurate

Receipts are proof of processing, not proof of correctness.

## Reporting Security Issues

Contact: pvtclawn@proton.me

Please use responsible disclosure. We aim to respond within 48 hours.
