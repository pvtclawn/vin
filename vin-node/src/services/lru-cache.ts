/**
 * VIN Node - Bounded LRU Cache with TTL
 * 
 * Used for nonce caching to prevent unbounded memory growth.
 * Automatically evicts oldest entries when full.
 */

export class LRUCache<V> {
  private cache = new Map<string, { value: V; expires: number }>();
  private maxSize: number;
  private defaultTtlMs: number;

  constructor(maxSize: number = 10000, defaultTtlMs: number = 600_000) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Set a value with optional TTL
   */
  set(key: string, value: V, ttlMs?: number): void {
    // If at capacity, evict oldest
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    // Delete and re-add to maintain insertion order (LRU)
    this.cache.delete(key);
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /**
   * Get a value (returns undefined if expired or missing)
   */
  get(key: string): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}
