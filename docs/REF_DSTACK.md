# dstack TEE Reference

Source: https://github.com/Dstack-TEE/dstack

## Overview

dstack is the open framework for confidential AI - deploy AI applications with cryptographic privacy guarantees.

Containers run inside confidential VMs (Intel TDX) with native support for NVIDIA Confidential Computing (H100, Blackwell). Users can cryptographically verify exactly what's running.

## Key Features

### Zero Friction Onboarding
- **Docker Compose native**: Bring your docker-compose.yaml as-is. No SDK, no code changes.
- **Encrypted by default**: Network traffic and disk storage encrypted out of the box.

### Hardware-Rooted Security
- **Private by hardware**: Data encrypted in memory, inaccessible even to the host.
- **Reproducible OS**: Deterministic builds mean anyone can verify the OS image hash.
- **Workload identity**: Every app gets an attested identity users can verify cryptographically.
- **Confidential GPUs**: Native support for NVIDIA Confidential Computing.

### Trustless Operations
- **Isolated keys**: Per-app keys derived in TEE. Survives hardware failure. Never exposed to operators.
- **Code governance**: Updates follow predefined rules (e.g., multi-party approval). Operators can't swap code or access secrets.

## Architecture

```
Your container → Confidential VM (Intel TDX) → Optional GPU TEE (NVIDIA)
```

### Core Components

1. **Guest Agent**: Runs inside each CVM. Generates TDX attestation quotes. Provisions per-app cryptographic keys from KMS.

2. **KMS**: Runs in its own TEE. Verifies TDX quotes before releasing keys. Enforces authorization policies.

3. **Gateway**: Terminates TLS at the edge. Routes traffic to CVMs. Uses RA-TLS for mutual attestation.

4. **VMM**: Runs on bare-metal TDX hosts. Parses docker-compose files directly.

## SDKs

| Language | Install | Docs |
|----------|---------|------|
| Python | `pip install dstack-sdk` | [README](https://github.com/Dstack-TEE/dstack/blob/master/sdk/python/README.md) |
| TypeScript | `npm install @phala/dstack-sdk` | [README](https://github.com/Dstack-TEE/dstack/blob/master/sdk/js/README.md) |
| Rust | `cargo add dstack-sdk` | [README](https://github.com/Dstack-TEE/dstack/blob/master/sdk/rust/README.md) |
| Go | `go get github.com/Dstack-TEE/dstack/sdk/go` | [README](https://github.com/Dstack-TEE/dstack/blob/master/sdk/go/README.md) |

## VIN Integration Points

1. **Attestation Report**: Guest agent generates TDX quotes that can be included in VIN receipts
2. **Workload Identity**: Bind VIN node signing key to measured runtime
3. **Key Derivation**: Per-app keys that never leave TEE
4. **Verification**: Users verify TDX + GPU attestation via dstack-verifier

## Key Links

- [Deployment Guide](https://github.com/Dstack-TEE/dstack/blob/master/docs/deployment.md)
- [Verification Guide](https://github.com/Dstack-TEE/dstack/blob/master/docs/verification.md)
- [Security Model](https://github.com/Dstack-TEE/dstack/blob/master/docs/security/security-model.md)
- [Security Audit (zkSecurity)](https://github.com/Dstack-TEE/dstack/blob/master/docs/security/dstack-audit.pdf)
