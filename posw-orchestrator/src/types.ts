/**
 * PoSw Orchestrator - Types
 */

export interface NodeConfig {
  id: string;
  endpoint: string;
  pubkey?: string;
}

export interface ChallengeTask {
  task_id: string;
  action_type: 'challenge_response';
  policy_id: string;
  inputs: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

export interface PoSwRoundV0 {
  schema: 'posw.round.v0';
  round_id: string;
  issued_at: number;
  expires_at: number;
  tasks: ChallengeTask[];
}

export interface NodeResult {
  node_id: string;
  task_id: string;
  success: boolean;
  latency_ms: number;
  receipt_valid: boolean;
  error?: string;
}

export interface PoSwScoreV0 {
  schema: 'posw.score.v0';
  round_id: string;
  nodes_tested: number;
  confidence: number;
  signals: {
    completion_rate: number;
    latency_p50_ms: number;
    latency_p90_ms: number;
    latency_p99_ms: number;
    receipt_valid_rate: number;
  };
  valid_until: number;
  orchestrator_pubkey: string;
  sig: string;
}
