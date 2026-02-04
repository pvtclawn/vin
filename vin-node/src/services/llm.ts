/**
 * VIN Node - LLM Providers
 * 
 * Pluggable LLM backends for real inference.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ActionRequestV0 } from '../types/index';

export interface LLMResponse {
  text: string;
  model: string;
  provider: string;
}

export interface LLMProvider {
  generate(request: ActionRequestV0): Promise<LLMResponse>;
}

// ============ Anthropic Provider ============

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(request: ActionRequestV0): Promise<LLMResponse> {
    const prompt = (request.prompt || request.inputs?.prompt || '') as string;
    const maxTokens = request.constraints?.max_tokens || 1024;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      text,
      model: this.model,
      provider: 'anthropic',
    };
  }
}

// ============ Echo Provider (for testing) ============

export class EchoProvider implements LLMProvider {
  async generate(request: ActionRequestV0): Promise<LLMResponse> {
    const prompt = (request.prompt || request.inputs?.prompt || '') as string;
    return {
      text: `[VIN Node] Processed request: ${prompt.slice(0, 100)}...`,
      model: 'echo',
      provider: 'echo',
    };
  }
}

// ============ Provider Factory ============

export function createProvider(): LLMProvider {
  const provider = process.env.VIN_LLM_PROVIDER || 'echo';
  
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY required for anthropic provider');
    }
    const model = process.env.VIN_LLM_MODEL || 'claude-sonnet-4-20250514';
    return new AnthropicProvider(apiKey, model);
  }
  
  // Default to echo for testing
  return new EchoProvider();
}
