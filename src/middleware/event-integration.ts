/**
 * Event Integration Middleware
 * 
 * Automatically publishes events for specific API operations
 */

import { Context, Next } from 'hono';
import { eventSystem } from '../lib/event-system';

export interface EventIntegrationConfig {
  enableAutoPublish: boolean;
  topics: {
    artwork: boolean;
    transaction: boolean;
    user: boolean;
    analytics: boolean;
  };
}

// Global configuration
const config: EventIntegrationConfig = {
  enableAutoPublish: true,
  topics: {
    artwork: true,
    transaction: true,
    user: true,
    analytics: true
  }
};

/**
 * Event integration middleware
 * 
 * Intercepts responses and publishes events based on the operation
 */
export async function eventIntegrationMiddleware(c: Context, next: Next) {
  if (!config.enableAutoPublish) {
    return await next();
  }

  const path = c.req.path;
  const method = c.req.method;

  // Execute the handler
  await next();

  // Only publish events for successful operations (2xx status codes)
  if (c.res.status >= 200 && c.res.status < 300) {
    try {
      await publishEventForOperation(path, method, c);
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to publish event:', error);
    }
  }
}

/**
 * Publish event based on API operation
 */
async function publishEventForOperation(path: string, method: string, c: Context): Promise<void> {
  // Extract entity and operation from path
  const pathParts = path.split('/').filter(p => p.length > 0);
  
  // Artwork events
  if (config.topics.artwork && pathParts.includes('artworks')) {
    if (method === 'POST') {
      await eventSystem.publish('artwork.created', {
        path,
        timestamp: new Date(),
        user: (c.get('user') as any)?.user_id,
      }, {
        metadata: {
          producer: 'api-gateway',
          correlationId: c.get('correlationId')
        }
      });
    } else if (method === 'PUT' || method === 'PATCH') {
      await eventSystem.publish('artwork.updated', {
        path,
        timestamp: new Date(),
        user: (c.get('user') as any)?.user_id,
      }, {
        metadata: {
          producer: 'api-gateway',
          correlationId: c.get('correlationId')
        }
      });
    } else if (method === 'DELETE') {
      await eventSystem.publish('artwork.deleted', {
        path,
        timestamp: new Date(),
        user: (c.get('user') as any)?.user_id,
      }, {
        metadata: {
          producer: 'api-gateway',
          correlationId: c.get('correlationId')
        }
      });
    }
  }

  // Transaction events
  if (config.topics.transaction && pathParts.includes('transactions')) {
    if (method === 'POST') {
      await eventSystem.publish('transaction.created', {
        path,
        timestamp: new Date(),
        user: (c.get('user') as any)?.user_id,
      }, {
        metadata: {
          producer: 'api-gateway',
          correlationId: c.get('correlationId')
        }
      });
    } else if (method === 'PUT' || method === 'PATCH') {
      await eventSystem.publish('transaction.updated', {
        path,
        timestamp: new Date(),
        user: (c.get('user') as any)?.user_id,
      }, {
        metadata: {
          producer: 'api-gateway',
          correlationId: c.get('correlationId')
        }
      });
    }
  }

  // User events
  if (config.topics.user) {
    if (path.includes('/auth/register') && method === 'POST') {
      await eventSystem.publish('user.registered', {
        path,
        timestamp: new Date(),
      }, {
        metadata: {
          producer: 'api-gateway',
          correlationId: c.get('correlationId')
        }
      });
    } else if (path.includes('/auth/login') && method === 'POST') {
      await eventSystem.publish('user.login', {
        path,
        timestamp: new Date(),
      }, {
        metadata: {
          producer: 'api-gateway',
          correlationId: c.get('correlationId')
        }
      });
    }
  }

  // Analytics events (for all API calls)
  if (config.topics.analytics) {
    await eventSystem.publish('analytics.event', {
      path,
      method,
      timestamp: new Date(),
      status: c.res.status,
      user: (c.get('user') as any)?.user_id,
    }, {
      metadata: {
        producer: 'api-gateway',
        correlationId: c.get('correlationId')
      }
    });
  }
}

/**
 * Update event integration configuration
 */
export function updateEventIntegrationConfig(newConfig: Partial<EventIntegrationConfig>): void {
  Object.assign(config, newConfig);
}

/**
 * Get current event integration configuration
 */
export function getEventIntegrationConfig(): EventIntegrationConfig {
  return { ...config };
}
