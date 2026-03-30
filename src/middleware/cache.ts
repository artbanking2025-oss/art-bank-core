/**
 * Caching Middleware for Art Bank API
 * 
 * Implements HTTP caching for public endpoints to reduce database load
 * and improve response times.
 * 
 * Uses Cloudflare's edge caching via Cache-Control headers.
 * For local development, implements simple in-memory cache.
 */

import type { Context, Next } from 'hono'
import type { Env } from '../types'

// Simple in-memory cache for development
const memoryCache = new Map<string, { data: any; expires: number }>()

export interface CacheConfig {
  ttl: number          // Time to live in seconds
  swr?: number         // Stale-while-revalidate in seconds
  tags?: string[]      // Cache tags for invalidation
  varyBy?: string[]    // Vary cache by headers (e.g., Accept-Language)
}

/**
 * Default cache configurations for different endpoint types
 */
export const CACHE_CONFIGS = {
  // Static data - longer cache
  graph: {
    ttl: 300,        // 5 minutes
    swr: 600,        // 10 minutes stale-while-revalidate
    tags: ['graph', 'nodes', 'edges']
  },
  
  // Dashboard stats - medium cache
  stats: {
    ttl: 60,         // 1 minute
    swr: 300,        // 5 minutes stale-while-revalidate
    tags: ['stats', 'dashboard']
  },
  
  // Artwork lists - short cache
  artworks: {
    ttl: 30,         // 30 seconds
    swr: 60,         // 1 minute stale-while-revalidate
    tags: ['artworks']
  },
  
  // Individual resources - longer cache
  resource: {
    ttl: 180,        // 3 minutes
    swr: 360,        // 6 minutes stale-while-revalidate
  },
  
  // Price history - short cache (volatile data)
  prices: {
    ttl: 15,         // 15 seconds
    swr: 30,         // 30 seconds stale-while-revalidate
    tags: ['prices']
  },
  
  // Health checks - no cache
  health: {
    ttl: 0,
    swr: 0
  }
}

/**
 * Generate cache key from request
 */
function generateCacheKey(c: Context): string {
  const url = new URL(c.req.url)
  return `cache:${url.pathname}${url.search}`
}

/**
 * Check if request is cacheable
 */
function isCacheable(c: Context): boolean {
  // Only cache GET requests
  if (c.req.method !== 'GET') {
    return false
  }
  
  // Don't cache authenticated requests (with JWT)
  const authHeader = c.req.header('Authorization')
  if (authHeader) {
    return false
  }
  
  // Don't cache if client explicitly requests fresh data
  const cacheControl = c.req.header('Cache-Control')
  if (cacheControl && (cacheControl.includes('no-cache') || cacheControl.includes('no-store'))) {
    return false
  }
  
  return true
}

/**
 * Get data from memory cache (development only)
 */
function getFromMemoryCache(key: string): any | null {
  const cached = memoryCache.get(key)
  
  if (!cached) {
    return null
  }
  
  // Check if expired
  if (Date.now() > cached.expires) {
    memoryCache.delete(key)
    return null
  }
  
  return cached.data
}

/**
 * Store data in memory cache (development only)
 */
function setInMemoryCache(key: string, data: any, ttl: number) {
  memoryCache.set(key, {
    data,
    expires: Date.now() + (ttl * 1000)
  })
  
  // Limit cache size to 100 entries
  if (memoryCache.size > 100) {
    const firstKey = memoryCache.keys().next().value
    memoryCache.delete(firstKey)
  }
}

/**
 * Cache Middleware Factory
 */
export function cacheMiddleware(config: CacheConfig) {
  return async (c: Context<Env>, next: Next) => {
    // Check if request is cacheable
    if (!isCacheable(c)) {
      return next()
    }
    
    const cacheKey = generateCacheKey(c)
    
    // Try to get from memory cache (development)
    const cached = getFromMemoryCache(cacheKey)
    if (cached) {
      // Add headers to indicate cache hit
      return c.json(cached, 200, {
        'X-Cache': 'HIT',
        'X-Cache-Key': cacheKey,
        'Cache-Control': `public, max-age=${config.ttl}${config.swr ? `, stale-while-revalidate=${config.swr}` : ''}`
      })
    }
    
    // Continue to handler
    await next()
    
    // Cache successful responses
    if (c.res.ok && c.res.status === 200) {
      try {
        // Clone response to read body
        const responseClone = c.res.clone()
        const data = await responseClone.json()
        
        // Store in memory cache
        setInMemoryCache(cacheKey, data, config.ttl)
        
        // Add caching headers to response
        c.res.headers.set('X-Cache', 'MISS')
        c.res.headers.set('X-Cache-Key', cacheKey)
        c.res.headers.set('Cache-Control', 
          `public, max-age=${config.ttl}${config.swr ? `, stale-while-revalidate=${config.swr}` : ''}`
        )
        
        // Add cache tags if provided
        if (config.tags && config.tags.length > 0) {
          c.res.headers.set('Cache-Tag', config.tags.join(','))
        }
        
        // Add Vary header if specified
        if (config.varyBy && config.varyBy.length > 0) {
          c.res.headers.set('Vary', config.varyBy.join(', '))
        }
      } catch (error) {
        // If caching fails, continue without caching
        console.warn('Cache middleware error:', error)
      }
    }
  }
}

/**
 * Cache invalidation helper
 */
export function invalidateCache(pattern?: string) {
  if (pattern) {
    // Invalidate specific pattern
    for (const key of memoryCache.keys()) {
      if (key.includes(pattern)) {
        memoryCache.delete(key)
      }
    }
  } else {
    // Clear all cache
    memoryCache.clear()
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  let totalSize = 0
  let expired = 0
  const now = Date.now()
  
  for (const [key, value] of memoryCache.entries()) {
    totalSize++
    if (now > value.expires) {
      expired++
    }
  }
  
  return {
    size: totalSize,
    expired,
    active: totalSize - expired,
    memoryUsage: memoryCache.size * 1024 // rough estimate
  }
}

/**
 * Convenience middleware for common cache types
 */
export const cacheGraph = cacheMiddleware(CACHE_CONFIGS.graph)
export const cacheStats = cacheMiddleware(CACHE_CONFIGS.stats)
export const cacheArtworks = cacheMiddleware(CACHE_CONFIGS.artworks)
export const cacheResource = cacheMiddleware(CACHE_CONFIGS.resource)
export const cachePrices = cacheMiddleware(CACHE_CONFIGS.prices)
