/**
 * Saga Pattern - Distributed Transaction Management
 * 
 * Coordinates long-running business processes across multiple services.
 * Ensures eventual consistency with compensation actions.
 * 
 * Key Features:
 * - Choreography-based saga (event-driven)
 * - Compensation actions for rollback
 * - State machine for saga execution
 * - Timeout handling
 * - Retry logic
 */

import { eventSystem } from './event-system';

export type SagaStatus = 'pending' | 'running' | 'completed' | 'compensating' | 'compensated' | 'failed';

export interface SagaStep {
  name: string;
  execute: (context: SagaContext) => Promise<any>;
  compensate: (context: SagaContext) => Promise<void>;
  timeout?: number; // milliseconds
  retries?: number;
}

export interface SagaContext {
  sagaId: string;
  data: Record<string, any>;
  results: Record<string, any>;
  error?: Error;
  metadata?: {
    userId?: string;
    correlationId?: string;
    startedAt?: Date;
    completedAt?: Date;
  };
}

export interface SagaDefinition {
  name: string;
  steps: SagaStep[];
  timeout?: number; // overall saga timeout
}

export interface SagaInstance {
  id: string;
  definition: string;
  status: SagaStatus;
  currentStep: number;
  context: SagaContext;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Saga Executor - Executes saga steps with compensation
 */
export class SagaExecutor {
  private sagas: Map<string, SagaInstance> = new Map();
  private definitions: Map<string, SagaDefinition> = new Map();

  /**
   * Register a saga definition
   */
  registerDefinition(definition: SagaDefinition): void {
    this.definitions.set(definition.name, definition);
  }

  /**
   * Start a saga
   */
  async start(
    definitionName: string,
    initialData: Record<string, any>,
    metadata?: SagaContext['metadata']
  ): Promise<string> {
    const definition = this.definitions.get(definitionName);
    if (!definition) {
      throw new Error(`Saga definition not found: ${definitionName}`);
    }

    const sagaId = this.generateSagaId();
    
    const context: SagaContext = {
      sagaId,
      data: initialData,
      results: {},
      metadata: {
        ...metadata,
        startedAt: new Date()
      }
    };

    const instance: SagaInstance = {
      id: sagaId,
      definition: definitionName,
      status: 'pending',
      currentStep: 0,
      context,
      startedAt: new Date()
    };

    this.sagas.set(sagaId, instance);

    // Start execution asynchronously
    this.execute(sagaId).catch(error => {
      console.error(`Saga ${sagaId} failed:`, error);
    });

    return sagaId;
  }

  /**
   * Execute saga steps
   */
  private async execute(sagaId: string): Promise<void> {
    const instance = this.sagas.get(sagaId);
    if (!instance) {
      throw new Error(`Saga instance not found: ${sagaId}`);
    }

    const definition = this.definitions.get(instance.definition);
    if (!definition) {
      throw new Error(`Saga definition not found: ${instance.definition}`);
    }

    instance.status = 'running';

    try {
      // Execute each step
      for (let i = 0; i < definition.steps.length; i++) {
        instance.currentStep = i;
        const step = definition.steps[i];

        console.log(`[Saga ${sagaId}] Executing step ${i + 1}/${definition.steps.length}: ${step.name}`);

        // Execute step with timeout and retry
        const result = await this.executeStepWithRetry(step, instance.context);
        
        // Store result
        instance.context.results[step.name] = result;

        // Publish step completed event
        await eventSystem.publish('saga.step.completed', {
          sagaId,
          step: step.name,
          stepIndex: i,
          result
        });
      }

      // All steps completed successfully
      instance.status = 'completed';
      instance.completedAt = new Date();
      
      if (instance.context.metadata) {
        instance.context.metadata.completedAt = new Date();
      }

      console.log(`[Saga ${sagaId}] Completed successfully`);

      // Publish saga completed event
      await eventSystem.publish('saga.completed', {
        sagaId,
        definition: instance.definition,
        duration: Date.now() - instance.startedAt.getTime()
      });

    } catch (error) {
      // Saga failed - start compensation
      console.error(`[Saga ${sagaId}] Failed at step ${instance.currentStep}:`, error);
      
      instance.status = 'compensating';
      instance.error = (error as Error).message;
      instance.context.error = error as Error;

      await this.compensate(sagaId);
    }
  }

  /**
   * Execute step with retry logic
   */
  private async executeStepWithRetry(
    step: SagaStep,
    context: SagaContext
  ): Promise<any> {
    const maxRetries = step.retries || 3;
    const timeout = step.timeout || 30000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Execute with timeout
        const result = await Promise.race([
          step.execute(context),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Step timeout')), timeout)
          )
        ]);

        return result;

      } catch (error) {
        lastError = error as Error;
        console.warn(`[Saga ${context.sagaId}] Step ${step.name} attempt ${attempt + 1} failed:`, error);

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Step failed after all retries');
  }

  /**
   * Compensate saga (rollback)
   */
  private async compensate(sagaId: string): Promise<void> {
    const instance = this.sagas.get(sagaId);
    if (!instance) {
      return;
    }

    const definition = this.definitions.get(instance.definition);
    if (!definition) {
      return;
    }

    console.log(`[Saga ${sagaId}] Starting compensation`);

    // Compensate in reverse order
    for (let i = instance.currentStep; i >= 0; i--) {
      const step = definition.steps[i];
      
      // Skip if step was not executed
      if (!instance.context.results[step.name]) {
        continue;
      }

      try {
        console.log(`[Saga ${sagaId}] Compensating step: ${step.name}`);
        await step.compensate(instance.context);

        // Publish compensation completed event
        await eventSystem.publish('saga.step.compensated', {
          sagaId,
          step: step.name,
          stepIndex: i
        });

      } catch (error) {
        console.error(`[Saga ${sagaId}] Failed to compensate step ${step.name}:`, error);
        // Continue with other compensations even if one fails
      }
    }

    instance.status = 'compensated';
    instance.completedAt = new Date();

    console.log(`[Saga ${sagaId}] Compensation completed`);

    // Publish saga compensated event
    await eventSystem.publish('saga.compensated', {
      sagaId,
      definition: instance.definition,
      error: instance.error
    });
  }

  /**
   * Get saga instance
   */
  getInstance(sagaId: string): SagaInstance | null {
    return this.sagas.get(sagaId) || null;
  }

  /**
   * Get all saga instances
   */
  getAllInstances(): SagaInstance[] {
    return Array.from(this.sagas.values());
  }

  /**
   * Get saga statistics
   */
  getStats(): {
    total: number;
    byStatus: Record<SagaStatus, number>;
    definitions: string[];
  } {
    const byStatus: Record<SagaStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      compensating: 0,
      compensated: 0,
      failed: 0
    };

    for (const saga of this.sagas.values()) {
      byStatus[saga.status]++;
    }

    return {
      total: this.sagas.size,
      byStatus,
      definitions: Array.from(this.definitions.keys())
    };
  }

  private generateSagaId(): string {
    return `saga-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

// ========== EXAMPLE SAGA DEFINITIONS ==========

/**
 * Example: Artwork Purchase Saga
 * 
 * Steps:
 * 1. Reserve artwork
 * 2. Process payment
 * 3. Transfer ownership
 * 4. Send notifications
 */
export function createArtworkPurchaseSaga(executor: SagaExecutor): void {
  executor.registerDefinition({
    name: 'artwork-purchase',
    timeout: 60000,
    steps: [
      {
        name: 'reserve-artwork',
        execute: async (context) => {
          console.log('Reserving artwork:', context.data.artworkId);
          // Mock: Reserve artwork
          return { reserved: true, reservationId: 'res-123' };
        },
        compensate: async (context) => {
          console.log('Releasing artwork reservation:', context.results['reserve-artwork']);
          // Mock: Release reservation
        },
        timeout: 5000,
        retries: 3
      },
      {
        name: 'process-payment',
        execute: async (context) => {
          console.log('Processing payment:', context.data.amount);
          // Mock: Process payment
          return { transactionId: 'tx-456', amount: context.data.amount };
        },
        compensate: async (context) => {
          console.log('Refunding payment:', context.results['process-payment']);
          // Mock: Refund payment
        },
        timeout: 10000,
        retries: 2
      },
      {
        name: 'transfer-ownership',
        execute: async (context) => {
          console.log('Transferring ownership:', context.data.artworkId);
          // Mock: Transfer ownership
          return { transferred: true, newOwnerId: context.data.buyerId };
        },
        compensate: async (context) => {
          console.log('Reverting ownership transfer:', context.results['transfer-ownership']);
          // Mock: Revert ownership
        },
        timeout: 5000,
        retries: 3
      },
      {
        name: 'send-notifications',
        execute: async (context) => {
          console.log('Sending notifications');
          // Mock: Send notifications
          return { notificationsSent: 2 };
        },
        compensate: async (context) => {
          console.log('No compensation needed for notifications');
          // Usually no compensation needed for notifications
        },
        timeout: 3000,
        retries: 1
      }
    ]
  });
}

/**
 * Example: User Onboarding Saga
 */
export function createUserOnboardingSaga(executor: SagaExecutor): void {
  executor.registerDefinition({
    name: 'user-onboarding',
    timeout: 120000,
    steps: [
      {
        name: 'create-user-profile',
        execute: async (context) => {
          console.log('Creating user profile:', context.data.email);
          return { userId: 'user-789', email: context.data.email };
        },
        compensate: async (context) => {
          console.log('Deleting user profile:', context.results['create-user-profile']);
        }
      },
      {
        name: 'setup-preferences',
        execute: async (context) => {
          console.log('Setting up user preferences');
          return { preferencesSet: true };
        },
        compensate: async (context) => {
          console.log('Removing user preferences');
        }
      },
      {
        name: 'send-welcome-email',
        execute: async (context) => {
          console.log('Sending welcome email');
          return { emailSent: true };
        },
        compensate: async (context) => {
          console.log('No compensation for welcome email');
        }
      }
    ]
  });
}

// Singleton instance
export const sagaExecutor = new SagaExecutor();

// Initialize example sagas
createArtworkPurchaseSaga(sagaExecutor);
createUserOnboardingSaga(sagaExecutor);
