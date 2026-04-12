/**
 * CQRS (Command Query Responsibility Segregation)
 * 
 * Separates read and write operations:
 * - Commands: Change state (write operations)
 * - Queries: Read state (read operations)
 * 
 * Benefits:
 * - Independent scaling of reads and writes
 * - Optimized read models
 * - Better performance
 * - Simplified domain logic
 */

import { eventSourcingManager, DomainEvent } from './event-sourcing';

// ========== COMMAND SIDE ==========

export interface Command {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  data: any;
  metadata?: {
    userId?: string;
    correlationId?: string;
    timestamp?: Date;
  };
}

export interface CommandResult {
  success: boolean;
  aggregateId: string;
  version: number;
  events?: DomainEvent[];
  error?: string;
}

export interface CommandHandler<T extends Command = Command> {
  handle(command: T): Promise<CommandResult>;
}

/**
 * Command Bus - Routes commands to appropriate handlers
 */
export class CommandBus {
  private handlers: Map<string, CommandHandler> = new Map();

  register(commandType: string, handler: CommandHandler): void {
    this.handlers.set(commandType, handler);
  }

  async dispatch(command: Command): Promise<CommandResult> {
    const handler = this.handlers.get(command.type);

    if (!handler) {
      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: `No handler registered for command type: ${command.type}`
      };
    }

    try {
      return await handler.handle(command);
    } catch (error) {
      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: (error as Error).message
      };
    }
  }
}

// ========== QUERY SIDE ==========

export interface Query {
  id: string;
  type: string;
  params?: any;
  metadata?: {
    userId?: string;
    correlationId?: string;
  };
}

export interface QueryResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    count?: number;
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface QueryHandler<Q extends Query = Query, R = any> {
  handle(query: Q): Promise<QueryResult<R>>;
}

/**
 * Query Bus - Routes queries to appropriate handlers
 */
export class QueryBus {
  private handlers: Map<string, QueryHandler> = new Map();

  register(queryType: string, handler: QueryHandler): void {
    this.handlers.set(queryType, handler);
  }

  async dispatch<T = any>(query: Query): Promise<QueryResult<T>> {
    const handler = this.handlers.get(query.type);

    if (!handler) {
      return {
        success: false,
        error: `No handler registered for query type: ${query.type}`
      };
    }

    try {
      return await handler.handle(query);
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}

// ========== READ MODEL ==========

/**
 * Read Model - Optimized for queries
 * 
 * Projections are updated by listening to domain events
 */
export interface ReadModel<T = any> {
  id: string;
  data: T;
  version: number;
  lastUpdated: Date;
}

export class ReadModelStore<T = any> {
  private models: Map<string, ReadModel<T>> = new Map();
  private indexes: Map<string, Set<string>> = new Map(); // field -> model IDs

  /**
   * Upsert read model
   */
  upsert(id: string, data: T, version: number): void {
    this.models.set(id, {
      id,
      data,
      version,
      lastUpdated: new Date()
    });

    // Update indexes
    this.updateIndexes(id, data);
  }

  /**
   * Get by ID
   */
  get(id: string): ReadModel<T> | null {
    return this.models.get(id) || null;
  }

  /**
   * Get all
   */
  getAll(): ReadModel<T>[] {
    return Array.from(this.models.values());
  }

  /**
   * Find by field value
   */
  findBy(field: string, value: any): ReadModel<T>[] {
    const indexKey = `${field}:${JSON.stringify(value)}`;
    const ids = this.indexes.get(indexKey);

    if (!ids) {
      return [];
    }

    return Array.from(ids)
      .map(id => this.models.get(id))
      .filter((model): model is ReadModel<T> => model !== null);
  }

  /**
   * Delete
   */
  delete(id: string): boolean {
    return this.models.delete(id);
  }

  /**
   * Clear all
   */
  clear(): void {
    this.models.clear();
    this.indexes.clear();
  }

  /**
   * Get count
   */
  count(): number {
    return this.models.size;
  }

  private updateIndexes(id: string, data: T): void {
    // Simple indexing - index all top-level fields
    if (typeof data === 'object' && data !== null) {
      for (const [field, value] of Object.entries(data)) {
        const indexKey = `${field}:${JSON.stringify(value)}`;
        const existing = this.indexes.get(indexKey) || new Set();
        existing.add(id);
        this.indexes.set(indexKey, existing);
      }
    }
  }
}

// ========== PROJECTION ==========

/**
 * Projection - Builds read models from events
 */
export interface Projection<T = any> {
  readonly name: string;
  readonly eventTypes: string[];
  project(event: DomainEvent, readModel: ReadModelStore<T>): Promise<void>;
}

export class ProjectionManager {
  private projections: Map<string, Projection> = new Map();
  private readModels: Map<string, ReadModelStore<any>> = new Map();

  /**
   * Register a projection
   */
  register<T>(projection: Projection<T>): void {
    this.projections.set(projection.name, projection);
    this.readModels.set(projection.name, new ReadModelStore<T>());
  }

  /**
   * Get read model store for a projection
   */
  getReadModel<T>(projectionName: string): ReadModelStore<T> | null {
    return this.readModels.get(projectionName) || null;
  }

  /**
   * Project an event to all matching projections
   */
  async projectEvent(event: DomainEvent): Promise<void> {
    for (const [name, projection] of this.projections) {
      if (projection.eventTypes.includes(event.eventType)) {
        const readModel = this.readModels.get(name);
        if (readModel) {
          await projection.project(event, readModel);
        }
      }
    }
  }

  /**
   * Rebuild all projections from event store
   */
  async rebuildAll(): Promise<void> {
    // Clear all read models
    for (const readModel of this.readModels.values()) {
      readModel.clear();
    }

    // Get all events
    const events = await eventSourcingManager.getAllEvents();

    // Project all events
    for (const event of events) {
      await this.projectEvent(event);
    }
  }

  /**
   * Get statistics
   */
  getStats(): Record<string, { name: string; eventTypes: string[]; count: number }> {
    const stats: Record<string, { name: string; eventTypes: string[]; count: number }> = {};

    for (const [name, projection] of this.projections) {
      const readModel = this.readModels.get(name);
      stats[name] = {
        name,
        eventTypes: projection.eventTypes,
        count: readModel?.count() || 0
      };
    }

    return stats;
  }
}

// ========== CQRS FACADE ==========

/**
 * CQRS Facade - Main entry point for CQRS operations
 */
export class CQRS {
  public commandBus: CommandBus;
  public queryBus: QueryBus;
  public projectionManager: ProjectionManager;

  constructor() {
    this.commandBus = new CommandBus();
    this.queryBus = new QueryBus();
    this.projectionManager = new ProjectionManager();
  }

  /**
   * Execute a command
   */
  async command(command: Command): Promise<CommandResult> {
    const result = await this.commandBus.dispatch(command);

    // Project events to read models
    if (result.success && result.events) {
      for (const event of result.events) {
        await this.projectionManager.projectEvent(event);
      }
    }

    return result;
  }

  /**
   * Execute a query
   */
  async query<T = any>(query: Query): Promise<QueryResult<T>> {
    return await this.queryBus.dispatch<T>(query);
  }

  /**
   * Register command handler
   */
  registerCommandHandler(commandType: string, handler: CommandHandler): void {
    this.commandBus.register(commandType, handler);
  }

  /**
   * Register query handler
   */
  registerQueryHandler(queryType: string, handler: QueryHandler): void {
    this.queryBus.register(queryType, handler);
  }

  /**
   * Register projection
   */
  registerProjection<T>(projection: Projection<T>): void {
    this.projectionManager.register(projection);
  }

  /**
   * Get read model
   */
  getReadModel<T>(projectionName: string): ReadModelStore<T> | null {
    return this.projectionManager.getReadModel(projectionName);
  }

  /**
   * Rebuild all projections
   */
  async rebuildProjections(): Promise<void> {
    await this.projectionManager.rebuildAll();
  }

  /**
   * Get statistics
   */
  getStats(): {
    commands: number;
    queries: number;
    projections: Record<string, { name: string; eventTypes: string[]; count: number }>;
  } {
    return {
      commands: (this.commandBus as any).handlers.size,
      queries: (this.queryBus as any).handlers.size,
      projections: this.projectionManager.getStats()
    };
  }
}

// Singleton instance
export const cqrs = new CQRS();
