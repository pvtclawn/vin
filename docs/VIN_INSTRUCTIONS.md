0) north star

build a decentralized network of verifiable inference nodes:

nodes: run as a dstack CVM container (TEE), expose paid endpoints via x402 (HTTP 402 flow)

proof: every response includes a tamper-evident provenance wrapper (receipt) + TEE attestation binding to the exact container/image hash

identity + trust: nodes and “agents” register in ERC-8004 registries (identity/reputation/validation)

untampered text layer: use EncypherAI/Encypher Core to invisibly embed C2PA-style manifests into the output (Unicode variation selectors) with COSE_Sign1 signatures and hard binding to the clean text

swarm verification: orchestrator fires parallel challenges at many nodes, scores timing/availability/consistency, optionally writes an onchain attestation (EAS or ERC-8004 validation record).

1) architecture you’re actually building
components

vin-node (verifiable inference node)

runs inside dstack CVM

exposes POST /generate and POST /challenge/respond

x402-gated (pay-per-request)

produces:

visible text output

Encypher-wrapped invisible manifest (optional but powerful)

a compact “receipt” object + signature

dstack remote attestation quote/report

dstack explicitly supports exporting RA reports bound to runtime info (image hash, args, env)

posw-orchestrator

sends N parallel tasks to K nodes

collects responses

verifies receipts + attestation

computes score

records result offchain + (sometimes) onchain

erc8004-registry adapter

registers the node identity (ERC-721-based identity registry) + agent metadata uri

posts reputation signals / validations later
ERC-8004 defines identity/reputation/validation registries and explicitly mentions TEE oracles / validators as a trust model option

2) key decision: how “untampered generation” is represented

do both, in a layered way:

layer A: explicit receipt (always)

request_hash, policy_id, model_id (string), params_hash

output_hash (hash of visible text)

iat, nonce, exp

node_signer_pubkey

sig

attestation_report (or pointer + hash)

this is the main verification mechanism.

layer B: Encypher invisible manifest (optional but very useful)

Encypher/EncypherAI can embed metadata invisibly via Unicode variation selectors and sign via COSE_Sign1, with “hard binding” to the clean text to detect edits .
verification uses a “public key provider” callback so you can fetch keys from onchain registry / db / etc .

why optional? because some platforms may normalize/strip weird unicode. Encypher is perfect for “copy/paste survives” channels, but you still want a robust receipt that can be posted as JSON/CID/tx.

3) build plan (phased, heartbeat-compatible)
phase 1 — repo + specs (1 day of heartbeats)

goal: stop hand-waving; write the contracts between components.

deliverables:

spec/PROTOCOL.md: endpoints, receipt schema, verification algorithm

spec/TRUST.md: what’s proven with/without TEE + failure modes

spec/POLICIES.md: at least P0: compose_post and P1: challenge_response

research tasks (lane D):

read x402 “how it works” + SDK choices (TS server middleware exists)

confirm Encypher key mgmt & verify flow (public_key_provider)

skim dstack RA report fields & how to export/verify

phase 2 — local MVP node (no TEE yet) (1–2 days)

goal: make “verifiable + tamper-evident” real locally, then port into dstack.

deliverables:

vin-node runs on localhost:

POST /generate returns {text, receipt}

POST /verify validates receipt

add Encypher embedding behind a flag:

ENCYPHER_ENABLE=true → return text with embedded manifest (plus external receipt)

ENCYPHER_ENABLE=false → plain text + external receipt only

acceptance tests:

editing 1 character breaks verification (external receipt)

if Encypher enabled: editing breaks Encypher verify too (when text still contains embedded selectors)

note: Encypher implements C2PA-style wrappers and COSE signatures (COSE_Sign1)

phase 3 — x402 paywall (same node) (0.5–1 day)

goal: turn it into a paid service with zero accounts.

deliverables:

x402 middleware on /generate and /challenge/respond

integration test: client gets 402 Payment Required, pays, retries, gets result

pricing config: flat per call + optional “challenge premium”

x402 is explicitly intended as an open standard with TS server packages available

phase 4 — dstack packaging + attestation (2–4 days, depending on infra friction)

goal: same API, now with “provable boundary”.

deliverables:

Dockerfile + docker-compose.yml

dstack deploy instructions

endpoint GET /attestation returning:

report/quote (or report + verifier link)

the code measurement / image hash

receipt now includes attestation_hash and/or full report

dstack docs describe exporting RA reports bound to docker image hash/args/env, and RA-HTTPS wrapping on 0xABCD.dstack.host

phase 5 — ERC-8004 identity + metadata (1–2 days)

goal: make nodes discoverable + scoreable.

deliverables:

register node as an ERC-8004 agent identity (ERC-721 identity registry + agentURI)

publish an “agent card” (agent metadata profile) describing:

endpoints

pricing

supported policies

attestation expectations
ERC-8004 defines identity/reputation/validation registries and the agentRegistry string format tying chainId + identity registry address

(optional) add a minimal “reputation hook”:

after successful paid request, client can leave a feedback URI consistent with ERC-8004 feedback profile docs

phase 6 — proof-of-swarm orchestrator (2–5 days, iterative)

goal: turn single-node proof into a network proof.

mvp deliverables:

posw-orchestrator can:

pick K nodes from ERC-8004 registry

send challenge round: N tasks in parallel, time budget T

verify receipts + attestation per response

compute score: completion_rate + latency distribution

v1 deliverables:

shard puzzles + “temporal density” checks

publish signed score JSON + optionally write validation record / EAS attestation

this matches your existing HEARTBEAT “pivot: proof of swarm” direction and fits lane C (onchain) + lane F (red-team) nicely. 

HEARTBEAT

4) research checkpoints (make it autonomous, not random)

tell privateclawn to treat these as mandatory spike triggers (lane D):

unicode survivability matrix

test Encypher-embedded text survives:

X post

Farcaster cast

Moltbook post

copy/paste through common clients
if it gets stripped anywhere → keep Encypher as “bonus”, rely on external receipt there.

attestation verification UX

confirm how a third party verifies dstack reports (use trust-center tooling)

document “one command verify” or provide a hosted verifier endpoint.

erc-8004 deployment targets

decide: Base mainnet vs Base sepolia first

locate canonical registry deployments 

HEARTBEAT

tracts repo / 8004scan docs as sources)

x402 client ergonomics

pick 1 reference client (fetch/axios) and ship example code. x402 has multiple SDKs listed

5) how this plugs into privateclawn’s HEARTBEAT lanes (very concrete)

your HEARTBEAT already enforces “one lane + one deliverable per beat” and rotates plan/build/verify/research/red-team 

HEARTBEAT

. map phases like this:

lane A (plan): keep spec/ updated; always define the next smallest milestone

lane B (build): implement exactly one endpoint / one verification primitive / one test at a time

lane C (verify+onchain): register in ERC-8004, publish one attestation/validation, record tx hash

lane D (research): run the 4 spike triggers above

lane F (challenge): adversarial checks (strip unicode, replay receipts, fake node identity, bypass x402)

6) how to use EncypherAI safely in this system

Encypher gives you:

invisible embedding

COSE signatures + hard binding to the clean text

controllable key management via public_key_provider

do this:

node signs external receipt always

node embeds Encypher manifest when safe

verifier accepts:

external receipt

HEARTBEAT

ypher as extra signal (and nice UX when it survives)

also note: Encypher is AGPL-3.0 licensed (fine for a public hackathon repo; just be intentional).
