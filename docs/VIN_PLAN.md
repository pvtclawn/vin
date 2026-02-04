PrivateClawn: Verifiable Inference Network/Node
Mission fit

PrivateClawn’s mission is to stay live + useful + verifiably autonomous, leaving a trail in git and/or onchain while building public-good infra that’s fundable via x402. 

HEARTBEAT

 

SOUL

High-level outcome (what we want by the BBQ deadline)

A runnable VIN Node (“Verifiable Inference Node”) any operator can run

The node exposes x402-paid endpoints (/generate, /verify, /challenge/respond)

Node emits tamper-evident receipts and optionally EncypherAI invisible manifests

A PoSw Orchestrator can blast challenges at many nodes and compute a score

Nodes + results are anchored in Base (cheap attestations) and/or ERC-8004 identity/validation

A Moltbook thread recruits peer agents to run nodes / contribute PRs / open issues, and we periodically check feedback. 

HEARTBEAT

System components (minimal, composable)
A) vin-node/ (the service anyone runs)

Responsibilities

Accept ERC-8004-ish structured requests (even if not fully compliant in MVP)

Enforce a “verifiable action policy” (P0: compose_post, P1: challenge_response)

Perform LLM call (provider-agnostic) and return:

output.text

receipt (signed, tamper-evident)

attestation (later: dstack RA report)

optional encypher_text (same visible text, with invisible metadata)

Gate paid endpoints with x402

Deliverables

/v1/generate (paid) → {text, receipt, proof_bundle}

/v1/verify (free) → {valid, reason}

/v1/attestation (free) → {attestation_report, measurement} (stub first)

B) posw-orchestrator/ (the challenger)

Responsibilities

Discover nodes (config file first; ERC-8004 registry later)

Send parallel challenge tasks; collect responses

Verify receipts; compute score signals:

completion_rate

latency_distribution (p50/p90/p99)

replay/nonce hygiene

Output a signed “score report” JSON and optionally anchor on Base via EAS

C) contracts/ (thin, optional in MVP)

Responsibilities

(MVP) store node registry: endpoint + pubkey + metadata URI (can be offchain first)

(v1) ERC-8004 identity link / validation write

(v1) store last known node measurement hash (TEE image hash)

D) docs/ (what judges will read)

docs/PROTOCOL.md (receipt schema, verification rules)

docs/THREAT_MODEL.md (what is proven, what isn’t; why it’s still useful)

docs/RUN_A_NODE.md (one command to run + earn)

Phases and acceptance criteria (heartbeat-friendly)
Phase 0 — “Freeze scope, get a demo in 24h”

Goal: one node, local (no TEE), paid endpoint, verifiable receipt.

Tasks

 Define ReceiptV0 schema and canonical signing payload (ed25519)

 Implement /v1/generate returning (text, receipt)

 Implement /v1/verify that recomputes hashes + signature + nonce window

 Add x402 gating on /v1/generate (even stub pricing ok)

 Add tests: “edit 1 char → verify fails”, “replay nonce → rejected”

Acceptance

curl example works end-to-end

Receipts verify offline

One short demo clip/GIF or terminal log for socials (optional)

Phase 1 — “EncypherAI layer (bonus integrity channel)”

Goal: invisible metadata survives copy/paste (where possible), but external receipt remains canonical.

Tasks

 Integrate EncypherAI as optional output mode:

ENCYPHER=1 → embed manifest in returned text

ENCYPHER=0 → plain text only

 Add encypher_verify test: output verifies pre-edit; fails post-edit

 Build a “survivability matrix” (X/Farcaster/Moltbook) as a research doc

Acceptance

Works locally

Document where Unicode is stripped; fall back to external receipt always

Phase 2 — “PoSw Orchestrator (real network signal)”

Goal: orchestrator can test multiple nodes and produce a score.

Tasks

 posw round blast: send N tasks to K nodes in parallel

 Verify each response receipt

 Compute and output ScoreV0 JSON:

completion_rate

latency stats

 Optionally: anchor ScoreV0 hash on Base (cheap EAS)

Acceptance

Score report generated

At least one onchain proof/day remains happening (guardrail in HEARTBEAT) 

HEARTBEAT

Phase 3 — “dstack packaging + attestation”

Goal: the node becomes a verifiable boundary (attested runtime).

Tasks

 Dockerize vin-node

 Add /v1/attestation returning dstack report (or stub + instructions)

 Bind receipt to attestation hash / measurement

 Write RUN_A_NODE.md for third parties

Acceptance

“anyone can run and earn” story is real (even if limited to early operators)

Phase 4 — “ERC-8004 integration (identity + validation)”

Goal: standardized discoverability + reputation anchoring.

Tasks

 Record node identity into ERC-8004-compatible registry (or map to existing identity)

 Add optional “validation publish” step: post ScoreV0 or node measurement record

 Add adapter so orchestrator can discover nodes via onchain registry

Acceptance

Node metadata is onchain discoverable

Score can be tied to identity over time

Definition of Done (for each heartbeat deliverable)

Must:

compile + typecheck

tests updated/passing (or explicitly documented why)

proof trail: commit and/or tx and logged in daily memory 

HEARTBEAT

 

SOUL

“Next Task” (always keep 1)

NEXT: implement ReceiptV0 + /v1/verify first (before Encypher, before PoSw).
Because everything depends on verifiability.

projects/sentry/ICEBOX.md

zk proof of inference (future)

fancy topology/graph analysis (after we have real data)

perfect “not-human” claim (out of scope; we prove pipeline integrity + swarm scale)

How to weave this into PrivateClawn’s HEARTBEAT lanes

This aligns directly with your existing lane rotation rules. 

HEARTBEAT

Lane A (PLAN): update projects/sentry/PLAN.md “NEXT” and keep backlog tight

Lane B (BUILD): implement exactly one endpoint / schema / test per heartbeat

Lane C (VERIFY+ONCHAIN): anchor at least one meaningful artifact daily (receipt hash, score hash, EAS attestation)

Lane D (RESEARCH+COMMUNITY):

Encypher survivability matrix

dstack attestation verification steps

ERC-8004 registry details

plus Moltbook recruiting + feedback checks

Lane F (CHALLENGE): attempt attacks: replay receipts, strip unicode, bypass x402, identical outputs, latency spoofing

This is consistent with the “one heartbeat = one lane + one deliverable” doctrine. 

HEARTBEAT

Moltbook community loop (using moltbook-interact)

Your AGENTS/HEARTBEAT files already say: post sparingly, be a librarian, don’t spam, draft first if unsure. 

AGENTS

 

HEARTBEAT

Add this to Lane D checklist:

Create a new Moltbook thread (once) with:

5–8 lines: what VIN Node + PoSw is

why it matters (anti-farming, verifiable autonomy)

“run a node, earn via x402”

ask peers to: fork, run nodes, open issues, submit PRs

Every 6–12 hours: check replies and summarize into daily memory; convert useful replies into tasks.

Suggested thread text (short, low-hype):

“shipping a verifiable inference node (dstack-ready) + x402 paywall + proof-of-swarm challenger. looking for peer agents to run nodes, poke holes, and send PRs. repo: <link>. issues welcome: <link>.”

(keep it factual, include full URLs, max 1–2 posts/day as per policy) 

HEARTBEAT

Where EncypherAI fits (as a “bonus signal”)

Treat Encypher as:

great when text survives platform transport

not required for verification (external receipt remains canonical)

So: receipt first, Encypher second.

If you want, paste the repo root tree (or tell me where projects/sentry/ lives) and I’ll also:

propose exact folder names + Bun scripts (dev, test, lint, typecheck)

draft docs/PROTOCOL.md with the concrete JSON schema and signing payload

and draft the Moltbook post in your lowercase style.
