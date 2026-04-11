/**
 * Central Router Routes
 * 
 * Admin endpoints for managing the central router
 */

import { Hono } from 'hono';
import { centralRouter } from '../lib/central-router';

const app = new Hono();

/**
 * GET /api/router/metrics
 * Get routing metrics
 */
app.get('/metrics', (c) => {
  const metrics = centralRouter.getMetrics();
  
  return c.json({
    success: true,
    metrics
  });
});

/**
 * GET /api/router/services
 * Get all registered services
 */
app.get('/services', (c) => {
  const services = centralRouter.getAllServices();
  const serviceList = Array.from(services.entries()).map(([name, endpoints]) => ({
    name,
    endpoints: endpoints.map(e => ({
      id: e.id,
      url: e.url,
      weight: e.weight,
      health: e.health,
      lastHealthCheck: e.lastHealthCheck,
      responseTime: e.responseTime,
      errorRate: e.errorRate
    }))
  }));
  
  return c.json({
    success: true,
    count: serviceList.length,
    services: serviceList
  });
});

/**
 * GET /api/router/services/:name
 * Get service health by name
 */
app.get('/services/:name', (c) => {
  const name = c.req.param('name');
  const endpoints = centralRouter.getServiceHealth(name);
  
  if (endpoints.length === 0) {
    return c.json({
      success: false,
      error: 'Service not found',
      message: `No service found with name: ${name}`
    }, 404);
  }
  
  return c.json({
    success: true,
    service: name,
    endpoints: endpoints.map(e => ({
      id: e.id,
      url: e.url,
      weight: e.weight,
      health: e.health,
      lastHealthCheck: e.lastHealthCheck,
      responseTime: e.responseTime,
      errorRate: e.errorRate
    }))
  });
});

/**
 * GET /api/router/routes
 * Get all configured routes
 */
app.get('/routes', (c) => {
  const routes = centralRouter.getAllRoutes();
  
  return c.json({
    success: true,
    count: routes.length,
    routes: routes.map(r => ({
      pattern: r.pattern,
      service: r.service,
      methods: r.methods,
      timeout: r.timeout,
      retries: r.retries,
      circuitBreaker: r.circuitBreaker,
      rateLimit: r.rateLimit
    }))
  });
});

/**
 * POST /api/router/health-check
 * Run health checks for all services
 */
app.post('/health-check', async (c) => {
  await centralRouter.runHealthChecks();
  
  const services = centralRouter.getAllServices();
  const results = Array.from(services.entries()).map(([name, endpoints]) => ({
    name,
    healthyEndpoints: endpoints.filter(e => e.health === 'healthy').length,
    totalEndpoints: endpoints.length,
    endpoints: endpoints.map(e => ({
      id: e.id,
      health: e.health,
      lastHealthCheck: e.lastHealthCheck
    }))
  }));
  
  return c.json({
    success: true,
    message: 'Health checks completed',
    results
  });
});

/**
 * POST /api/router/register-service
 * Register a new service endpoint
 */
app.post('/register-service', async (c) => {
  const body = await c.req.json();
  
  const { name, url, weight = 100 } = body;
  
  if (!name || !url) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required fields: name, url'
    }, 400);
  }
  
  centralRouter.registerService({
    id: `${name}-${Date.now()}`,
    name,
    url,
    weight,
    health: 'unknown'
  });
  
  return c.json({
    success: true,
    message: 'Service registered successfully',
    service: { name, url, weight }
  });
});

/**
 * POST /api/router/add-route
 * Add a new route configuration
 */
app.post('/add-route', async (c) => {
  const body = await c.req.json();
  
  const {
    pattern,
    service,
    methods = ['GET'],
    timeout = 5000,
    retries = 2,
    circuitBreaker = true,
    rateLimit
  } = body;
  
  if (!pattern || !service) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required fields: pattern, service'
    }, 400);
  }
  
  centralRouter.addRoute({
    pattern,
    service,
    methods,
    timeout,
    retries,
    circuitBreaker,
    rateLimit
  });
  
  return c.json({
    success: true,
    message: 'Route added successfully',
    route: { pattern, service, methods, timeout, retries }
  });
});

export default app;
