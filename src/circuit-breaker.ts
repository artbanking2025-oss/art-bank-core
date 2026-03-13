/**
 * Circuit Breaker Pattern Implementation
 * Защита от каскадных сбоев при вызове внешних сервисов
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Нормальная работа
  OPEN = 'OPEN',         // Сервис недоступен, блокируем запросы
  HALF_OPEN = 'HALF_OPEN' // Тестовый режим, пробуем восстановить
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Порог ошибок для открытия (default: 5)
  successThreshold: number;      // Успехов для закрытия (default: 2)
  timeout: number;               // Таймаут до HALF_OPEN в мс (default: 60000)
  requestTimeout: number;        // Таймаут запроса в мс (default: 5000)
}

interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttempt: number = Date.now();
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;

  constructor(
    private serviceName: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,        // 1 минута
      requestTimeout: 5000   // 5 секунд
    }
  ) {}

  /**
   * Выполнить запрос через Circuit Breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Проверяем состояние перед выполнением
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(
          `Circuit breaker is OPEN for ${this.serviceName}. ` +
          `Next attempt in ${Math.round((this.nextAttempt - Date.now()) / 1000)}s`
        );
      }
      // Переходим в HALF_OPEN для тестирования
      this.state = CircuitState.HALF_OPEN;
      console.log(`[Circuit Breaker] ${this.serviceName}: OPEN → HALF_OPEN`);
    }

    try {
      // Выполняем запрос с таймаутом
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Выполнить функцию с таймаутом
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${this.config.requestTimeout}ms`)),
          this.config.requestTimeout
        )
      )
    ]);
  }

  /**
   * Обработка успешного запроса
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        console.log(
          `[Circuit Breaker] ${this.serviceName}: HALF_OPEN → CLOSED (recovered)`
        );
      }
    }
  }

  /**
   * Обработка ошибки
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
      console.error(
        `[Circuit Breaker] ${this.serviceName}: ${this.state} → OPEN ` +
        `(${this.failureCount} failures)`
      );
    }
  }

  /**
   * Получить текущую статистику
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }

  /**
   * Принудительно открыть Circuit Breaker (для тестирования)
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.timeout;
  }

  /**
   * Принудительно закрыть Circuit Breaker (для сброса)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }
}

/**
 * Глобальный реестр Circuit Breakers
 */
class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getOrCreate(serviceName: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, config));
    }
    return this.breakers.get(serviceName)!;
  }

  getStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    this.breakers.forEach((breaker, name) => {
      stats[name] = breaker.getStats();
    });
    return stats;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
