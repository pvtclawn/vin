/**
 * ISM + VIN Integration Example
 * 
 * Shows how ISM gates inputs before they reach the VIN node,
 * creating a verifiable chain: Input → ISM attestation → VIN inference → Receipt
 */

import { createISM, type InputAttestation } from './index';

// Example: Agent receiving a cron-triggered task
async function demo() {
  // 1. Create ISM with approved sources
  const privKey = new Uint8Array(32);
  crypto.getRandomValues(privKey);
  
  const ism = createISM({
    ism_id: 'agent-ism-001',
    private_key: privKey,
    approved_sources: [
      { id: 'heartbeat-cron', type: 'cron' },
      { id: 'price-feed', type: 'api_signed', pubkey: '...' },
      { id: 'eth-events', type: 'blockchain_event', chain_id: 1 },
    ],
  });

  // 2. Agent receives a heartbeat trigger (cron)
  const attestation = await ism.attest({
    data: { task: 'check-portfolio', triggered_at: Date.now() },
    source_id: 'heartbeat-cron',
    source_type: 'cron',
  });

  if ('error' in attestation) {
    console.error('ISM rejected input:', attestation.error);
    return;
  }

  console.log('Input attested:', {
    hash: attestation.input_hash,
    sequence: attestation.sequence,
    sig: attestation.sig.slice(0, 20) + '...',
  });

  // 3. Agent constructs LLM prompt using attested input
  const prompt = `Analyze the current portfolio based on task: ${attestation.input_hash}`;
  
  // 4. Send to VIN node with ISM attestation attached
  // The VIN receipt + ISM attestation together prove:
  //   - Input came from an approved non-human source (ISM)
  //   - LLM inference happened in TEE (VIN)
  //   - Output is bound to both input attestation and LLM call
  
  console.log('Would send to VIN:', {
    prompt,
    ism_attestation: attestation.sig.slice(0, 20) + '...',
    ism_pubkey: ism.pubkey,
  });

  // 5. Verify the attestation (any party can do this)
  const verification = await ism.verify(attestation);
  console.log('Verification:', verification);
}

demo().catch(console.error);
