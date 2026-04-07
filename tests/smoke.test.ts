/**
 * Quick Smoke Tests for Art Bank Core API
 * Fast integration tests for CI/CD
 */

import { describe, test, expect } from '@jest/globals';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

describe('Art Bank API - Smoke Tests', () => {
  
  test('Health check endpoint is accessible', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });

  test('OpenAPI spec is available', async () => {
    const response = await fetch(`${BASE_URL}/api/openapi.json`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('openapi');
  });

  test('Admin login works', async () => {
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
    expect(data).toHaveProperty('tokens');
    expect(data.tokens).toHaveProperty('access_token');
  });

  test('Protected endpoint requires authentication', async () => {
    const response = await fetch(`${BASE_URL}/api/nodes`);
    expect(response.status).toBe(401);
  });

  test('API versioning works', async () => {
    const response = await fetch(`${BASE_URL}/api/v2/version`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('version', 'v2');
  });
});
