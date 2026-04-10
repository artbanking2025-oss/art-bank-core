/**
 * Monitoring API Routes
 * 
 * API endpoints для мониторинга и алертов:
 * - Prometheus metrics export
 * - Alert rules management
 * - Alert history
 */

import { Hono } from 'hono';
import { exportPrometheusMetrics, exportOpenMetrics } from '../lib/prometheus-exporter';
import { getAlertManager } from '../lib/alert-manager';
import { metrics } from '../lib/metrics';
import type { Env } from '../types/env';

const app = new Hono<{ Bindings: Env }>();

// ========== PROMETHEUS METRICS ==========

/**
 * GET /api/monitoring/metrics - Prometheus metrics export
 */
app.get('/metrics', async (c) => {
  try {
    const prometheusMetrics = exportPrometheusMetrics();
    
    return c.text(prometheusMetrics, 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
    });
  } catch (error) {
    console.error('Prometheus export error:', error);
    return c.json({ error: 'Failed to export metrics' }, 500);
  }
});

/**
 * GET /api/monitoring/metrics/openmetrics - OpenMetrics format
 */
app.get('/metrics/openmetrics', async (c) => {
  try {
    const openMetrics = exportOpenMetrics();
    
    return c.text(openMetrics, 200, {
      'Content-Type': 'application/openmetrics-text; version=1.0.0; charset=utf-8'
    });
  } catch (error) {
    console.error('OpenMetrics export error:', error);
    return c.json({ error: 'Failed to export metrics' }, 500);
  }
});

// ========== ALERT RULES ==========

/**
 * GET /api/monitoring/alerts/rules - Get all alert rules
 */
app.get('/alerts/rules', async (c) => {
  const alertManager = getAlertManager();
  const rules = alertManager.getRules();
  
  return c.json({
    rules,
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    disabled: rules.filter(r => !r.enabled).length,
    timestamp: new Date().toISOString()
  });
});

/**
 * PUT /api/monitoring/alerts/rules/:id/toggle - Enable/disable rule
 */
app.put('/alerts/rules/:id/toggle', async (c) => {
  const alertManager = getAlertManager();
  const ruleId = c.req.param('id');
  const { enabled } = await c.req.json();
  
  const success = alertManager.toggleRule(ruleId, enabled);
  
  if (!success) {
    return c.json({ error: 'Rule not found', ruleId }, 404);
  }
  
  return c.json({
    success: true,
    ruleId,
    enabled,
    message: `Rule ${enabled ? 'enabled' : 'disabled'}`,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/monitoring/alerts/rules - Add new alert rule
 */
app.post('/alerts/rules', async (c) => {
  const alertManager = getAlertManager();
  const rule = await c.req.json();
  
  // Validate rule
  if (!rule.id || !rule.name || !rule.condition) {
    return c.json({
      error: 'Invalid rule format',
      required: ['id', 'name', 'condition']
    }, 400);
  }
  
  alertManager.addRule(rule);
  
  return c.json({
    success: true,
    rule,
    message: 'Alert rule added',
    timestamp: new Date().toISOString()
  }, 201);
});

/**
 * DELETE /api/monitoring/alerts/rules/:id - Delete alert rule
 */
app.delete('/alerts/rules/:id', async (c) => {
  const alertManager = getAlertManager();
  const ruleId = c.req.param('id');
  
  alertManager.removeRule(ruleId);
  
  return c.json({
    success: true,
    ruleId,
    message: 'Alert rule removed',
    timestamp: new Date().toISOString()
  });
});

// ========== ACTIVE ALERTS ==========

/**
 * GET /api/monitoring/alerts/active - Get active alerts
 */
app.get('/alerts/active', async (c) => {
  const alertManager = getAlertManager();
  const activeAlerts = alertManager.getActiveAlerts();
  
  return c.json({
    alerts: activeAlerts,
    count: activeAlerts.length,
    bySeverity: {
      critical: activeAlerts.filter(a => a.severity === 'critical').length,
      warning: activeAlerts.filter(a => a.severity === 'warning').length,
      info: activeAlerts.filter(a => a.severity === 'info').length
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/monitoring/alerts/:id/silence - Silence alert
 */
app.post('/alerts/:id/silence', async (c) => {
  const alertManager = getAlertManager();
  const ruleId = c.req.param('id');
  const { durationMs } = await c.req.json();
  
  const duration = durationMs || 3600000; // Default 1 hour
  const success = alertManager.silenceAlert(ruleId, duration);
  
  if (!success) {
    return c.json({ error: 'Alert not found', ruleId }, 404);
  }
  
  return c.json({
    success: true,
    ruleId,
    silencedUntil: new Date(Date.now() + duration).toISOString(),
    message: 'Alert silenced',
    timestamp: new Date().toISOString()
  });
});

// ========== ALERT HISTORY ==========

/**
 * GET /api/monitoring/alerts/history - Get alert history
 */
app.get('/alerts/history', async (c) => {
  const alertManager = getAlertManager();
  const limit = parseInt(c.req.query('limit') || '100');
  
  const history = alertManager.getAlertHistory(limit);
  
  return c.json({
    ...history,
    timestamp: new Date().toISOString()
  });
});

/**
 * DELETE /api/monitoring/alerts/history - Clear alert history
 */
app.delete('/alerts/history', async (c) => {
  const alertManager = getAlertManager();
  alertManager.clearHistory();
  
  return c.json({
    success: true,
    message: 'Alert history cleared',
    timestamp: new Date().toISOString()
  });
});

// ========== CHECK ALERTS ==========

/**
 * POST /api/monitoring/alerts/check - Manually check for alerts
 */
app.post('/alerts/check', async (c) => {
  const alertManager = getAlertManager();
  const systemMetrics = metrics.getSystemMetrics();
  
  const newAlerts = alertManager.checkMetrics(systemMetrics);
  
  return c.json({
    newAlerts,
    count: newAlerts.length,
    activeAlerts: alertManager.getActiveAlerts().length,
    timestamp: new Date().toISOString()
  });
});

// ========== TEST ALERT ==========

/**
 * POST /api/monitoring/alerts/test - Test alert system
 */
app.post('/alerts/test', async (c) => {
  const { ruleId } = await c.req.json();
  
  return c.json({
    success: true,
    message: `Test alert would be fired for rule: ${ruleId}`,
    note: 'Implement actual test alert logic here',
    timestamp: new Date().toISOString()
  });
});

export default app;
