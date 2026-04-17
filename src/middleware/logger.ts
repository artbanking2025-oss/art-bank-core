/**
 * Structured Logging Middleware
 * 
 * Provides comprehensive logging for Art Bank Core v2.13
 * Features:
 * - JSON structured logs
 * - Request/Response tracking
 * - Error logging with context
 * - Performance metrics
 * - Correlation IDs
 */

import { Context, Next } from 'hono';
import type { Env } from '../types';
import { logExporter } from '../lib/log-exporter';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  userId?: string;
  userRole?: string;
  ip?: string;
  userAgent?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Logger class
 */
export class Logger {
  private context: Record<string, any>;

  constructor(context: Record<string, any> = {}) {
    this.context = context;
  }

  /**
   * Create log entry with default fields
   */
  private createLogEntry(level: LogLevel, message: string, metadata?: Record<string, any>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...(metadata && { metadata })
    };
  }

  /**
   * Format log entry as JSON
   */
  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * Output log to console
   */
  private output(entry: LogEntry) {
    const formatted = this.formatLog(entry);
    
    // Store log in exporter for later export
    logExporter.addLog({
      timestamp: entry.timestamp,
      level: entry.level as string,
      message: entry.message,
      correlationId: entry.correlationId,
      requestId: entry.requestId,
      method: entry.method,
      path: entry.path,
      status: entry.statusCode,
      duration: entry.duration,
      error: entry.error?.message,
      stack: entry.error?.stack,
      userId: entry.userId,
      userRole: entry.userRole,
      ip: entry.ip,
      userAgent: entry.userAgent
    });
    
    switch (entry.level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formatted);
        break;
    }
  }

  debug(message: string, metadata?: Record<string, any>) {
    this.output(this.createLogEntry(LogLevel.DEBUG, message, metadata));
  }

  info(message: string, metadata?: Record<string, any>) {
    this.output(this.createLogEntry(LogLevel.INFO, message, metadata));
  }

  warn(message: string, metadata?: Record<string, any>) {
    this.output(this.createLogEntry(LogLevel.WARN, message, metadata));
  }

  error(message: string, error?: Error, metadata?: Record<string, any>) {
    const entry = this.createLogEntry(LogLevel.ERROR, message, metadata);
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      };
    }

    this.output(entry);
  }

  fatal(message: string, error?: Error, metadata?: Record<string, any>) {
    const entry = this.createLogEntry(LogLevel.FATAL, message, metadata);
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      };
    }

    this.output(entry);
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

/**
 * Generate correlation ID
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Extract user info from JWT payload
 */
function getUserInfo(c: Context<{ Bindings: Env }>) {
  const jwtPayload = c.get('jwtPayload');
  if (jwtPayload) {
    return {
      userId: jwtPayload.sub || jwtPayload.userId,
      userRole: jwtPayload.role
    };
  }
  return {};
}

/**
 * Get client IP address
 */
function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

/**
 * Logging middleware
 */
export function loggingMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const startTime = Date.now();
    const correlationId = c.req.header('x-correlation-id') || generateCorrelationId();
    const requestId = c.req.header('x-request-id') || generateCorrelationId();

    // Create logger with request context
    const logger = new Logger({
      correlationId,
      requestId,
      method: c.req.method,
      path: c.req.path,
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent')
    });

    // Store logger in context for use in route handlers
    c.set('logger', logger);

    // Add correlation ID to response headers
    c.header('X-Correlation-ID', correlationId);
    c.header('X-Request-ID', requestId);

    // Log incoming request
    logger.info('Incoming request', {
      query: c.req.query(),
      headers: {
        'content-type': c.req.header('content-type'),
        'accept': c.req.header('accept')
      }
    });

    try {
      // Process request
      await next();

      // Calculate duration
      const duration = Date.now() - startTime;

      // Get user info after authentication
      const userInfo = getUserInfo(c);

      // Log successful response
      logger.info('Request completed', {
        statusCode: c.res.status,
        duration,
        ...userInfo
      });

    } catch (error: any) {
      // Calculate duration
      const duration = Date.now() - startTime;

      // Get user info if available
      const userInfo = getUserInfo(c);

      // Log error
      logger.error('Request failed', error, {
        statusCode: c.res?.status || 500,
        duration,
        ...userInfo
      });

      // Re-throw error for error handler
      throw error;
    }
  };
}

/**
 * Error logging middleware
 * Should be added at the end of middleware chain
 */
export function errorLoggingMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    try {
      await next();
    } catch (error: any) {
      const logger = c.get('logger') as Logger || new Logger();

      // Determine error severity
      const statusCode = error.status || 500;
      const isFatal = statusCode >= 500;

      // Log error with appropriate level
      if (isFatal) {
        logger.fatal('Fatal error occurred', error, {
          statusCode,
          errorCode: error.code,
          errorName: error.name
        });
      } else {
        logger.error('Error occurred', error, {
          statusCode,
          errorCode: error.code,
          errorName: error.name
        });
      }

      // Return structured error response
      return c.json(
        {
          error: error.name || 'InternalServerError',
          message: error.message || 'An unexpected error occurred',
          code: error.code,
          correlationId: c.get('logger')?.context?.correlationId,
          requestId: c.get('logger')?.context?.requestId
        },
        statusCode
      );
    }
  };
}

/**
 * Create logger instance for use outside middleware
 */
export function createLogger(context?: Record<string, any>): Logger {
  return new Logger(context);
}

/**
 * Helper to get logger from context
 */
export function getLogger(c: Context<{ Bindings: Env }>): Logger {
  return c.get('logger') as Logger || new Logger();
}
