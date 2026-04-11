/**
 * Event System Routes
 * 
 * Admin endpoints for managing the event system
 */

import { Hono } from 'hono';
import { eventSystem } from '../lib/event-system';

const app = new Hono();

/**
 * GET /api/events/stats
 * Get event system statistics
 */
app.get('/stats', (c) => {
  const stats = eventSystem.getStats();
  
  return c.json({
    success: true,
    stats
  });
});

/**
 * GET /api/events/topics
 * Get all topics
 */
app.get('/topics', (c) => {
  const topics = eventSystem.getTopics();
  
  return c.json({
    success: true,
    count: topics.length,
    topics
  });
});

/**
 * POST /api/events/topics
 * Create a new topic
 */
app.post('/topics', async (c) => {
  const body = await c.req.json();
  
  const {
    name,
    partitions = 3,
    retentionMs = 7 * 24 * 60 * 60 * 1000, // 7 days
    replicationFactor = 1
  } = body;
  
  if (!name) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required field: name'
    }, 400);
  }
  
  eventSystem.createTopic({
    name,
    partitions,
    retentionMs,
    replicationFactor
  });
  
  return c.json({
    success: true,
    message: 'Topic created successfully',
    topic: { name, partitions, retentionMs, replicationFactor }
  });
});

/**
 * GET /api/events/topics/:topic
 * Get events from a topic
 */
app.get('/topics/:topic', (c) => {
  const topic = c.req.param('topic');
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');
  
  const events = eventSystem.getEvents(topic, { offset, limit });
  
  return c.json({
    success: true,
    topic,
    count: events.length,
    offset,
    limit,
    events: events.map(e => ({
      id: e.id,
      key: e.key,
      data: e.data,
      timestamp: e.timestamp,
      headers: e.headers,
      metadata: e.metadata
    }))
  });
});

/**
 * POST /api/events/publish
 * Publish an event
 */
app.post('/publish', async (c) => {
  const body = await c.req.json();
  
  const { topic, data, key, headers, metadata } = body;
  
  if (!topic || !data) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required fields: topic, data'
    }, 400);
  }
  
  const eventId = await eventSystem.publish(topic, data, {
    key,
    headers,
    metadata
  });
  
  return c.json({
    success: true,
    message: 'Event published successfully',
    eventId,
    topic
  });
});

/**
 * POST /api/events/subscribe
 * Subscribe to a topic (webhook-style)
 */
app.post('/subscribe', async (c) => {
  const body = await c.req.json();
  
  const { topic, webhookUrl, consumerGroup, filter } = body;
  
  if (!topic || !webhookUrl) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required fields: topic, webhookUrl'
    }, 400);
  }
  
  // Create webhook handler
  const handler = async (event: any) => {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Id': event.id,
          'X-Event-Topic': event.topic,
          'X-Event-Timestamp': event.timestamp.toISOString()
        },
        body: JSON.stringify(event)
      });
    } catch (error) {
      console.error('Webhook delivery failed:', error);
      throw error;
    }
  };
  
  const subscriberId = eventSystem.subscribe(topic, handler, {
    consumerGroup,
    filter: filter ? (event: any) => {
      // Simple filter evaluation (can be extended)
      try {
        return eval(filter)(event);
      } catch {
        return true;
      }
    } : undefined
  });
  
  return c.json({
    success: true,
    message: 'Subscription created successfully',
    subscriberId,
    topic,
    webhookUrl
  });
});

/**
 * DELETE /api/events/subscribe/:id
 * Unsubscribe from a topic
 */
app.delete('/subscribe/:id', (c) => {
  const subscriberId = c.req.param('id');
  
  const success = eventSystem.unsubscribe(subscriberId);
  
  if (!success) {
    return c.json({
      success: false,
      error: 'Not Found',
      message: `Subscriber not found: ${subscriberId}`
    }, 404);
  }
  
  return c.json({
    success: true,
    message: 'Unsubscribed successfully',
    subscriberId
  });
});

/**
 * GET /api/events/consumer-groups
 * Get all consumer groups
 */
app.get('/consumer-groups', (c) => {
  const groups = eventSystem.getConsumerGroups();
  
  return c.json({
    success: true,
    count: groups.length,
    consumerGroups: groups
  });
});

/**
 * GET /api/events/dead-letter-queue
 * Get dead letter queue
 */
app.get('/dead-letter-queue', (c) => {
  const events = eventSystem.getDeadLetterQueue();
  
  return c.json({
    success: true,
    count: events.length,
    events: events.map(e => ({
      id: e.id,
      topic: e.topic,
      key: e.key,
      data: e.data,
      timestamp: e.timestamp,
      headers: e.headers,
      metadata: e.metadata
    }))
  });
});

/**
 * POST /api/events/dead-letter-queue/retry
 * Retry all events in dead letter queue
 */
app.post('/dead-letter-queue/retry', async (c) => {
  const count = await eventSystem.retryDeadLetterQueue();
  
  return c.json({
    success: true,
    message: 'Dead letter queue retry initiated',
    retriedEvents: count
  });
});

/**
 * DELETE /api/events/dead-letter-queue
 * Clear dead letter queue
 */
app.delete('/dead-letter-queue', (c) => {
  const count = eventSystem.clearDeadLetterQueue();
  
  return c.json({
    success: true,
    message: 'Dead letter queue cleared',
    clearedEvents: count
  });
});

/**
 * POST /api/events/replay
 * Replay events to a subscriber
 */
app.post('/replay', async (c) => {
  const body = await c.req.json();
  
  const { subscriberId, since, limit } = body;
  
  if (!subscriberId) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required field: subscriberId'
    }, 400);
  }
  
  try {
    const count = await eventSystem.replayEvents(subscriberId, {
      since: since ? new Date(since) : undefined,
      limit
    });
    
    return c.json({
      success: true,
      message: 'Event replay completed',
      replayedEvents: count
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Replay Failed',
      message: (error as Error).message
    }, 400);
  }
});

/**
 * DELETE /api/events/clear
 * Clear all events (use with caution)
 */
app.delete('/clear', (c) => {
  eventSystem.clearAllEvents();
  
  return c.json({
    success: true,
    message: 'All events cleared'
  });
});

export default app;
