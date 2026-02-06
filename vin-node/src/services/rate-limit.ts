/**
 * VIN Node - Rate Limiter
 * 
 * Simple token bucket rate limiter to prevent DoS attacks.
 * Uses in-memory storage (sufficient for single-node MVP).
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiterConfig {
  maxTokens: number;       // Max tokens in bucket
  refillRate: number;      // Tokens per second
  refillInterval: number;  // Ms between refills
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 100,          // 100 requests max burst
  refillRate: 10,          // 10 requests per second sustained
  refillInterval: 1000,    // Refill every second
};

export class RateLimiter {
  private buckets = new Map<string, RateLimitEntry>();
  private config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if request is allowed and consume a token
   * Returns true if allowed, false if rate limited
   */
  check(key: string): boolean {
    const now = Date.now();
    let entry = this.buckets.get(key);

    if (!entry) {
      // New client: start with full bucket minus 1
      entry = { tokens: this.config.maxTokens - 1, lastRefill: now };
      this.buckets.set(key, entry);
      return true;
    }

    // Refill tokens based on time elapsed
    const elapsed = now - entry.lastRefill;
    const refillCount = Math.floor(elapsed / this.config.refillInterval);
    
    if (refillCount > 0) {
      entry.tokens = Math.min(
        this.config.maxTokens,
        entry.tokens + (refillCount * this.config.refillRate)
      );
      entry.lastRefill = now;
    }

    // Check if we have tokens
    if (entry.tokens <= 0) {
      return false; // Rate limited
    }

    // Consume a token
    entry.tokens--;
    return true;
  }

  /**
   * Get remaining tokens for a key
   */
  remaining(key: string): number {
    const entry = this.buckets.get(key);
    return entry ? Math.max(0, entry.tokens) : this.config.maxTokens;
  }

  /**
   * Clean up old entries (call periodically)
   */
  cleanup(maxAgeMs: number = 3600_000): void {
    const now = Date.now();
    for (const [key, entry] of this.buckets) {
      if (now - entry.lastRefill > maxAgeMs) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Get key from request (IP-based)
   */
  static getKey(req: Request): string {
    // Try various headers for real IP behind proxies
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIp = req.headers.get('x-real-ip');
    if (realIp) {
      return realIp;
    }

    // Fallback: use a hash of user-agent + accept-language as fingerprint
    const ua = req.headers.get('user-agent') || 'unknown';
    const lang = req.headers.get('accept-language') || 'unknown';
    return `fp:${ua.slice(0, 50)}:${lang.slice(0, 20)}`;
  }
}

// Global rate limiter instance
export const rateLimiter = new RateLimiter({
  maxTokens: 100,    // 100 request burst
  refillRate: 10,    // 10 req/s sustained
  refillInterval: 1000,
});

// Cleanup old entries every 10 minutes
setInterval(() => rateLimiter.cleanup(), 600_000);
