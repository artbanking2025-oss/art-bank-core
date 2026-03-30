/**
 * Health Check Endpoint for Art Bank API
 * 
 * Provides detailed system health diagnostics including:
 * - Database connectivity
 * - Circuit breaker status
 * - Service uptime
 * - Memory usage
 * - API version info
 */

import type { Context } from 'hono'
import type { Env } from '../types'
import { circuitBreakers } from './circuit-breaker'

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  checks: {
    database: HealthCheck
    circuitBreakers: HealthCheck
    rateLimit?: HealthCheck
    memory?: HealthCheck
  }
  metadata: {
    environment: string
    region?: string
  }
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail'
  message: string
  responseTime?: number
  details?: Record<string, any>
}

// Store service start time
const SERVICE_START_TIME = Date.now()
const VERSION = 'v2.7'

/**
 * Check database connectivity
 */
async function checkDatabase(c: Context<{ Bindings: Env }>): Promise<HealthCheck> {
  const startTime = Date.now()
  
  try {
    const { DB } = c.env
    
    // Simple query to test DB connection
    const result = await DB.prepare('SELECT 1 as test').first()
    const responseTime = Date.now() - startTime
    
    if (result && result.test === 1) {
      return {
        status: 'pass',
        message: 'Database connection successful',
        responseTime,
        details: {
          type: 'Cloudflare D1 (SQLite)'
        }
      }
    }
    
    return {
      status: 'fail',
      message: 'Database query returned unexpected result',
      responseTime
    }
  } catch (error: any) {
    return {
      status: 'fail',
      message: `Database connection failed: ${error.message}`,
      responseTime: Date.now() - startTime
    }
  }
}

/**
 * Check circuit breakers status
 */
function checkCircuitBreakers(): HealthCheck {
  try {
    const openBreakers: string[] = []
    const halfOpenBreakers: string[] = []
    
    for (const [name, breaker] of Object.entries(circuitBreakers)) {
      const state = (breaker as any).state
      if (state === 'OPEN') {
        openBreakers.push(name)
      } else if (state === 'HALF_OPEN') {
        halfOpenBreakers.push(name)
      }
    }
    
    if (openBreakers.length > 0) {
      return {
        status: 'fail',
        message: `${openBreakers.length} circuit breaker(s) open`,
        details: {
          open: openBreakers,
          halfOpen: halfOpenBreakers
        }
      }
    }
    
    if (halfOpenBreakers.length > 0) {
      return {
        status: 'warn',
        message: `${halfOpenBreakers.length} circuit breaker(s) recovering`,
        details: {
          halfOpen: halfOpenBreakers
        }
      }
    }
    
    return {
      status: 'pass',
      message: 'All circuit breakers operational',
      details: {
        total: Object.keys(circuitBreakers).length
      }
    }
  } catch (error: any) {
    return {
      status: 'warn',
      message: 'Circuit breaker check unavailable',
      details: {
        error: error.message
      }
    }
  }
}

/**
 * Check rate limiting service (KV)
 */
function checkRateLimit(c: Context<{ Bindings: Env }>): HealthCheck | undefined {
  try {
    const env = c.env as any
    
    if (!env.RATE_LIMIT) {
      return {
        status: 'warn',
        message: 'Rate limiting not configured (KV namespace missing)',
        details: {
          configured: false
        }
      }
    }
    
    return {
      status: 'pass',
      message: 'Rate limiting service available',
      details: {
        configured: true,
        provider: 'Cloudflare KV'
      }
    }
  } catch (error: any) {
    return {
      status: 'fail',
      message: `Rate limit check failed: ${error.message}`
    }
  }
}

/**
 * Check memory usage (if available)
 */
function checkMemory(): HealthCheck | undefined {
  try {
    // Workers don't have process.memoryUsage(), but we can provide metadata
    return {
      status: 'pass',
      message: 'Memory monitoring not available in Workers',
      details: {
        platform: 'Cloudflare Workers',
        limit: '128MB per request'
      }
    }
  } catch (error: any) {
    return undefined
  }
}

/**
 * Calculate overall health status
 */
function calculateOverallStatus(checks: HealthStatus['checks']): 'healthy' | 'degraded' | 'unhealthy' {
  const statuses = [
    checks.database.status,
    checks.circuitBreakers.status,
    checks.rateLimit?.status,
    checks.memory?.status
  ].filter(Boolean)
  
  if (statuses.some(s => s === 'fail')) {
    return 'unhealthy'
  }
  
  if (statuses.some(s => s === 'warn')) {
    return 'degraded'
  }
  
  return 'healthy'
}

/**
 * Health Check Handler
 */
export async function healthCheckHandler(c: Context<{ Bindings: Env }>) {
  const startTime = Date.now()
  
  // Run all health checks
  const [database, circuitBreakers, rateLimit, memory] = await Promise.all([
    checkDatabase(c),
    Promise.resolve(checkCircuitBreakers()),
    Promise.resolve(checkRateLimit(c)),
    Promise.resolve(checkMemory())
  ])
  
  const checks = {
    database,
    circuitBreakers,
    ...(rateLimit && { rateLimit }),
    ...(memory && { memory })
  }
  
  const status = calculateOverallStatus(checks)
  
  const health: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - SERVICE_START_TIME) / 1000), // seconds
    version: VERSION,
    checks,
    metadata: {
      environment: process.env.NODE_ENV || 'production',
      region: (c.req.raw as any).cf?.colo // Cloudflare datacenter
    }
  }
  
  const responseTime = Date.now() - startTime
  
  // Set appropriate HTTP status code
  const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503
  
  return c.json(health, httpStatus, {
    'X-Response-Time': `${responseTime}ms`,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  })
}

/**
 * Simple liveness probe (for Kubernetes/load balancers)
 */
export function livenessHandler(c: Context) {
  return c.json({ alive: true, timestamp: new Date().toISOString() })
}

/**
 * Simple readiness probe (checks if service can accept traffic)
 */
export async function readinessHandler(c: Context<{ Bindings: Env }>) {
  try {
    // Quick DB check
    const dbCheck = await checkDatabase(c)
    
    if (dbCheck.status === 'fail') {
      return c.json({ ready: false, reason: 'Database unavailable' }, 503)
    }
    
    return c.json({ ready: true, timestamp: new Date().toISOString() })
  } catch (error: any) {
    return c.json({ ready: false, reason: error.message }, 503)
  }
}
