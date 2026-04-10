/**
 * Query Optimization Routes
 * 
 * Admin endpoints for database query profiling and optimization
 */

import { Hono } from 'hono';
import { queryProfiler, type QueryProfile } from '../lib/query-profiler';
import { slowQueryAnalyzer } from '../lib/slow-query-analyzer';

const app = new Hono();

/**
 * GET /api/query-optimization/profiles
 * Get all query profiles
 */
app.get('/profiles', (c) => {
  const profiles = queryProfiler.getAllProfiles();
  
  return c.json({
    success: true,
    count: profiles.length,
    profiles: profiles.map(p => ({
      ...p,
      duration_ms: Math.round(p.duration * 1000) / 1000
    }))
  });
});

/**
 * GET /api/query-optimization/slow-queries
 * Get slow queries analysis
 */
app.get('/slow-queries', (c) => {
  const report = slowQueryAnalyzer.getOptimizationReport();
  
  return c.json({
    success: true,
    report: {
      ...report,
      topSlowQueries: report.topSlowQueries.map(q => ({
        ...q,
        executionTime_ms: Math.round(q.executionTime)
      }))
    }
  });
});

/**
 * GET /api/query-optimization/patterns
 * Get query patterns
 */
app.get('/patterns', (c) => {
  const patterns = slowQueryAnalyzer.getQueryPatterns();
  
  return c.json({
    success: true,
    count: patterns.length,
    patterns: patterns.map(p => ({
      ...p,
      avgTime_ms: Math.round(p.avgTime),
      maxTime_ms: Math.round(p.maxTime)
    }))
  });
});

/**
 * GET /api/query-optimization/recommendations
 * Get index recommendations
 */
app.get('/recommendations', (c) => {
  const report = slowQueryAnalyzer.getOptimizationReport();
  
  return c.json({
    success: true,
    recommendations: {
      indexes: report.recommendedIndexes,
      summary: {
        totalQueries: report.totalQueries,
        slowQueries: report.slowQueries,
        criticalQueries: report.criticalQueries,
        slowQueryPercentage: report.totalQueries > 0 
          ? Math.round((report.slowQueries / report.totalQueries) * 100) 
          : 0
      }
    }
  });
});

/**
 * POST /api/query-optimization/clear
 * Clear profiling history
 */
app.post('/clear', (c) => {
  const beforeCount = queryProfiler.getAllProfiles().length;
  
  queryProfiler.clearProfiles();
  slowQueryAnalyzer.clearHistory();
  
  return c.json({
    success: true,
    message: 'Query profiling history cleared',
    clearedProfiles: beforeCount
  });
});

/**
 * GET /api/query-optimization/export
 * Export profiling data
 */
app.get('/export', (c) => {
  const profiles = queryProfiler.getAllProfiles();
  const report = slowQueryAnalyzer.getOptimizationReport();
  
  const exportData = {
    exported: new Date().toISOString(),
    summary: {
      totalQueries: profiles.length,
      slowQueries: report.slowQueries,
      criticalQueries: report.criticalQueries
    },
    profiles: profiles.map(p => ({
      ...p,
      duration_ms: Math.round(p.duration * 1000) / 1000
    })),
    patterns: slowQueryAnalyzer.getQueryPatterns(),
    recommendations: report.recommendedIndexes
  };
  
  const format = c.req.query('format') || 'json';
  
  if (format === 'csv') {
    // CSV format for profiles
    const csvLines = [
      'Query,Duration(ms),Timestamp,Row Count,Has Index',
      ...profiles.map(p => 
        `"${p.query.replace(/"/g, '""')}",${Math.round(p.duration)},${p.timestamp},${p.rowCount || 0},${p.hasIndex}`
      )
    ];
    
    return c.text(csvLines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="query-profiles-${Date.now()}.csv"`
      }
    });
  }
  
  // JSON format (default)
  return c.json(exportData);
});

/**
 * GET /api/query-optimization/stats
 * Get optimization statistics
 */
app.get('/stats', (c) => {
  const profiles = queryProfiler.getAllProfiles();
  const report = slowQueryAnalyzer.getOptimizationReport();
  
  // Calculate statistics
  const durations = profiles.map(p => p.duration);
  const avgDuration = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;
  
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0;
  const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 0;
  const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0;
  
  return c.json({
    success: true,
    stats: {
      totalQueries: profiles.length,
      slowQueries: report.slowQueries,
      criticalQueries: report.criticalQueries,
      avgDuration_ms: Math.round(avgDuration),
      p50_ms: Math.round(p50),
      p95_ms: Math.round(p95),
      p99_ms: Math.round(p99),
      queriesWithIndexes: profiles.filter(p => p.hasIndex).length,
      queriesWithoutIndexes: profiles.filter(p => !p.hasIndex).length,
      recommendedIndexesCount: report.recommendedIndexes.length
    }
  });
});

export default app;
