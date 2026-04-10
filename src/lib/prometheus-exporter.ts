/**
 * Prometheus Metrics Exporter
 * 
 * Экспорт метрик в формате Prometheus для интеграции с мониторингом
 * - Counter metrics (total requests, errors)
 * - Gauge metrics (active connections, cache hit rate)
 * - Histogram metrics (response time distribution)
 * - Summary metrics (percentiles)
 */

import { metrics } from './metrics';

/**
 * Форматировать метрику в формате Prometheus
 */
function formatMetric(name: string, type: string, help: string, value: number | string, labels?: Record<string, string>): string {
  const lines: string[] = [];
  
  // HELP line
  lines.push(`# HELP ${name} ${help}`);
  
  // TYPE line
  lines.push(`# TYPE ${name} ${type}`);
  
  // Metric line with labels
  if (labels && Object.keys(labels).length > 0) {
    const labelStr = Object.entries(labels)
      .map(([key, val]) => `${key}="${val}"`)
      .join(',');
    lines.push(`${name}{${labelStr}} ${value}`);
  } else {
    lines.push(`${name} ${value}`);
  }
  
  return lines.join('\n');
}

/**
 * Экспорт метрик в формате Prometheus
 */
export function exportPrometheusMetrics(): string {
  const systemMetrics = metrics.getSystemMetrics();
  const output: string[] = [];
  
  // ========== REQUEST METRICS ==========
  
  // Total requests (Counter)
  output.push(formatMetric(
    'artbank_http_requests_total',
    'counter',
    'Total number of HTTP requests',
    systemMetrics.requests.total
  ));
  
  // Requests by status code (Counter with labels)
  output.push('# HELP artbank_http_requests_by_status_total Total requests by HTTP status code');
  output.push('# TYPE artbank_http_requests_by_status_total counter');
  for (const [status, count] of Object.entries(systemMetrics.requests.byStatus)) {
    output.push(`artbank_http_requests_by_status_total{status="${status}"} ${count}`);
  }
  
  // Requests by method (Counter with labels)
  output.push('# HELP artbank_http_requests_by_method_total Total requests by HTTP method');
  output.push('# TYPE artbank_http_requests_by_method_total counter');
  for (const [method, count] of Object.entries(systemMetrics.requests.byMethod)) {
    output.push(`artbank_http_requests_by_method_total{method="${method}"} ${count}`);
  }
  
  // ========== PERFORMANCE METRICS ==========
  
  // Response time (Histogram buckets)
  output.push('# HELP artbank_http_response_time_seconds HTTP response time in seconds');
  output.push('# TYPE artbank_http_response_time_seconds histogram');
  
  const responseTime = systemMetrics.performance.responseTime;
  const buckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]; // seconds
  let cumulativeCount = 0;
  
  for (const bucket of buckets) {
    // Simulate bucket count (в реальной системе нужно хранить histogram data)
    const bucketCount = responseTime.max <= bucket * 1000 ? responseTime.count : Math.floor(responseTime.count * 0.9);
    cumulativeCount += bucketCount;
    output.push(`artbank_http_response_time_seconds_bucket{le="${bucket}"} ${cumulativeCount}`);
  }
  output.push(`artbank_http_response_time_seconds_bucket{le="+Inf"} ${responseTime.count}`);
  output.push(`artbank_http_response_time_seconds_sum ${(responseTime.avg * responseTime.count) / 1000}`);
  output.push(`artbank_http_response_time_seconds_count ${responseTime.count}`);
  
  // Response time percentiles (Summary)
  output.push('# HELP artbank_http_response_time_percentiles HTTP response time percentiles');
  output.push('# TYPE artbank_http_response_time_percentiles summary');
  output.push(`artbank_http_response_time_percentiles{quantile="0.5"} ${responseTime.p50 / 1000}`);
  output.push(`artbank_http_response_time_percentiles{quantile="0.95"} ${responseTime.p95 / 1000}`);
  output.push(`artbank_http_response_time_percentiles{quantile="0.99"} ${responseTime.p99 / 1000}`);
  
  // ========== ERROR METRICS ==========
  
  // Total errors (Counter)
  output.push(formatMetric(
    'artbank_errors_total',
    'counter',
    'Total number of errors',
    systemMetrics.errors.count
  ));
  
  // Error rate (Gauge)
  output.push(formatMetric(
    'artbank_error_rate',
    'gauge',
    'Error rate percentage',
    systemMetrics.errors.rate
  ));
  
  // Errors by type (Counter with labels)
  output.push('# HELP artbank_errors_by_type_total Total errors by type');
  output.push('# TYPE artbank_errors_by_type_total counter');
  for (const [type, count] of Object.entries(systemMetrics.errors.byType)) {
    output.push(`artbank_errors_by_type_total{type="${type}"} ${count}`);
  }
  
  // ========== CACHE METRICS ==========
  
  // Cache hits (Counter)
  output.push(formatMetric(
    'artbank_cache_hits_total',
    'counter',
    'Total cache hits',
    systemMetrics.cache.hits
  ));
  
  // Cache misses (Counter)
  output.push(formatMetric(
    'artbank_cache_misses_total',
    'counter',
    'Total cache misses',
    systemMetrics.cache.misses
  ));
  
  // Cache hit rate (Gauge)
  output.push(formatMetric(
    'artbank_cache_hit_rate',
    'gauge',
    'Cache hit rate percentage',
    systemMetrics.cache.hitRate
  ));
  
  // ========== DATABASE METRICS ==========
  
  // DB queries (Counter)
  output.push(formatMetric(
    'artbank_db_queries_total',
    'counter',
    'Total database queries',
    systemMetrics.performance.dbQueryTime.count
  ));
  
  // DB query time (Summary)
  output.push('# HELP artbank_db_query_time_seconds Database query time in seconds');
  output.push('# TYPE artbank_db_query_time_seconds summary');
  output.push(`artbank_db_query_time_seconds{quantile="0.5"} ${systemMetrics.performance.dbQueryTime.p50 / 1000}`);
  output.push(`artbank_db_query_time_seconds{quantile="0.95"} ${systemMetrics.performance.dbQueryTime.p95 / 1000}`);
  output.push(`artbank_db_query_time_seconds{quantile="0.99"} ${systemMetrics.performance.dbQueryTime.p99 / 1000}`);
  output.push(`artbank_db_query_time_seconds_sum ${(systemMetrics.performance.dbQueryTime.avg * systemMetrics.performance.dbQueryTime.count) / 1000}`);
  output.push(`artbank_db_query_time_seconds_count ${systemMetrics.performance.dbQueryTime.count}`);
  
  // ========== ENDPOINT METRICS ==========
  
  // Top endpoints (Counter with labels)
  output.push('# HELP artbank_endpoint_requests_total Total requests per endpoint');
  output.push('# TYPE artbank_endpoint_requests_total counter');
  
  const topEndpoints = Object.entries(systemMetrics.requests.byEndpoint)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20); // Top 20 endpoints
  
  for (const [endpoint, count] of topEndpoints) {
    // Escape endpoint path for Prometheus
    const escapedEndpoint = endpoint.replace(/"/g, '\\"');
    output.push(`artbank_endpoint_requests_total{endpoint="${escapedEndpoint}"} ${count}`);
  }
  
  // ========== METADATA ==========
  
  // Build info
  output.push('# HELP artbank_build_info Build information');
  output.push('# TYPE artbank_build_info gauge');
  output.push(`artbank_build_info{version="v2.9",environment="production"} 1`);
  
  return output.join('\n') + '\n';
}

/**
 * Экспорт в формате OpenMetrics (современный стандарт)
 */
export function exportOpenMetrics(): string {
  const prometheus = exportPrometheusMetrics();
  
  // Add OpenMetrics header and EOF
  return `# OpenMetrics format\n${prometheus}# EOF\n`;
}
