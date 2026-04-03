# API Versioning Guide

## Overview

Art Bank Core API uses **URL-based versioning** to ensure backward compatibility and smooth transitions between API versions.

## Supported Versions

### v2 (Current) ✅

**Status**: Active, Stable  
**Release Date**: 2026-04-01  
**Base URL**: `/api/v2/`

**Features**:
- Enhanced structured logging
- OpenAPI/Swagger documentation
- Health monitoring with detailed checks
- HTTP caching with TTL/SWR
- Rate limiting with 3 tiers
- Admin dashboard
- Improved error responses
- Performance optimizations
- camelCase response format

**Example**:
```bash
curl https://art-bank.pages.dev/api/v2/nodes
```

---

### v1 (Deprecated) ⚠️

**Status**: Deprecated  
**Sunset Date**: 2026-12-31  
**Base URL**: `/api/v1/`

**Limitations**:
- snake_case response format
- Simplified error responses
- No structured logging headers
- Limited rate limiting (60 req/min)
- Missing v2 features

**Migration Required**: Please migrate to v2 before sunset date.

**Example**:
```bash
curl https://art-bank.pages.dev/api/v1/nodes
```

---

## Using API Versions

### Explicit Versioning (Recommended)

Always specify the version in your requests:

```bash
# V2 (current)
curl https://art-bank.pages.dev/api/v2/nodes

# V1 (deprecated)
curl https://art-bank.pages.dev/api/v1/nodes
```

### Unversioned Endpoints (Backward Compatible)

Unversioned endpoints default to v2:

```bash
# Defaults to v2
curl https://art-bank.pages.dev/api/nodes
```

---

## Version Headers

All versioned requests include these headers:

### Response Headers

```
X-API-Version: v2
X-API-Current-Version: v2
```

### Deprecation Headers (v1 only)

```
Deprecation: true
Sunset: 2026-12-31
Link: </api/v2>; rel="successor-version"
```

---

## Version Differences

### Response Format

**V1 (snake_case)**:
```json
{
  "node_id": "node-123",
  "node_type": "artist",
  "trust_level": 0.85,
  "created_at": "2026-04-01T12:00:00Z"
}
```

**V2 (camelCase)**:
```json
{
  "nodeId": "node-123",
  "nodeType": "artist",
  "trustLevel": 0.85,
  "createdAt": "2026-04-01T12:00:00Z"
}
```

### Error Responses

**V1 (simple)**:
```json
{
  "error": "Node not found"
}
```

**V2 (detailed)**:
```json
{
  "error": "NotFoundError",
  "message": "Node not found",
  "code": "NODE_NOT_FOUND",
  "correlationId": "1775079344257-7gu5sqn32",
  "requestId": "1775079344257-w554sdwia"
}
```

---

## Migration Guide: V1 → V2

### Step 1: Update Base URL

```javascript
// Before (v1)
const baseURL = 'https://art-bank.pages.dev/api/v1';

// After (v2)
const baseURL = 'https://art-bank.pages.dev/api/v2';
```

### Step 2: Update Response Handling

```javascript
// Before (v1 - snake_case)
const nodeId = response.data.node_id;
const nodeType = response.data.node_type;
const trustLevel = response.data.trust_level;

// After (v2 - camelCase)
const nodeId = response.data.nodeId;
const nodeType = response.data.nodeType;
const trustLevel = response.data.trustLevel;
```

### Step 3: Update Error Handling

```javascript
// Before (v1)
if (error.response?.data?.error) {
  console.error(error.response.data.error);
}

// After (v2)
if (error.response?.data) {
  const { error, message, code, correlationId } = error.response.data;
  console.error(`${error}: ${message} (${code})`);
  console.error(`Correlation ID: ${correlationId}`);
}
```

### Step 4: Test Your Changes

```bash
# Test v2 endpoints
curl https://art-bank.pages.dev/api/v2/nodes
curl https://art-bank.pages.dev/api/v2/artworks
curl https://art-bank.pages.dev/api/v2/graph-data
```

---

## Version Lifecycle

### Timeline

| Date | Event |
|------|-------|
| 2026-04-01 | V2 released (stable) |
| 2026-04-01 | V1 deprecated |
| 2026-12-31 | V1 sunset (removed) |

### Deprecation Process

1. **Announcement** (v1 deprecated on 2026-04-01)
   - Deprecation headers added to v1 responses
   - Migration guide published
   - 9 months migration period

2. **Warning Period** (2026-04-01 to 2026-12-31)
   - V1 continues to work
   - Deprecation warnings in logs
   - Sunset countdown

3. **Sunset** (2026-12-31)
   - V1 returns 410 Gone
   - All requests must use v2

---

## Best Practices

### 1. Always Specify Version

```bash
# ✅ Good
curl https://art-bank.pages.dev/api/v2/nodes

# ⚠️ Avoid (relies on default)
curl https://art-bank.pages.dev/api/nodes
```

### 2. Monitor Deprecation Headers

```javascript
if (response.headers['deprecation'] === 'true') {
  const sunsetDate = response.headers['sunset'];
  console.warn(`API version deprecated. Sunset: ${sunsetDate}`);
}
```

### 3. Use Version Constants

```javascript
const API_VERSION = 'v2';
const baseURL = `https://art-bank.pages.dev/api/${API_VERSION}`;
```

### 4. Test Before Migrating

```bash
# Test in parallel
curl https://art-bank.pages.dev/api/v1/nodes > v1.json
curl https://art-bank.pages.dev/api/v2/nodes > v2.json
diff v1.json v2.json
```

---

## Version Metadata

### Get Version Information

```bash
# V2 metadata
curl https://art-bank.pages.dev/api/v2/version

# V1 metadata
curl https://art-bank.pages.dev/api/v1/version
```

### V2 Version Endpoint Response

```json
{
  "version": "v2",
  "releaseDate": "2026-04-01",
  "features": [
    "Enhanced structured logging",
    "OpenAPI/Swagger documentation",
    "Health monitoring",
    "HTTP caching",
    "Rate limiting"
  ],
  "status": "stable"
}
```

### V1 Version Endpoint Response

```json
{
  "version": "v1",
  "status": "deprecated",
  "sunset_date": "2026-12-31",
  "message": "This API version is deprecated. Please migrate to v2.",
  "migration_guide": "/docs/migration/v1-to-v2",
  "successor": "v2"
}
```

---

## Future Versions

### V3 (Planned)

**Expected**: Q1 2027  
**Features** (tentative):
- GraphQL support
- WebSocket real-time updates
- Enhanced batch operations
- Improved pagination
- New analytics endpoints

**Backward Compatibility**: V2 will be supported for 12 months after v3 release.

---

## Support

### Questions?

- **Documentation**: https://art-bank.pages.dev/api/docs
- **Migration Help**: Check `/docs/migration/v1-to-v2`
- **GitHub Issues**: Report problems or ask questions

### Version Status

Check current version status:
```bash
curl https://art-bank.pages.dev/api/v2/meta
```

---

**Last Updated**: 2026-04-02  
**Current Version**: v2  
**Deprecated Versions**: v1 (sunset 2026-12-31)
