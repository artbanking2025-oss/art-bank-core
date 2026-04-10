/**
 * Metrics Middleware
 * 
 * Automatically collects performance metrics for all requests:
 * - Response time
 * - Status codes
 * - Methods and endpoints
 * - Errors
 * - Real-time WebSocket broadcasting
 * - Alert checking
 */

import type { Context, Next } from 'hono';
import { metrics } from '../lib/metrics';
import { getWebSocketManager } from '../lib/websocket-manager';
import { getAlertManager } from '../lib/alert-manager';

// Throttle WebSocket broadcasts to avoid overwhelming clients
let lastBroadcast = 0;
const BROADCAST_INTERVAL = 2000; // 2 seconds

// Throttle alert checks to avoid performance impact
let lastAlertCheck = 0;
const ALERT_CHECK_INTERVAL = 10000; // 10 seconds

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
    
    // Broadcast metrics update via WebSocket (throttled)
    const now = Date.now();
    if (now - lastBroadcast > BROADCAST_INTERVAL) {
      lastBroadcast = now;
      try {
        const wsManager = getWebSocketManager();
        if (wsManager.getClientCount() > 0) {
          const systemMetrics = metrics.getSystemMetrics();
          wsManager.broadcastMetrics(systemMetrics);
        }
      } catch (error) {
        // Silently fail - WebSocket is optional
        console.error('Failed to broadcast metrics:', error);
      }
    }
    
    // Check for alerts (throttled)
    if (now - lastAlertCheck > ALERT_CHECK_INTERVAL) {
      lastAlertCheck = now;
      try {
        const alertManager = getAlertManager();
        const systemMetrics = metrics.getSystemMetrics();
        alertManager.checkMetrics(systemMetrics);
      } catch (error) {
        // Silently fail - Alerts are optional
        console.error('Failed to check alerts:', error);
      }
    }
    
  } catch (error) {
    const duration = Date.now() - start;
    
    // Record failed request
    metrics.recordRequest(method, path, 500, duration);
    metrics.recordError('exception');
    
    throw error;
  }
};
