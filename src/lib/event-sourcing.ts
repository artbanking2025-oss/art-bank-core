/**
 * Event Sourcing Store
 * 
 * Stores all state changes as a sequence of events.
 * Current state is derived by replaying all events.
 * 
 * Key Concepts:
 * - Events are immutable and append-only
 * - State is rebuilt by replaying events
 * - Full audit trail of all changes
 * - Time-travel queries (state at any point in time)
 * - Event versioning support
 */

export interface DomainEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  version: number;
  timestamp: Date;
  data: any;
  metadata?: {
    userId?: string;
    correlationId?: string;
    causationId?: string;
    ip?: string;
    userAgent?: string;
  };
}

export interface Aggregate {
  id: string;
  type: string;
  version: number;
  state: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface Snapshot {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: any;
  timestamp: Date;
}

export interface EventStore {
  append(event: DomainEvent): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getEventsByType(aggregateType: string, limit?: number): Promise<DomainEvent[]>;
  getAllEvents(options?: { since?: Date; limit?: number }): Promise<DomainEvent[]>;
  createSnapshot(snapshot: Snapshot): Promise<void>;
  getLatestSnapshot(aggregateId: string): Promise<Snapshot | null>;
}

export class InMemoryEventStore implements EventStore {
  private events: Map<string, DomainEvent[]> = new Map(); // aggregateId -> events
  private eventsByType: Map<string, DomainEvent[]> = new Map(); // aggregateType -> events
  private snapshots: Map<string, Snapshot> = new Map(); // aggregateId -> latest snapshot
  private allEvents: DomainEvent[] = [];

  async append(event: DomainEvent): Promise<void> {
    // Append to aggregate events
    const aggregateEvents = this.events.get(event.aggregateId) || [];
    aggregateEvents.push(event);
    this.events.set(event.aggregateId, aggregateEvents);

    // Append to type-based index
    const typeEvents = this.eventsByType.get(event.aggregateType) || [];
    typeEvents.push(event);
    this.eventsByType.set(event.aggregateType, typeEvents);

    // Append to global events
    this.allEvents.push(event);
  }

  async getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]> {
    const events = this.events.get(aggregateId) || [];
    
    if (fromVersion !== undefined) {
      return events.filter(e => e.version >= fromVersion);
    }
    
    return events;
  }

  async getEventsByType(aggregateType: string, limit?: number): Promise<DomainEvent[]> {
    const events = this.eventsByType.get(aggregateType) || [];
    
    if (limit) {
      return events.slice(-limit);
    }
    
    return events;
  }

  async getAllEvents(options?: { since?: Date; limit?: number }): Promise<DomainEvent[]> {
    let filtered = this.allEvents;

    if (options?.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  async createSnapshot(snapshot: Snapshot): Promise<void> {
    this.snapshots.set(snapshot.aggregateId, snapshot);
  }

  async getLatestSnapshot(aggregateId: string): Promise<Snapshot | null> {
    return this.snapshots.get(aggregateId) || null;
  }
}

/**
 * Event Sourced Repository
 * 
 * Manages aggregates using event sourcing
 */
export class EventSourcedRepository<T extends Aggregate> {
  constructor(
    private eventStore: EventStore,
    private aggregateType: string,
    private applyEvent: (state: any, event: DomainEvent) => any,
    private snapshotInterval: number = 10 // Take snapshot every N events
  ) {}

  /**
   * Get aggregate by ID
   */
  async getById(id: string): Promise<T | null> {
    // Try to load from snapshot first
    const snapshot = await this.eventStore.getLatestSnapshot(id);
    
    let state: any = null;
    let version = 0;

    if (snapshot) {
      state = snapshot.state;
      version = snapshot.version;
    }

    // Load events after snapshot
    const events = await this.eventStore.getEvents(id, version + 1);
    
    if (events.length === 0 && !snapshot) {
      return null; // Aggregate doesn't exist
    }

    // Rebuild state by applying events
    for (const event of events) {
      state = this.applyEvent(state, event);
      version = event.version;
    }

    if (!state) {
      return null;
    }

    return {
      id,
      type: this.aggregateType,
      version,
      state,
      createdAt: snapshot?.timestamp || events[0]?.timestamp || new Date(),
      updatedAt: events[events.length - 1]?.timestamp || new Date()
    } as T;
  }

  /**
   * Save aggregate (by appending events)
   */
  async save(aggregateId: string, events: Omit<DomainEvent, 'id' | 'timestamp'>[]): Promise<void> {
    // Get current version
    const current = await this.getById(aggregateId);
    let version = current?.version || 0;

    // Append events
    for (const eventData of events) {
      version++;
      
      const event: DomainEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        ...eventData,
        version
      };

      await this.eventStore.append(event);
    }

    // Create snapshot if needed
    if (version % this.snapshotInterval === 0) {
      const aggregate = await this.getById(aggregateId);
      if (aggregate) {
        await this.eventStore.createSnapshot({
          aggregateId,
          aggregateType: this.aggregateType,
          version: aggregate.version,
          state: aggregate.state,
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Get all aggregates of this type
   */
  async getAll(limit?: number): Promise<T[]> {
    const events = await this.eventStore.getEventsByType(this.aggregateType, limit);
    
    // Group events by aggregate ID
    const eventsByAggregate = new Map<string, DomainEvent[]>();
    
    for (const event of events) {
      const existing = eventsByAggregate.get(event.aggregateId) || [];
      existing.push(event);
      eventsByAggregate.set(event.aggregateId, existing);
    }

    // Rebuild aggregates
    const aggregates: T[] = [];
    
    for (const [aggregateId] of eventsByAggregate) {
      const aggregate = await this.getById(aggregateId);
      if (aggregate) {
        aggregates.push(aggregate);
      }
    }

    return aggregates;
  }

  /**
   * Get aggregate state at a specific point in time (time travel)
   */
  async getAtTime(id: string, timestamp: Date): Promise<T | null> {
    const events = await this.eventStore.getEvents(id);
    
    // Filter events up to timestamp
    const filteredEvents = events.filter(e => e.timestamp <= timestamp);
    
    if (filteredEvents.length === 0) {
      return null;
    }

    // Rebuild state
    let state: any = null;
    let version = 0;

    for (const event of filteredEvents) {
      state = this.applyEvent(state, event);
      version = event.version;
    }

    return {
      id,
      type: this.aggregateType,
      version,
      state,
      createdAt: filteredEvents[0].timestamp,
      updatedAt: filteredEvents[filteredEvents.length - 1].timestamp
    } as T;
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Event Sourcing Manager
 * 
 * Central management for event sourced aggregates
 */
export class EventSourcingManager {
  private eventStore: InMemoryEventStore;
  private repositories: Map<string, EventSourcedRepository<any>> = new Map();

  constructor() {
    this.eventStore = new InMemoryEventStore();
  }

  /**
   * Register an aggregate type
   */
  registerAggregate<T extends Aggregate>(
    aggregateType: string,
    applyEvent: (state: any, event: DomainEvent) => any,
    snapshotInterval?: number
  ): EventSourcedRepository<T> {
    const repository = new EventSourcedRepository<T>(
      this.eventStore,
      aggregateType,
      applyEvent,
      snapshotInterval
    );

    this.repositories.set(aggregateType, repository);
    return repository;
  }

  /**
   * Get repository for aggregate type
   */
  getRepository<T extends Aggregate>(aggregateType: string): EventSourcedRepository<T> | null {
    return this.repositories.get(aggregateType) || null;
  }

  /**
   * Get event store
   */
  getEventStore(): EventStore {
    return this.eventStore;
  }

  /**
   * Get all events (for debugging/monitoring)
   */
  async getAllEvents(options?: { since?: Date; limit?: number }): Promise<DomainEvent[]> {
    return this.eventStore.getAllEvents(options);
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalEvents: number;
    aggregateTypes: number;
    eventsByType: Record<string, number>;
  }> {
    const allEvents = await this.eventStore.getAllEvents();
    
    const eventsByType: Record<string, number> = {};
    
    for (const event of allEvents) {
      eventsByType[event.aggregateType] = (eventsByType[event.aggregateType] || 0) + 1;
    }

    return {
      totalEvents: allEvents.length,
      aggregateTypes: Object.keys(eventsByType).length,
      eventsByType
    };
  }
}

// Singleton instance
export const eventSourcingManager = new EventSourcingManager();
