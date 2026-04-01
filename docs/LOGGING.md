# Structured Logging

## Overview

Art Bank Core v2.7 includes **comprehensive structured logging** with JSON output, request tracking, and error context.

## Features

- ✅ **JSON Structured Logs** - Machine-parsable format
- ✅ **Correlation IDs** - Track requests across services
- ✅ **Request/Response Tracking** - Complete request lifecycle
- ✅ **Performance Metrics** - Duration, status codes
- ✅ **User Context** - User ID, role, IP address
- ✅ **Error Tracking** - Stack traces, error codes
- ✅ **Multiple Log Levels** - debug, info, warn, error, fatal

## Log Format

### Standard Log Entry

```json
{
  "timestamp": "2026-03-30T21:15:42.123Z",
  "level": "info",
  "message": "Request completed",
  "correlationId": "1711836942123-a3f9b2c1d",
  "requestId": "1711836942123-x8y2k5m9n",
  "method": "POST",
  "path": "/api/nodes",
  "statusCode": 201,
  "duration": 45,
  "userId": "user-123",
  "userRole": "artist",
  "ip": "203.0.113.42",
  "userAgent": "Mozilla/5.0..."
}
```

### Error Log Entry

```json
{
  "timestamp": "2026-03-30T21:16:15.456Z",
  "level": "error",
  "message": "Database query failed",
  "correlationId": "1711836975456-b8c3d5e2f",
  "requestId": "1711836975456-p9q1r3s7t",
  "method": "GET",
  "path": "/api/artworks",
  "statusCode": 500,
  "duration": 2340,
  "error": {
    "name": "DatabaseError",
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n    at ...",
    "code": "DB_TIMEOUT"
  },
  "metadata": {
    "query": "SELECT * FROM artworks",
    "timeout": 5000
  }
}
```

## Log Levels

### DEBUG
Development-only verbose logging
```typescript
logger.debug('Cache lookup', { key: 'graph-data', found: true })
```

### INFO
Normal operational messages
```typescript
logger.info('Request completed', { statusCode: 200, duration: 42 })
```

### WARN
Warning messages (non-fatal issues)
```typescript
logger.warn('Rate limit approaching', { remaining: 10, limit: 300 })
```

### ERROR
Error conditions (recoverable)
```typescript
logger.error('Validation failed', error, { field: 'email' })
```

### FATAL
Critical errors (service impaired)
```typescript
logger.fatal('Database connection lost', error)
```

## Usage

### In Route Handlers

```typescript
import { getLogger } from '../middleware/logger'

app.get('/api/artworks', async (c) => {
  const logger = getLogger(c)
  
  try {
    logger.info('Fetching artworks', { limit: 50 })
    
    const artworks = await db.getArtworks()
    
    logger.info('Artworks fetched', { count: artworks.length })
    
    return c.json(artworks)
  } catch (error: any) {
    logger.error('Failed to fetch artworks', error)
    throw error
  }
})
```

### With Metadata

```typescript
logger.info('Price calculated', {
  artworkId: 'artwork-123',
  calculatedPrice: 125000,
  method: 'fair-price-api',
  factors: {
    institutional: 0.65,
    hype: 0.82,
    liquidity: 0.55
  }
})
```

### Child Loggers

Create child loggers with additional context:

```typescript
const userLogger = logger.child({ 
  userId: 'user-123',
  userRole: 'collector'
})

userLogger.info('Purchase initiated')
// Automatically includes userId and userRole
```

## Correlation IDs

### Request Tracking

Each request automatically receives:
- **correlationId** - Tracks request across services
- **requestId** - Unique identifier for this request

### Client-Side Correlation

Send correlation ID from client:
```javascript
fetch('/api/nodes', {
  headers: {
    'X-Correlation-ID': 'frontend-1234567890'
  }
})
```

Server will use provided ID or generate new one.

### Response Headers

All responses include:
```
X-Correlation-ID: 1711836942123-a3f9b2c1d
X-Request-ID: 1711836942123-x8y2k5m9n
```

## Integration

### Application Setup

```typescript
import { loggingMiddleware, errorLoggingMiddleware } from './middleware/logger'

const app = new Hono()

// Add logging middleware EARLY in chain
app.use('*', loggingMiddleware())

// Your routes here
app.get('/api/...')

// Add error logging LAST in chain
app.use('*', errorLoggingMiddleware())
```

### Request Lifecycle

1. **Request arrives** → Log "Incoming request"
2. **Process request** → Custom logs from handlers
3. **Response sent** → Log "Request completed"
4. **Error occurs** → Log "Request failed" or "Fatal error"

## Performance Impact

- **Overhead**: ~1-2ms per request
- **JSON serialization**: Fast, async
- **Memory**: Minimal (no buffering)
- **Production-ready**: Yes

## Log Aggregation

### CloudWatch Logs

Cloudflare Workers automatically send logs to CloudWatch:
```bash
wrangler tail --format json | jq
```

### Log Analysis

Filter by level:
```bash
wrangler tail | jq 'select(.level == "error")'
```

Find slow requests:
```bash
wrangler tail | jq 'select(.duration > 1000)'
```

Track user activity:
```bash
wrangler tail | jq 'select(.userId == "user-123")'
```

## Security

### Sensitive Data

**DO NOT LOG**:
- Passwords
- JWT tokens
- API keys
- Credit card numbers
- Personal data (GDPR)

### Sanitization

```typescript
// BAD
logger.info('User login', { password: 'SecurePass123!' })

// GOOD
logger.info('User login', { 
  email: sanitizeEmail(user.email),
  hashedPassword: '***'
})
```

### PII Handling

If logging user data:
```typescript
logger.info('Profile updated', {
  userId: hashUserId(user.id),  // Hash instead of plain ID
  fields: ['name', 'email'],    // Field names, not values
  timestamp: Date.now()
})
```

## Monitoring

### Dashboards

Use logs for monitoring:
- **Request volume**: Count log entries per minute
- **Error rate**: Percentage of error/fatal logs
- **Latency**: Average duration field
- **User activity**: Group by userId

### Alerts

Set up alerts for:
- **Error rate > 5%** → Warning
- **Fatal errors** → Page on-call
- **Latency > 1000ms** → Investigation
- **Rate limit hits** → Capacity planning

## Examples

### Successful Request
```json
{
  "timestamp": "2026-03-30T21:20:00.000Z",
  "level": "info",
  "message": "Request completed",
  "correlationId": "abc123",
  "method": "GET",
  "path": "/api/graph-data",
  "statusCode": 200,
  "duration": 42
}
```

### Authentication Failure
```json
{
  "timestamp": "2026-03-30T21:20:05.000Z",
  "level": "warn",
  "message": "Authentication failed",
  "correlationId": "def456",
  "method": "POST",
  "path": "/api/nodes",
  "statusCode": 401,
  "error": {
    "name": "UnauthorizedError",
    "message": "Invalid token"
  }
}
```

### Database Error
```json
{
  "timestamp": "2026-03-30T21:20:10.000Z",
  "level": "error",
  "message": "Database query failed",
  "correlationId": "ghi789",
  "method": "GET",
  "path": "/api/artworks",
  "statusCode": 500,
  "duration": 5234,
  "error": {
    "name": "DatabaseError",
    "message": "Query timeout after 5000ms",
    "code": "SQLITE_BUSY"
  }
}
```

## Best Practices

1. **Log at appropriate levels**
   - Don't use ERROR for client errors (use WARN)
   - Reserve FATAL for service-impacting issues

2. **Include context**
   - Add metadata to help debugging
   - Include relevant IDs (userId, artworkId, etc.)

3. **Be concise**
   - Clear, actionable messages
   - Avoid verbose stack traces in production

4. **Performance**
   - Avoid logging in tight loops
   - Use appropriate log levels (DEBUG off in production)

5. **Privacy**
   - Never log sensitive data
   - Sanitize user inputs

## Troubleshooting

### Logs not appearing
- Check middleware order
- Verify console output
- Check Cloudflare dashboard

### Missing correlation IDs
- Ensure loggingMiddleware is first
- Check header propagation

### Performance issues
- Reduce DEBUG logs in production
- Optimize metadata serialization

## Configuration

### Environment Variables

```bash
# .dev.vars
LOG_LEVEL=debug  # debug, info, warn, error
```

### Production Settings

```typescript
const logger = createLogger({
  environment: 'production',
  service: 'art-bank-core',
  version: '2.7.0'
})
```

---

**Last Updated**: 2026-03-30
**Version**: v2.7
**Status**: ✅ Production Ready
