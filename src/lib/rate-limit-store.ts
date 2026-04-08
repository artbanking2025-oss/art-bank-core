/**
 * Rate Limit Storage Layer
 * 
 * Hybrid storage: Cloudflare KV (production) + In-Memory (development)
 * - Production: Uses Cloudflare KV for distributed rate limiting
 * - Development: Uses in-memory Map for local testing
 * - Automatic fallback if KV unavailable
 */

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-Memory Rate Limit Store (fallback для development)
 */
class InMemoryRateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    const entry = this.store.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (entry.resetTime < Date.now()) {
      this.store.delete(key);
      return null;
    }
    
    return entry;
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    let entry = await this.get(key);
    
    if (!entry) {
      entry = {
        count: 1,
        resetTime: Date.now() + windowMs
      };
    } else {
      entry.count++;
    }
    
    await this.set(key, entry);
    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  getSize(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

/**
 * Cloudflare KV Rate Limit Store (production)
 */
class KVRateLimitStore {
  constructor(private kv: any) {} // KVNamespace type (any для совместимости)

  async get(key: string): Promise<RateLimitEntry | null> {
    const result = await this.kv.getWithMetadata(key);
    
    if (!result.value) return null;
    
    const count = parseInt(result.value, 10);
    const resetTime = (result.metadata as any)?.resetTime || 0;
    
    return { count, resetTime };
  }

  async set(key: string, entry: RateLimitEntry, expirationTtl: number): Promise<void> {
    await this.kv.put(key, String(entry.count), {
      expirationTtl,
      metadata: { resetTime: entry.resetTime }
    });
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    const entry = await this.get(key);
    const expirationTtl = Math.ceil(windowMs / 1000);
    
    if (!entry) {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: Date.now() + windowMs
      };
      await this.set(key, newEntry, expirationTtl);
      return newEntry;
    }
    
    const updatedEntry: RateLimitEntry = {
      count: entry.count + 1,
      resetTime: entry.resetTime
    };
    await this.set(key, updatedEntry, expirationTtl);
    return updatedEntry;
  }
}

/**
 * Unified Rate Limit Store Interface
 */
export class RateLimitStore {
  private kvStore: KVRateLimitStore | null = null;
  private memoryStore: InMemoryRateLimitStore;
  private mode: 'kv' | 'memory';

  constructor(kv?: any) { // any для совместимости с KVNamespace
    if (kv) {
      this.kvStore = new KVRateLimitStore(kv);
      this.mode = 'kv';
    } else {
      this.mode = 'memory';
      console.warn('⚠️ Rate Limiting using in-memory store (development mode)');
    }
    
    this.memoryStore = new InMemoryRateLimitStore();
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    try {
      if (this.mode === 'kv' && this.kvStore) {
        return await this.kvStore.increment(key, windowMs);
      }
    } catch (error) {
      console.error('KV rate limit error, falling back to memory:', error);
      this.mode = 'memory'; // Fallback to memory
    }
    
    return await this.memoryStore.increment(key, windowMs);
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    try {
      if (this.mode === 'kv' && this.kvStore) {
        return await this.kvStore.get(key);
      }
    } catch (error) {
      console.error('KV rate limit error, falling back to memory:', error);
      this.mode = 'memory';
    }
    
    return await this.memoryStore.get(key);
  }

  getMode(): 'kv' | 'memory' {
    return this.mode;
  }

  getStats(): { mode: string; size?: number } {
    return {
      mode: this.mode,
      size: this.mode === 'memory' ? this.memoryStore.getSize() : undefined
    };
  }

  clearMemoryStore(): void {
    this.memoryStore.clear();
  }

  shutdown(): void {
    this.memoryStore.shutdown();
  }
}

// Singleton instance
let rateLimitStore: RateLimitStore | null = null;

export function getRateLimitStore(kv?: any): RateLimitStore { // any для KVNamespace
  if (!rateLimitStore) {
    rateLimitStore = new RateLimitStore(kv);
  }
  return rateLimitStore;
}
