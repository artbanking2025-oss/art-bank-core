/**
 * OpenAPI Routes Configuration
 * 
 * Defines all API routes with OpenAPI schema annotations
 */

import { createRoute, z } from '@hono/zod-openapi'

/**
 * Authentication Routes
 */
export const authRoutes = {
  register: createRoute({
    method: 'post',
    path: '/api/auth/register',
    tags: ['Authentication'],
    summary: 'Register new user',
    description: 'Create a new user account with email and password',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email().openapi({ example: 'user@example.com' }),
              password: z.string().min(8).openapi({ example: 'SecurePass123!' }),
              name: z.string().openapi({ example: 'John Doe' }),
              role: z.enum(['artist', 'collector', 'gallery', 'bank', 'expert']).openapi({ example: 'collector' })
            })
          }
        }
      }
    },
    responses: {
      200: {
        description: 'User registered successfully',
        content: {
          'application/json': {
            schema: z.object({
              user: z.object({
                id: z.string(),
                email: z.string(),
                name: z.string(),
                role: z.string()
              }),
              accessToken: z.string(),
              refreshToken: z.string()
            })
          }
        }
      },
      400: {
        description: 'Invalid request or user already exists'
      },
      429: {
        description: 'Rate limit exceeded (10 req/min)'
      }
    }
  }),

  login: createRoute({
    method: 'post',
    path: '/api/auth/login',
    tags: ['Authentication'],
    summary: 'User login',
    description: 'Authenticate user and receive JWT tokens',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email().openapi({ example: 'user@example.com' }),
              password: z.string().openapi({ example: 'SecurePass123!' })
            })
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Login successful',
        content: {
          'application/json': {
            schema: z.object({
              accessToken: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
              refreshToken: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
              expiresIn: z.number().openapi({ example: 86400 })
            })
          }
        }
      },
      401: {
        description: 'Invalid credentials'
      },
      429: {
        description: 'Rate limit exceeded'
      }
    }
  }),

  refresh: createRoute({
    method: 'post',
    path: '/api/auth/refresh',
    tags: ['Authentication'],
    summary: 'Refresh access token',
    description: 'Get new access token using refresh token',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              refreshToken: z.string()
            })
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Token refreshed',
        content: {
          'application/json': {
            schema: z.object({
              accessToken: z.string(),
              expiresIn: z.number()
            })
          }
        }
      },
      401: {
        description: 'Invalid or expired refresh token'
      }
    }
  })
}

/**
 * Node Routes
 */
export const nodeRoutes = {
  list: createRoute({
    method: 'get',
    path: '/api/nodes',
    tags: ['Nodes'],
    summary: 'List all nodes',
    description: 'Get list of all graph nodes (artists, collectors, galleries, banks, experts)',
    request: {
      query: z.object({
        type: z.enum(['artist', 'collector', 'gallery', 'bank', 'expert', 'artwork']).optional(),
        limit: z.string().optional(),
        offset: z.string().optional()
      })
    },
    responses: {
      200: {
        description: 'List of nodes',
        content: {
          'application/json': {
            schema: z.object({
              nodes: z.array(z.object({
                id: z.string(),
                node_type: z.string(),
                name: z.string(),
                trust_level: z.number(),
                status: z.string(),
                created_at: z.string(),
                metadata: z.string().optional()
              })),
              total: z.number()
            })
          }
        }
      },
      429: {
        description: 'Rate limit exceeded'
      }
    }
  }),

  create: createRoute({
    method: 'post',
    path: '/api/nodes',
    tags: ['Nodes'],
    summary: 'Create new node',
    description: 'Create a new graph node (requires JWT authentication)',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              node_type: z.enum(['artist', 'collector', 'gallery', 'bank', 'expert', 'artwork']),
              name: z.string(),
              jurisdiction: z.string().optional(),
              metadata: z.record(z.any()).optional()
            })
          }
        }
      }
    },
    responses: {
      201: {
        description: 'Node created successfully',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              node_type: z.string(),
              name: z.string(),
              trust_level: z.number(),
              created_at: z.string()
            })
          }
        }
      },
      401: {
        description: 'Authentication required'
      },
      403: {
        description: 'Insufficient permissions'
      }
    }
  }),

  get: createRoute({
    method: 'get',
    path: '/api/nodes/{id}',
    tags: ['Nodes'],
    summary: 'Get node by ID',
    description: 'Retrieve detailed information about a specific node',
    request: {
      params: z.object({
        id: z.string()
      })
    },
    responses: {
      200: {
        description: 'Node details',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              node_type: z.string(),
              name: z.string(),
              trust_level: z.number(),
              status: z.string(),
              created_at: z.string(),
              updated_at: z.string(),
              metadata: z.string().optional()
            })
          }
        }
      },
      404: {
        description: 'Node not found'
      }
    }
  })
}

/**
 * Health Check Routes
 */
export const healthRoutes = {
  full: createRoute({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'Full health check',
    description: 'Comprehensive health check with detailed diagnostics',
    responses: {
      200: {
        description: 'System healthy',
        content: {
          'application/json': {
            schema: z.object({
              status: z.enum(['healthy', 'degraded', 'unhealthy']),
              timestamp: z.string(),
              uptime: z.number(),
              version: z.string(),
              checks: z.object({
                database: z.object({
                  status: z.enum(['pass', 'fail', 'warn']),
                  responseTime: z.number().optional(),
                  message: z.string().optional()
                }),
                circuitBreakers: z.object({
                  status: z.enum(['pass', 'fail', 'warn']),
                  message: z.string().optional()
                }),
                rateLimit: z.object({
                  status: z.enum(['pass', 'fail', 'warn']),
                  message: z.string().optional()
                }),
                memory: z.object({
                  status: z.enum(['pass', 'fail', 'warn']),
                  platform: z.string().optional(),
                  limit: z.string().optional()
                })
              }),
              metadata: z.object({
                environment: z.string(),
                region: z.string()
              })
            })
          }
        }
      },
      503: {
        description: 'System unhealthy'
      }
    }
  }),

  liveness: createRoute({
    method: 'get',
    path: '/healthz',
    tags: ['Health'],
    summary: 'Liveness probe',
    description: 'Quick liveness check for orchestration systems',
    responses: {
      200: {
        description: 'Service is alive',
        content: {
          'application/json': {
            schema: z.object({
              alive: z.boolean()
            })
          }
        }
      }
    }
  }),

  readiness: createRoute({
    method: 'get',
    path: '/readyz',
    tags: ['Health'],
    summary: 'Readiness probe',
    description: 'Check if service is ready to accept traffic',
    responses: {
      200: {
        description: 'Service is ready',
        content: {
          'application/json': {
            schema: z.object({
              ready: z.boolean()
            })
          }
        }
      },
      503: {
        description: 'Service not ready'
      }
    }
  })
}

/**
 * Dashboard Routes
 */
export const dashboardRoutes = {
  stats: createRoute({
    method: 'get',
    path: '/api/dashboard/stats',
    tags: ['Dashboard'],
    summary: 'Dashboard statistics',
    description: 'Get aggregated statistics for dashboard (cached 1 min)',
    responses: {
      200: {
        description: 'Dashboard stats',
        content: {
          'application/json': {
            schema: z.object({
              nodes: z.object({
                total: z.number(),
                byType: z.record(z.number())
              }),
              edges: z.object({
                total: z.number(),
                byType: z.record(z.number())
              }),
              artworks: z.object({
                total: z.number(),
                totalValue: z.number()
              }),
              transactions: z.object({
                total: z.number(),
                volume: z.number()
              })
            })
          }
        }
      }
    }
  }),

  graph: createRoute({
    method: 'get',
    path: '/api/dashboard/graph',
    tags: ['Dashboard'],
    summary: 'Graph visualization data',
    description: 'Get graph data for visualization (cached 1 min)',
    responses: {
      200: {
        description: 'Graph data',
        content: {
          'application/json': {
            schema: z.object({
              nodes: z.array(z.any()),
              edges: z.array(z.any())
            })
          }
        }
      }
    }
  })
}

/**
 * Export all routes
 */
export const openAPIRoutes = {
  auth: authRoutes,
  node: nodeRoutes,
  health: healthRoutes,
  dashboard: dashboardRoutes
}
