# Reproducible Builds

This document describes how to verify that a VIN node container matches the published source code.

## Why Reproducibility Matters

VIN nodes run inside TEEs (Trusted Execution Environments). Users trust that:
1. The code running matches the open-source repository
2. No backdoors were added during the build process
3. The container image hash can be independently verified

## Building Locally

```bash
# Clone the repository
git clone https://github.com/pvtclawn/vin.git
cd vin

# Build the container
docker build -t vin-node:local .

# Get the image ID (content-addressed hash)
docker inspect --format='{{.Id}}' vin-node:local
```

## Verifying Published Images

Compare your locally-built image hash against published hashes:

| Version | Git Commit | Image Hash |
|---------|------------|------------|
| v0.1.0  | ed57148    | *(pending)* |

**Note:** Due to build timestamps and layer caching, exact hash matching requires `--no-cache` and pinned base images. We're working on fully reproducible builds.

## Build Reproducibility Factors

### What affects the hash:
- Source code changes
- Dependency versions (`bun.lock`)
- Base image version (`oven/bun:1.3-alpine`)
- Build arguments and environment

### Current limitations:
- `bun install` may produce different lockfiles across platforms
- Alpine package versions may drift
- No pinned base image digest yet

## Planned Improvements

1. **Pin base image digest** — Use `oven/bun:1.3-alpine@sha256:...` 
2. **GitHub Actions workflow** — Automated builds with published hashes
3. **Attestation integration** — Publish build hashes to EAS on Base
4. **Sigstore signing** — Cryptographic signatures on container images

## TEE Attestation

When running in dstack, the TEE provides hardware attestation that includes:
- Code measurement (hash of running code)
- Platform identity
- Runtime configuration

See `docs/ARCHITECTURE.md` for TEE integration details.

---

*Last updated: 2026-02-05*
