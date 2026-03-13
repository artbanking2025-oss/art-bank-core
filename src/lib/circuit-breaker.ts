/**
 * Circuit Breaker Pattern для отказоустойчивости
 * 
 * Защищает систему от каскадных сбоев при отказе внешних сервисов
 * Три состояния: CLOSED (работает), OPEN (отключен), HALF_OPEN (проверка)
 */

export enum CircuitState {
  CLOSED = 'CLOSED',      // Нормальная работа
  OPEN = 'OPEN',          // Сервис отключен из-за ошибок
  HALF_OPEN = 'HALF_OPEN' // Пробный запрос для проверки восстановления
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Количество ошибок до открытия (default: 5)
  successThreshold: number;    // Количество успехов для закрытия (default: 2)
  timeout: number;             // Таймаут запроса в мс (default: 5000)
  resetTimeout: number;        // Время до перехода в HALF_OPEN в мс (default: 60000)
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttempt: number = Date.now();
  
  // Статистика
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  
  private config: Required<CircuitBreakerConfig>;
  
  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 5000,
      resetTimeout: config.resetTimeout ?? 60000
    };
    
    console.log(`[CircuitBreaker:${name}] Initialized with config:`, this.config);
  }
  
  /**
   * Выполнить функцию с защитой Circuit Breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;
    
    // Проверка состояния
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN for ${this.name}. Next attempt in ${this.nextAttempt - Date.now()}ms`
        );
      }
      
      // Переход в HALF_OPEN для пробного запроса
      this.state = CircuitState.HALF_OPEN;
      console.log(`[CircuitBreaker:${this.name}] State: OPEN → HALF_OPEN (attempting recovery)`);
    }
    
    try {
      // Выполнение с таймаутом
      const result = await this.executeWithTimeout(fn, this.config.timeout);
      
      // Успех
      this.onSuccess();
      return result;
      
    } catch (error) {
      // Ошибка
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Выполнение с таймаутом
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      )
    ]);
  }
  
  /**
   * Обработка успешного запроса
   */
  private onSuccess(): void {
    this.failures = 0;
    this.successes++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.name}] State: HALF_OPEN → CLOSED (recovered)`);
      }
    }
  }
  
  /**
   * Обработка ошибки
   */
  private onFailure(): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    } else if (this.failures >= this.config.failureThreshold) {
      this.open();
    }
  }
  
  /**
   * Открыть circuit breaker (отключить сервис)
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.resetTimeout;
    console.error(
      `[CircuitBreaker:${this.name}] State: ${CircuitState.CLOSED} → OPEN ` +
      `(failures: ${this.failures}/${this.config.failureThreshold})`
    );
  }
  
  /**
   * Получить текущую статистику
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }
  
  /**
   * Сброс circuit breaker (для тестирования)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    console.log(`[CircuitBreaker:${this.name}] Manual reset to CLOSED state`);
  }

  /**
   * Принудительно открыть Circuit Breaker (STOP механизм)
   */
  forceOpen(reason?: string): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.resetTimeout;
    console.warn(
      `[CircuitBreaker:${this.name}] FORCE OPENED${reason ? ': ' + reason : ''}`
    );
  }
}

/**
 * Ошибка открытого Circuit Breaker
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Глобальные Circuit Breakers для сервисов
 */
export const circuitBreakers = {
  analyticsService: new CircuitBreaker('Analytics Service', {
    failureThreshold: 3,  // 3 ошибки подряд
    successThreshold: 2,  // 2 успеха для восстановления
    timeout: 10000,       // 10 секунд таймаут
    resetTimeout: 30000   // 30 секунд до повторной попытки
  })
};
