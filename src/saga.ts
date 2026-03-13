/**
 * Saga Pattern Implementation
 * Координирует распределённые транзакции с компенсирующими операциями
 */

export enum SagaStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED'
}

export interface SagaStep<T = any> {
  name: string;
  execute: () => Promise<T>;
  compensate: () => Promise<void>;
}

export interface SagaContext {
  sagaId: string;
  status: SagaStatus;
  startTime: number;
  endTime?: number;
  steps: Array<{
    name: string;
    status: 'pending' | 'completed' | 'failed' | 'compensated';
    result?: any;
    error?: string;
    executionTime?: number;
  }>;
  error?: string;
}

/**
 * Orchestrator для Saga транзакций
 */
export class SagaOrchestrator {
  private context: SagaContext;
  private steps: SagaStep[] = [];
  private completedSteps: Array<{ step: SagaStep; result: any }> = [];

  constructor(sagaId: string) {
    this.context = {
      sagaId,
      status: SagaStatus.PENDING,
      startTime: Date.now(),
      steps: []
    };
  }

  /**
   * Добавить шаг в Saga
   */
  addStep<T>(step: SagaStep<T>): this {
    this.steps.push(step);
    this.context.steps.push({
      name: step.name,
      status: 'pending'
    });
    return this;
  }

  /**
   * Выполнить Saga
   */
  async execute(): Promise<SagaContext> {
    this.context.status = SagaStatus.RUNNING;
    console.log(`[Saga] Starting ${this.context.sagaId} with ${this.steps.length} steps`);

    try {
      // Выполняем каждый шаг последовательно
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];
        const stepContext = this.context.steps[i];
        
        console.log(`[Saga] Executing step ${i + 1}/${this.steps.length}: ${step.name}`);
        const startTime = Date.now();

        try {
          const result = await step.execute();
          
          stepContext.status = 'completed';
          stepContext.result = result;
          stepContext.executionTime = Date.now() - startTime;
          
          this.completedSteps.push({ step, result });
          
          console.log(
            `[Saga] Step ${step.name} completed in ${stepContext.executionTime}ms`
          );
        } catch (error) {
          stepContext.status = 'failed';
          stepContext.error = error instanceof Error ? error.message : String(error);
          stepContext.executionTime = Date.now() - startTime;
          
          throw error;
        }
      }

      // Все шаги успешно выполнены
      this.context.status = SagaStatus.COMPLETED;
      this.context.endTime = Date.now();
      
      console.log(
        `[Saga] ${this.context.sagaId} completed successfully in ` +
        `${this.context.endTime - this.context.startTime}ms`
      );

      return this.context;
    } catch (error) {
      // Ошибка - запускаем компенсацию
      console.error(`[Saga] Error in ${this.context.sagaId}:`, error);
      await this.compensate();
      
      this.context.status = SagaStatus.FAILED;
      this.context.error = error instanceof Error ? error.message : String(error);
      this.context.endTime = Date.now();
      
      throw error;
    }
  }

  /**
   * Выполнить компенсирующие транзакции (откат)
   */
  private async compensate(): Promise<void> {
    this.context.status = SagaStatus.COMPENSATING;
    console.log(
      `[Saga] Compensating ${this.completedSteps.length} completed steps`
    );

    // Откатываем шаги в обратном порядке
    for (let i = this.completedSteps.length - 1; i >= 0; i--) {
      const { step } = this.completedSteps[i];
      const stepIndex = this.steps.indexOf(step);
      const stepContext = this.context.steps[stepIndex];

      console.log(`[Saga] Compensating step: ${step.name}`);
      
      try {
        await step.compensate();
        stepContext.status = 'compensated';
        console.log(`[Saga] Step ${step.name} compensated successfully`);
      } catch (compensateError) {
        console.error(
          `[Saga] Failed to compensate step ${step.name}:`,
          compensateError
        );
        // Продолжаем компенсацию остальных шагов
      }
    }

    this.context.status = SagaStatus.COMPENSATED;
    console.log(`[Saga] Compensation completed for ${this.context.sagaId}`);
  }

  /**
   * Получить контекст Saga
   */
  getContext(): SagaContext {
    return this.context;
  }
}

/**
 * Создать Saga для транзакции покупки произведения искусства
 * 
 * Этапы:
 * 1. Валидация участников (покупатель, продавец, произведение)
 * 2. Резервирование произведения
 * 3. Создание транзакции в БД
 * 4. Расчёт справедливой цены через Analytics Service
 * 5. Обновление владельца произведения
 * 6. Логирование события
 */
export async function createArtworkPurchaseSaga(
  db: any,
  analyticsService: any,
  data: {
    artwork_id: string;
    from_node_id: string;
    to_node_id: string;
    bank_node_id?: string;
    price: number;
  }
): Promise<SagaContext> {
  const saga = new SagaOrchestrator(`purchase-${data.artwork_id}-${Date.now()}`);

  let artwork: any = null;
  let fromNode: any = null;
  let toNode: any = null;
  let transaction: any = null;
  let fairPriceResult: any = null;
  let previousOwner: string | null = null;

  // Шаг 1: Валидация участников
  saga.addStep({
    name: 'validate-participants',
    execute: async () => {
      artwork = await db.getArtwork(data.artwork_id);
      if (!artwork) throw new Error(`Artwork ${data.artwork_id} not found`);

      fromNode = await db.getNode(data.from_node_id);
      if (!fromNode) throw new Error(`Seller node ${data.from_node_id} not found`);

      toNode = await db.getNode(data.to_node_id);
      if (!toNode) throw new Error(`Buyer node ${data.to_node_id} not found`);

      // Проверяем, что продавец - текущий владелец
      if (artwork.current_owner_node_id !== data.from_node_id) {
        throw new Error(
          `Seller ${data.from_node_id} is not the current owner of ${data.artwork_id}`
        );
      }

      return { artwork, fromNode, toNode };
    },
    compensate: async () => {
      // Нечего откатывать - только проверка
    }
  });

  // Шаг 2: Резервирование произведения (soft lock)
  saga.addStep({
    name: 'reserve-artwork',
    execute: async () => {
      // В реальной системе здесь был бы механизм блокировки
      // Сейчас просто логируем
      console.log(`[Saga] Artwork ${data.artwork_id} reserved for transaction`);
      return { reserved: true };
    },
    compensate: async () => {
      console.log(`[Saga] Releasing reservation for artwork ${data.artwork_id}`);
    }
  });

  // Шаг 3: Создание транзакции
  saga.addStep({
    name: 'create-transaction',
    execute: async () => {
      transaction = await db.createTransaction({
        artwork_id: data.artwork_id,
        from_node_id: data.from_node_id,
        to_node_id: data.to_node_id,
        bank_node_id: data.bank_node_id,
        price: data.price,
        status: 'pending'
      });
      return transaction;
    },
    compensate: async () => {
      if (transaction) {
        console.log(`[Saga] Cancelling transaction ${transaction.id}`);
        await db.updateTransactionStatus(transaction.id, 'cancelled');
      }
    }
  });

  // Шаг 4: Расчёт справедливой цены через Analytics Service
  saga.addStep({
    name: 'calculate-fair-price',
    execute: async () => {
      // Получаем похожие сделки
      const recentTransactions = await db.getRecentTransactionsByArtwork(data.artwork_id);
      
      fairPriceResult = await analyticsService.calculateFairPrice({
        asset_id: data.artwork_id,
        current_price: data.price,
        similar_sales: recentTransactions.map((t: any) => ({
          price: t.price,
          date: t.transaction_date,
          similarity: 0.85
        }))
      });

      return fairPriceResult;
    },
    compensate: async () => {
      // Расчёт цены не требует отката
    }
  });

  // Шаг 5: Обновление владельца произведения
  saga.addStep({
    name: 'transfer-ownership',
    execute: async () => {
      previousOwner = artwork.current_owner_node_id;
      await db.updateArtworkOwner(data.artwork_id, data.to_node_id);
      return { previousOwner, newOwner: data.to_node_id };
    },
    compensate: async () => {
      if (previousOwner) {
        console.log(`[Saga] Reverting ownership back to ${previousOwner}`);
        await db.updateArtworkOwner(data.artwork_id, previousOwner);
      }
    }
  });

  // Шаг 6: Обновление статуса транзакции на completed
  saga.addStep({
    name: 'complete-transaction',
    execute: async () => {
      await db.updateTransactionStatus(transaction.id, 'completed');
      return { transactionId: transaction.id, status: 'completed' };
    },
    compensate: async () => {
      if (transaction) {
        await db.updateTransactionStatus(transaction.id, 'cancelled');
      }
    }
  });

  // Шаг 7: Логирование события
  saga.addStep({
    name: 'log-event',
    execute: async () => {
      await db.logActivity({
        node_id: data.to_node_id,
        action: 'artwork_purchased',
        details: {
          transaction_id: transaction.id,
          artwork_id: data.artwork_id,
          from_node_id: data.from_node_id,
          price: data.price,
          fair_value: fairPriceResult?.fair_value
        }
      });
      return { logged: true };
    },
    compensate: async () => {
      // Логи не откатываем, но можно добавить запись о компенсации
    }
  });

  return await saga.execute();
}
