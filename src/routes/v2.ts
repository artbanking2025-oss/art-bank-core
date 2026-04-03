/**
 * API v2 Routes
 * 
 * Current version of the API with latest features:
 * - Improved response formats
 * - Enhanced error handling
 * - Better performance
 * - New endpoints
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import coreRoutes from './core';
import dashboardRoutes from './dashboard';

const v2Routes = new Hono<{ Bindings: Env }>();

// Mount core routes under v2
v2Routes.route('/', coreRoutes);
v2Routes.route('/', dashboardRoutes);

// V2-specific endpoints (new features)
v2Routes.get('/version', (c) => {
  return c.json({
    version: 'v2',
    releaseDate: '2026-04-01',
    features: [
      'Enhanced structured logging',
      'OpenAPI/Swagger documentation',
      'Health monitoring with detailed checks',
      'HTTP caching with TTL/SWR',
      'Rate limiting with 3 tiers',
      'Admin dashboard',
      'Improved error responses',
      'Performance optimizations'
    ],
    status: 'stable'
  });
});

// V2 metadata endpoint
v2Routes.get('/meta', (c) => {
  return c.json({
    apiVersion: 'v2',
    serverVersion: '2.7.0',
    endpoints: {
      total: 67,
      protected: 40,
      public: 15,
      health: 4,
      documentation: 2
    },
    features: {
      authentication: 'JWT (HS256)',
      rateLimiting: '3-tier (60/300/1000 req/min)',
      caching: 'HTTP with TTL/SWR',
      logging: 'Structured JSON with correlation IDs',
      monitoring: 'Health checks + Admin dashboard'
    },
    documentation: '/api/docs',
    health: '/health'
  });
});

export default v2Routes;
