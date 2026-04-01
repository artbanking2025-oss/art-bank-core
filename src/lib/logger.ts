/**
 * Structured Logging System for Art Bank
 * 
 * Production-grade logging with:
 * - Multiple log levels (debug/info/warn/error)
 * - Structured JSON output
 * - Request context tracking
 * - Performance metrics
 * - Error serialization
 * - Cloudflare Workers compatible
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  requestId?: string
  userId?: string
  endpoint?: string
  method?: string
  duration?: number
  statusCode?: number
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context: LogContext
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
}

class Logger {
  private minLevel: LogLevel
  private isDevelopment: boolean

  constructor(minLevel: LogLevel = 'info', isDevelopment: boolean = false) {
    this.minLevel = minLevel
    this.isDevelopment = isDevelopment
  }

  private getLevelPriority(level: LogLevel): number {
    const priorities = { debug: 0, info: 1, warn: 2, error: 3 }
    return priorities[level]
  }

  private shouldLog(level: LogLevel): boolean {
    return this.getLevelPriority(level) >= this.getLevelPriority(this.minLevel)
  }

  private formatLog(level: LogLevel, message: string, context: LogContext = {}, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        environment: process.env.NODE_ENV || 'production'
      }
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
        code: (error as any).code
      }
    }

    return entry
  }

  private output(entry: LogEntry) {
    const output = JSON.stringify(entry)
    
    switch (entry.level) {
      case 'error':
        console.error(output)
        break
      case 'warn':
        console.warn(output)
        break
      case 'debug':
        console.debug(output)
        break
      default:
        console.log(output)
    }
  }

  debug(message: string, context?: LogContext) {
    if (!this.shouldLog('debug')) return
    const entry = this.formatLog('debug', message, context)
    this.output(entry)
  }

  info(message: string, context?: LogContext) {
    if (!this.shouldLog('info')) return
    const entry = this.formatLog('info', message, context)
    this.output(entry)
  }

  warn(message: string, context?: LogContext, error?: Error) {
    if (!this.shouldLog('warn')) return
    const entry = this.formatLog('warn', message, context, error)
    this.output(entry)
  }

  error(message: string, context?: LogContext, error?: Error) {
    if (!this.shouldLog('error')) return
    const entry = this.formatLog('error', message, context, error)
    this.output(entry)
  }

  // Convenience methods
  request(method: string, endpoint: string, context?: LogContext) {
    this.info(`${method} ${endpoint}`, {
      ...context,
      method,
      endpoint,
      type: 'request'
    })
  }

  response(method: string, endpoint: string, statusCode: number, duration: number, context?: LogContext) {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    
    this[level](`${method} ${endpoint} - ${statusCode}`, {
      ...context,
      method,
      endpoint,
      statusCode,
      duration,
      type: 'response'
    })
  }

  apiError(endpoint: string, error: Error, context?: LogContext) {
    this.error(`API Error: ${endpoint}`, {
      ...context,
      endpoint,
      type: 'api_error'
    }, error)
  }

  dbError(operation: string, error: Error, context?: LogContext) {
    this.error(`Database Error: ${operation}`, {
      ...context,
      operation,
      type: 'db_error'
    }, error)
  }

  authError(reason: string, context?: LogContext) {
    this.warn(`Authentication failed: ${reason}`, {
      ...context,
      type: 'auth_error'
    })
  }

  performance(operation: string, duration: number, context?: LogContext) {
    const level = duration > 1000 ? 'warn' : 'info'
    
    this[level](`Performance: ${operation}`, {
      ...context,
      operation,
      duration,
      type: 'performance'
    })
  }
}

// Singleton instance
let loggerInstance: Logger | null = null

export function getLogger(minLevel?: LogLevel): Logger {
  if (!loggerInstance) {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const level = minLevel || (isDevelopment ? 'debug' : 'info')
    loggerInstance = new Logger(level, isDevelopment)
  }
  return loggerInstance
}

// Export default logger
export const logger = getLogger()

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Log aggregator for collecting logs in memory
 * Useful for debugging and monitoring
 */
export class LogAggregator {
  private logs: LogEntry[] = []
  private maxLogs: number = 1000

  add(entry: LogEntry) {
    this.logs.push(entry)
    
    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  getLogs(level?: LogLevel, limit: number = 100): LogEntry[] {
    let filtered = this.logs
    
    if (level) {
      filtered = filtered.filter(log => log.level === level)
    }
    
    return filtered.slice(-limit)
  }

  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0
      },
      byType: {} as Record<string, number>,
      errors: this.logs.filter(l => l.level === 'error').length,
      warnings: this.logs.filter(l => l.level === 'warn').length
    }

    this.logs.forEach(log => {
      stats.byLevel[log.level]++
      
      const type = log.context.type as string
      if (type) {
        stats.byType[type] = (stats.byType[type] || 0) + 1
      }
    })

    return stats
  }

  clear() {
    this.logs = []
  }
}

// Global log aggregator
export const logAggregator = new LogAggregator()
