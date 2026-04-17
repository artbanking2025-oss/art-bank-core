/**
 * OpenAPI/Swagger Documentation Configuration
 * 
 * Auto-generates interactive API documentation for Art Bank Core v2.13
 * Accessible at: /api/docs (Swagger UI), /api/openapi.json (OpenAPI spec)
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'

/**
 * Create OpenAPI-enabled Hono app
 */
export function createOpenAPIApp() {
  return new OpenAPIHono()
}

/**
 * OpenAPI documentation metadata
 */
export const openAPIConfig = {
  openapi: '3.1.0',
  info: {
    title: 'Art Bank Core API',
    version: '2.7.0',
    description: `
# Art Bank Core API Documentation

Production-ready API for Art Banking Platform with JWT authentication, 
graph-based network analysis, and comprehensive art ecosystem management.

## Features

- 🔒 **JWT Authentication** - Secure role-based access control
- 📊 **Graph Network** - Node/Edge based relationship management
- 🎨 **Art Management** - Complete artwork lifecycle tracking
- 💰 **Transaction System** - Price history and financial operations
- ✅ **Validation Hub** - Expert authentication and condition reports
- 📸 **Media Hub** - NLP-powered sentiment analysis
- 🏛️ **Exhibition Management** - Gallery and museum event tracking
- 🔄 **Saga Pattern** - Distributed transaction reliability
- ⚡ **Circuit Breaker** - Resilience and fault tolerance

## Authentication

Most endpoints require JWT authentication. Include the token in requests:

\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

### Getting a Token

1. **Register**: POST /api/auth/register
2. **Login**: POST /api/auth/login
3. **Receive**: Access token (24h) + Refresh token (7d)
4. **Use**: Add to Authorization header

### Roles

- **Artist**: Create and manage artworks
- **Collector**: Purchase and own artworks
- **Gallery**: Host exhibitions and sales
- **Bank**: Finance art transactions
- **Expert**: Validate and authenticate artworks
- **Admin**: System management and emergency controls

## Rate Limiting

All endpoints are rate-limited:
- **Public endpoints**: 60 requests/minute
- **Authenticated endpoints**: 300 requests/minute
- **Admin endpoints**: 1000 requests/minute
- **Auth endpoints**: 10 requests/minute (strict)

## Caching

Public GET endpoints are cached:
- **Graph data**: 5 minutes (TTL) + 10 minutes (SWR)
- **Dashboard stats**: 1 minute + 5 minutes
- **Artworks**: 30 seconds + 1 minute

## Error Codes

- **400** - Bad Request (validation error)
- **401** - Unauthorized (missing/invalid token)
- **403** - Forbidden (insufficient permissions)
- **404** - Not Found
- **429** - Too Many Requests (rate limit exceeded)
- **500** - Internal Server Error
- **503** - Service Unavailable (health check failed)

## Health Monitoring

- **/health** - Full health check with diagnostics
- **/healthz** - Liveness probe (quick)
- **/readyz** - Readiness probe (dependencies)

## Support

- **GitHub**: https://github.com/artbanking/art-bank-core
- **Docs**: https://art-bank.pages.dev/docs
- **Email**: artbanking2025@gmail.com
    `,
    contact: {
      name: 'Art Bank Core Team',
      email: 'artbanking2025@gmail.com',
      url: 'https://art-bank.pages.dev'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'https://art-bank.pages.dev',
      description: 'Production server'
    },
    {
      url: 'http://localhost:3000',
      description: 'Local development server'
    }
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'User registration, login, token refresh'
    },
    {
      name: 'Nodes',
      description: 'Graph nodes (artists, collectors, galleries, banks, experts)'
    },
    {
      name: 'Edges',
      description: 'Graph edges (relationships between nodes)'
    },
    {
      name: 'Artworks',
      description: 'Artwork management and tracking'
    },
    {
      name: 'Transactions',
      description: 'Financial transactions and price history'
    },
    {
      name: 'Validations',
      description: 'Expert validations and condition reports'
    },
    {
      name: 'Media',
      description: 'Media items with NLP sentiment analysis'
    },
    {
      name: 'Exhibitions',
      description: 'Gallery and museum exhibitions'
    },
    {
      name: 'Graph',
      description: 'Graph data and analytics'
    },
    {
      name: 'Dashboard',
      description: 'Dashboard statistics and visualizations'
    },
    {
      name: 'Analytics',
      description: 'Advanced analytics (fair price, risk score)'
    },
    {
      name: 'Health',
      description: 'Health checks and monitoring'
    },
    {
      name: 'Admin',
      description: 'Administrative operations (admin role required)'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token from /api/auth/login'
      }
    }
  },
  security: []
}

/**
 * Add Swagger UI routes to app
 */
export function addSwaggerRoutes(app: any) {
  // Serve OpenAPI spec JSON
  app.get('/api/openapi.json', (c: any) => {
    return c.json(openAPIConfig)
  })

  // Serve Swagger UI
  app.get(
    '/api/docs',
    swaggerUI({
      url: '/api/openapi.json'
    })
  )

  return app
}

/**
 * Common response schemas
 */
export const commonSchemas = {
  error: {
    type: 'object',
    properties: {
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' }
    }
  },
  success: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' }
    }
  },
  pagination: {
    type: 'object',
    properties: {
      total: { type: 'number' },
      page: { type: 'number' },
      limit: { type: 'number' },
      hasNext: { type: 'boolean' }
    }
  }
}

/**
 * Common parameter schemas
 */
export const commonParams = {
  id: {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: 'Resource ID'
  },
  limit: {
    name: 'limit',
    in: 'query',
    required: false,
    schema: { type: 'number', default: 50 },
    description: 'Number of items to return'
  },
  offset: {
    name: 'offset',
    in: 'query',
    required: false,
    schema: { type: 'number', default: 0 },
    description: 'Number of items to skip'
  }
}

/**
 * Common header schemas
 */
export const commonHeaders = {
  authorization: {
    name: 'Authorization',
    in: 'header',
    required: true,
    schema: { type: 'string' },
    description: 'Bearer token (JWT)'
  },
  rateLimit: {
    'X-RateLimit-Limit': {
      schema: { type: 'number' },
      description: 'Rate limit ceiling'
    },
    'X-RateLimit-Remaining': {
      schema: { type: 'number' },
      description: 'Remaining requests'
    },
    'X-RateLimit-Reset': {
      schema: { type: 'number' },
      description: 'Time when limit resets (Unix timestamp)'
    }
  },
  cache: {
    'Cache-Control': {
      schema: { type: 'string' },
      description: 'Caching directives'
    },
    'X-Cache': {
      schema: { type: 'string', enum: ['HIT', 'MISS'] },
      description: 'Cache status'
    },
    'Cache-Tag': {
      schema: { type: 'string' },
      description: 'Cache tags for invalidation'
    }
  }
}
