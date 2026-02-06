/**
 * VIN Node - Generic LLM Caller
 * 
 * Calls any LLM provider using user-provided credentials.
 * Supports OpenAI-compatible APIs (most providers).
 */

import * as net from 'net';

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

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

// Allowlist of permitted LLM provider domains
const ALLOWED_PROVIDER_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'api.together.xyz',
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.perplexity.ai',
  'api.deepseek.com',
  'openrouter.ai',
]);

/**
 * Blocked IP ranges (RFC 1918, link-local, loopback, metadata)
 */
function isBlockedIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    return (
      parts[0] === 10 ||                              // 10.0.0.0/8
      parts[0] === 127 ||                             // 127.0.0.0/8 (loopback)
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
      (parts[0] === 192 && parts[1] === 168) ||       // 192.168.0.0/16
      (parts[0] === 169 && parts[1] === 254) ||       // 169.254.0.0/16 (link-local, AWS metadata)
      parts[0] === 0 ||                               // 0.0.0.0/8
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) // 100.64.0.0/10 (CGNAT)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower.startsWith('::1') ||                 // loopback
           lower.startsWith('fe80:') ||               // link-local
           lower.startsWith('fc') ||                  // unique local
           lower.startsWith('fd');
  }
  return false;
}

/**
 * SSRF Protection: Validate URL and resolve IPs
 */
async function validateProviderUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid provider_url: not a valid URL');
  }

  // Require HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error('Invalid provider_url: must use HTTPS');
  }

  // Check against allowlist (if configured)
  const isAllowedHost = ALLOWED_PROVIDER_HOSTS.has(parsed.hostname) || 
                        process.env.VIN_ALLOW_ANY_HOST === '1';
                        
  if (!isAllowedHost) {
    throw new Error(`Invalid provider_url: host "${parsed.hostname}" not in allowlist`);
  }

  // DNS resolution check — ensure it doesn't resolve to internal IP
  try {
    const addresses = await Bun.dns.lookup(parsed.hostname, { family: 4, all: true });
    for (const { address } of addresses) {
      if (isBlockedIP(address)) {
        throw new Error(`Invalid provider_url: resolves to blocked IP ${address}`);
      }
    }
  } catch (err: any) {
    if (err.message?.includes('blocked IP')) throw err;
    // For TEE environments, we strictly reject if we can't verify the IP
    throw new Error(`Invalid provider_url: DNS resolution failed or blocked for ${parsed.hostname}`);
  }
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
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
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call OpenAI-compatible API
 */
async function callOpenAI(req: LLMRequest): Promise<LLMResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
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
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call any LLM provider
 */
export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  // P1 Fix: SSRF Protection
  await validateProviderUrl(req.provider_url);

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
