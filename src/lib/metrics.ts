/**
 * Performance Metrics System
 * 
 * Collects and stores performance metrics for monitoring:
 * - API response times
 * - Request counts
 * - Error rates
 * - Database query performance
 * - Cache hit rates
 * - Active connections
 * 
 * Metrics are stored in-memory with a rolling window of 1 hour
 */

export interface MetricEntry {
  timestamp: number;
  value: number;
  tags?: Record<string, string>;
}

export interface MetricSummary {
  min: number;
  max: number;
  avg: number;
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface SystemMetrics {
  requests: {
    total: number;
    byStatus: Record<number, number>;
    byMethod: Record<string, number>;
    byEndpoint: Record<string, number>;
  };
  performance: {
    responseTime: MetricSummary;
    dbQueryTime: MetricSummary;
  };
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  database: {
    queries: number;
    slowQueries: number;
    avgQueryTime: number;
  };
}

class MetricsCollector {
  private metrics: Map<string, MetricEntry[]> = new Map();
  private readonly maxAge = 60 * 60 * 1000; // 1 hour
  
  // Request tracking
  private requestCount = 0;
  private requestsByStatus: Map<number, number> = new Map();
  private requestsByMethod: Map<string, number> = new Map();
  private requestsByEndpoint: Map<string, number> = new Map();
  
  // Error tracking
  private errorCount = 0;
  private errorsByType: Map<string, number> = new Map();
  
  // Cache tracking
  private cacheHits = 0;
  private cacheMisses = 0;
  
  // Database tracking
  private dbQueryCount = 0;
  private slowQueryCount = 0;
  
  /**
   * Record a metric value
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    const entry: MetricEntry = {
      timestamp: Date.now(),
      value,
      tags
    };
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const entries = this.metrics.get(name)!;
    entries.push(entry);
    
    // Clean old entries
    this.cleanOldEntries(name);
  }
  
  /**
   * Record request metrics
   */
  recordRequest(method: string, endpoint: string, status: number, duration: number): void {
    this.requestCount++;
    this.requestsByStatus.set(status, (this.requestsByStatus.get(status) || 0) + 1);
    this.requestsByMethod.set(method, (this.requestsByMethod.get(method) || 0) + 1);
    this.requestsByEndpoint.set(endpoint, (this.requestsByEndpoint.get(endpoint) || 0) + 1);
    
    this.record('response_time', duration, { method, endpoint, status: status.toString() });
  }
  
  /**
   * Record error
   */
  recordError(type: string): void {
    this.errorCount++;
    this.errorsByType.set(type, (this.errorsByType.get(type) || 0) + 1);
    this.record('error', 1, { type });
  }
  
  /**
   * Record cache hit/miss
   */
  recordCacheHit(hit: boolean): void {
    if (hit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
    this.record('cache', hit ? 1 : 0);
  }
  
  /**
   * Record database query
   */
  recordDbQuery(duration: number, isSlow: boolean = false): void {
    this.dbQueryCount++;
    if (isSlow) {
      this.slowQueryCount++;
    }
    this.record('db_query_time', duration, { slow: isSlow.toString() });
  }
  
  /**
   * Get metric entries for a given name
   */
  getMetrics(name: string): MetricEntry[] {
    this.cleanOldEntries(name);
    return this.metrics.get(name) || [];
  }
  
  /**
   * Calculate summary statistics for a metric
   */
  getSummary(name: string): MetricSummary | null {
    const entries = this.getMetrics(name);
    if (entries.length === 0) {
      return null;
    }
    
    const values = entries.map(e => e.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      count: values.length,
      p50: this.percentile(values, 50),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    };
  }
  
  /**
   * Get all system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const responseTime = this.getSummary('response_time') || {
      min: 0, max: 0, avg: 0, count: 0, p50: 0, p95: 0, p99: 0
    };
    
    const dbQueryTime = this.getSummary('db_query_time') || {
      min: 0, max: 0, avg: 0, count: 0, p50: 0, p95: 0, p99: 0
    };
    
    const totalCache = this.cacheHits + this.cacheMisses;
    const hitRate = totalCache > 0 ? (this.cacheHits / totalCache) * 100 : 0;
    
    const totalRequests = this.requestCount || 1;
    const errorRate = (this.errorCount / totalRequests) * 100;
    
    return {
      requests: {
        total: this.requestCount,
        byStatus: Object.fromEntries(this.requestsByStatus),
        byMethod: Object.fromEntries(this.requestsByMethod),
        byEndpoint: Object.fromEntries(this.requestsByEndpoint)
      },
      performance: {
        responseTime,
        dbQueryTime
      },
      errors: {
        total: this.errorCount,
        rate: errorRate,
        byType: Object.fromEntries(this.errorsByType)
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate
      },
      database: {
        queries: this.dbQueryCount,
        slowQueries: this.slowQueryCount,
        avgQueryTime: dbQueryTime.avg
      }
    };
  }
  
  /**
   * Get time series data for charting
   */
  getTimeSeries(name: string, intervalMs: number = 60000): Array<{ timestamp: number; value: number }> {
    const entries = this.getMetrics(name);
    if (entries.length === 0) {
      return [];
    }
    
    // Group by interval
    const grouped = new Map<number, number[]>();
    
    for (const entry of entries) {
      const bucket = Math.floor(entry.timestamp / intervalMs) * intervalMs;
      if (!grouped.has(bucket)) {
        grouped.set(bucket, []);
      }
      grouped.get(bucket)!.push(entry.value);
    }
    
    // Calculate average for each bucket
    return Array.from(grouped.entries())
      .map(([timestamp, values]) => ({
        timestamp,
        value: values.reduce((a, b) => a + b, 0) / values.length
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.requestCount = 0;
    this.requestsByStatus.clear();
    this.requestsByMethod.clear();
    this.requestsByEndpoint.clear();
    this.errorCount = 0;
    this.errorsByType.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.dbQueryCount = 0;
    this.slowQueryCount = 0;
  }
  
  /**
   * Clean entries older than maxAge
   */
  private cleanOldEntries(name: string): void {
    const entries = this.metrics.get(name);
    if (!entries) return;
    
    const cutoff = Date.now() - this.maxAge;
    const filtered = entries.filter(e => e.timestamp > cutoff);
    
    if (filtered.length < entries.length) {
      this.metrics.set(name, filtered);
    }
  }
  
  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Singleton instance
export const metrics = new MetricsCollector();
