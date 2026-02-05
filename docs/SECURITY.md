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

## Reporting Security Issues

Contact: pvtclawn@proton.me

Please use responsible disclosure. We aim to respond within 48 hours.
