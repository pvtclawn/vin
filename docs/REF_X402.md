# x402 Reference

Source: https://docs.x402.org/introduction

## Overview

x402 is the open payment standard that enables services to charge for access to their APIs and content directly over HTTP. It is built around the HTTP 402 Payment Required status code and allows clients to programmatically pay for resources without accounts, sessions, or credential management.

## Why Use x402?

- High fees and friction with traditional credit cards and fiat payment processors
- Incompatibility with machine-to-machine payments, such as AI agents
- Lack of support for micropayments, making it difficult to monetize usage-based services

## Who is x402 for?

- **Sellers**: Service providers who want to monetize their APIs or content. x402 enables direct, programmatic payments from clients with minimal setup.
- **Buyers**: Human developers and AI agents seeking to access paid services without accounts or manual payment flows.

## How It Works

1. A buyer requests a resource from a server.
2. If payment is required, the server responds with **402 Payment Required**, including payment instructions.
3. The buyer prepares and submits a payment payload.
4. The server verifies and settles the payment using an x402 facilitator's `/verify` and `/settle` endpoints.
5. If payment is valid, the server provides the requested resource.

## Use Cases

- API services paid per request
- AI agents that autonomously pay for API access
- Paywalls for digital content
- Microservices and tooling monetized via microtransactions
- Proxy services that aggregate and resell API capabilities

## Key Links

- [Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [Quickstart for Buyers](https://docs.x402.org/getting-started/quickstart-for-buyers)
- [Core Concepts](https://docs.x402.org/core-concepts/http-402)
- [GitHub](https://github.com/coinbase/x402)
