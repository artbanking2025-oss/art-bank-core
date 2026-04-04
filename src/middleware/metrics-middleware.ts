/**
 * Metrics Middleware
 * 
 * Automatically collects performance metrics for all requests:
 * - Response time
 * - Status codes
 * - Methods and endpoints
 * - Errors
 */

import type { Context, Next } from 'hono';
import { metrics } from '../lib/metrics';

/**
 * Middleware to collect request metrics
 */
export const metricsMiddleware = async (c: Context, next: Next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  
  try {
    await next();
    
    const duration = Date.now() - start;
    const status = c.res.status;
    
    // Record request metrics
    metrics.recordRequest(method, path, status, duration);
    
    // Record error if status >= 400
    if (status >= 400) {
      const errorType = status >= 500 ? 'server_error' : 'client_error';
      metrics.recordError(errorType);
    }
    
  } catch (error) {
    const duration = Date.now() - start;
    
    // Record failed request
    metrics.recordRequest(method, path, 500, duration);
    metrics.recordError('exception');
    
    throw error;
  }
};
