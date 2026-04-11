/**
 * Event System - Event-driven architecture
 * 
 * Emulates Kafka-like event streaming using in-memory storage
 * In production, this would use Cloudflare Durable Objects or external Kafka
 * 
 * Features:
 * - Event publishing and subscription
 * - Event persistence (in-memory with fallback)
 * - Topic-based routing
 * - Consumer groups
 * - Event replay
 * - Dead letter queue
 */

export interface Event<T = any> {
  id: string;
  topic: string;
  key?: string; // Partition key
  data: T;
  timestamp: Date;
  headers?: Record<string, string>;
  metadata?: {
    producer?: string;
    correlationId?: string;
    causationId?: string;
  };
}

export interface EventSubscriber<T = any> {
  id: string;
  topic: string;
  consumerGroup?: string;
  handler: (event: Event<T>) => Promise<void>;
  errorHandler?: (event: Event<T>, error: Error) => Promise<void>;
  filter?: (event: Event<T>) => boolean;
}

export interface Topic {
  name: string;
  partitions: number;
  retentionMs: number; // How long to keep events
  replicationFactor: number;
}

export interface ConsumerGroup {
  id: string;
  topic: string;
  members: string[]; // Subscriber IDs
  offset: number; // Last processed event offset
}

export interface EventStats {
  totalEvents: number;
  eventsByTopic: Record<string, number>;
  subscriberCount: number;
  activeConsumerGroups: number;
  processingRate: number; // Events per second
  errorRate: number;
  deadLetterQueueSize: number;
}

export class EventSystem {
  private events: Map<string, Event[]> = new Map(); // topic -> events
  private subscribers: Map<string, EventSubscriber[]> = new Map(); // topic -> subscribers
  private consumerGroups: Map<string, ConsumerGroup> = new Map();
  private topics: Map<string, Topic> = new Map();
  private deadLetterQueue: Event[] = [];
  private maxEventsPerTopic: number = 10000;
  private maxDeadLetterSize: number = 1000;
  private processingCount: number = 0;
  private errorCount: number = 0;

  constructor() {
    this.initializeDefaultTopics();
    this.startCleanupTask();
  }

  /**
   * Initialize default topics
   */
  private initializeDefaultTopics(): void {
    this.createTopic({
      name: 'artwork.created',
      partitions: 3,
      retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      replicationFactor: 1
    });

    this.createTopic({
      name: 'artwork.updated',
      partitions: 3,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      replicationFactor: 1
    });

    this.createTopic({
      name: 'transaction.created',
      partitions: 5,
      retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      replicationFactor: 1
    });

    this.createTopic({
      name: 'user.registered',
      partitions: 2,
      retentionMs: 30 * 24 * 60 * 60 * 1000,
      replicationFactor: 1
    });

    this.createTopic({
      name: 'analytics.event',
      partitions: 10,
      retentionMs: 24 * 60 * 60 * 1000, // 1 day
      replicationFactor: 1
    });
  }

  /**
   * Create a topic
   */
  createTopic(topic: Topic): void {
    if (!this.topics.has(topic.name)) {
      this.topics.set(topic.name, topic);
      this.events.set(topic.name, []);
      this.subscribers.set(topic.name, []);
    }
  }

  /**
   * Publish an event
   */
  async publish<T = any>(
    topic: string,
    data: T,
    options?: {
      key?: string;
      headers?: Record<string, string>;
      metadata?: Event['metadata'];
    }
  ): Promise<string> {
    // Create event
    const event: Event<T> = {
      id: this.generateEventId(),
      topic,
      key: options?.key,
      data,
      timestamp: new Date(),
      headers: options?.headers,
      metadata: options?.metadata
    };

    // Ensure topic exists
    if (!this.topics.has(topic)) {
      this.createTopic({
        name: topic,
        partitions: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        replicationFactor: 1
      });
    }

    // Store event
    const topicEvents = this.events.get(topic) || [];
    topicEvents.push(event);

    // Enforce max events limit
    if (topicEvents.length > this.maxEventsPerTopic) {
      topicEvents.shift();
    }

    this.events.set(topic, topicEvents);

    // Publish to subscribers
    await this.notifySubscribers(event);

    return event.id;
  }

  /**
   * Subscribe to a topic
   */
  subscribe<T = any>(
    topic: string,
    handler: (event: Event<T>) => Promise<void>,
    options?: {
      id?: string;
      consumerGroup?: string;
      filter?: (event: Event<T>) => boolean;
      errorHandler?: (event: Event<T>, error: Error) => Promise<void>;
    }
  ): string {
    const subscriber: EventSubscriber<T> = {
      id: options?.id || this.generateSubscriberId(),
      topic,
      consumerGroup: options?.consumerGroup,
      handler,
      filter: options?.filter,
      errorHandler: options?.errorHandler
    };

    // Ensure topic exists
    if (!this.topics.has(topic)) {
      this.createTopic({
        name: topic,
        partitions: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        replicationFactor: 1
      });
    }

    // Add subscriber
    const topicSubscribers = this.subscribers.get(topic) || [];
    topicSubscribers.push(subscriber);
    this.subscribers.set(topic, topicSubscribers);

    // Register consumer group if needed
    if (options?.consumerGroup) {
      this.registerConsumerGroup(options.consumerGroup, topic, subscriber.id);
    }

    return subscriber.id;
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(subscriberId: string): boolean {
    for (const [topic, subscribers] of this.subscribers) {
      const index = subscribers.findIndex(s => s.id === subscriberId);
      if (index >= 0) {
        subscribers.splice(index, 1);
        this.subscribers.set(topic, subscribers);
        return true;
      }
    }
    return false;
  }

  /**
   * Notify subscribers about an event
   */
  private async notifySubscribers<T>(event: Event<T>): Promise<void> {
    const subscribers = this.subscribers.get(event.topic) || [];
    
    // Group subscribers by consumer group
    const groupedSubscribers = new Map<string | undefined, EventSubscriber<T>[]>();
    
    for (const subscriber of subscribers) {
      const group = subscriber.consumerGroup;
      const existing = groupedSubscribers.get(group) || [];
      existing.push(subscriber as EventSubscriber<T>);
      groupedSubscribers.set(group, existing);
    }

    // Process each group
    for (const [group, subs] of groupedSubscribers) {
      if (group) {
        // Consumer group: only one subscriber processes the event
        const subscriber = subs[0]; // Simple round-robin (can be improved)
        await this.processEvent(event, subscriber);
      } else {
        // No group: all subscribers process the event
        await Promise.allSettled(
          subs.map(subscriber => this.processEvent(event, subscriber))
        );
      }
    }
  }

  /**
   * Process event with a subscriber
   */
  private async processEvent<T>(event: Event<T>, subscriber: EventSubscriber<T>): Promise<void> {
    try {
      // Apply filter if exists
      if (subscriber.filter && !subscriber.filter(event)) {
        return;
      }

      this.processingCount++;
      await subscriber.handler(event);

    } catch (error) {
      this.errorCount++;

      // Try error handler
      if (subscriber.errorHandler) {
        try {
          await subscriber.errorHandler(event, error as Error);
        } catch (handlerError) {
          console.error('Error handler failed:', handlerError);
          this.moveToDeadLetterQueue(event);
        }
      } else {
        this.moveToDeadLetterQueue(event);
      }
    }
  }

  /**
   * Move event to dead letter queue
   */
  private moveToDeadLetterQueue<T>(event: Event<T>): void {
    this.deadLetterQueue.push(event as Event);
    
    // Enforce max size
    if (this.deadLetterQueue.length > this.maxDeadLetterSize) {
      this.deadLetterQueue.shift();
    }
  }

  /**
   * Register consumer group
   */
  private registerConsumerGroup(groupId: string, topic: string, memberId: string): void {
    const existing = this.consumerGroups.get(groupId);
    
    if (existing) {
      if (!existing.members.includes(memberId)) {
        existing.members.push(memberId);
      }
    } else {
      this.consumerGroups.set(groupId, {
        id: groupId,
        topic,
        members: [memberId],
        offset: 0
      });
    }
  }

  /**
   * Get events from topic (for replay)
   */
  getEvents(topic: string, options?: {
    offset?: number;
    limit?: number;
    since?: Date;
  }): Event[] {
    const topicEvents = this.events.get(topic) || [];
    let filtered = topicEvents;

    // Filter by timestamp if needed
    if (options?.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }

    // Apply offset and limit
    const offset = options?.offset || 0;
    const limit = options?.limit || filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Replay events to a subscriber
   */
  async replayEvents<T>(
    subscriberId: string,
    options?: {
      since?: Date;
      limit?: number;
    }
  ): Promise<number> {
    // Find subscriber
    let targetSubscriber: EventSubscriber<T> | null = null;
    let targetTopic: string | null = null;

    for (const [topic, subscribers] of this.subscribers) {
      const found = subscribers.find(s => s.id === subscriberId);
      if (found) {
        targetSubscriber = found as EventSubscriber<T>;
        targetTopic = topic;
        break;
      }
    }

    if (!targetSubscriber || !targetTopic) {
      throw new Error(`Subscriber not found: ${subscriberId}`);
    }

    // Get events to replay
    const events = this.getEvents(targetTopic, {
      since: options?.since,
      limit: options?.limit
    });

    // Replay events
    for (const event of events) {
      await this.processEvent(event as Event<T>, targetSubscriber);
    }

    return events.length;
  }

  /**
   * Get statistics
   */
  getStats(): EventStats {
    let totalEvents = 0;
    const eventsByTopic: Record<string, number> = {};

    for (const [topic, events] of this.events) {
      const count = events.length;
      totalEvents += count;
      eventsByTopic[topic] = count;
    }

    let subscriberCount = 0;
    for (const subscribers of this.subscribers.values()) {
      subscriberCount += subscribers.length;
    }

    return {
      totalEvents,
      eventsByTopic,
      subscriberCount,
      activeConsumerGroups: this.consumerGroups.size,
      processingRate: this.processingCount,
      errorRate: this.errorCount,
      deadLetterQueueSize: this.deadLetterQueue.length
    };
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(): Event[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry dead letter events
   */
  async retryDeadLetterQueue(): Promise<number> {
    const events = [...this.deadLetterQueue];
    this.deadLetterQueue = [];

    for (const event of events) {
      await this.notifySubscribers(event);
    }

    return events.length;
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    return count;
  }

  /**
   * Start cleanup task (remove old events)
   */
  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      this.cleanupOldEvents();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up old events based on retention policy
   */
  private cleanupOldEvents(): void {
    const now = Date.now();

    for (const [topicName, events] of this.events) {
      const topic = this.topics.get(topicName);
      if (!topic) continue;

      // Remove events older than retention period
      const filtered = events.filter(event => {
        const age = now - event.timestamp.getTime();
        return age < topic.retentionMs;
      });

      this.events.set(topicName, filtered);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Generate unique subscriber ID
   */
  private generateSubscriberId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get all topics
   */
  getTopics(): Topic[] {
    return Array.from(this.topics.values());
  }

  /**
   * Get consumer groups
   */
  getConsumerGroups(): ConsumerGroup[] {
    return Array.from(this.consumerGroups.values());
  }

  /**
   * Clear all events (use with caution)
   */
  clearAllEvents(): void {
    this.events.clear();
    for (const topic of this.topics.keys()) {
      this.events.set(topic, []);
    }
  }
}

// Singleton instance
export const eventSystem = new EventSystem();
