import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { swaggerUI } from '@hono/swagger-ui';

// Middleware
import { authMiddleware } from './middleware/auth-middleware';
import { adminMiddleware } from './middleware/admin-middleware';
import { rateLimitMiddleware, strictRateLimitMiddleware } from './middleware/rate-limit';
import { loggingMiddleware, errorLoggingMiddleware } from './middleware/logger';
import { metricsMiddleware } from './middleware/metrics-middleware';
import { versionMiddleware, versionEnforcementMiddleware } from './middleware/versioning';
import { healthCheckHandler, livenessHandler, readinessHandler } from './lib/health';

// Route modules
import auth from './routes/auth';
import artist from './routes/artist';
import collector from './routes/collector';
import gallery from './routes/gallery';
import bank from './routes/bank';
import expert from './routes/expert';
import analyticsExtended from './routes/analytics-extended';
import mediaHub from './routes/media-hub';
import graphSegmentation from './routes/graph-segmentation';
import coreRoutes from './routes/core';
import dashboardRoutes from './routes/dashboard';
import v1Routes from './routes/v1';
import v2Routes from './routes/v2';
import metricsRoutes from './routes/metrics';
import logsRoutes from './routes/logs';
import rateLimitAdminRoutes from './routes/rate-limit-admin';
import websocketRoutes from './routes/websocket';

// HTML renderers (TODO: move to separate module)
import { renderAnalyticsDashboard } from './analytics-dashboard-render';
import { renderAdminDashboard } from './lib/admin-dashboard';
import { renderMetricsDashboard } from './lib/metrics-dashboard';

const app = new Hono<{ Bindings: Env }>();

// ========== GLOBAL MIDDLEWARE ==========
// Structured Logging (MUST BE FIRST - captures all requests)
app.use('*', loggingMiddleware());

// Metrics Collection (captures performance data)
app.use('*', metricsMiddleware);

// API Versioning (extract and validate version)
app.use('/api/*', versionMiddleware());
app.use('/api/*', versionEnforcementMiddleware());

// Rate Limiting (applies to all API routes)
app.use('/api/*', rateLimitMiddleware);

// CORS (enable for API)
app.use('/api/*', cors());

// NOTE: Static files served automatically by Cloudflare Pages from dist/

// ========== HEALTH CHECK ENDPOINTS (PUBLIC) ==========
app.get('/health', healthCheckHandler);
app.get('/api/health', healthCheckHandler);
app.get('/healthz', livenessHandler);
app.get('/readyz', readinessHandler);

// ========== OPENAPI DOCUMENTATION (PUBLIC) ==========
app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));

app.get('/api/openapi.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  const openAPISpec = {
    openapi: '3.1.0',
    info: {
      title: 'Art Bank Core API',
      version: '2.7.0',
      description: `
# Art Bank Core API Documentation

Production-ready API for Art Banking Platform with JWT authentication, 
graph-based network analysis, and comprehensive art ecosystem management.

## Features
- 🔒 JWT Authentication - Secure role-based access control
- 📊 Graph Network - Node/Edge based relationship management  
- 🎨 Art Management - Complete artwork lifecycle tracking
- 💰 Transaction System - Price history and financial operations
- ✅ Validation Hub - Expert authentication and condition reports
- 📸 Media Hub - NLP-powered sentiment analysis
- 🏛️ Exhibition Management - Gallery and museum event tracking
- 🔄 Saga Pattern - Distributed transaction reliability
- ⚡ Circuit Breaker - Resilience and fault tolerance

## Authentication
Most endpoints require JWT authentication. Include the token:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

## Rate Limiting
- Public: 60 req/min
- Authenticated: 300 req/min  
- Admin: 1000 req/min
- Auth endpoints: 10 req/min

## Roles
Artist, Collector, Gallery, Bank, Expert, Admin
      `,
      contact: {
        name: 'Art Bank Core Team',
        email: 'artbanking2025@gmail.com'
      }
    },
    servers: [
      { url: baseUrl, description: 'Current server' },
      { url: 'https://art-bank.pages.dev', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local development' }
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
    tags: [
      { name: 'Authentication', description: 'User registration, login, token refresh' },
      { name: 'Nodes', description: 'Graph nodes management' },
      { name: 'Edges', description: 'Graph edges management' },
      { name: 'Artworks', description: 'Artwork management' },
      { name: 'Transactions', description: 'Financial transactions' },
      { name: 'Validations', description: 'Expert validations' },
      { name: 'Media', description: 'Media items with NLP' },
      { name: 'Exhibitions', description: 'Exhibition management' },
      { name: 'Dashboard', description: 'Statistics and graphs' },
      { name: 'Health', description: 'Health monitoring' }
    ],
    paths: {
      '/api/auth/login': {
        post: {
          tags: ['Authentication'],
          summary: 'User login',
          description: 'Authenticate and receive JWT tokens',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email', example: 'user@example.com' },
                    password: { type: 'string', example: 'SecurePass123!' }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      accessToken: { type: 'string' },
                      refreshToken: { type: 'string' },
                      expiresIn: { type: 'number', example: 86400 }
                    }
                  }
                }
              }
            },
            401: { description: 'Invalid credentials' },
            429: { description: 'Rate limit exceeded' }
          }
        }
      },
      '/api/auth/register': {
        post: {
          tags: ['Authentication'],
          summary: 'Register new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password', 'name', 'role'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    name: { type: 'string' },
                    role: { 
                      type: 'string', 
                      enum: ['artist', 'collector', 'gallery', 'bank', 'expert'] 
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'User registered' },
            400: { description: 'Invalid request' }
          }
        }
      },
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Full health check',
          responses: {
            200: {
              description: 'System healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                      timestamp: { type: 'string', format: 'date-time' },
                      uptime: { type: 'number' },
                      version: { type: 'string' },
                      checks: { type: 'object' }
                    }
                  }
                }
              }
            },
            503: { description: 'System unhealthy' }
          }
        }
      },
      '/api/graph-data': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get graph visualization data',
          description: 'Public endpoint with 5min cache',
          responses: {
            200: {
              description: 'Graph data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      nodes: { type: 'array' },
                      edges: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/nodes': {
        get: {
          tags: ['Nodes'],
          summary: 'List nodes',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'number' } },
            { name: 'offset', in: 'query', schema: { type: 'number' } }
          ],
          responses: {
            200: { description: 'List of nodes' }
          }
        },
        post: {
          tags: ['Nodes'],
          summary: 'Create node',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['node_type', 'name'],
                  properties: {
                    node_type: { 
                      type: 'string',
                      enum: ['artist', 'collector', 'gallery', 'bank', 'expert', 'artwork']
                    },
                    name: { type: 'string' },
                    jurisdiction: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Node created' },
            401: { description: 'Authentication required' }
          }
        }
      }
    }
  };
  
  return c.json(openAPISpec);
});

// ========== AUTH ROUTES (PUBLIC) ==========
// Strict rate limiting for auth endpoints (10 req/min)
app.use('/api/auth/*', strictRateLimitMiddleware);
app.route('/api/auth', auth);

// ========== PROTECTED ROLE-SPECIFIC ROUTES ==========
app.use('/api/artist/*', authMiddleware);
app.use('/api/collector/*', authMiddleware);
app.use('/api/gallery/*', authMiddleware);
app.use('/api/bank/*', authMiddleware);
app.use('/api/expert/*', authMiddleware);

app.route('/api/artist', artist);
app.route('/api/collector', collector);
app.route('/api/gallery', gallery);
app.route('/api/bank', bank);
app.route('/api/expert', expert);

// ========== ANALYTICS & MEDIA ROUTES (PROTECTED) ==========
app.use('/api/analytics-extended/*', authMiddleware);
app.route('/api/analytics-extended', analyticsExtended);

app.use('/api/media-hub/*', authMiddleware);
app.route('/api/media-hub', mediaHub);

app.use('/api/graph-segmentation/*', authMiddleware);
app.route('/api/graph-segmentation', graphSegmentation);

// ========== VERSIONED API ROUTES ==========
// V1 API (deprecated, sunset 2026-12-31)
app.route('/api/v1', v1Routes);

// V2 API (current, stable)
app.route('/api/v2', v2Routes);

// ========== METRICS ROUTES (ADMIN ONLY) ==========
app.use('/api/metrics/*', authMiddleware, adminMiddleware);
app.route('/api/metrics', metricsRoutes);

// ========== LOGS ROUTES (ADMIN ONLY) ==========
app.use('/api/logs/*', authMiddleware, adminMiddleware);
app.route('/api/logs', logsRoutes);

// ========== RATE LIMIT ADMIN ROUTES (ADMIN ONLY) ==========
app.use('/api/rate-limit/*', authMiddleware, adminMiddleware);
app.route('/api/rate-limit', rateLimitAdminRoutes);

// ========== WEBSOCKET ROUTES ==========
// Real-time updates via WebSocket (no auth middleware - handled in route)
app.route('/api', websocketRoutes);

// ========== CORE API ROUTES (unversioned, defaults to v2) ==========
// Core endpoints (nodes, edges, artworks, transactions, etc.)
app.route('/api', coreRoutes);

// ========== DASHBOARD ROUTES (PUBLIC) ==========
// Dashboard statistics and graph data
app.route('/api', dashboardRoutes);

// ========== FRONTEND ROUTES ==========
// TODO: Move HTML renderers to separate module

// Landing page
app.get('/', (c) => {
  return c.html(renderLandingPage());
});

// Auth page
app.get('/auth', (c) => {
  return c.html(renderAuthPage());
});

// Profile page
app.get('/profile', (c) => {
  return c.html(renderProfilePage());
});

// Analytics dashboard
app.get('/analytics', (c) => {
  return c.html(renderAnalyticsDashboard());
});

// Admin dashboard (protected with JWT + admin role)
app.get('/admin', authMiddleware, adminMiddleware, (c) => {
  return c.html(renderAdminDashboard());
});

// Metrics dashboard (protected with JWT + admin role)
app.get('/metrics', authMiddleware, adminMiddleware, (c) => {
  return c.html(renderMetricsDashboard());
});

// Role-specific dashboards
app.get('/dashboard/:role', (c) => {
  const role = c.req.param('role');
  return c.html(renderDashboard(role));
});

// ========== ERROR HANDLING (MUST BE LAST) ==========
app.use('*', errorLoggingMiddleware());

export default app;

// ========== HTML RENDERERS (TODO: Extract to separate module) ==========

function renderLandingPage() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Art Bank Core - Art-OS Platform</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen">
        <header class="bg-white shadow-sm">
            <div class="max-w-7xl mx-auto px-4 py-4">
                <h1 class="text-2xl font-bold text-gray-900">Art Bank Core v2.7</h1>
                <p class="text-sm text-gray-600">Production-Ready Art Banking Platform</p>
            </div>
        </header>
        
        <main class="max-w-7xl mx-auto px-4 py-8">
            <div class="text-center mb-12">
                <h2 class="text-4xl font-bold text-gray-900 mb-4">
                    Welcome to Art Bank Core
                </h2>
                <p class="text-xl text-gray-600">
                    Graph-based art ecosystem management platform
                </p>
            </div>
            
            <div class="grid md:grid-cols-3 gap-6 mb-12">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-semibold mb-2">🔒 Secure</h3>
                    <p class="text-gray-600">JWT authentication, rate limiting, RBAC</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-semibold mb-2">📚 Documented</h3>
                    <p class="text-gray-600">Interactive OpenAPI/Swagger docs</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-semibold mb-2">📊 Observable</h3>
                    <p class="text-gray-600">Structured logging, health checks</p>
                </div>
            </div>
            
            <div class="text-center space-x-4">
                <a href="/api/docs" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                    API Documentation
                </a>
                <a href="/auth" class="inline-block bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700">
                    Login
                </a>
            </div>
        </main>
    </div>
</body>
</html>`;
}

function renderAuthPage() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication - Art Bank Core</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen flex items-center justify-center px-4">
        <div class="max-w-md w-full bg-white p-8 rounded-lg shadow-lg">
            <h1 class="text-2xl font-bold text-center mb-6">Art Bank Core</h1>
            <div class="space-y-4">
                <button onclick="window.location.href='/api/docs'" 
                        class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                    View API Documentation
                </button>
                <button onclick="window.location.href='/'" 
                        class="w-full bg-gray-600 text-white py-2 rounded hover:bg-gray-700">
                    Back to Home
                </button>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function renderProfilePage() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile - Art Bank Core</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen p-8">
        <div class="max-w-4xl mx-auto">
            <h1 class="text-3xl font-bold mb-6">User Profile</h1>
            <p class="text-gray-600">Profile page (JWT protected)</p>
        </div>
    </div>
</body>
</html>`;
}

function renderDashboard(role: string) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${role} Dashboard - Art Bank Core</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen p-8">
        <div class="max-w-7xl mx-auto">
            <h1 class="text-3xl font-bold mb-6 capitalize">${role} Dashboard</h1>
            <p class="text-gray-600">Role-specific dashboard for ${role}</p>
        </div>
    </div>
</body>
</html>`;
}
