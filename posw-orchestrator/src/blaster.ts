/**
 * PoSw Orchestrator - Challenge Blaster
 * 
 * Sends parallel challenges to multiple VIN nodes and collects results.
 */

import type { NodeConfig, ChallengeTask, NodeResult, PoSwScoreV0 } from './types';

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Verify a receipt by calling the node's /v1/verify endpoint
 */
async function verifyReceipt(
  nodeEndpoint: string,
  request: unknown,
  output: unknown,
  receipt: unknown
): Promise<boolean> {
  try {
    const response = await fetch(`${nodeEndpoint}/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request, output, receipt }),
    });
    
    if (!response.ok) return false;
    
    const result = await response.json() as { valid: boolean };
    return result.valid === true;
  } catch {
    return false;
  }
}

/**
 * Send a challenge to a single node
 */
async function challengeNode(
  node: NodeConfig,
  task: ChallengeTask,
  paymentHeader?: string
): Promise<NodeResult> {
  const start = performance.now();
  
  // Build request object for verification
  const request = {
    schema: 'vin.action_request.v0',
    request_id: `${task.task_id}-${node.id}`,
    action_type: task.action_type,
    policy_id: task.policy_id,
    inputs: task.inputs,
    constraints: task.constraints,
  };
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add payment header if provided
    if (paymentHeader) {
      headers['X-Payment'] = paymentHeader;
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    
    const response = await fetch(`${node.endpoint}/v1/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const latency_ms = performance.now() - start;
    
    if (response.status === 402) {
      return {
        node_id: node.id,
        task_id: task.task_id,
        success: false,
        latency_ms,
        receipt_valid: false,
        error: 'payment_required',
      };
    }
    
    if (!response.ok) {
      return {
        node_id: node.id,
        task_id: task.task_id,
        success: false,
        latency_ms,
        receipt_valid: false,
        error: `http_${response.status}`,
      };
    }
    
    const data = await response.json() as { output?: unknown; receipt?: unknown };
    
    // Actually verify the receipt (not just check it exists)
    let receiptValid = false;
    if (data.output && data.receipt) {
      receiptValid = await verifyReceipt(node.endpoint, request, data.output, data.receipt);
    }
    
    return {
      node_id: node.id,
      task_id: task.task_id,
      success: true,
      latency_ms,
      receipt_valid: receiptValid,
    };
    
  } catch (error) {
    const latency_ms = performance.now() - start;
    return {
      node_id: node.id,
      task_id: task.task_id,
      success: false,
      latency_ms,
      receipt_valid: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

/**
 * Blast challenges to all nodes in parallel
 */
export async function blastRound(
  nodes: NodeConfig[],
  tasks: ChallengeTask[],
  options?: { paymentHeader?: string }
): Promise<NodeResult[]> {
  const promises: Promise<NodeResult>[] = [];
  
  for (const node of nodes) {
    for (const task of tasks) {
      promises.push(challengeNode(node, task, options?.paymentHeader));
    }
  }
  
  return Promise.all(promises);
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Compute score from results
 */
export function computeScore(
  round_id: string,
  results: NodeResult[]
): Omit<PoSwScoreV0, 'orchestrator_pubkey' | 'sig'> {
  const total = results.length;
  const successful = results.filter(r => r.success);
  const validReceipts = results.filter(r => r.receipt_valid);
  
  const latencies = successful.map(r => r.latency_ms).sort((a, b) => a - b);
  
  return {
    schema: 'posw.score.v0',
    round_id,
    nodes_tested: new Set(results.map(r => r.node_id)).size,
    confidence: total > 0 ? successful.length / total : 0,
    signals: {
      completion_rate: total > 0 ? successful.length / total : 0,
      latency_p50_ms: Math.round(percentile(latencies, 50)),
      latency_p90_ms: Math.round(percentile(latencies, 90)),
      latency_p99_ms: Math.round(percentile(latencies, 99)),
      receipt_valid_rate: total > 0 ? validReceipts.length / total : 0,
    },
    valid_until: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };
}
