/**
 * Log Export System
 * 
 * Provides functionality to export application logs in JSON and CSV formats
 * Supports filtering by date range, log level, and search queries
 */

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  correlationId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  duration?: number;
  error?: string;
  stack?: string;
  userId?: string;
  userRole?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: any;
}

export interface LogExportOptions {
  startDate?: Date;
  endDate?: Date;
  level?: string[];
  search?: string;
  limit?: number;
  format?: 'json' | 'csv';
}

class LogExporter {
  private logs: LogEntry[] = [];
  private readonly maxLogs = 10000; // Store last 10k logs in memory
  
  /**
   * Add log entry to in-memory storage
   */
  addLog(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }
  
  /**
   * Filter logs based on options
   */
  filterLogs(options: LogExportOptions = {}): LogEntry[] {
    let filtered = [...this.logs];
    
    // Filter by date range
    if (options.startDate) {
      const startTime = options.startDate.getTime();
      filtered = filtered.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        return logTime >= startTime;
      });
    }
    
    if (options.endDate) {
      const endTime = options.endDate.getTime();
      filtered = filtered.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        return logTime <= endTime;
      });
    }
    
    // Filter by log level
    if (options.level && options.level.length > 0) {
      filtered = filtered.filter(log => options.level!.includes(log.level));
    }
    
    // Filter by search query
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(log => {
        return (
          log.message?.toLowerCase().includes(searchLower) ||
          log.path?.toLowerCase().includes(searchLower) ||
          log.error?.toLowerCase().includes(searchLower) ||
          log.correlationId?.toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Apply limit
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(-options.limit);
    }
    
    return filtered;
  }
  
  /**
   * Export logs as JSON
   */
  exportJSON(options: LogExportOptions = {}): string {
    const filtered = this.filterLogs(options);
    return JSON.stringify(filtered, null, 2);
  }
  
  /**
   * Export logs as CSV
   */
  exportCSV(options: LogExportOptions = {}): string {
    const filtered = this.filterLogs(options);
    
    if (filtered.length === 0) {
      return 'No logs to export';
    }
    
    // Determine CSV columns based on available fields
    const allKeys = new Set<string>();
    filtered.forEach(log => {
      Object.keys(log).forEach(key => allKeys.add(key));
    });
    
    const columns = Array.from(allKeys);
    
    // Create CSV header
    const header = columns.map(col => this.escapeCSV(col)).join(',');
    
    // Create CSV rows
    const rows = filtered.map(log => {
      return columns.map(col => {
        const value = log[col];
        if (value === undefined || value === null) {
          return '';
        }
        if (typeof value === 'object') {
          return this.escapeCSV(JSON.stringify(value));
        }
        return this.escapeCSV(String(value));
      }).join(',');
    });
    
    return [header, ...rows].join('\n');
  }
  
  /**
   * Get log statistics
   */
  getStats(): {
    total: number;
    byLevel: Record<string, number>;
    byPath: Record<string, number>;
    byStatus: Record<number, number>;
    dateRange: { oldest: string; newest: string };
  } {
    const byLevel: Record<string, number> = {};
    const byPath: Record<string, number> = {};
    const byStatus: Record<number, number> = {};
    
    let oldest = this.logs[0]?.timestamp;
    let newest = this.logs[this.logs.length - 1]?.timestamp;
    
    this.logs.forEach(log => {
      // Count by level
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
      
      // Count by path
      if (log.path) {
        byPath[log.path] = (byPath[log.path] || 0) + 1;
      }
      
      // Count by status
      if (log.status) {
        byStatus[log.status] = (byStatus[log.status] || 0) + 1;
      }
    });
    
    return {
      total: this.logs.length,
      byLevel,
      byPath,
      byStatus,
      dateRange: { oldest: oldest || 'N/A', newest: newest || 'N/A' }
    };
  }
  
  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }
  
  /**
   * Escape CSV special characters
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

// Singleton instance
export const logExporter = new LogExporter();
