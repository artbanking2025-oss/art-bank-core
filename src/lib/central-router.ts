/**
 * Central Router - API Gateway
 * 
 * Intelligent routing system with:
 * - Service discovery
 * - Load balancing
 * - Circuit breakers
 * - Request/response transformation
 * - Rate limiting per service
 * - Health checks
 */

import { CircuitBreaker } from './circuit-breaker';

export interface ServiceEndpoint {
  id: string;
  name: string;
  url: string;
  weight: number; // Load balancing weight (1-100)
  health: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck?: Date;
  responseTime?: number; // Average response time in ms
  errorRate?: number; // Error rate percentage
}

export interface RouteConfig {
  pattern: string; // URL pattern (e.g., /api/v1/artworks)
  service: string; // Service name
  methods: string[]; // Allowed HTTP methods
  timeout?: number; // Request timeout in ms
  retries?: number; // Number of retries
  circuitBreaker?: boolean; // Enable circuit breaker
  rateLimit?: number; // Requests per minute
  transform?: {
    request?: (req: Request) => Request | Promise<Request>;
    response?: (res: Response) => Response | Promise<Response>;
  };
}

export interface RoutingMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  routeBreakdown: Record<string, {
    count: number;
    avgTime: number;
    errorRate: number;
  }>;
}

export class CentralRouter {
  private services: Map<string, ServiceEndpoint[]> = new Map();
  private routes: RouteConfig[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private metrics: Map<string, number[]> = new Map(); // Response times per route
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();

  constructor() {
    this.initializeDefaultServices();
    this.initializeDefaultRoutes();
  }

  /**
   * Initialize default service endpoints
   */
  private initializeDefaultServices(): void {
    // Analytics service
    this.registerService({
      id: 'analytics-1',
      name: 'analytics',
      url: 'http://localhost:3001',
      weight: 100,
      health: 'unknown'
    });

    // Auth service (embedded)
    this.registerService({
      id: 'auth-1',
      name: 'auth',
      url: 'http://localhost:3000',
      weight: 100,
      health: 'healthy'
    });

    // Core service (embedded)
    this.registerService({
      id: 'core-1',
      name: 'core',
      url: 'http://localhost:3000',
      weight: 100,
      health: 'healthy'
    });
  }

  /**
   * Initialize default routes
   */
  private initializeDefaultRoutes(): void {
    this.routes = [
      {
        pattern: '/api/auth/*',
        service: 'auth',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        timeout: 5000,
        retries: 3,
        circuitBreaker: true,
        rateLimit: 100
      },
      {
        pattern: '/api/analytics/*',
        service: 'analytics',
        methods: ['GET', 'POST'],
        timeout: 10000,
        retries: 2,
        circuitBreaker: true,
        rateLimit: 50
      },
      {
        pattern: '/api/v1/*',
        service: 'core',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        timeout: 5000,
        retries: 2,
        circuitBreaker: true
      },
      {
        pattern: '/api/v2/*',
        service: 'core',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        timeout: 5000,
        retries: 2,
        circuitBreaker: true
      }
    ];
  }

  /**
   * Register a service endpoint
   */
  registerService(endpoint: ServiceEndpoint): void {
    const existing = this.services.get(endpoint.name) || [];
    existing.push(endpoint);
    this.services.set(endpoint.name, existing);

    // Initialize circuit breaker if needed
    if (!this.circuitBreakers.has(endpoint.id)) {
      this.circuitBreakers.set(endpoint.id, new CircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenRetries: 2
      }));
    }
  }

  /**
   * Add a route configuration
   */
  addRoute(route: RouteConfig): void {
    this.routes.push(route);
  }

  /**
   * Find matching route for a request
   */
  private findRoute(path: string, method: string): RouteConfig | null {
    for (const route of this.routes) {
      const pattern = route.pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      
      if (regex.test(path) && route.methods.includes(method)) {
        return route;
      }
    }
    return null;
  }

  /**
   * Select best endpoint using weighted round-robin
   */
  private selectEndpoint(serviceName: string): ServiceEndpoint | null {
    const endpoints = this.services.get(serviceName);
    if (!endpoints || endpoints.length === 0) {
      return null;
    }

    // Filter healthy endpoints
    const healthyEndpoints = endpoints.filter(e => e.health === 'healthy');
    if (healthyEndpoints.length === 0) {
      // Fallback to any endpoint if none are healthy
      return endpoints[0];
    }

    // Weighted random selection
    const totalWeight = healthyEndpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of healthyEndpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return healthyEndpoints[0];
  }

  /**
   * Route a request through the gateway
   */
  async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Find matching route
    const route = this.findRoute(path, method);
    if (!route) {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: `No route found for ${method} ${path}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Select endpoint
    const endpoint = this.selectEndpoint(route.service);
    if (!endpoint) {
      return new Response(JSON.stringify({
        error: 'Service Unavailable',
        message: `No healthy endpoints available for service: ${route.service}`
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get circuit breaker
    const circuitBreaker = this.circuitBreakers.get(endpoint.id);
    if (!circuitBreaker) {
      return new Response(JSON.stringify({
        error: 'Internal Error',
        message: 'Circuit breaker not initialized'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check circuit breaker
    if (route.circuitBreaker && circuitBreaker.getState() === 'open') {
      return new Response(JSON.stringify({
        error: 'Service Unavailable',
        message: `Service ${route.service} is temporarily unavailable (circuit breaker open)`,
        retryAfter: 30
      }), {
        status: 503,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': '30'
        }
      });
    }

    // Transform request if needed
    let transformedRequest = request;
    if (route.transform?.request) {
      transformedRequest = await route.transform.request(request);
    }

    // Execute request with retries
    const startTime = performance.now();
    let lastError: Error | null = null;
    const maxRetries = route.retries || 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Build target URL
        const targetUrl = new URL(path, endpoint.url);
        targetUrl.search = url.search;

        // Forward request
        const response = await circuitBreaker.execute(async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), route.timeout || 5000);

          try {
            const res = await fetch(targetUrl.toString(), {
              method: transformedRequest.method,
              headers: transformedRequest.headers,
              body: transformedRequest.body,
              signal: controller.signal
            });
            clearTimeout(timeout);
            return res;
          } catch (error) {
            clearTimeout(timeout);
            throw error;
          }
        });

        // Record metrics
        const duration = performance.now() - startTime;
        this.recordMetrics(route.pattern, duration, response.status >= 200 && response.status < 300);

        // Transform response if needed
        let finalResponse = response;
        if (route.transform?.response) {
          finalResponse = await route.transform.response(response);
        }

        // Add routing headers
        const headers = new Headers(finalResponse.headers);
        headers.set('X-Routed-By', 'central-router');
        headers.set('X-Service', route.service);
        headers.set('X-Endpoint', endpoint.id);
        headers.set('X-Response-Time', `${Math.round(duration)}ms`);

        return new Response(finalResponse.body, {
          status: finalResponse.status,
          statusText: finalResponse.statusText,
          headers
        });

      } catch (error) {
        lastError = error as Error;
        
        // Don't retry if circuit breaker is open
        if (circuitBreaker.getState() === 'open') {
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }

    // All retries failed
    const duration = performance.now() - startTime;
    this.recordMetrics(route.pattern, duration, false);

    return new Response(JSON.stringify({
      error: 'Service Error',
      message: `Failed to route request to ${route.service}: ${lastError?.message}`,
      service: route.service,
      endpoint: endpoint.id
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Record routing metrics
   */
  private recordMetrics(pattern: string, duration: number, success: boolean): void {
    // Record response time
    const times = this.metrics.get(pattern) || [];
    times.push(duration);
    if (times.length > 1000) {
      times.shift();
    }
    this.metrics.set(pattern, times);

    // Record counts
    const currentCount = this.requestCounts.get(pattern) || 0;
    this.requestCounts.set(pattern, currentCount + 1);

    if (!success) {
      const errorCount = this.errorCounts.get(pattern) || 0;
      this.errorCounts.set(pattern, errorCount + 1);
    }
  }

  /**
   * Get routing metrics
   */
  getMetrics(): RoutingMetrics {
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    const allTimes: number[] = [];

    const routeBreakdown: Record<string, { count: number; avgTime: number; errorRate: number }> = {};

    for (const [pattern, times] of this.metrics) {
      const count = this.requestCounts.get(pattern) || 0;
      const errors = this.errorCounts.get(pattern) || 0;
      
      totalRequests += count;
      successfulRequests += (count - errors);
      failedRequests += errors;
      
      allTimes.push(...times);

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const errorRate = count > 0 ? (errors / count) * 100 : 0;

      routeBreakdown[pattern] = {
        count,
        avgTime: Math.round(avgTime),
        errorRate: Math.round(errorRate * 100) / 100
      };
    }

    // Calculate percentiles
    const sortedTimes = allTimes.sort((a, b) => a - b);
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
    const avgResponseTime = sortedTimes.length > 0
      ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length
      : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      avgResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: Math.round(p95),
      p99ResponseTime: Math.round(p99),
      routeBreakdown
    };
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceName: string): ServiceEndpoint[] {
    return this.services.get(serviceName) || [];
  }

  /**
   * Get all services
   */
  getAllServices(): Map<string, ServiceEndpoint[]> {
    return this.services;
  }

  /**
   * Get all routes
   */
  getAllRoutes(): RouteConfig[] {
    return this.routes;
  }

  /**
   * Health check for a service endpoint
   */
  async checkEndpointHealth(endpoint: ServiceEndpoint): Promise<boolean> {
    try {
      const response = await fetch(`${endpoint.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      const isHealthy = response.ok;
      endpoint.health = isHealthy ? 'healthy' : 'unhealthy';
      endpoint.lastHealthCheck = new Date();

      return isHealthy;
    } catch (error) {
      endpoint.health = 'unhealthy';
      endpoint.lastHealthCheck = new Date();
      return false;
    }
  }

  /**
   * Run health checks for all endpoints
   */
  async runHealthChecks(): Promise<void> {
    const checks: Promise<boolean>[] = [];

    for (const endpoints of this.services.values()) {
      for (const endpoint of endpoints) {
        checks.push(this.checkEndpointHealth(endpoint));
      }
    }

    await Promise.allSettled(checks);
  }
}

// Singleton instance
export const centralRouter = new CentralRouter();
