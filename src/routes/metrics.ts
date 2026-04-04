/**
 * Performance Metrics API Routes
 * 
 * Provides endpoints for retrieving system performance metrics
 * Protected by admin authentication
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { metrics } from '../lib/metrics';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/metrics/system
 * Get overall system metrics
 */
app.get('/system', (c) => {
  try {
    const systemMetrics = metrics.getSystemMetrics();
    return c.json(systemMetrics);
  } catch (error) {
    return c.json({ error: 'Failed to retrieve metrics' }, 500);
  }
});

/**
 * GET /api/metrics/timeseries/:metric
 * Get time series data for a specific metric
 * Query params:
 * - interval: Time interval in ms (default: 60000 = 1 minute)
 */
app.get('/timeseries/:metric', (c) => {
  try {
    const metricName = c.req.param('metric');
    const interval = parseInt(c.req.query('interval') || '60000');
    
    const timeSeries = metrics.getTimeSeries(metricName, interval);
    
    return c.json({
      metric: metricName,
      interval,
      data: timeSeries
    });
  } catch (error) {
    return c.json({ error: 'Failed to retrieve time series data' }, 500);
  }
});

/**
 * GET /api/metrics/summary/:metric
 * Get summary statistics for a specific metric
 */
app.get('/summary/:metric', (c) => {
  try {
    const metricName = c.req.param('metric');
    const summary = metrics.getSummary(metricName);
    
    if (!summary) {
      return c.json({ error: 'No data available for this metric' }, 404);
    }
    
    return c.json({
      metric: metricName,
      summary
    });
  } catch (error) {
    return c.json({ error: 'Failed to retrieve summary' }, 500);
  }
});

/**
 * POST /api/metrics/reset
 * Reset all metrics (admin only)
 */
app.post('/reset', (c) => {
  try {
    metrics.reset();
    return c.json({ message: 'Metrics reset successfully' });
  } catch (error) {
    return c.json({ error: 'Failed to reset metrics' }, 500);
  }
});

export default app;
