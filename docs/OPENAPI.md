# OpenAPI/Swagger Documentation

## Overview

Art Bank Core v2.7 includes **automatic API documentation** using OpenAPI 3.1 standard with interactive Swagger UI.

## Access Documentation

### Production
- **Swagger UI**: https://art-bank.pages.dev/api/docs
- **OpenAPI JSON**: https://art-bank.pages.dev/api/openapi.json

### Local Development
- **Swagger UI**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/openapi.json

## Features

### 📚 Interactive Documentation
- **Try it out**: Test API endpoints directly from browser
- **Authentication**: Built-in JWT token management
- **Request/Response**: See examples and schemas
- **Validation**: Real-time input validation

### 🔒 Security Schemes
- **Bearer Authentication**: JWT tokens
- **Role-based access**: Documented per endpoint
- **Rate limiting**: Limits shown in docs

### 📊 API Coverage

**67+ documented endpoints** organized by:
- Authentication (register, login, refresh)
- Nodes (CRUD operations)
- Edges (relationship management)
- Artworks (lifecycle tracking)
- Transactions (financial operations)
- Validations (expert authentication)
- Media Hub (NLP sentiment)
- Exhibitions (event management)
- Graph Analytics (network analysis)
- Dashboard (statistics)
- Health Checks (monitoring)
- Admin Operations (system management)

## Using Swagger UI

### 1. Open Documentation
Visit `/api/docs` in your browser

### 2. Authenticate
1. Click **"Authorize"** button (top right)
2. Get JWT token:
   - Expand **POST /api/auth/login**
   - Click **"Try it out"**
   - Enter credentials:
     ```json
     {
       "email": "user@example.com",
       "password": "SecurePass123!"
     }
     ```
   - Click **"Execute"**
   - Copy `accessToken` from response
3. Paste token into authorization dialog
4. Click **"Authorize"**

### 3. Test Endpoints
1. Expand any endpoint
2. Click **"Try it out"**
3. Fill in required parameters
4. Click **"Execute"**
5. View response

## OpenAPI Specification

### Structure

```yaml
openapi: 3.1.0
info:
  title: Art Bank Core API
  version: 2.7.0
  description: Production-ready API...

servers:
  - url: https://art-bank.pages.dev
    description: Production
  - url: http://localhost:3000
    description: Local development

paths:
  /api/auth/login:
    post:
      tags: [Authentication]
      summary: User login
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                email: { type: string }
                password: { type: string }
      responses:
        200:
          description: Login successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  accessToken: { type: string }
                  refreshToken: { type: string }
```

### Tags

All endpoints are organized by functionality:
- **Authentication** - User auth and tokens
- **Nodes** - Graph nodes (artists, collectors, etc.)
- **Edges** - Relationships between nodes
- **Artworks** - Artwork management
- **Transactions** - Financial operations
- **Validations** - Expert validations
- **Media** - Media items with NLP
- **Exhibitions** - Gallery events
- **Graph** - Graph analytics
- **Dashboard** - Statistics
- **Analytics** - Advanced analytics
- **Health** - System monitoring
- **Admin** - System administration

## Response Schemas

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": { ... }
}
```

### Pagination
```json
{
  "data": [...],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "hasNext": true
  }
}
```

## Rate Limiting Headers

All responses include rate limit information:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 299
X-RateLimit-Reset: 1710012345
```

## Caching Headers

Cached endpoints include:

```
Cache-Control: public, max-age=300, stale-while-revalidate=600
X-Cache: HIT
Cache-Tag: graph,nodes,edges
X-Cache-Key: cache:/api/graph-data
```

## Code Generation

### Generate Client SDKs

Use OpenAPI spec to auto-generate client libraries:

**TypeScript**
```bash
npx openapi-typescript http://localhost:3000/api/openapi.json -o ./types/api.ts
```

**Python**
```bash
openapi-generator-cli generate \
  -i http://localhost:3000/api/openapi.json \
  -g python \
  -o ./clients/python
```

**JavaScript/Fetch**
```bash
npx openapi-typescript-codegen \
  --input http://localhost:3000/api/openapi.json \
  --output ./src/api \
  --client fetch
```

## Integration Examples

### cURL
```bash
# Get graph data
curl -X GET 'https://art-bank.pages.dev/api/graph-data' \
  -H 'Accept: application/json'

# Create node (authenticated)
curl -X POST 'https://art-bank.pages.dev/api/nodes' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "node_type": "artist",
    "name": "Vincent van Gogh",
    "jurisdiction": "Netherlands"
  }'
```

### JavaScript/Fetch
```javascript
// Login
const auth = await fetch('https://art-bank.pages.dev/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!'
  })
})
const { accessToken } = await auth.json()

// Create node
const node = await fetch('https://art-bank.pages.dev/api/nodes', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    node_type: 'artist',
    name: 'Vincent van Gogh'
  })
})
const data = await node.json()
```

### Python/Requests
```python
import requests

# Login
auth = requests.post('https://art-bank.pages.dev/api/auth/login', json={
    'email': 'user@example.com',
    'password': 'SecurePass123!'
})
access_token = auth.json()['accessToken']

# Create node
node = requests.post(
    'https://art-bank.pages.dev/api/nodes',
    headers={'Authorization': f'Bearer {access_token}'},
    json={
        'node_type': 'artist',
        'name': 'Vincent van Gogh'
    }
)
data = node.json()
```

## Validation

All request bodies are validated using **Zod schemas**:
- Type checking
- Required fields
- Format validation (email, UUID, etc.)
- Min/max constraints
- Custom validators

Example error:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": {
    "email": ["Invalid email format"],
    "password": ["Must be at least 8 characters"]
  }
}
```

## Extending Documentation

### Add New Endpoint

1. Define route in `src/lib/openapi-routes.ts`:
```typescript
export const myRoute = createRoute({
  method: 'post',
  path: '/api/my-endpoint',
  tags: ['MyTag'],
  summary: 'My endpoint',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string()
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            name: z.string()
          })
        }
      }
    }
  }
})
```

2. Register route in main app
3. Endpoint automatically appears in Swagger UI

## Best Practices

1. **Always document new endpoints** - Keep docs in sync with code
2. **Use descriptive summaries** - Help users understand purpose
3. **Provide examples** - Show expected request/response formats
4. **Document errors** - List all possible error codes
5. **Version your API** - Use semantic versioning
6. **Test in Swagger UI** - Verify docs match implementation

## Troubleshooting

### Documentation not loading
- Check `/api/openapi.json` returns valid JSON
- Verify Swagger UI middleware is registered
- Clear browser cache

### Authentication not working
- Ensure token format is `Bearer <token>`
- Check token hasn't expired (24h)
- Verify token permissions

### Schemas not matching
- Regenerate TypeScript types
- Update Zod schemas
- Rebuild project

## Additional Resources

- **OpenAPI Spec**: https://spec.openapis.org/oas/v3.1.0
- **Swagger UI**: https://swagger.io/tools/swagger-ui/
- **Zod**: https://zod.dev/
- **Hono OpenAPI**: https://hono.dev/guides/zod-openapi

## Maintenance

### Update Version
Edit `src/lib/openapi.ts`:
```typescript
info: {
  version: '2.8.0'  // Update version
}
```

### Add New Tag
```typescript
tags: [
  {
    name: 'MyNewFeature',
    description: 'Description of new feature'
  }
]
```

### Modify Security
```typescript
components: {
  securitySchemes: {
    apiKey: {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key'
    }
  }
}
```

---

**Last Updated**: 2026-03-30
**Version**: v2.7
**Status**: ✅ Production Ready
