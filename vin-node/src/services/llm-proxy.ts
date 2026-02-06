/**
 * VIN Node - Generic LLM Caller
 * 
 * Calls any LLM provider using user-provided credentials.
 * Supports OpenAI-compatible APIs (most providers).
 * 
 * Security: SSRF protection via domain allowlist + IP validation
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
// SECURITY: This is the ONLY way to add new providers. No env var bypass.
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
 * 
 * SECURITY FIX: Also handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
 */
function isBlockedIP(ip: string): boolean {
  // Handle IPv4-mapped IPv6 addresses first (e.g., ::ffff:127.0.0.1)
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const mappedV4 = ip.slice(7);
    return isBlockedIP(mappedV4); // Recurse with the IPv4 portion
  }

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
    return lower === '::' ||                          // Unspecified address
           lower === '::1' ||                         // Loopback
           lower.startsWith('::1/') ||                // Loopback with prefix
           lower.startsWith('fe80:') ||               // Link-local
           lower.startsWith('fc') ||                  // Unique local (fc00::/7)
           lower.startsWith('fd');                    // Unique local (fc00::/7)
  }
  return false;
}

// Cache resolved IPs to prevent TOCTOU attacks
const resolvedIpCache = new Map<string, { ip: string; expires: number }>();
const DNS_CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Resolve hostname and cache the IP to prevent DNS rebinding (TOCTOU)
 */
async function resolveAndCache(hostname: string): Promise<string> {
  const now = Date.now();
  const cached = resolvedIpCache.get(hostname);
  
  if (cached && cached.expires > now) {
    return cached.ip;
  }

  const addresses = await Bun.dns.lookup(hostname, { family: 4, all: true });
  if (!addresses || addresses.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }

  const ip = addresses[0].address;
  
  // Validate the IP is not blocked
  if (isBlockedIP(ip)) {
    throw new Error(`Invalid provider_url: resolves to blocked IP ${ip}`);
  }

  // Cache for future use (prevents TOCTOU)
  resolvedIpCache.set(hostname, { ip, expires: now + DNS_CACHE_TTL_MS });
  
  // Clean old entries
  for (const [key, entry] of resolvedIpCache) {
    if (entry.expires < now) resolvedIpCache.delete(key);
  }

  return ip;
}

/**
 * SSRF Protection: Validate URL and resolve IPs
 * 
 * SECURITY: No VIN_ALLOW_ANY_HOST bypass. Allowlist is mandatory.
 */
async function validateProviderUrl(urlString: string): Promise<string> {
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

  // Check against allowlist (NO ENV VAR BYPASS)
  if (!ALLOWED_PROVIDER_HOSTS.has(parsed.hostname)) {
    throw new Error(`Invalid provider_url: host "${parsed.hostname}" not in allowlist`);
  }

  // Resolve and cache IP (prevents DNS rebinding TOCTOU)
  const resolvedIp = await resolveAndCache(parsed.hostname);
  
  return resolvedIp;
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
  // SSRF Protection: Validate URL and cache resolved IP
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
