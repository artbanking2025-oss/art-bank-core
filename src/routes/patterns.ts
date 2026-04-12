/**
 * Event Patterns Routes
 * 
 * Admin endpoints for Event Sourcing, CQRS, Saga, and Outbox patterns
 */

import { Hono } from 'hono';
import { eventSourcingManager } from '../lib/event-sourcing';
import { cqrs } from '../lib/cqrs';
import { sagaExecutor } from '../lib/saga';
import { outboxManager } from '../lib/outbox-pattern';

const app = new Hono();

// ========== EVENT SOURCING ENDPOINTS ==========

/**
 * GET /api/patterns/event-sourcing/stats
 * Get event sourcing statistics
 */
app.get('/event-sourcing/stats', async (c) => {
  const stats = await eventSourcingManager.getStats();
  
  return c.json({
    success: true,
    stats
  });
});

/**
 * GET /api/patterns/event-sourcing/events
 * Get all events from event store
 */
app.get('/event-sourcing/events', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  const since = c.req.query('since');
  
  const events = await eventSourcingManager.getAllEvents({
    since: since ? new Date(since) : undefined,
    limit
  });
  
  return c.json({
    success: true,
    count: events.length,
    events: events.map(e => ({
      id: e.id,
      aggregateId: e.aggregateId,
      aggregateType: e.aggregateType,
      eventType: e.eventType,
      version: e.version,
      timestamp: e.timestamp,
      data: e.data,
      metadata: e.metadata
    }))
  });
});

// ========== CQRS ENDPOINTS ==========

/**
 * GET /api/patterns/cqrs/stats
 * Get CQRS statistics
 */
app.get('/cqrs/stats', (c) => {
  const stats = cqrs.getStats();
  
  return c.json({
    success: true,
    stats
  });
});

/**
 * POST /api/patterns/cqrs/command
 * Execute a command
 */
app.post('/cqrs/command', async (c) => {
  const body = await c.req.json();
  
  const { type, aggregateId, aggregateType, data, metadata } = body;
  
  if (!type || !aggregateId || !aggregateType) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required fields: type, aggregateId, aggregateType'
    }, 400);
  }
  
  const result = await cqrs.command({
    id: `cmd-${Date.now()}`,
    type,
    aggregateId,
    aggregateType,
    data,
    metadata
  });
  
  return c.json({
    success: result.success,
    result
  });
});

/**
 * POST /api/patterns/cqrs/query
 * Execute a query
 */
app.post('/cqrs/query', async (c) => {
  const body = await c.req.json();
  
  const { type, params, metadata } = body;
  
  if (!type) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required field: type'
    }, 400);
  }
  
  const result = await cqrs.query({
    id: `qry-${Date.now()}`,
    type,
    params,
    metadata
  });
  
  return c.json({
    success: result.success,
    result
  });
});

/**
 * POST /api/patterns/cqrs/rebuild-projections
 * Rebuild all projections from event store
 */
app.post('/cqrs/rebuild-projections', async (c) => {
  await cqrs.rebuildProjections();
  
  return c.json({
    success: true,
    message: 'Projections rebuilt successfully'
  });
});

// ========== SAGA ENDPOINTS ==========

/**
 * GET /api/patterns/saga/stats
 * Get saga statistics
 */
app.get('/saga/stats', (c) => {
  const stats = sagaExecutor.getStats();
  
  return c.json({
    success: true,
    stats
  });
});

/**
 * POST /api/patterns/saga/start
 * Start a saga
 */
app.post('/saga/start', async (c) => {
  const body = await c.req.json();
  
  const { definition, data, metadata } = body;
  
  if (!definition || !data) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required fields: definition, data'
    }, 400);
  }
  
  try {
    const sagaId = await sagaExecutor.start(definition, data, metadata);
    
    return c.json({
      success: true,
      message: 'Saga started successfully',
      sagaId
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Saga Start Failed',
      message: (error as Error).message
    }, 400);
  }
});

/**
 * GET /api/patterns/saga/instances
 * Get all saga instances
 */
app.get('/saga/instances', (c) => {
  const instances = sagaExecutor.getAllInstances();
  
  return c.json({
    success: true,
    count: instances.length,
    instances: instances.map(i => ({
      id: i.id,
      definition: i.definition,
      status: i.status,
      currentStep: i.currentStep,
      startedAt: i.startedAt,
      completedAt: i.completedAt,
      error: i.error
    }))
  });
});

/**
 * GET /api/patterns/saga/instances/:id
 * Get saga instance by ID
 */
app.get('/saga/instances/:id', (c) => {
  const id = c.req.param('id');
  const instance = sagaExecutor.getInstance(id);
  
  if (!instance) {
    return c.json({
      success: false,
      error: 'Not Found',
      message: `Saga instance not found: ${id}`
    }, 404);
  }
  
  return c.json({
    success: true,
    instance: {
      id: instance.id,
      definition: instance.definition,
      status: instance.status,
      currentStep: instance.currentStep,
      context: instance.context,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      error: instance.error
    }
  });
});

// ========== OUTBOX ENDPOINTS ==========

/**
 * GET /api/patterns/outbox/stats
 * Get outbox statistics
 */
app.get('/outbox/stats', (c) => {
  const stats = outboxManager.getStats();
  
  return c.json({
    success: true,
    stats
  });
});

/**
 * POST /api/patterns/outbox/publish
 * Publish event via outbox
 */
app.post('/outbox/publish', async (c) => {
  const body = await c.req.json();
  
  const { topic, data, key, headers, metadata } = body;
  
  if (!topic || !data) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required fields: topic, data'
    }, 400);
  }
  
  const eventId = await outboxManager.publish(topic, data, {
    key,
    headers,
    metadata
  });
  
  return c.json({
    success: true,
    message: 'Event added to outbox',
    eventId
  });
});

/**
 * GET /api/patterns/outbox/pending
 * Get pending events in outbox
 */
app.get('/outbox/pending', (c) => {
  const events = outboxManager.getPending();
  
  return c.json({
    success: true,
    count: events.length,
    events
  });
});

/**
 * GET /api/patterns/outbox/failed
 * Get failed events in outbox
 */
app.get('/outbox/failed', (c) => {
  const events = outboxManager.getFailed();
  
  return c.json({
    success: true,
    count: events.length,
    events
  });
});

/**
 * POST /api/patterns/outbox/retry/:id
 * Retry a failed outbox event
 */
app.post('/outbox/retry/:id', async (c) => {
  const id = c.req.param('id');
  
  const success = await outboxManager.retry(id);
  
  if (!success) {
    return c.json({
      success: false,
      error: 'Not Found',
      message: `Failed event not found: ${id}`
    }, 404);
  }
  
  return c.json({
    success: true,
    message: 'Event retry initiated',
    eventId: id
  });
});

/**
 * POST /api/patterns/outbox/retry-all
 * Retry all failed outbox events
 */
app.post('/outbox/retry-all', async (c) => {
  const count = await outboxManager.retryAll();
  
  return c.json({
    success: true,
    message: 'Retry initiated for all failed events',
    retriedEvents: count
  });
});

export default app;
