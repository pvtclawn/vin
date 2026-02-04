/**
 * PoSw Orchestrator - CLI Demo
 * 
 * Usage: bun run blast -- --nodes http://localhost:3402
 */

import { blastRound, computeScore } from './blaster';
import type { NodeConfig, ChallengeTask } from './types';

const args = process.argv.slice(2);

// Parse --nodes flag
const nodesIdx = args.indexOf('--nodes');
const nodeEndpoints = nodesIdx >= 0 && args[nodesIdx + 1] 
  ? args[nodesIdx + 1].split(',')
  : ['http://localhost:3402'];

// Parse --tasks flag (number of tasks)
const tasksIdx = args.indexOf('--tasks');
const numTasks = tasksIdx >= 0 && args[tasksIdx + 1]
  ? parseInt(args[tasksIdx + 1])
  : 5;

// Build node configs
const nodes: NodeConfig[] = nodeEndpoints.map((endpoint, i) => ({
  id: `node-${i}`,
  endpoint: endpoint.trim(),
}));

// Generate challenge tasks
const tasks: ChallengeTask[] = Array.from({ length: numTasks }, (_, i) => ({
  task_id: `task-${i}-${Date.now()}`,
  action_type: 'challenge_response',
  policy_id: 'P1_CHALLENGE_RESP_V1',
  inputs: {
    challenge: `What is ${i + 1} + ${i + 2}?`,
    nonce: crypto.randomUUID(),
  },
}));

console.log('🚀 PoSw Orchestrator - Challenge Blast');
console.log(`   Nodes: ${nodes.length}`);
console.log(`   Tasks: ${tasks.length}`);
console.log(`   Total challenges: ${nodes.length * tasks.length}`);
console.log('');

const start = performance.now();

// Blast with payment header for testing
const results = await blastRound(nodes, tasks, { paymentHeader: 'test-payment' });

const elapsed = performance.now() - start;

console.log(`✅ Completed in ${Math.round(elapsed)}ms`);
console.log('');

// Show results
const successful = results.filter(r => r.success);
const failed = results.filter(r => !r.success);

console.log('📊 Results:');
console.log(`   Success: ${successful.length}/${results.length}`);
console.log(`   Failed: ${failed.length}`);

if (failed.length > 0) {
  console.log('   Failures:');
  for (const f of failed.slice(0, 5)) {
    console.log(`     - ${f.node_id}/${f.task_id}: ${f.error}`);
  }
}

console.log('');

// Compute score
const score = computeScore(`round-${Date.now()}`, results);

console.log('🏆 Score:');
console.log(`   Nodes tested: ${score.nodes_tested}`);
console.log(`   Completion rate: ${(score.signals.completion_rate * 100).toFixed(1)}%`);
console.log(`   Receipt valid rate: ${(score.signals.receipt_valid_rate * 100).toFixed(1)}%`);
console.log(`   Latency p50: ${score.signals.latency_p50_ms}ms`);
console.log(`   Latency p90: ${score.signals.latency_p90_ms}ms`);
console.log(`   Latency p99: ${score.signals.latency_p99_ms}ms`);
console.log(`   Confidence: ${(score.confidence * 100).toFixed(1)}%`);
