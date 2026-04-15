/**
 * Outbox Pattern - Reliable Event Publishing
 * 
 * Ensures events are published reliably by storing them in an outbox
 * before publishing. This prevents event loss if publishing fails.
 * 
 * Flow:
 * 1. Save event to outbox (in same transaction as business operation)
 * 2. Background process publishes events from outbox
 * 3. Mark events as published
 * 4. Clean up old published events
 */

import { eventSystem } from './event-system';

export interface OutboxEvent {
  id: string;
  topic: string;
  data: any;
  key?: string;
  headers?: Record<string, string>;
  metadata?: {
    correlationId?: string;
    causationId?: string;
    aggregateId?: string;
    aggregateType?: string;
  };
  status: 'pending' | 'published' | 'failed';
  createdAt: Date;
  publishedAt?: Date;
  attempts: number;
  lastAttemptAt?: Date;
  error?: string;
}

export class Outbox {
  private events: Map<string, OutboxEvent> = new Map();
  private publishInterval: number = 1000; // 1 second
  private maxRetries: number = 5;
  private retryDelay: number = 5000; // 5 seconds
  private cleanupInterval: number = 60000; // 1 minute
  private retentionMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private publisherRunning: boolean = false;

  constructor() {
    this.startPublisher();
    this.startCleanup();
  }

  /**
   * Add event to outbox
   */
  async add(event: Omit<OutboxEvent, 'id' | 'status' | 'createdAt' | 'attempts'>): Promise<string> {
    const outboxEvent: OutboxEvent = {
      id: this.generateEventId(),
      ...event,
      status: 'pending',
      createdAt: new Date(),
      attempts: 0
    };

    this.events.set(outboxEvent.id, outboxEvent);

    return outboxEvent.id;
  }

  /**
   * Get event by ID
   */
  get(id: string): OutboxEvent | null {
    return this.events.get(id) || null;
  }

  /**
   * Get pending events
   */
  getPending(): OutboxEvent[] {
    return Array.from(this.events.values()).filter(e => e.status === 'pending');
  }

  /**
   * Get failed events
   */
  getFailed(): OutboxEvent[] {
    return Array.from(this.events.values()).filter(e => e.status === 'failed');
  }

  /**
   * Get all events
   */
  getAll(): OutboxEvent[] {
    return Array.from(this.events.values());
  }

  /**
   * Start background publisher
   */
  private startPublisher(): void {
    // DISABLED для Cloudflare Workers
    // setTimeout() нельзя использовать в global scope
    console.log('⚠️  Background publisher disabled in Cloudflare Workers');
    console.log('📝 Call publishPendingEvents() manually or use Cloudflare Cron Triggers');
    this.publisherRunning = false;
  }

  /**
   * Publish pending events manually (for Cloudflare Workers)
   */
  async publishPendingEvents(): Promise<number> {
    const pending = this.getPending();
    let published = 0;

    for (const event of pending) {
      // Skip if recently attempted
      if (event.lastAttemptAt) {
        const timeSinceLastAttempt = Date.now() - event.lastAttemptAt.getTime();
        if (timeSinceLastAttempt < this.retryDelay) {
          continue;
        }
      }

      // Skip if max retries reached
      if (event.attempts >= this.maxRetries) {
        event.status = 'failed';
        event.error = 'Max retries reached';
        continue;
      }

      try {
        // Attempt to publish
        await eventSystem.publish(event.topic, event.data, {
          key: event.key,
          headers: event.headers,
          metadata: event.metadata
        });

        // Mark as published
        event.status = 'published';
        event.publishedAt = new Date();
        published++;

        console.log(`[Outbox] Published event ${event.id} to topic ${event.topic}`);

      } catch (error) {
        // Update attempt info
        event.attempts++;
        event.lastAttemptAt = new Date();
        event.error = (error as Error).message;

        console.error(`[Outbox] Failed to publish event ${event.id} (attempt ${event.attempts}):`, error);
      }
    }

    return published;
  }

  /**
   * Stop background publisher
   */
  stopPublisher(): void {
    this.publisherRunning = false;
  }

  /**
   * Start cleanup process
   * Note: В Cloudflare Workers используйте ручной вызов cleanup() или Cron Triggers
   */
  private startCleanup(): void {
    // DISABLED для Cloudflare Workers
    console.log('⚠️  Automatic cleanup disabled - call cleanup() manually');
  }

  /**
   * Clean up old published events
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, event] of this.events) {
      if (event.status === 'published' && event.publishedAt) {
        const age = now - event.publishedAt.getTime();
        
        if (age > this.retentionMs) {
          this.events.delete(id);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[Outbox] Cleaned up ${cleaned} old events`);
    }
  }

  /**
   * Retry failed event
   */
  async retry(eventId: string): Promise<boolean> {
    const event = this.events.get(eventId);
    
    if (!event || event.status !== 'failed') {
      return false;
    }

    // Reset status and retry
    event.status = 'pending';
    event.attempts = 0;
    event.error = undefined;

    return true;
  }

  /**
   * Retry all failed events
   */
  async retryAll(): Promise<number> {
    const failed = this.getFailed();
    let retried = 0;

    for (const event of failed) {
      const success = await this.retry(event.id);
      if (success) {
        retried++;
      }
    }

    return retried;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    pending: number;
    published: number;
    failed: number;
    oldestPending?: Date;
    newestPublished?: Date;
  } {
    const pending = this.getPending();
    const published = this.getAll().filter(e => e.status === 'published');
    const failed = this.getFailed();

    const oldestPending = pending.length > 0
      ? new Date(Math.min(...pending.map(e => e.createdAt.getTime())))
      : undefined;

    const newestPublished = published.length > 0
      ? new Date(Math.max(...published.map(e => e.publishedAt!.getTime())))
      : undefined;

    return {
      total: this.events.size,
      pending: pending.length,
      published: published.length,
      failed: failed.length,
      oldestPending,
      newestPublished
    };
  }

  /**
   * Clear all events (use with caution)
   */
  clear(): void {
    this.events.clear();
  }

  private generateEventId(): string {
    return `outbox-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Outbox Manager - High-level API for outbox pattern
 */
export class OutboxManager {
  private outbox: Outbox;

  constructor() {
    this.outbox = new Outbox();
  }

  /**
   * Publish event reliably (via outbox)
   */
  async publish(
    topic: string,
    data: any,
    options?: {
      key?: string;
      headers?: Record<string, string>;
      metadata?: OutboxEvent['metadata'];
    }
  ): Promise<string> {
    return await this.outbox.add({
      topic,
      data,
      key: options?.key,
      headers: options?.headers,
      metadata: options?.metadata
    });
  }

  /**
   * Publish multiple events as a batch
   */
  async publishBatch(
    events: Array<{
      topic: string;
      data: any;
      key?: string;
      headers?: Record<string, string>;
      metadata?: OutboxEvent['metadata'];
    }>
  ): Promise<string[]> {
    const ids: string[] = [];

    for (const event of events) {
      const id = await this.publish(event.topic, event.data, {
        key: event.key,
        headers: event.headers,
        metadata: event.metadata
      });
      ids.push(id);
    }

    return ids;
  }

  /**
   * Get outbox statistics
   */
  getStats() {
    return this.outbox.getStats();
  }

  /**
   * Get pending events
   */
  getPending(): OutboxEvent[] {
    return this.outbox.getPending();
  }

  /**
   * Get failed events
   */
  getFailed(): OutboxEvent[] {
    return this.outbox.getFailed();
  }

  /**
   * Retry failed event
   */
  async retry(eventId: string): Promise<boolean> {
    return await this.outbox.retry(eventId);
  }

  /**
   * Retry all failed events
   */
  async retryAll(): Promise<number> {
    return await this.outbox.retryAll();
  }

  /**
   * Stop outbox publisher
   */
  stop(): void {
    this.outbox.stopPublisher();
  }
}

// Singleton instance
export const outboxManager = new OutboxManager();
