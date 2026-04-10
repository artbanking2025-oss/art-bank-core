/**
 * Database Query Wrapper with Profiling
 * 
 * Wraps D1 database queries with automatic profiling and slow query detection
 */

import { queryProfiler } from './query-profiler';
import { slowQueryAnalyzer } from './slow-query-analyzer';

export interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: {
    duration?: number;
    rows_read?: number;
    rows_written?: number;
  };
  error?: string;
}

export interface ProfiledQuery<T = unknown> {
  results: T[];
  meta: {
    duration: number;
    rowCount: number;
    hasIndex: boolean;
  };
  analysis?: {
    recommendations: string[];
    severity: string;
    indexSuggestions: string[];
  };
}

/**
 * Execute a profiled database query
 * 
 * @param db - D1Database instance
 * @param query - SQL query string
 * @param params - Query parameters
 * @param options - Profiling options
 * @returns Promise with results and profiling data
 */
export async function executeProfiledQuery<T = unknown>(
  db: D1Database,
  query: string,
  params: unknown[] = [],
  options: {
    enableProfiling?: boolean;
    slowQueryThreshold?: number;
  } = {}
): Promise<ProfiledQuery<T>> {
  const { 
    enableProfiling = true, 
    slowQueryThreshold = 100 
  } = options;

  const startTime = performance.now();
  
  try {
    // Execute query
    const statement = db.prepare(query);
    
    // Bind parameters if provided
    let boundStatement = statement;
    if (params.length > 0) {
      boundStatement = statement.bind(...params);
    }
    
    // Execute
    const result = await boundStatement.all<T>();
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Check if query used an index (basic heuristic)
    const hasIndex = !query.toUpperCase().includes('SCAN') && 
                     (query.toUpperCase().includes('INDEX') || duration < 50);

    const rowCount = result.results?.length || 0;

    // Profile the query
    if (enableProfiling) {
      queryProfiler.profileQuery(query, duration, rowCount, hasIndex);

      // Analyze slow queries
      if (duration >= slowQueryThreshold) {
        const analysis = slowQueryAnalyzer.analyzeQuery(query, duration);
        
        return {
          results: result.results || [],
          meta: {
            duration,
            rowCount,
            hasIndex
          },
          analysis: {
            recommendations: analysis.recommendations,
            severity: analysis.severity,
            indexSuggestions: analysis.indexSuggestions
          }
        };
      }
    }

    return {
      results: result.results || [],
      meta: {
        duration,
        rowCount,
        hasIndex
      }
    };

  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Profile failed query
    if (enableProfiling) {
      queryProfiler.profileQuery(query, duration, 0, false);
    }

    throw error;
  }
}

/**
 * Execute query without profiling (for high-frequency operations)
 */
export async function executeFastQuery<T = unknown>(
  db: D1Database,
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const statement = db.prepare(query);
  const boundStatement = params.length > 0 ? statement.bind(...params) : statement;
  const result = await boundStatement.all<T>();
  return result.results || [];
}

/**
 * Execute batch queries with profiling
 */
export async function executeBatch(
  db: D1Database,
  queries: Array<{ query: string; params?: unknown[] }>,
  options: {
    enableProfiling?: boolean;
  } = {}
): Promise<ProfiledQuery[]> {
  const results: ProfiledQuery[] = [];

  for (const { query, params = [] } of queries) {
    const result = await executeProfiledQuery(db, query, params, options);
    results.push(result);
  }

  return results;
}

/**
 * Get query explanation (EXPLAIN QUERY PLAN)
 */
export async function explainQuery(
  db: D1Database,
  query: string
): Promise<Array<{ detail: string }>> {
  const explainQuery = `EXPLAIN QUERY PLAN ${query}`;
  const result = await db.prepare(explainQuery).all();
  return result.results as Array<{ detail: string }>;
}

/**
 * Analyze table indexes
 */
export async function analyzeTableIndexes(
  db: D1Database,
  tableName: string
): Promise<Array<{ name: string; sql: string }>> {
  const query = `
    SELECT name, sql 
    FROM sqlite_master 
    WHERE type='index' AND tbl_name=?
  `;
  const result = await db.prepare(query).bind(tableName).all();
  return result.results as Array<{ name: string; sql: string }>;
}

/**
 * Get table statistics
 */
export async function getTableStats(
  db: D1Database,
  tableName: string
): Promise<{
  rowCount: number;
  indexes: number;
  hasAutoIncrement: boolean;
}> {
  // Get row count
  const countResult = await db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).all();
  const rowCount = (countResult.results?.[0] as { count: number })?.count || 0;

  // Get indexes
  const indexes = await analyzeTableIndexes(db, tableName);

  // Check for autoincrement
  const tableInfo = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasAutoIncrement = (tableInfo.results || []).some(
    (col: any) => col.pk === 1 && col.type.toUpperCase().includes('INTEGER')
  );

  return {
    rowCount,
    indexes: indexes.length,
    hasAutoIncrement
  };
}
