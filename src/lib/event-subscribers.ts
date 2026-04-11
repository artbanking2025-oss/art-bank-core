/**
 * Event Subscribers - Example implementations
 * 
 * Demonstrates how to use the event system with real-world scenarios
 */

import { eventSystem, Event } from '../lib/event-system';

/**
 * Initialize default event subscribers
 */
export function initializeEventSubscribers(): void {
  // Subscribe to artwork events
  setupArtworkSubscribers();
  
  // Subscribe to transaction events
  setupTransactionSubscribers();
  
  // Subscribe to user events
  setupUserSubscribers();
  
  // Subscribe to analytics events
  setupAnalyticsSubscribers();
}

/**
 * Artwork event subscribers
 */
function setupArtworkSubscribers(): void {
  // Log all artwork creations
  eventSystem.subscribe('artwork.created', async (event: Event) => {
    console.log(`📦 New artwork created:`, {
      eventId: event.id,
      timestamp: event.timestamp,
      data: event.data
    });
    
    // Here you could:
    // - Update search index
    // - Send notifications
    // - Update analytics
    // - Trigger ML model training
  }, {
    id: 'artwork-logger',
    consumerGroup: 'logging'
  });

  // Update analytics on artwork updates
  eventSystem.subscribe('artwork.updated', async (event: Event) => {
    console.log(`✏️ Artwork updated:`, {
      eventId: event.id,
      timestamp: event.timestamp,
      data: event.data
    });
    
    // Update analytics, search index, etc.
  }, {
    id: 'artwork-analytics',
    consumerGroup: 'analytics'
  });

  // Clean up on artwork deletion
  eventSystem.subscribe('artwork.deleted', async (event: Event) => {
    console.log(`🗑️ Artwork deleted:`, {
      eventId: event.id,
      timestamp: event.timestamp,
      data: event.data
    });
    
    // Remove from search index, clean up files, etc.
  }, {
    id: 'artwork-cleanup',
    consumerGroup: 'cleanup'
  });
}

/**
 * Transaction event subscribers
 */
function setupTransactionSubscribers(): void {
  // Log all transactions
  eventSystem.subscribe('transaction.created', async (event: Event) => {
    console.log(`💰 New transaction created:`, {
      eventId: event.id,
      timestamp: event.timestamp,
      data: event.data
    });
    
    // Here you could:
    // - Update balances
    // - Send email confirmations
    // - Update analytics
    // - Trigger fraud detection
  }, {
    id: 'transaction-logger',
    consumerGroup: 'logging'
  });

  // Fraud detection on transactions
  eventSystem.subscribe('transaction.created', async (event: Event) => {
    // Simulate fraud detection
    const amount = event.data.amount || 0;
    
    if (amount > 100000) {
      console.warn(`⚠️ High-value transaction detected:`, {
        eventId: event.id,
        amount,
        timestamp: event.timestamp
      });
      
      // Trigger fraud alert
      await eventSystem.publish('transaction.fraud-alert', {
        originalEvent: event.id,
        reason: 'High value transaction',
        amount,
        timestamp: new Date()
      });
    }
  }, {
    id: 'fraud-detector',
    consumerGroup: 'fraud-detection'
  });

  // Update transaction status
  eventSystem.subscribe('transaction.updated', async (event: Event) => {
    console.log(`🔄 Transaction updated:`, {
      eventId: event.id,
      timestamp: event.timestamp,
      data: event.data
    });
    
    // Update caches, notify users, etc.
  }, {
    id: 'transaction-updater',
    consumerGroup: 'updates'
  });
}

/**
 * User event subscribers
 */
function setupUserSubscribers(): void {
  // Welcome email on registration
  eventSystem.subscribe('user.registered', async (event: Event) => {
    console.log(`👤 New user registered:`, {
      eventId: event.id,
      timestamp: event.timestamp,
      data: event.data
    });
    
    // Here you could:
    // - Send welcome email
    // - Create user profile
    // - Initialize preferences
    // - Track signup analytics
  }, {
    id: 'user-onboarding',
    consumerGroup: 'onboarding'
  });

  // Track user logins
  eventSystem.subscribe('user.login', async (event: Event) => {
    console.log(`🔐 User logged in:`, {
      eventId: event.id,
      timestamp: event.timestamp,
      data: event.data
    });
    
    // Update last login time, track analytics, etc.
  }, {
    id: 'login-tracker',
    consumerGroup: 'analytics'
  });
}

/**
 * Analytics event subscribers
 */
function setupAnalyticsSubscribers(): void {
  // Aggregate analytics events
  const analyticsBuffer: Event[] = [];
  const BUFFER_SIZE = 100;
  const FLUSH_INTERVAL = 60000; // 1 minute

  eventSystem.subscribe('analytics.event', async (event: Event) => {
    analyticsBuffer.push(event);
    
    // Flush buffer when full
    if (analyticsBuffer.length >= BUFFER_SIZE) {
      await flushAnalyticsBuffer();
    }
  }, {
    id: 'analytics-aggregator',
    consumerGroup: 'analytics-processing'
  });

  // Periodic flush
  setInterval(async () => {
    if (analyticsBuffer.length > 0) {
      await flushAnalyticsBuffer();
    }
  }, FLUSH_INTERVAL);

  async function flushAnalyticsBuffer(): Promise<void> {
    const events = analyticsBuffer.splice(0, analyticsBuffer.length);
    
    console.log(`📊 Flushing ${events.length} analytics events to storage`);
    
    // Here you would:
    // - Write to analytics database
    // - Update dashboards
    // - Calculate metrics
    // - Trigger alerts
  }
}

/**
 * Example: Subscribe to multiple topics with a filter
 */
export function setupCustomSubscriber(
  topics: string[],
  handler: (event: Event) => Promise<void>,
  filter?: (event: Event) => boolean
): string[] {
  const subscriberIds: string[] = [];

  for (const topic of topics) {
    const id = eventSystem.subscribe(topic, handler, {
      filter
    });
    subscriberIds.push(id);
  }

  return subscriberIds;
}

/**
 * Example: Create a consumer group for load balancing
 */
export function setupConsumerGroup(
  topic: string,
  groupId: string,
  handlers: Array<(event: Event) => Promise<void>>
): string[] {
  const subscriberIds: string[] = [];

  for (const handler of handlers) {
    const id = eventSystem.subscribe(topic, handler, {
      consumerGroup: groupId
    });
    subscriberIds.push(id);
  }

  return subscriberIds;
}

/**
 * Example: Replay events from a specific time
 */
export async function replayEventsFromDate(
  subscriberId: string,
  fromDate: Date
): Promise<number> {
  return await eventSystem.replayEvents(subscriberId, {
    since: fromDate
  });
}

/**
 * Get subscriber statistics
 */
export function getSubscriberStats(): {
  totalSubscribers: number;
  subscribersByTopic: Record<string, number>;
} {
  const stats = eventSystem.getStats();
  
  return {
    totalSubscribers: stats.subscriberCount,
    subscribersByTopic: stats.eventsByTopic
  };
}
