/**
 * Saga Pattern для распределённых транзакций
 * 
 * Обеспечивает согласованность данных через компенсирующие транзакции
 * Каждый шаг имеет compensate функцию для отката изменений
 */

export type SagaStepStatus = 'pending' | 'completed' | 'failed' | 'compensated';

export interface SagaStep<T = any> {
  name: string;
  execute: () => Promise<T>;
  compensate: (result?: T) => Promise<void>;
}

export interface SagaExecutionResult {
  success: boolean;
  completedSteps: string[];
  failedStep?: string;
  error?: Error;
  results: Record<string, any>;
}

export class Saga {
  private steps: SagaStep[] = [];
  private executedSteps: Array<{
    name: string;
    status: SagaStepStatus;
    result?: any;
    error?: Error;
  }> = [];
  
  constructor(private name: string) {}
  
  /**
   * Добавить шаг в сагу
   */
  addStep<T>(step: SagaStep<T>): this {
    this.steps.push(step);
    return this;
  }
  
  /**
   * Выполнить сагу
   */
  async execute(): Promise<SagaExecutionResult> {
    console.log(`[Saga:${this.name}] Starting saga with ${this.steps.length} steps`);
    
    const results: Record<string, any> = {};
    let failedStep: string | undefined;
    let error: Error | undefined;
    
    try {
      // Выполнение всех шагов последовательно
      for (const step of this.steps) {
        console.log(`[Saga:${this.name}] Executing step: ${step.name}`);
        
        try {
          const result = await step.execute();
          
          this.executedSteps.push({
            name: step.name,
            status: 'completed',
            result
          });
          
          results[step.name] = result;
          console.log(`[Saga:${this.name}] Step ${step.name} completed successfully`);
          
        } catch (stepError: any) {
          // Ошибка на шаге - начинаем компенсацию
          this.executedSteps.push({
            name: step.name,
            status: 'failed',
            error: stepError
          });
          
          failedStep = step.name;
          error = stepError;
          
          console.error(`[Saga:${this.name}] Step ${step.name} failed:`, stepError.message);
          
          // Запускаем компенсацию
          await this.compensate();
          
          return {
            success: false,
            completedSteps: this.executedSteps
              .filter(s => s.status === 'completed')
              .map(s => s.name),
            failedStep,
            error,
            results
          };
        }
      }
      
      // Все шаги успешно выполнены
      console.log(`[Saga:${this.name}] Saga completed successfully`);
      
      return {
        success: true,
        completedSteps: this.executedSteps.map(s => s.name),
        results
      };
      
    } catch (unknownError: any) {
      console.error(`[Saga:${this.name}] Unexpected error:`, unknownError);
      await this.compensate();
      
      return {
        success: false,
        completedSteps: [],
        error: unknownError,
        results
      };
    }
  }
  
  /**
   * Компенсация (откат) выполненных шагов
   */
  private async compensate(): Promise<void> {
    console.log(`[Saga:${this.name}] Starting compensation for ${this.executedSteps.length} steps`);
    
    // Компенсируем в обратном порядке
    const stepsToCompensate = [...this.executedSteps]
      .filter(s => s.status === 'completed')
      .reverse();
    
    for (const executedStep of stepsToCompensate) {
      const step = this.steps.find(s => s.name === executedStep.name);
      
      if (!step) {
        console.warn(`[Saga:${this.name}] Cannot find step ${executedStep.name} for compensation`);
        continue;
      }
      
      try {
        console.log(`[Saga:${this.name}] Compensating step: ${step.name}`);
        await step.compensate(executedStep.result);
        
        // Обновляем статус
        executedStep.status = 'compensated';
        
        console.log(`[Saga:${this.name}] Step ${step.name} compensated successfully`);
        
      } catch (compensateError: any) {
        console.error(
          `[Saga:${this.name}] Failed to compensate step ${step.name}:`,
          compensateError.message
        );
        // Продолжаем компенсацию остальных шагов даже при ошибке
      }
    }
    
    console.log(`[Saga:${this.name}] Compensation completed`);
  }
  
  /**
   * Получить статус выполнения
   */
  getStatus() {
    return {
      name: this.name,
      steps: this.executedSteps.map(s => ({
        name: s.name,
        status: s.status,
        hasError: !!s.error
      }))
    };
  }
}

/**
 * Пример: Saga для транзакции покупки произведения
 */
export function createPurchaseSaga(params: {
  artwork_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  bank_id?: string;
  loan_amount?: number;
  db: any; // ArtBankDB instance
}): Saga {
  const saga = new Saga(`Purchase-${params.artwork_id}`);
  
  let reservationId: number | null = null;
  let transactionId: number | null = null;
  let oldOwnerId: string | null = null;
  
  // Шаг 1: Резервирование актива
  saga.addStep({
    name: 'reserve_asset',
    execute: async () => {
      // Проверяем доступность актива
      const artwork = await params.db.getArtwork(params.artwork_id);
      
      if (!artwork) {
        throw new Error(`Artwork ${params.artwork_id} not found`);
      }
      
      if (artwork.current_owner_node_id && artwork.current_owner_node_id !== params.seller_id) {
        throw new Error(`Artwork is owned by different seller`);
      }
      
      // Сохраняем текущего владельца для компенсации
      oldOwnerId = artwork.current_owner_node_id;
      
      // Создаём резервацию (в реальности это отдельная таблица)
      reservationId = Date.now(); // Упрощённо
      
      console.log(`[Saga] Asset ${params.artwork_id} reserved (reservation: ${reservationId})`);
      
      return { reservationId, oldOwnerId };
    },
    compensate: async () => {
      if (reservationId) {
        console.log(`[Saga] Releasing reservation ${reservationId}`);
        // Отменяем резервацию
        reservationId = null;
      }
    }
  });
  
  // Шаг 2: Проверка аналитики (если цена подозрительна - STOP)
  saga.addStep({
    name: 'validate_price',
    execute: async () => {
      // Проверка через Analytics Service (упрощённо)
      const artwork = await params.db.getArtwork(params.artwork_id);
      const currentFPC = artwork.current_fpc || 0;
      
      if (params.price > currentFPC * 1.5) {
        throw new Error(`Price ${params.price} exceeds Fair Price Corridor by 50%`);
      }
      
      console.log(`[Saga] Price validation passed`);
      return { validated: true };
    },
    compensate: async () => {
      // Нет действий для компенсации валидации
      console.log(`[Saga] Price validation compensated (no action needed)`);
    }
  });
  
  // Шаг 3: Создание транзакции
  saga.addStep({
    name: 'create_transaction',
    execute: async () => {
      const transaction = await params.db.createTransaction({
        artwork_id: params.artwork_id,
        from_node_id: params.seller_id,
        to_node_id: params.buyer_id,
        bank_node_id: params.bank_id,
        price: params.price,
        loan_amount: params.loan_amount || 0,
        interest_rate: params.loan_amount ? 0.045 : 0,
        metadata: { saga_id: saga.getStatus().name }
      });
      
      transactionId = transaction.id;
      
      console.log(`[Saga] Transaction ${transactionId} created`);
      return transaction;
    },
    compensate: async (transaction: any) => {
      if (transactionId) {
        console.log(`[Saga] Cancelling transaction ${transactionId}`);
        await params.db.updateTransactionStatus(transactionId, 'cancelled');
      }
    }
  });
  
  // Шаг 4: Обновление владельца
  saga.addStep({
    name: 'transfer_ownership',
    execute: async () => {
      await params.db.updateArtworkOwner(params.artwork_id, params.buyer_id);
      
      console.log(`[Saga] Ownership transferred to ${params.buyer_id}`);
      return { new_owner: params.buyer_id };
    },
    compensate: async () => {
      if (oldOwnerId) {
        console.log(`[Saga] Reverting ownership to ${oldOwnerId}`);
        await params.db.updateArtworkOwner(params.artwork_id, oldOwnerId);
      }
    }
  });
  
  // Шаг 5: Завершение транзакции
  saga.addStep({
    name: 'complete_transaction',
    execute: async () => {
      if (transactionId) {
        await params.db.updateTransactionStatus(transactionId, 'completed');
        console.log(`[Saga] Transaction ${transactionId} completed`);
      }
      
      return { completed: true, transaction_id: transactionId };
    },
    compensate: async () => {
      // Статус уже изменён на 'cancelled' в компенсации create_transaction
      console.log(`[Saga] Transaction completion compensated`);
    }
  });
  
  return saga;
}
