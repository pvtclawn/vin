# Reproducible Builds

This document describes how to verify that the VIN node container matches the source code.

## Build Process

VIN uses a deterministic Docker build:

```bash
# Clone at specific commit
git clone https://github.com/pvtclawn/vin.git
cd vin
git checkout <commit-hash>

# Build container
cd vin-node
docker build -t vin-node:local .

# Get image digest
docker inspect vin-node:local --format='{{.Id}}'
```

## Verification Steps

1. **Check the commit hash** — matches what's claimed in attestation
2. **Build locally** — produces the same container image
3. **Compare digests** — local build matches published hash

## Published Builds

| Version | Commit | Image Digest | Attestation |
|---------|--------|--------------|-------------|
| v0.1.0  | (pending deployment) | (pending) | (pending) |

## Why This Matters

TEE attestation proves code ran in an enclave. But it doesn't prove *which* code. Without reproducible builds, you're trusting that the node operator deployed the correct version.

With reproducible builds:
1. You can verify the exact code that was deployed
2. Anyone can audit the source and confirm the container matches
3. The attestation becomes meaningful — it proves *this specific code* ran

## Limitations

- Docker builds may not be perfectly reproducible across all systems
- Timestamps, build IDs, and random elements can cause differences
- We aim for "content-identical" rather than "byte-identical"

## Future Work

- [ ] Integrate with Phala's TDX attestation
- [ ] Publish code hash in ERC-8004 registration
- [ ] Automate digest publishing on release
