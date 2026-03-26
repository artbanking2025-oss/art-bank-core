/**
 * Rate Limiting Middleware for Art Bank API
 * 
 * Защита от DDoS и злоупотреблений API
 * Использует Cloudflare KV для хранения счётчиков запросов
 * 
 * Лимиты:
 * - Публичные эндпоинты: 60 req/min
 * - Аутентифицированные: 300 req/min
 * - Admin: unlimited
 */

import type { Context, Next } from 'hono'
import type { Env } from '../types'

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
 * ВАЖНО: Требует Cloudflare KV namespace в wrangler.jsonc:
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
  
  // Если KV не настроен, пропускаем rate limiting (для разработки)
  if (!env.RATE_LIMIT) {
    console.warn('⚠️ Rate Limiting disabled: KV namespace RATE_LIMIT not configured')
    return next()
  }

  const config = getRateLimitConfig(c)
  const identifier = getClientIdentifier(c)
  const key = `${config.keyPrefix}${identifier}`
  
  try {
    // Получить текущий счётчик из KV
    const currentStr = await env.RATE_LIMIT.get(key)
    const current = currentStr ? parseInt(currentStr, 10) : 0
    
    // Проверить лимит
    if (current >= config.maxRequests) {
      // Получить TTL для информирования клиента
      const metadata = await env.RATE_LIMIT.getWithMetadata(key)
      const resetTime = metadata.metadata?.resetTime || Date.now() + config.windowMs
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
      
      return c.json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        code: 'RATE_LIMIT_EXCEEDED',
        limit: config.maxRequests,
        reset: new Date(resetTime).toISOString()
      }, 429)
    }

    // Увеличить счётчик
    const newCount = current + 1
    const expirationTtl = Math.ceil(config.windowMs / 1000) // В секундах
    
    if (current === 0) {
      // Первый запрос в окне - установить TTL и metadata
      await env.RATE_LIMIT.put(key, String(newCount), {
        expirationTtl,
        metadata: { resetTime: Date.now() + config.windowMs }
      })
    } else {
      // Просто увеличить счётчик (TTL уже установлен)
      await env.RATE_LIMIT.put(key, String(newCount), { expirationTtl })
    }

    // Добавить заголовки для информирования клиента
    c.res.headers.set('X-RateLimit-Limit', String(config.maxRequests))
    c.res.headers.set('X-RateLimit-Remaining', String(config.maxRequests - newCount))
    c.res.headers.set('X-RateLimit-Reset', String(Date.now() + config.windowMs))

    await next()
  } catch (error) {
    // В случае ошибки KV - пропускаем rate limiting
    console.error('Rate limiting error:', error)
    await next()
  }
}

/**
 * Строгий Rate Limiter для критических эндпоинтов (auth, admin)
 */
export const strictRateLimitMiddleware = async (c: Context<Env>, next: Next) => {
  const env = c.env as any
  
  if (!env.RATE_LIMIT) {
    return next()
  }

  const identifier = getClientIdentifier(c)
  const key = `ratelimit:strict:${identifier}`
  
  // Строгий лимит: 10 запросов в минуту
  const LIMIT = 10
  const WINDOW_MS = 60 * 1000

  try {
    const currentStr = await env.RATE_LIMIT.get(key)
    const current = currentStr ? parseInt(currentStr, 10) : 0
    
    if (current >= LIMIT) {
      return c.json({
        error: 'Too Many Requests',
        message: 'Too many authentication attempts. Please try again later.',
        code: 'STRICT_RATE_LIMIT_EXCEEDED'
      }, 429)
    }

    const newCount = current + 1
    const expirationTtl = Math.ceil(WINDOW_MS / 1000)
    await env.RATE_LIMIT.put(key, String(newCount), { expirationTtl })

    await next()
  } catch (error) {
    console.error('Strict rate limiting error:', error)
    await next()
  }
}
