/**
 * Slow Query Analyzer
 * 
 * Analyzes slow database queries and provides optimization recommendations
 */

export interface QueryAnalysis {
  query: string;
  executionTime: number;
  timestamp: string;
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedTables: string[];
  indexSuggestions: string[];
}

export interface QueryPattern {
  pattern: string;
  count: number;
  avgTime: number;
  maxTime: number;
  lastSeen: string;
}

export class SlowQueryAnalyzer {
  private readonly slowQueryThreshold: number = 100; // ms
  private readonly criticalThreshold: number = 500; // ms
  private queryHistory: QueryAnalysis[] = [];
  private maxHistorySize: number = 1000;

  /**
   * Analyze a query and provide recommendations
   */
  analyzeQuery(query: string, executionTime: number): QueryAnalysis {
    const analysis: QueryAnalysis = {
      query,
      executionTime,
      timestamp: new Date().toISOString(),
      recommendations: [],
      severity: this.calculateSeverity(executionTime),
      affectedTables: this.extractTables(query),
      indexSuggestions: []
    };

    // Add recommendations based on query pattern
    this.addRecommendations(analysis);

    // Store in history
    this.queryHistory.push(analysis);
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift();
    }

    return analysis;
  }

  /**
   * Calculate severity based on execution time
   */
  private calculateSeverity(executionTime: number): 'low' | 'medium' | 'high' | 'critical' {
    if (executionTime >= this.criticalThreshold) return 'critical';
    if (executionTime >= this.slowQueryThreshold * 2) return 'high';
    if (executionTime >= this.slowQueryThreshold) return 'medium';
    return 'low';
  }

  /**
   * Extract table names from SQL query
   */
  private extractTables(query: string): string[] {
    const tables: string[] = [];
    const upperQuery = query.toUpperCase();
    
    // Extract from FROM clause
    const fromMatch = upperQuery.match(/FROM\s+([a-zA-Z0-9_]+)/g);
    if (fromMatch) {
      fromMatch.forEach(match => {
        const table = match.replace(/FROM\s+/i, '').toLowerCase();
        if (!tables.includes(table)) {
          tables.push(table);
        }
      });
    }

    // Extract from JOIN clause
    const joinMatch = upperQuery.match(/JOIN\s+([a-zA-Z0-9_]+)/g);
    if (joinMatch) {
      joinMatch.forEach(match => {
        const table = match.replace(/JOIN\s+/i, '').toLowerCase();
        if (!tables.includes(table)) {
          tables.push(table);
        }
      });
    }

    return tables;
  }

  /**
   * Add recommendations based on query analysis
   */
  private addRecommendations(analysis: QueryAnalysis): void {
    const query = analysis.query.toUpperCase();

    // Check for SELECT *
    if (query.includes('SELECT *')) {
      analysis.recommendations.push('Avoid SELECT * - specify only needed columns');
    }

    // Check for missing WHERE clause
    if (!query.includes('WHERE') && (query.includes('SELECT') || query.includes('UPDATE') || query.includes('DELETE'))) {
      analysis.recommendations.push('Consider adding WHERE clause to limit rows scanned');
      analysis.severity = 'high';
    }

    // Check for OR conditions (can prevent index usage)
    if (query.includes(' OR ')) {
      analysis.recommendations.push('OR conditions may prevent index usage - consider UNION or IN clause');
    }

    // Check for LIKE with leading wildcard
    if (query.match(/LIKE\s+['"]%/)) {
      analysis.recommendations.push('LIKE with leading wildcard prevents index usage');
      analysis.indexSuggestions.push('Consider full-text search or different search strategy');
    }

    // Check for multiple JOINs
    const joinCount = (query.match(/JOIN/g) || []).length;
    if (joinCount >= 3) {
      analysis.recommendations.push(`Query has ${joinCount} JOINs - consider denormalization or caching`);
    }

    // Check for subqueries
    if (query.match(/\(\s*SELECT/)) {
      analysis.recommendations.push('Subquery detected - consider using JOIN instead');
    }

    // Check for ORDER BY without LIMIT
    if (query.includes('ORDER BY') && !query.includes('LIMIT')) {
      analysis.recommendations.push('ORDER BY without LIMIT - sorting entire result set');
    }

    // Suggest indexes based on WHERE clause
    const whereMatch = query.match(/WHERE\s+([a-zA-Z0-9_]+)\s*=/);
    if (whereMatch) {
      const column = whereMatch[1].toLowerCase();
      analysis.indexSuggestions.push(`CREATE INDEX idx_${analysis.affectedTables[0]}_${column} ON ${analysis.affectedTables[0]}(${column})`);
    }

    // Suggest composite indexes for multiple conditions
    const andMatch = query.match(/WHERE\s+([a-zA-Z0-9_]+)\s*=.*AND\s+([a-zA-Z0-9_]+)\s*=/);
    if (andMatch) {
      const col1 = andMatch[1].toLowerCase();
      const col2 = andMatch[2].toLowerCase();
      analysis.indexSuggestions.push(`CREATE INDEX idx_${analysis.affectedTables[0]}_${col1}_${col2} ON ${analysis.affectedTables[0]}(${col1}, ${col2})`);
    }
  }

  /**
   * Get slow query patterns
   */
  getQueryPatterns(): QueryPattern[] {
    const patterns = new Map<string, QueryPattern>();

    this.queryHistory.forEach(analysis => {
      // Normalize query to find patterns (remove specific values)
      const pattern = this.normalizeQuery(analysis.query);
      
      const existing = patterns.get(pattern);
      if (existing) {
        existing.count++;
        existing.avgTime = (existing.avgTime * (existing.count - 1) + analysis.executionTime) / existing.count;
        existing.maxTime = Math.max(existing.maxTime, analysis.executionTime);
        existing.lastSeen = analysis.timestamp;
      } else {
        patterns.set(pattern, {
          pattern,
          count: 1,
          avgTime: analysis.executionTime,
          maxTime: analysis.executionTime,
          lastSeen: analysis.timestamp
        });
      }
    });

    return Array.from(patterns.values())
      .sort((a, b) => b.avgTime - a.avgTime);
  }

  /**
   * Normalize query for pattern matching
   */
  private normalizeQuery(query: string): string {
    return query
      // Replace string literals
      .replace(/'[^']*'/g, "'?'")
      // Replace numbers
      .replace(/\b\d+\b/g, '?')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get optimization report
   */
  getOptimizationReport(): {
    totalQueries: number;
    slowQueries: number;
    criticalQueries: number;
    topSlowQueries: QueryAnalysis[];
    mostCommonPatterns: QueryPattern[];
    recommendedIndexes: string[];
  } {
    const slowQueries = this.queryHistory.filter(q => q.executionTime >= this.slowQueryThreshold);
    const criticalQueries = this.queryHistory.filter(q => q.executionTime >= this.criticalThreshold);
    
    // Get top 10 slowest queries
    const topSlowQueries = [...this.queryHistory]
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 10);

    // Get most common patterns
    const patterns = this.getQueryPatterns();
    const mostCommonPatterns = patterns.slice(0, 10);

    // Aggregate recommended indexes
    const indexSet = new Set<string>();
    this.queryHistory.forEach(q => {
      q.indexSuggestions.forEach(idx => indexSet.add(idx));
    });

    return {
      totalQueries: this.queryHistory.length,
      slowQueries: slowQueries.length,
      criticalQueries: criticalQueries.length,
      topSlowQueries,
      mostCommonPatterns,
      recommendedIndexes: Array.from(indexSet)
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.queryHistory = [];
  }

  /**
   * Export history as JSON
   */
  exportHistory(): string {
    return JSON.stringify({
      exported: new Date().toISOString(),
      totalQueries: this.queryHistory.length,
      queries: this.queryHistory
    }, null, 2);
  }
}

// Singleton instance
export const slowQueryAnalyzer = new SlowQueryAnalyzer();
