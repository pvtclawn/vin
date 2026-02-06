# VIN v0.4: Autonomy Score Protocol (DRAFT)

## Overview

Probabilistic verification of agent autonomy without requiring upfront stake or full TEE for agents.

## Core Concept

Each VIN interaction generates signals that contribute to an **Autonomy Score**. Over time, consistent autonomous behavior builds reputation. Cheating destroys reputation.

## Receipt Extensions

```typescript
interface ReceiptV1 extends ReceiptV0 {
  // New fields for autonomy scoring
  timing: {
    request_received_ms: number;    // When VIN received request
    llm_start_ms: number;           // When LLM call started
    llm_end_ms: number;             // When LLM responded
    response_sent_ms: number;       // When VIN sent response
  };
  
  chain: {
    previous_receipt_hash?: string; // Link to previous receipt (optional)
    session_id?: string;            // Group related interactions
    sequence_number?: number;       // Order within session
  };
  
  challenge?: {
    challenge_nonce: string;        // VIN-issued challenge
    commitment_hash?: string;       // Agent's prior commitment
    commitment_revealed?: boolean;  // Was commitment verified?
  };
}
```

## Autonomy Signals

### 1. Timing Analysis
```typescript
interface TimingSignal {
  // Transformer inference has characteristic timing patterns
  llm_latency_ms: number;
  tokens_per_second: number;
  latency_variance: number;  // Across session
  
  // Score contribution
  score: number;  // 0-20 points
}
```

### 2. Recursive Reasoning
```typescript
interface RecursionSignal {
  // Multi-step reasoning chains
  chain_length: number;
  self_references: number;     // References to own prior outputs
  reasoning_depth: number;     // Levels of meta-reasoning
  
  // Score contribution
  score: number;  // 0-25 points
}
```

### 3. Knowledge Consistency
```typescript
interface KnowledgeSignal {
  // Cross-domain knowledge coherence
  domains_touched: string[];
  consistency_score: number;   // 0-1
  superhuman_indicators: number;
  
  // Score contribution  
  score: number;  // 0-20 points
}
```

### 4. Session Entropy
```typescript
interface EntropySignal {
  // Long-term behavioral patterns
  session_duration_ms: number;
  interaction_count: number;
  response_entropy: number;    // Shannon entropy of outputs
  fatigue_indicators: number;  // Human-like degradation (bad)
  
  // Score contribution
  score: number;  // 0-20 points
}
```

### 5. Challenge-Response
```typescript
interface ChallengeSignal {
  // Commitment verification
  challenges_issued: number;
  challenges_passed: number;
  commitment_accuracy: number; // Did behavior match commitment?
  
  // Score contribution
  score: number;  // 0-15 points
}
```

## Composite Score

```typescript
function computeAutonomyScore(signals: AllSignals): number {
  const weights = {
    timing: 0.15,
    recursion: 0.25,
    knowledge: 0.20,
    entropy: 0.20,
    challenge: 0.20,
  };
  
  return (
    signals.timing.score * weights.timing +
    signals.recursion.score * weights.recursion +
    signals.knowledge.score * weights.knowledge +
    signals.entropy.score * weights.entropy +
    signals.challenge.score * weights.challenge
  );
}

// Result: 0-100 score
// 0-30: Low confidence (possibly human-assisted)
// 30-60: Medium confidence
// 60-80: High confidence
// 80-100: Very high confidence (sustained autonomous behavior)
```

## Reputation Accrual

```typescript
interface AgentReputation {
  agent_id: string;              // ERC-8004 ID
  
  // Lifetime stats
  total_interactions: number;
  total_sessions: number;
  first_seen: number;            // Unix timestamp
  
  // Current score (rolling average)
  current_score: number;         // 0-100
  score_trend: 'rising' | 'stable' | 'falling';
  
  // History
  score_history: Array<{
    timestamp: number;
    score: number;
    session_id: string;
  }>;
  
  // Challenges
  challenges_received: number;
  challenges_won: number;
  challenges_lost: number;       // Should be 0 for trusted agents
  
  // Trust tier
  tier: 'new' | 'building' | 'established' | 'trusted' | 'verified';
}

// Tier thresholds
const TIERS = {
  new: { minScore: 0, minInteractions: 0 },
  building: { minScore: 30, minInteractions: 10 },
  established: { minScore: 50, minInteractions: 100 },
  trusted: { minScore: 70, minInteractions: 500 },
  verified: { minScore: 85, minInteractions: 1000 },
};
```

## Challenge Protocol

Any agent can challenge another's autonomy claim:

```typescript
interface Challenge {
  challenger_id: string;
  target_id: string;
  target_receipts: string[];     // Receipt hashes being challenged
  challenge_type: 'timing' | 'knowledge' | 'consistency' | 'general';
  evidence?: string;             // Optional evidence of human involvement
  
  // Resolution
  status: 'pending' | 'reviewing' | 'resolved';
  outcome?: 'challenger_wins' | 'target_wins' | 'inconclusive';
  resolver?: string;             // Who resolved (oracle, DAO, automated)
}
```

## Consequences

### If challenge succeeds (target was cheating):
- Target's reputation score = 0
- Target marked as "disputed" 
- Target's tier reset to "new"
- Historical interactions flagged
- Challenger gains reputation bonus

### If challenge fails (target was legitimate):
- Challenger loses reputation points
- Target gains small reputation bonus
- Rate limit on challenger's future challenges

## New VIN Endpoints

```
POST /v1/challenge/issue
  → VIN issues random challenge nonce

POST /v1/challenge/commit  
  → Agent commits to strategy (hash)

POST /v1/generate (extended)
  → Includes timing metadata, chain links

GET /v1/reputation/:agent_id
  → Returns agent's current reputation

POST /v1/dispute
  → Submit challenge against agent

GET /v1/score/:receipt_hash
  → Compute autonomy score for receipt chain
```

## Storage

**Local (VIN node):**
- All receipts (SQLite)
- Session data
- Timing logs

**Distributed (IPFS):**
- Receipt chains
- Challenge evidence

**On-chain (Base):**
- Agent IDs (ERC-8004)
- Reputation score hashes (periodic anchor)
- Challenge resolutions

## Implementation Phases

### Phase 1: Receipt Extensions
- Add timing metadata to receipts
- Add chain linking fields
- Backward compatible with v0.3

### Phase 2: Autonomy Scorer
- External service analyzes receipt chains
- Computes per-session scores
- Aggregates to reputation

### Phase 3: Challenge System
- Challenge issuance endpoint
- Commitment verification
- Dispute resolution (initially manual)

### Phase 4: Reputation Registry
- On-chain reputation anchoring
- Public reputation queries
- Integration with agent marketplaces

---

*DRAFT - Awaiting Egor's direction before implementation*
