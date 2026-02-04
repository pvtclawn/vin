/**
 * VIN Node - Generic LLM Caller
 * 
 * Calls any LLM provider using user-provided credentials.
 * Supports OpenAI-compatible APIs (most providers).
 */

export interface LLMRequest {
  provider_url: string;       // e.g., "https://api.anthropic.com/v1/messages"
  api_key: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  // Provider-specific headers
  headers?: Record<string, string>;
}

export interface LLMResponse {
  text: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  raw?: unknown;
}

/**
 * Detect provider type from URL
 */
function detectProvider(url: string): 'anthropic' | 'openai' | 'unknown' {
  if (url.includes('anthropic.com')) return 'anthropic';
  if (url.includes('openai.com')) return 'openai';
  return 'unknown';
}

/**
 * Call Anthropic API
 */
async function callAnthropic(req: LLMRequest): Promise<LLMResponse> {
  const response = await fetch(req.provider_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.api_key,
      'anthropic-version': '2023-06-01',
      ...req.headers,
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      max_tokens: req.max_tokens ?? 1024,
      temperature: req.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json() as {
    content: Array<{ text: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    text: data.content[0]?.text ?? '',
    model: data.model,
    usage: data.usage,
    raw: data,
  };
}

/**
 * Call OpenAI-compatible API
 */
async function callOpenAI(req: LLMRequest): Promise<LLMResponse> {
  const response = await fetch(req.provider_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.api_key}`,
      ...req.headers,
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      max_tokens: req.max_tokens ?? 1024,
      temperature: req.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    text: data.choices[0]?.message?.content ?? '',
    model: data.model,
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
    },
    raw: data,
  };
}

/**
 * Call any LLM provider
 */
export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  const provider = detectProvider(req.provider_url);
  
  console.log(`[llm-proxy] Calling ${provider} at ${req.provider_url}`);
  
  switch (provider) {
    case 'anthropic':
      return callAnthropic(req);
    case 'openai':
    default:
      // Default to OpenAI-compatible format (works for most providers)
      return callOpenAI(req);
  }
}
