/**
 * VIN Node - Receipt Test
 */
import { describe, test, expect } from 'bun:test';
import { generateNodeKeys, createReceipt, verifyReceipt } from './receipt';
import type { ActionRequestV0, OutputV0 } from '../types/index';

describe('ReceiptV0', () => {
  const keys = generateNodeKeys();
  
  const request: ActionRequestV0 = {
    schema: 'vin.action_request.v0',
    request_id: 'test-001',
    action_type: 'compose_post',
    policy_id: 'P0_COMPOSE_POST_V1',
    inputs: { prompt: 'Write a short tweet about AI' },
    constraints: { max_chars: 280 },
    llm: { provider: 'anthropic', model_id: 'claude-3.5-sonnet', params: {} },
  };
  
  const output: OutputV0 = {
    schema: 'vin.output.v0',
    format: 'plain',
    text: 'AI is transforming how we work and create.',
    clean_text: 'AI is transforming how we work and create.',
  };
  
  test('creates valid receipt', () => {
    const receipt = createReceipt(request, output, keys);
    
    expect(receipt.schema).toBe('vin.receipt.v0');
    expect(receipt.version).toBe('0.1');
    expect(receipt.request_id).toBe('test-001');
    expect(receipt.sig).toBeTruthy();
  });
  
  test('verifies valid receipt', () => {
    const receipt = createReceipt(request, output, keys);
    const result = verifyReceipt(request, output, receipt);
    
    expect(result.valid).toBe(true);
  });
  
  test('rejects tampered output', () => {
    const receipt = createReceipt(request, output, keys);
    
    const tamperedOutput: OutputV0 = {
      ...output,
      clean_text: 'TAMPERED: AI is bad.',
      text: 'TAMPERED: AI is bad.',
    };
    
    const result = verifyReceipt(request, tamperedOutput, receipt);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('output_clean_hash_mismatch');
  });
  
  test('rejects tampered inputs', () => {
    const receipt = createReceipt(request, output, keys);
    
    const tamperedRequest: ActionRequestV0 = {
      ...request,
      inputs: { prompt: 'DIFFERENT PROMPT' },
    };
    
    const result = verifyReceipt(tamperedRequest, output, receipt);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('inputs_commitment_mismatch');
  });
  
  test('rejects expired receipt', () => {
    const receipt = createReceipt(request, output, keys, { validitySeconds: -10 });
    const result = verifyReceipt(request, output, receipt);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });
  
  test('rejects replay (same nonce)', () => {
    const receipt = createReceipt(request, output, keys);
    
    // First verification should pass
    const result1 = verifyReceipt(request, output, receipt);
    expect(result1.valid).toBe(true);
    
    // Second verification with same receipt should fail (replay)
    const result2 = verifyReceipt(request, output, receipt);
    expect(result2.valid).toBe(false);
    expect(result2.reason).toBe('replay_detected');
  });
});

import canonicalize from 'canonicalize';

describe('RFC 8785 Canonicalization', () => {
  test('nested objects produce stable output', () => {
    const obj1 = { b: 2, a: { d: 4, c: 3 } };
    const obj2 = { a: { c: 3, d: 4 }, b: 2 };
    
    const json1 = canonicalize(obj1);
    const json2 = canonicalize(obj2);
    
    // RFC 8785 should produce identical output regardless of input order
    expect(json1).toBe(json2);
    expect(json1).toBe('{"a":{"c":3,"d":4},"b":2}');
  });
  
  test('arrays preserve order', () => {
    const obj = { items: [3, 1, 2], name: "test" };
    const json = canonicalize(obj);
    
    // Keys sorted, array order preserved
    expect(json).toBe('{"items":[3,1,2],"name":"test"}');
  });
});
