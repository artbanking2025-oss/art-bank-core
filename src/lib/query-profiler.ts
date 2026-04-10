/**
 * Database Query Profiler
 * 
 * Middleware для профилирования и оптимизации DB запросов:
 * - Измерение времени выполнения запросов
 * - Обнаружение медленных запросов (slow query log)
 * - Статистика по типам запросов
 * - Рекомендации по индексам
 */

export interface QueryProfile {
  query: string;
  duration: number;
  timestamp: Date;
  stack?: string;
}

export interface SlowQuery extends QueryProfile {
  threshold: number;
  recommendation?: string;
}

export interface QueryStats {
  totalQueries: number;
  avgDuration: number;
  slowQueries: number;
  byType: {
    SELECT: number;
    INSERT: number;
    UPDATE: number;
    DELETE: number;
    OTHER: number;
  };
  slowestQueries: SlowQuery[];
}

/**
 * Database Query Profiler Class
 */
export class QueryProfiler {
  private queries: QueryProfile[] = [];
  private slowQueries: SlowQuery[] = [];
  private maxHistory = 1000;
  private slowQueryThreshold = 100; // ms

  /**
   * Profile query execution
   */
  async profileQuery<T>(
    query: string,
    executor: () => Promise<T>,
    context?: string
  ): Promise<T> {
    const start = Date.now();
    let error: Error | null = null;

    try {
      const result = await executor();
      return result;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const duration = Date.now() - start;
      
      const profile: QueryProfile = {
        query: this.sanitizeQuery(query),
        duration,
        timestamp: new Date(),
        stack: context
      };

      this.queries.unshift(profile);
      
      // Trim history
      if (this.queries.length > this.maxHistory) {
        this.queries = this.queries.slice(0, this.maxHistory);
      }

      // Log slow queries
      if (duration > this.slowQueryThreshold) {
        this.logSlowQuery(profile, duration);
      }

      // Log to console in development
      if (duration > this.slowQueryThreshold) {
        console.warn(`⚠️ Slow query (${duration}ms):`, profile.query.substring(0, 100));
      }
    }
  }

  /**
   * Log slow query
   */
  private logSlowQuery(profile: QueryProfile, duration: number): void {
    const slowQuery: SlowQuery = {
      ...profile,
      threshold: this.slowQueryThreshold,
      recommendation: this.getRecommendation(profile.query)
    };

    this.slowQueries.unshift(slowQuery);
    
    // Keep only last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries = this.slowQueries.slice(0, 100);
    }
  }

  /**
   * Get optimization recommendation
   */
  private getRecommendation(query: string): string {
    const upperQuery = query.toUpperCase();

    if (upperQuery.includes('SELECT') && upperQuery.includes('WHERE')) {
      if (!upperQuery.includes('INDEX')) {
        return 'Consider adding an index on the WHERE clause column(s)';
      }
    }

    if (upperQuery.includes('JOIN')) {
      return 'Ensure foreign key columns are indexed for efficient joins';
    }

    if (upperQuery.includes('ORDER BY')) {
      return 'Consider adding an index on the ORDER BY column(s)';
    }

    if (upperQuery.includes('GROUP BY')) {
      return 'Consider adding an index on the GROUP BY column(s)';
    }

    if (upperQuery.includes('LIKE') && upperQuery.includes('%')) {
      return 'Avoid leading wildcards in LIKE queries; consider full-text search';
    }

    return 'Analyze query execution plan with EXPLAIN';
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  private sanitizeQuery(query: string): string {
    // Remove potential sensitive data from VALUES clause
    return query.replace(/VALUES\s*\((.*?)\)/gi, 'VALUES (...)');
  }

  /**
   * Get query statistics
   */
  getStats(): QueryStats {
    const totalQueries = this.queries.length;
    const avgDuration = totalQueries > 0
      ? this.queries.reduce((sum, q) => sum + q.duration, 0) / totalQueries
      : 0;

    const byType = {
      SELECT: 0,
      INSERT: 0,
      UPDATE: 0,
      DELETE: 0,
      OTHER: 0
    };

    for (const query of this.queries) {
      const upperQuery = query.query.toUpperCase();
      if (upperQuery.startsWith('SELECT')) byType.SELECT++;
      else if (upperQuery.startsWith('INSERT')) byType.INSERT++;
      else if (upperQuery.startsWith('UPDATE')) byType.UPDATE++;
      else if (upperQuery.startsWith('DELETE')) byType.DELETE++;
      else byType.OTHER++;
    }

    const slowestQueries = [...this.slowQueries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return {
      totalQueries,
      avgDuration: Math.round(avgDuration),
      slowQueries: this.slowQueries.length,
      byType,
      slowestQueries
    };
  }

  /**
   * Get all query profiles
   */
  getAllProfiles(): QueryProfile[] {
    return [...this.queries];
  }

  /**
   * Get recent queries (alias for getAllProfiles with limit)
   */
  getRecentQueries(limit: number = 50): QueryProfile[] {
    return this.queries.slice(0, limit);
  }

  /**
   * Get slow queries
   */
  getSlowQueries(limit: number = 50): SlowQuery[] {
    return this.slowQueries.slice(0, limit);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.queries = [];
    this.slowQueries = [];
  }

  /**
   * Clear profiles (alias for clearHistory)
   */
  clearProfiles(): void {
    this.clearHistory();
  }

  /**
   * Set slow query threshold
   */
  setSlowQueryThreshold(ms: number): void {
    this.slowQueryThreshold = ms;
  }

  /**
   * Get slow query threshold
   */
  getSlowQueryThreshold(): number {
    return this.slowQueryThreshold;
  }
}

// Singleton instance
export const queryProfiler = new QueryProfiler();

export function getQueryProfiler(): QueryProfiler {
  return queryProfiler;
}
