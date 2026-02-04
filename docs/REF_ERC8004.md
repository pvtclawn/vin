# ERC-8004: Trustless Agents Reference

Source: https://eips.ethereum.org/EIPS/eip-8004

## Overview

ERC-8004 proposes using blockchains to discover, choose, and interact with agents across organizational boundaries without pre-existing trust, enabling open-ended agent economies.

Trust models are pluggable and tiered, with security proportional to value at risk.

## Three Registries

### 1. Identity Registry
A minimal on-chain handle based on ERC-721 with URIStorage extension that resolves to an agent's registration file, providing every agent with a portable, censorship-resistant identifier.

**Agent Identifier:**
- `agentRegistry`: `{namespace}:{chainId}:{identityRegistry}` (e.g., `eip155:1:0x742...`)
- `agentId`: The ERC-721 tokenId

### 2. Reputation Registry
A standard interface for posting and fetching feedback signals. Scoring and aggregation occur both on-chain (for composability) and off-chain (for sophisticated algorithms).

**Feedback Structure:**
- `value`: signed fixed-point (int128)
- `valueDecimals`: uint8 (0-18)
- `tag1`, `tag2`: optional tags for filtering
- `feedbackURI`: off-chain JSON with additional info

### 3. Validation Registry
Generic hooks for requesting and recording independent validator checks:
- Stake-secured re-execution
- zkML verifiers
- TEE oracles
- Trusted judges

## Agent Registration File

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "myAgentName",
  "description": "...",
  "image": "https://example.com/agentimage.png",
  "services": [
    { "name": "A2A", "endpoint": "https://...", "version": "0.3.0" },
    { "name": "MCP", "endpoint": "https://...", "version": "2025-06-18" }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    { "agentId": 22, "agentRegistry": "eip155:1:0x742..." }
  ],
  "supportedTrust": [
    "reputation",
    "crypto-economic",
    "tee-attestation"
  ]
}
```

## Trust Models

1. **Reputation**: Client feedback (starred, uptime, successRate, responseTime)
2. **Crypto-economic**: Stake-secured re-execution
3. **TEE Attestation**: Hardware-rooted verification (dstack)
4. **zkML**: Zero-knowledge proofs of inference

## VIN Integration Points

1. **Identity**: VIN nodes register as ERC-8004 agents with `agentURI` pointing to registration file
2. **Services**: Expose VIN endpoints (A2A, MCP style)
3. **Reputation**: Clients can post feedback after verified inference
4. **Validation**: VIN receipts serve as validation artifacts
5. **x402Support**: Indicates payment-enabled endpoints

## Key Functions

```solidity
// Identity Registry
function register(string agentURI) returns (uint256 agentId)
function setAgentURI(uint256 agentId, string newURI)
function getMetadata(uint256 agentId, string metadataKey) returns (bytes)

// Reputation Registry
function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, ...)
function getSummary(uint256 agentId, address[] clients, ...) returns (uint64 count, int128 value, ...)

// Validation Registry
function validationRequest(address validator, uint256 agentId, string requestURI, bytes32 requestHash)
function validationResponse(bytes32 requestHash, uint8 response, ...)
```

## Links

- [EIP Discussion](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098)
- Requires: EIP-155, EIP-712, EIP-721, EIP-1271
