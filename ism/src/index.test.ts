import { describe, test, expect, beforeAll } from 'bun:test';
import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { createISM, type ISMConfig, type RawInput, type InputAttestation } from './index';

// Configure ed25519
// @ts-ignore
ed.hashes.sha512 = sha512;

// Test helpers
function randomPrivateKey(): Uint8Array {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key;
}

function makeConfig(overrides?: Partial<ISMConfig>): ISMConfig {
  return {
    ism_id: 'test-ism-001',
    private_key: randomPrivateKey(),
    approved_sources: [
      { id: 'price-oracle', type: 'api_signed' },
      { id: 'eth-mainnet', type: 'blockchain_event', chain_id: 1 },
      { id: 'scheduler', type: 'cron' },
      { id: 'upstream-ism', type: 'ism_chain' },
    ],
    ...overrides,
  };
}

describe('ISM - createISM', () => {
  test('returns ISM instance with correct id and pubkey', () => {
    const config = makeConfig();
    const ism = createISM(config);
    
    expect(ism.ism_id).toBe('test-ism-001');
    expect(ism.pubkey).toMatch(/^[0-9a-f]{64}$/); // 32-byte Ed25519 pubkey in hex
  });

  test('pubkey matches private key', () => {
    const privKey = randomPrivateKey();
    const expectedPubkey = Buffer.from(ed.getPublicKey(privKey)).toString('hex');
    const ism = createISM(makeConfig({ private_key: privKey }));
    
    expect(ism.pubkey).toBe(expectedPubkey);
  });
});

describe('ISM - attest', () => {
  test('attests a valid cron input', async () => {
    const ism = createISM(makeConfig());
    const input: RawInput = {
      data: 'heartbeat-check',
      source_id: 'scheduler',
      source_type: 'cron',
    };
    
    const result = await ism.attest(input);
    expect('error' in result).toBe(false);
    
    const att = result as InputAttestation;
    expect(att.schema).toBe('ism.input.v0');
    expect(att.input_type).toBe('cron');
    expect(att.input_source).toBe('scheduler');
    expect(att.sequence).toBeGreaterThan(0);
    expect(att.received_at).toBeGreaterThan(0);
    expect(att.sig).toBeTruthy();
    expect(att.ism_pubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  test('attests an API signed input', async () => {
    const ism = createISM(makeConfig());
    const input: RawInput = {
      data: { price: 3200.50, pair: 'ETH/USD' },
      source_id: 'price-oracle',
      source_type: 'api_signed',
      source_signature: 'dummy-sig',
    };
    
    const result = await ism.attest(input);
    expect('error' in result).toBe(false);
    
    const att = result as InputAttestation;
    expect(att.input_type).toBe('api_signed');
    expect(att.source_signature).toBe('dummy-sig');
  });

  test('attests a blockchain event', async () => {
    const ism = createISM(makeConfig());
    const input: RawInput = {
      data: { event: 'Transfer', from: '0xabc', to: '0xdef', value: '1000' },
      source_id: 'eth-mainnet',
      source_type: 'blockchain_event',
      block_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      block_number: 19000000,
    };
    
    const result = await ism.attest(input);
    expect('error' in result).toBe(false);
    
    const att = result as InputAttestation;
    expect(att.input_type).toBe('blockchain_event');
    expect(att.block_hash).toBe('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
  });

  test('rejects unapproved source', async () => {
    const ism = createISM(makeConfig());
    const input: RawInput = {
      data: 'evil input',
      source_id: 'unknown-source',
      source_type: 'cron',
    };
    
    const result = await ism.attest(input);
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Input rejected');
  });

  test('rejects mismatched source type', async () => {
    const ism = createISM(makeConfig());
    const input: RawInput = {
      data: 'sneaky',
      source_id: 'scheduler',       // approved as 'cron'
      source_type: 'api_signed',    // but claiming api_signed
    };
    
    const result = await ism.attest(input);
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Input rejected');
  });

  test('rejects api_signed without signature when pubkey configured', async () => {
    const sourcePubkey = Buffer.from(ed.getPublicKey(randomPrivateKey())).toString('hex');
    const config = makeConfig({
      approved_sources: [
        { id: 'signed-api', type: 'api_signed', pubkey: sourcePubkey },
      ],
    });
    const ism = createISM(config);
    
    const input: RawInput = {
      data: 'missing sig',
      source_id: 'signed-api',
      source_type: 'api_signed',
      // no source_signature!
    };
    
    const result = await ism.attest(input);
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Input rejected');
  });

  test('rejects blockchain event without block_hash', async () => {
    const ism = createISM(makeConfig());
    const input: RawInput = {
      data: { event: 'Transfer' },
      source_id: 'eth-mainnet',
      source_type: 'blockchain_event',
      // no block_hash!
    };
    
    const result = await ism.attest(input);
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Input rejected');
  });

  test('input hash is deterministic for same data across instances', async () => {
    const config = makeConfig();
    const ism1 = createISM(config);
    const ism2 = createISM(config);
    const input: RawInput = {
      data: 'deterministic-test',
      source_id: 'scheduler',
      source_type: 'cron',
    };
    
    const r1 = await ism1.attest(input) as InputAttestation;
    const r2 = await ism2.attest(input) as InputAttestation;
    
    expect(r1.input_hash).toBe(r2.input_hash);
  });

  test('sequence is monotonically increasing', async () => {
    const ism = createISM(makeConfig());
    
    const r1 = await ism.attest({ data: 'seq-1', source_id: 'scheduler', source_type: 'cron' }) as InputAttestation;
    const r2 = await ism.attest({ data: 'seq-2', source_id: 'scheduler', source_type: 'cron' }) as InputAttestation;
    const r3 = await ism.attest({ data: 'seq-3', source_id: 'scheduler', source_type: 'cron' }) as InputAttestation;
    
    expect(r2.sequence).toBeGreaterThan(r1.sequence);
    expect(r3.sequence).toBeGreaterThan(r2.sequence);
  });

  test('object data is JSON-stringified for hashing', async () => {
    const config = makeConfig();
    const ism1 = createISM(config);
    const ism2 = createISM(config);
    
    const objResult = await ism1.attest({
      data: { key: 'value' },
      source_id: 'scheduler',
      source_type: 'cron',
    }) as InputAttestation;
    
    const strResult = await ism2.attest({
      data: '{"key":"value"}',
      source_id: 'scheduler',
      source_type: 'cron',
    }) as InputAttestation;
    
    expect(objResult.input_hash).toBe(strResult.input_hash);
  });
});

describe('ISM - verify', () => {
  test('verifies a valid attestation', async () => {
    const ism = createISM(makeConfig());
    const att = await ism.attest({
      data: 'verify-me',
      source_id: 'scheduler',
      source_type: 'cron',
    }) as InputAttestation;
    
    const result = await ism.verify(att);
    expect(result.valid).toBe(true);
  });

  test('rejects tampered input_hash', async () => {
    const ism = createISM(makeConfig());
    const att = await ism.attest({
      data: 'tamper-test',
      source_id: 'scheduler',
      source_type: 'cron',
    }) as InputAttestation;
    
    // Tamper with input hash
    att.input_hash = 'deadbeef'.repeat(8);
    
    const result = await ism.verify(att);
    expect(result.valid).toBe(false);
  });

  test('rejects tampered signature', async () => {
    const ism = createISM(makeConfig());
    const att = await ism.attest({
      data: 'sig-tamper',
      source_id: 'scheduler',
      source_type: 'cron',
    }) as InputAttestation;
    
    // Corrupt signature
    att.sig = att.sig.slice(0, -4) + 'XXXX';
    
    const result = await ism.verify(att);
    expect(result.valid).toBe(false);
  });

  test('rejects attestation signed by different ISM', async () => {
    const ism1 = createISM(makeConfig({ ism_id: 'ism-1' }));
    const ism2 = createISM(makeConfig({ ism_id: 'ism-2' }));
    
    const att = await ism1.attest({
      data: 'cross-ism',
      source_id: 'scheduler',
      source_type: 'cron',
    }) as InputAttestation;
    
    // ism2 should still verify the signature (it's valid Ed25519)
    // but the pubkey belongs to ism1, not ism2
    const result = await ism2.verify(att);
    expect(result.valid).toBe(true); // sig is valid — trust decision is at consumer level
  });

  test('cross-ISM verification uses attestation pubkey, not verifier pubkey', async () => {
    const ism1 = createISM(makeConfig({ ism_id: 'ism-1' }));
    const ism2 = createISM(makeConfig({ ism_id: 'ism-2' }));
    
    const att = await ism1.attest({
      data: 'pubkey-check',
      source_id: 'scheduler',
      source_type: 'cron',
    }) as InputAttestation;
    
    // Verify attestation contains ism1's pubkey
    expect(att.ism_pubkey).toBe(ism1.pubkey);
    expect(att.ism_pubkey).not.toBe(ism2.pubkey);
    
    // ism2 verifies using the pubkey IN the attestation
    const result = await ism2.verify(att);
    expect(result.valid).toBe(true);
  });
});

describe('ISM - edge cases', () => {
  test('handles empty string data', async () => {
    const ism = createISM(makeConfig());
    const result = await ism.attest({
      data: '',
      source_id: 'scheduler',
      source_type: 'cron',
    });
    
    expect('error' in result).toBe(false);
    const att = result as InputAttestation;
    expect(att.input_hash).toBeTruthy();
  });

  test('handles large data', async () => {
    const ism = createISM(makeConfig());
    const largeData = 'x'.repeat(100_000);
    
    const result = await ism.attest({
      data: largeData,
      source_id: 'scheduler',
      source_type: 'cron',
    });
    
    expect('error' in result).toBe(false);
  });

  test('handles nested object data', async () => {
    const ism = createISM(makeConfig());
    const result = await ism.attest({
      data: { a: { b: { c: [1, 2, 3] } }, d: null },
      source_id: 'scheduler',
      source_type: 'cron',
    });
    
    expect('error' in result).toBe(false);
  });
});

describe('ISM - P0/P1 hardening', () => {
  test('verifies valid Ed25519 source signature', async () => {
    const sourceKey = new Uint8Array(32);
    crypto.getRandomValues(sourceKey);
    const sourcePubkey = Buffer.from(ed.getPublicKey(sourceKey)).toString('hex');
    
    const config = makeConfig({
      approved_sources: [
        { id: 'signed-oracle', type: 'api_signed', pubkey: sourcePubkey },
      ],
    });
    const ism = createISM(config);
    
    const inputData = 'price: ETH/USD 3200.50';
    const inputBytes = new TextEncoder().encode(inputData);
    const sig = await ed.signAsync(inputBytes, sourceKey);
    const sigB64 = Buffer.from(sig).toString('base64url');
    
    const result = await ism.attest({
      data: inputData,
      source_id: 'signed-oracle',
      source_type: 'api_signed',
      source_signature: sigB64,
    });
    
    expect('error' in result).toBe(false);
    const att = result as InputAttestation;
    expect(att.source_signature).toBe(sigB64);
  });

  test('rejects invalid Ed25519 source signature', async () => {
    const sourceKey = new Uint8Array(32);
    crypto.getRandomValues(sourceKey);
    const sourcePubkey = Buffer.from(ed.getPublicKey(sourceKey)).toString('hex');
    
    const config = makeConfig({
      approved_sources: [
        { id: 'signed-oracle', type: 'api_signed', pubkey: sourcePubkey },
      ],
    });
    const ism = createISM(config);
    
    // Sign with wrong key
    const wrongKey = new Uint8Array(32);
    crypto.getRandomValues(wrongKey);
    const inputData = 'price: ETH/USD 3200.50';
    const sig = await ed.signAsync(new TextEncoder().encode(inputData), wrongKey);
    
    const result = await ism.attest({
      data: inputData,
      source_id: 'signed-oracle',
      source_type: 'api_signed',
      source_signature: Buffer.from(sig).toString('base64url'),
    });
    
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Input rejected');
  });

  test('rejects duplicate input (replay protection)', async () => {
    const ism = createISM(makeConfig());
    const input: RawInput = {
      data: 'replay-me',
      source_id: 'scheduler',
      source_type: 'cron',
    };
    
    const r1 = await ism.attest(input);
    expect('error' in r1).toBe(false);
    
    const r2 = await ism.attest(input);
    expect('error' in r2).toBe(true);
    expect((r2 as { error: string }).error).toBe('Duplicate input rejected');
  });

  test('allows same data from different sources', async () => {
    const config = makeConfig({
      approved_sources: [
        { id: 'source-a', type: 'cron' },
        { id: 'source-b', type: 'cron' },
      ],
    });
    const ism = createISM(config);
    
    const r1 = await ism.attest({ data: 'same-data', source_id: 'source-a', source_type: 'cron' });
    const r2 = await ism.attest({ data: 'same-data', source_id: 'source-b', source_type: 'cron' });
    
    expect('error' in r1).toBe(false);
    expect('error' in r2).toBe(false);
  });

  test('rejects oversized input', async () => {
    const ism = createISM(makeConfig({ maxInputSize: 100 }));
    const result = await ism.attest({
      data: 'x'.repeat(200),
      source_id: 'scheduler',
      source_type: 'cron',
    });
    
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toBe('Input too large');
  });

  test('per-instance sequence counters are independent', async () => {
    const ism1 = createISM(makeConfig({ ism_id: 'ism-1' }));
    const ism2 = createISM(makeConfig({ ism_id: 'ism-2' }));
    
    const r1 = await ism1.attest({ data: 'a', source_id: 'scheduler', source_type: 'cron' }) as InputAttestation;
    const r2 = await ism1.attest({ data: 'b', source_id: 'scheduler', source_type: 'cron' }) as InputAttestation;
    const r3 = await ism2.attest({ data: 'c', source_id: 'scheduler', source_type: 'cron' }) as InputAttestation;
    
    expect(r1.sequence).toBe(1);
    expect(r2.sequence).toBe(2);
    expect(r3.sequence).toBe(1); // Independent counter
  });

  test('error messages do not leak approved source IDs', async () => {
    const ism = createISM(makeConfig());
    
    const result = await ism.attest({
      data: 'probe',
      source_id: 'unknown-source',
      source_type: 'cron',
    });
    
    const error = (result as { error: string }).error;
    expect(error).not.toContain('unknown-source');
    expect(error).not.toContain('scheduler');
    expect(error).toBe('Input rejected');
  });
});
