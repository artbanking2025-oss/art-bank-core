/**
 * Log Export API Routes
 * 
 * Admin-only endpoints for exporting application logs
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { logExporter } from '../lib/log-exporter';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/logs/export
 * Export logs in JSON or CSV format
 * 
 * Query parameters:
 * - format: 'json' | 'csv' (default: json)
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - level: comma-separated log levels (debug,info,warn,error)
 * - search: search query
 * - limit: max number of logs (default: 1000, max: 10000)
 */
app.get('/export', (c) => {
  try {
    const format = c.req.query('format') || 'json';
    const startDateStr = c.req.query('startDate');
    const endDateStr = c.req.query('endDate');
    const levelStr = c.req.query('level');
    const search = c.req.query('search');
    const limitStr = c.req.query('limit');
    
    const options: any = {};
    
    if (startDateStr) {
      options.startDate = new Date(startDateStr);
    }
    
    if (endDateStr) {
      options.endDate = new Date(endDateStr);
    }
    
    if (levelStr) {
      options.level = levelStr.split(',').map(l => l.trim());
    }
    
    if (search) {
      options.search = search;
    }
    
    if (limitStr) {
      options.limit = Math.min(parseInt(limitStr), 10000);
    } else {
      options.limit = 1000;
    }
    
    if (format === 'csv') {
      const csv = logExporter.exportCSV(options);
      return c.text(csv, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="logs_${new Date().toISOString()}.csv"`
      });
    } else {
      const json = logExporter.exportJSON(options);
      return c.text(json, 200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="logs_${new Date().toISOString()}.json"`
      });
    }
  } catch (error) {
    return c.json({ error: 'Failed to export logs', details: String(error) }, 500);
  }
});

/**
 * GET /api/logs/stats
 * Get log statistics
 */
app.get('/stats', (c) => {
  try {
    const stats = logExporter.getStats();
    return c.json(stats);
  } catch (error) {
    return c.json({ error: 'Failed to get log stats' }, 500);
  }
});

/**
 * POST /api/logs/clear
 * Clear all logs (admin only, use with caution)
 */
app.post('/clear', (c) => {
  try {
    logExporter.clear();
    return c.json({ message: 'Logs cleared successfully' });
  } catch (error) {
    return c.json({ error: 'Failed to clear logs' }, 500);
  }
});

/**
 * GET /api/logs/search
 * Search logs with filters
 * 
 * Query parameters same as /export but returns JSON array
 */
app.get('/search', (c) => {
  try {
    const startDateStr = c.req.query('startDate');
    const endDateStr = c.req.query('endDate');
    const levelStr = c.req.query('level');
    const search = c.req.query('search');
    const limitStr = c.req.query('limit');
    
    const options: any = {};
    
    if (startDateStr) {
      options.startDate = new Date(startDateStr);
    }
    
    if (endDateStr) {
      options.endDate = new Date(endDateStr);
    }
    
    if (levelStr) {
      options.level = levelStr.split(',').map(l => l.trim());
    }
    
    if (search) {
      options.search = search;
    }
    
    if (limitStr) {
      options.limit = Math.min(parseInt(limitStr), 10000);
    } else {
      options.limit = 100;
    }
    
    const logs = logExporter.filterLogs(options);
    
    return c.json({
      total: logs.length,
      logs
    });
  } catch (error) {
    return c.json({ error: 'Failed to search logs' }, 500);
  }
});

export default app;
