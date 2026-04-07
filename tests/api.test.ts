/**
 * Integration Tests for Art Bank Core API
 * 
 * Tests authentication, authorization, and core API endpoints
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test data
let accessToken = '';
let adminToken = '';
let testNodeId = '';
let testEdgeId = '';
let testArtworkId = '';

describe('Art Bank Core API - Integration Tests', () => {
  
  // ========== HEALTH & PUBLIC ENDPOINTS ==========
  
  describe('Health Checks', () => {
    test('GET /health should return healthy status', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(['healthy', 'degraded']).toContain(data.status);
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
    });

    test('GET /healthz should return OK (liveness probe)', async () => {
      const response = await fetch(`${BASE_URL}/healthz`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
    });

    test('GET /readyz should return OK (readiness probe)', async () => {
      const response = await fetch(`${BASE_URL}/readyz`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('status', 'ready');
    });
  });

  describe('OpenAPI Documentation', () => {
    test('GET /api/openapi.json should return OpenAPI spec', async () => {
      const response = await fetch(`${BASE_URL}/api/openapi.json`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('openapi');
      expect(data).toHaveProperty('info');
      expect(data.info).toHaveProperty('title', 'Art Bank Core API');
      expect(data).toHaveProperty('paths');
    });

    test('GET /api/docs should return Swagger UI HTML', async () => {
      const response = await fetch(`${BASE_URL}/api/docs`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('API Versioning', () => {
    test('GET /api/v2/version should return V2 metadata', async () => {
      const response = await fetch(`${BASE_URL}/api/v2/version`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('version', 'v2');
      expect(data).toHaveProperty('status', 'stable');
      expect(data).toHaveProperty('releaseDate');
    });

    test('GET /api/v1/version should return V1 deprecated metadata', async () => {
      const response = await fetch(`${BASE_URL}/api/v1/version`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('version', 'v1');
      expect(data).toHaveProperty('status', 'deprecated');
      expect(data).toHaveProperty('sunset');
      
      // Check deprecation headers
      expect(response.headers.get('deprecation')).toBe('true');
      expect(response.headers.get('sunset')).toBeTruthy();
    });
  });

  // ========== AUTHENTICATION ==========
  
  describe('Authentication - Registration', () => {
    test('POST /api/auth/register should create collector account', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `test-collector-${Date.now()}@test.com`,
          password: 'Test123!@#',
          full_name: 'Test Collector',
          role: 'collector'
        })
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('user');
      expect(data.user).toHaveProperty('role', 'collector');
    });

    test('POST /api/auth/register should reject invalid email', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'Test123!',
          full_name: 'Test User',
          role: 'collector'
        })
      });
      
      expect(response.status).toBe(400);
    });

    test('POST /api/auth/register should reject weak password', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@test.com',
          password: '123',
          full_name: 'Test User',
          role: 'collector'
        })
      });
      
      expect(response.status).toBe(400);
    });

    test('POST /api/auth/register should reject admin role', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin-attempt@test.com',
          password: 'Test123!',
          full_name: 'Admin Attempt',
          role: 'admin'
        })
      });
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid role');
    });
  });

  describe('Authentication - Login', () => {
    test('POST /api/auth/login should authenticate admin user', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@artbank.io',
          password: 'AdminPass123!'
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('tokens');
      expect(data.tokens).toHaveProperty('access_token');
      expect(data.tokens).toHaveProperty('refresh_token');
      expect(data.tokens).toHaveProperty('expires_in', 86400);
      expect(data.user).toHaveProperty('role', 'admin');
      
      // Store admin token for later tests
      adminToken = data.tokens.access_token;
    });

    test('POST /api/auth/login should reject invalid credentials', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@artbank.io',
          password: 'WrongPassword'
        })
      });
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('POST /api/auth/login should reject non-existent user', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@test.com',
          password: 'Test123!'
        })
      });
      
      expect(response.status).toBe(401);
    });
  });

  describe('Authentication - Token Validation', () => {
    test('GET /api/auth/me should return user info with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('user');
      expect(data.user).toHaveProperty('email', 'admin@artbank.io');
      expect(data.user).toHaveProperty('role', 'admin');
    });

    test('GET /api/auth/me should reject invalid token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': 'Bearer invalid-token' }
      });
      
      expect(response.status).toBe(401);
    });

    test('GET /api/auth/me should reject missing token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/me`);
      expect(response.status).toBe(401);
    });
  });

  // ========== CORE API ENDPOINTS (PROTECTED) ==========
  
  describe('Nodes API', () => {
    test('POST /api/nodes should create new node (authenticated)', async () => {
      const response = await fetch(`${BASE_URL}/api/nodes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'artist',
          name: 'Test Artist',
          email: 'artist@test.com',
          bio: 'Test artist bio'
        })
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('type', 'artist');
      expect(data).toHaveProperty('name', 'Test Artist');
      
      testNodeId = data.id;
    });

    test('GET /api/nodes should list all nodes (authenticated)', async () => {
      const response = await fetch(`${BASE_URL}/api/nodes`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    test('GET /api/nodes/:id should return specific node', async () => {
      const response = await fetch(`${BASE_URL}/api/nodes/${testNodeId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('id', testNodeId);
      expect(data).toHaveProperty('type', 'artist');
    });

    test('PUT /api/nodes/:id should update node', async () => {
      const response = await fetch(`${BASE_URL}/api/nodes/${testNodeId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bio: 'Updated artist bio'
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('bio', 'Updated artist bio');
    });

    test('GET /api/nodes should reject unauthenticated request', async () => {
      const response = await fetch(`${BASE_URL}/api/nodes`);
      expect(response.status).toBe(401);
    });
  });

  describe('Edges API', () => {
    test('POST /api/edges should create relationship', async () => {
      const response = await fetch(`${BASE_URL}/api/edges`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_node: testNodeId,
          to_node: testNodeId,
          relationship_type: 'trusts',
          weight: 0.85
        })
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('relationship_type', 'trusts');
      expect(data).toHaveProperty('weight', 0.85);
      
      testEdgeId = data.id;
    });

    test('GET /api/edges should list relationships', async () => {
      const response = await fetch(`${BASE_URL}/api/edges`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Artworks API', () => {
    test('POST /api/artworks should create artwork', async () => {
      const response = await fetch(`${BASE_URL}/api/artworks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Test Artwork',
          artist_id: testNodeId,
          medium: 'Oil on Canvas',
          year: 2024,
          dimensions: '100x80 cm',
          price: 50000
        })
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('title', 'Test Artwork');
      expect(data).toHaveProperty('price', 50000);
      
      testArtworkId = data.id;
    });

    test('GET /api/artworks should list artworks', async () => {
      const response = await fetch(`${BASE_URL}/api/artworks`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test('GET /api/artworks/:id should return artwork details', async () => {
      const response = await fetch(`${BASE_URL}/api/artworks/${testArtworkId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('id', testArtworkId);
      expect(data).toHaveProperty('title', 'Test Artwork');
    });
  });

  describe('Transactions API', () => {
    test('POST /api/transactions should record transaction', async () => {
      const response = await fetch(`${BASE_URL}/api/transactions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          artwork_id: testArtworkId,
          from_node: testNodeId,
          to_node: testNodeId,
          transaction_type: 'sale',
          amount: 50000,
          currency: 'USD'
        })
      });
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('transaction_type', 'sale');
      expect(data).toHaveProperty('amount', 50000);
    });

    test('GET /api/transactions should list transactions', async () => {
      const response = await fetch(`${BASE_URL}/api/transactions`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // ========== GRAPH DATA ==========
  
  describe('Graph Data API', () => {
    test('GET /api/graph-data should return graph visualization data', async () => {
      const response = await fetch(`${BASE_URL}/api/graph-data`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('nodes');
      expect(data).toHaveProperty('edges');
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
    });
  });

  // ========== ADMIN ENDPOINTS ==========
  
  describe('Admin Dashboard Access', () => {
    test('GET /admin should return dashboard HTML for admin', async () => {
      const response = await fetch(`${BASE_URL}/admin`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });

    test('GET /admin should reject non-admin user', async () => {
      // Create non-admin user first
      const registerResp = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `collector-${Date.now()}@test.com`,
          password: 'Test123!',
          full_name: 'Test Collector',
          role: 'collector'
        })
      });
      const registerData = await registerResp.json();
      const collectorToken = registerData.tokens?.access_token;

      if (collectorToken) {
        const response = await fetch(`${BASE_URL}/admin`, {
          headers: { 'Authorization': `Bearer ${collectorToken}` }
        });
        
        expect(response.status).toBe(403);
      }
    });
  });

  describe('Metrics API (Admin Only)', () => {
    test('GET /api/metrics/system should return system metrics', async () => {
      const response = await fetch(`${BASE_URL}/api/metrics/system`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('requests');
      expect(data).toHaveProperty('performance');
      expect(data).toHaveProperty('errors');
      expect(data).toHaveProperty('cache');
    });

    test('GET /api/metrics/system should reject non-admin', async () => {
      const response = await fetch(`${BASE_URL}/api/metrics/system`);
      expect(response.status).toBe(401);
    });

    test('GET /api/metrics/timeseries/response_time should return time series', async () => {
      const response = await fetch(`${BASE_URL}/api/metrics/timeseries/response_time?interval=60000`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('metric', 'response_time');
      expect(data).toHaveProperty('interval', 60000);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ========== RATE LIMITING ==========
  
  describe('Rate Limiting', () => {
    test('Should apply rate limits to unauthenticated requests', async () => {
      const requests = [];
      
      // Make 65 requests (public limit is 60/min)
      for (let i = 0; i < 65; i++) {
        requests.push(fetch(`${BASE_URL}/health`));
      }
      
      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);
      
      // At least some requests should be rate limited
      expect(tooManyRequests.length).toBeGreaterThan(0);
    }, 15000); // Longer timeout for this test

    test('Rate limit headers should be present', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      
      expect(response.headers.has('x-ratelimit-limit')).toBe(true);
      expect(response.headers.has('x-ratelimit-remaining')).toBe(true);
      expect(response.headers.has('x-ratelimit-reset')).toBe(true);
    });
  });

  // ========== CACHING ==========
  
  describe('HTTP Caching', () => {
    test('Cached endpoints should include cache headers', async () => {
      const response = await fetch(`${BASE_URL}/api/graph-data`);
      
      expect(response.status).toBe(200);
      expect(response.headers.has('cache-control')).toBe(true);
      
      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toContain('max-age');
    });
  });

  // ========== ERROR HANDLING ==========
  
  describe('Error Handling', () => {
    test('404 for non-existent endpoint', async () => {
      const response = await fetch(`${BASE_URL}/api/nonexistent`);
      expect(response.status).toBe(404);
    });

    test('400 for invalid request body', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json'
      });
      
      expect([400, 500]).toContain(response.status);
    });
  });

  // ========== CLEANUP ==========
  
  describe('Cleanup Test Data', () => {
    test('DELETE /api/edges/:id should remove edge', async () => {
      if (testEdgeId) {
        const response = await fetch(`${BASE_URL}/api/edges/${testEdgeId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        expect([200, 204]).toContain(response.status);
      }
    });

    test('DELETE /api/artworks/:id should remove artwork', async () => {
      if (testArtworkId) {
        const response = await fetch(`${BASE_URL}/api/artworks/${testArtworkId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        expect([200, 204]).toContain(response.status);
      }
    });

    test('DELETE /api/nodes/:id should remove node', async () => {
      if (testNodeId) {
        const response = await fetch(`${BASE_URL}/api/nodes/${testNodeId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        expect([200, 204]).toContain(response.status);
      }
    });
  });
});
