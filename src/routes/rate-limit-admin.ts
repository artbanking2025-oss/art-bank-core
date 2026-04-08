/**
 * Rate Limit Admin API
 * 
 * Admin endpoints для управления и мониторинга rate limiting
 */

import { Hono } from 'hono';
import { getRateLimitStore } from '../lib/rate-limit-store';
import type { Env } from '../types/env';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/rate-limit/status - Статус rate limiting system
 */
app.get('/status', async (c) => {
  const { env } = c;
  const store = getRateLimitStore((env as any).RATE_LIMIT);
  const stats = store.getStats();

  return c.json({
    status: 'active',
    mode: stats.mode,
    description: stats.mode === 'kv' 
      ? 'Using Cloudflare KV (distributed rate limiting)'
      : 'Using in-memory store (development mode)',
    entriesCount: stats.size,
    limits: {
      public: '60 req/min',
      authenticated: '300 req/min',
      admin: '1000 req/min',
      strict: '10 req/min (auth endpoints)'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/rate-limit/clear - Очистить in-memory store (только development)
 */
app.post('/clear', async (c) => {
  const { env } = c;
  const store = getRateLimitStore((env as any).RATE_LIMIT);
  
  if (store.getMode() === 'kv') {
    return c.json({
      error: 'Cannot clear KV store via API',
      message: 'KV store can only be cleared via Cloudflare dashboard',
      mode: 'kv'
    }, 400);
  }

  store.clearMemoryStore();
  
  return c.json({
    success: true,
    message: 'In-memory rate limit store cleared',
    mode: 'memory',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/rate-limit/test - Test rate limiting (для debugging)
 */
app.get('/test', async (c) => {
  const { env } = c;
  const store = getRateLimitStore((env as any).RATE_LIMIT);
  
  // Simulate multiple requests
  const testKey = 'test:rate-limit';
  const windowMs = 60 * 1000;
  const results = [];

  for (let i = 0; i < 5; i++) {
    const entry = await store.increment(testKey, windowMs);
    results.push({
      request: i + 1,
      count: entry.count,
      resetTime: new Date(entry.resetTime).toISOString(),
      remainingTime: Math.ceil((entry.resetTime - Date.now()) / 1000)
    });
  }

  return c.json({
    mode: store.getMode(),
    testResults: results,
    note: 'Test counter will reset after 60 seconds',
    timestamp: new Date().toISOString()
  });
});

export default app;
