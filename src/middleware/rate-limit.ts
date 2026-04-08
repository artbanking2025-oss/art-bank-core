/**
 * Rate Limiting Middleware for Art Bank API
 * 
 * Защита от DDoS и злоупотреблений API
 * Hybrid storage: Cloudflare KV (production) + In-Memory (development)
 * - Automatic fallback if KV unavailable
 * - Per-user rate limiting для authenticated users
 * - Per-IP rate limiting для anonymous users
 * 
 * Лимиты:
 * - Публичные эндпоинты: 60 req/min
 * - Аутентифицированные: 300 req/min
 * - Admin: 1000 req/min
 */

import type { Context, Next } from 'hono'
import type { Env } from '../types'
import { getRateLimitStore } from '../lib/rate-limit-store'

interface RateLimitConfig {
  windowMs: number      // Временное окно в миллисекундах
  maxRequests: number   // Максимум запросов в окно
  keyPrefix: string     // Префикс для KV ключа
}

// Конфигурации для разных типов запросов
const RATE_LIMITS = {
  public: {
    windowMs: 60 * 1000,      // 1 минута
    maxRequests: 60,           // 60 запросов
    keyPrefix: 'ratelimit:public:'
  },
  authenticated: {
    windowMs: 60 * 1000,      // 1 минута
    maxRequests: 300,          // 300 запросов
    keyPrefix: 'ratelimit:auth:'
  },
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 1000,         // Admin имеет высокий лимит
    keyPrefix: 'ratelimit:admin:'
  }
}

/**
 * Получить IP адрес клиента
 */
function getClientIP(c: Context): string {
  // Cloudflare передаёт реальный IP в CF-Connecting-IP
  const cfIP = c.req.header('CF-Connecting-IP')
  if (cfIP) return cfIP

  // Fallback на X-Forwarded-For
  const forwarded = c.req.header('X-Forwarded-For')
  if (forwarded) return forwarded.split(',')[0].trim()

  // Последний fallback
  return 'unknown'
}

/**
 * Получить идентификатор клиента для rate limiting
 */
function getClientIdentifier(c: Context): string {
  // Для аутентифицированных пользователей используем user_id
  const user = c.get('user')
  if (user?.user_id) {
    return `user:${user.user_id}`
  }

  // Для неаутентифицированных - IP адрес
  return `ip:${getClientIP(c)}`
}

/**
 * Выбрать конфигурацию rate limit на основе контекста
 */
function getRateLimitConfig(c: Context): RateLimitConfig {
  const user = c.get('user')
  
  // Admin имеет самый высокий лимит
  if (user?.role === 'admin') {
    return RATE_LIMITS.admin
  }

  // Аутентифицированные пользователи
  if (user) {
    return RATE_LIMITS.authenticated
  }

  // Публичные запросы
  return RATE_LIMITS.public
}

/**
 * Rate Limiting Middleware
 * 
 * Automatically uses Cloudflare KV if configured, falls back to in-memory
 * - Production: Distributed rate limiting via KV
 * - Development: In-memory rate limiting
 * 
 * Optional KV configuration in wrangler.jsonc:
 * ```jsonc
 * "kv_namespaces": [
 *   {
 *     "binding": "RATE_LIMIT",
 *     "id": "your-kv-id",
 *     "preview_id": "your-preview-kv-id"
 *   }
 * ]
 * ```
 */
export const rateLimitMiddleware = async (c: Context<Env>, next: Next) => {
  const env = c.env as any
  const store = getRateLimitStore(env.RATE_LIMIT) // Auto-fallback to memory if undefined
  
  const config = getRateLimitConfig(c)
  const identifier = getClientIdentifier(c)
  const key = `${config.keyPrefix}${identifier}`
  
  try {
    // Increment counter and get result
    const entry = await store.increment(key, config.windowMs)
    
    // Check limit
    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000)
      
      return c.json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        code: 'RATE_LIMIT_EXCEEDED',
        limit: config.maxRequests,
        remaining: 0,
        reset: new Date(entry.resetTime).toISOString(),
        retryAfter
      }, 429)
    }

    // Add rate limit headers
    c.header('X-RateLimit-Limit', String(config.maxRequests))
    c.header('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - entry.count)))
    c.header('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)))
    c.header('X-RateLimit-Mode', store.getMode()) // Debug: kv or memory

    await next()
  } catch (error) {
    // In case of error - allow request (fail-open для availability)
    console.error('Rate limiting error:', error)
    await next()
  }
}

/**
 * Строгий Rate Limiter для критических эндпоинтов (auth, admin)
 * Строгий лимит: 10 запросов в минуту
 */
export const strictRateLimitMiddleware = async (c: Context<Env>, next: Next) => {
  const env = c.env as any
  const store = getRateLimitStore(env.RATE_LIMIT)
  
  const identifier = getClientIdentifier(c)
  const key = `ratelimit:strict:${identifier}`
  
  // Строгий лимит: 10 запросов в минуту
  const LIMIT = 10
  const WINDOW_MS = 60 * 1000

  try {
    const entry = await store.increment(key, WINDOW_MS)
    
    if (entry.count > LIMIT) {
      const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000)
      
      return c.json({
        error: 'Too Many Requests',
        message: `Too many authentication attempts. Please try again in ${retryAfter} seconds.`,
        code: 'STRICT_RATE_LIMIT_EXCEEDED',
        retryAfter
      }, 429)
    }

    c.header('X-RateLimit-Limit', String(LIMIT))
    c.header('X-RateLimit-Remaining', String(Math.max(0, LIMIT - entry.count)))
    c.header('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)))

    await next()
  } catch (error) {
    console.error('Strict rate limiting error:', error)
    await next()
  }
}
