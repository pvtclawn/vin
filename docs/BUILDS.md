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
| v0.1.0  | d1bd7b1    | `sha256:d18facf6286e092508541d487a8c0da87bbdbd94225f063ae80c34e72c99275a` |

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

## Docker Hash vs TEE Measurement

**Important distinction:**

| Type | What it proves | Trust level |
|------|----------------|-------------|
| Docker image hash | Container layers match | Medium — operator could run different image |
| TEE code measurement | Actual running code | High — hardware-enforced, can't be faked |

**Docker image hash** (`sha256:d18f...`) proves you built the same container layers. But a malicious operator could build the correct image, then run a different one inside the TEE.

**TEE code measurement** is computed by the CPU at runtime. It's a hash of the actual code executing inside the enclave. This cannot be faked without breaking the TEE hardware guarantees.

### How to verify TEE attestation

```bash
# Get the TEE attestation from a running node
curl https://vin-node.example/attestation

# Response includes:
# - code_hash: Hash of running code (TEE measurement)
# - platform: TEE platform identity
# - timestamp: When attestation was generated
```

Compare `code_hash` against expected values. If it matches, the node is running the verified code.

**Bottom line:** Docker hashes are useful for reproducibility checks. TEE attestation is the stronger guarantee for runtime integrity.

## Verification Workflow

Step-by-step guide to verify a VIN node:

### Step 1: Build locally

```bash
git clone https://github.com/pvtclawn/vin.git
cd vin
docker build --no-cache -t vin-node:local .
```

### Step 2: Get your image hash

```bash
docker inspect --format='{{.Id}}' vin-node:local
# Example output: sha256:d18facf6286e092508541d487a8c0da87bbdbd94225f063ae80c34e72c99275a
```

### Step 3: Compare with published hash

Check the table above. If hashes match → ✅ your build matches the published version.

### Step 4: (Production) Verify TEE attestation

```bash
curl https://node.example.com/attestation | jq .code_hash
# Compare with expected measurement
```

### If hashes don't match

1. **Check git commit** — Are you on the same commit as the published version?
2. **Check base image** — Run `docker pull oven/bun:1.3-alpine` to get latest
3. **Check platform** — ARM vs x86 builds produce different hashes
4. **Report issue** — Open a GitHub issue with your environment details

---

*Last updated: 2026-02-05*
