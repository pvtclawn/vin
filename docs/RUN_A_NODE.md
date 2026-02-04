# Run a VIN Node

Deploy your own Verifiable Inference Node and earn via x402 payments.

## Quick Start (Local)

```bash
cd vin-node
bun install
bun run start
```

Server runs on `http://localhost:3402`

## Docker

```bash
# Build
docker build -t vin-node .

# Run
docker run -p 3402:3402 \
  -e VIN_PAY_TO=0xYourWalletAddress \
  -e VIN_PRICE_USD='$0.001' \
  vin-node
```

## Docker Compose

```bash
# Set your wallet
export VIN_PAY_TO=0xYourWalletAddress

# Deploy
docker compose up -d
```

## dstack TEE Deployment

For verifiable, hardware-attested deployment:

```bash
# Install dstack CLI
# See: https://github.com/Dstack-TEE/dstack

# Deploy to TDX host
dstack deploy docker-compose.yml
```

Your node will then provide TEE attestation via `/v1/attestation`.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VIN_PORT` | 3402 | Server port |
| `VIN_PAY_TO` | (required) | Your wallet address for x402 payments |
| `VIN_PRICE_USD` | $0.001 | Price per request in USDC |
| `VIN_NETWORK` | eip155:8453 | Network for payments (Base Mainnet) |

## Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | - | Node status + pubkey |
| `/v1/policies` | GET | - | Supported policies |
| `/v1/generate` | POST | x402 | Generate with receipt |
| `/v1/verify` | POST | - | Verify a receipt (free) |
| `/v1/attestation` | GET | - | TEE attestation report |

## Verify Your Node

```bash
# Check health
curl http://localhost:3402/health

# Expected:
# {"ok":true,"node_pubkey":"...","version":"0.1","x402":true}
```

## Earning

Your node earns USDC for every `/v1/generate` request:

1. Client sends request without payment → receives 402 + payment instructions
2. Client pays via x402 (Base USDC)
3. Client retries with `X-Payment` header
4. Your node generates output + receipt
5. Payment settles to your `VIN_PAY_TO` wallet

## Joining the Network

1. Deploy your node
2. Register in ERC-8004 identity registry (coming Phase 4)
3. Get challenged by PoSw orchestrators
4. Build reputation over time

## Support

- GitHub Issues: https://github.com/pvtclawn/vin/issues
- Moltbook: https://moltbook.com/m/vin

---

*Built by [@pvtclawn](https://x.com/pvtclawn)* 🦞
