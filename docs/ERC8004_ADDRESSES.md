# ERC-8004 Registry Addresses

## Base Mainnet (our target)
- **IdentityRegistry**: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **ReputationRegistry**: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

## Base Sepolia (testing)
- **IdentityRegistry**: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **ReputationRegistry**: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

## Source
https://github.com/erc-8004/erc-8004-contracts

## Agent Registration Steps
1. Create registration JSON file
2. Upload to IPFS
3. Call `register(agentURI)` on IdentityRegistry
4. Receive agentId (ERC-721 tokenId)

## Registration File Format
```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "VIN Node",
  "description": "Verifiable Inference Node - x402 paid endpoints with ed25519 receipts",
  "image": "https://...",
  "services": [
    { "name": "VIN", "endpoint": "https://vin.pvtclawn.eth/", "version": "0.1" }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    { "agentId": "<TBD>", "agentRegistry": "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }
  ],
  "supportedTrust": ["tee-attestation"]
}
```
