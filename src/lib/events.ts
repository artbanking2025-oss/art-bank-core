/**
 * Событийная архитектура (Event-Driven Architecture)
 * Упрощённая реализация для песочницы без Kafka/RabbitMQ
 * В продакшене следует использовать Apache Kafka или RabbitMQ
 */

export type EventType = 
  | 'ASSET_CREATED'
  | 'ASSET_VALIDATED'
  | 'TRADE_CREATED'
  | 'TRADE_COMPLETED'
  | 'TRADE_CANCELLED'
  | 'NODE_CREATED'
  | 'NODE_UPDATED'
  | 'EDGE_CREATED'
  | 'PRICE_CALCULATED';

export interface Event {
  event_id: string;
  event_type: EventType;
  timestamp: number;
  source_node_id?: string;
  payload: Record<string, any>;
}

export interface EventHandler {
  (event: Event): Promise<void>;
}

/**
 * Упрощённый EventBus для локальной разработки
 * В продакшене следует использовать Kafka Producer/Consumer
 */
export class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private eventLog: Event[] = [];
  private maxLogSize: number = 1000;

  /**
   * Подписаться на событие
   */
  subscribe(eventType: EventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  /**
   * Опубликовать событие
   * В продакшене: отправка в Kafka topic
   */
  async publish(event: Event): Promise<void> {
    // Логирование события
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift(); // Удаляем старейшее событие
    }

    console.log(`[EventBus] Publishing event: ${event.event_type}`, event);

    // Вызов всех подписчиков
    const handlers = this.handlers.get(event.event_type) || [];
    const promises = handlers.map(handler => handler(event));
    await Promise.all(promises);
  }

  /**
   * Получить последние события (для дебага)
   */
  getRecentEvents(limit: number = 50): Event[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Получить события по типу
   */
  getEventsByType(eventType: EventType, limit: number = 50): Event[] {
    return this.eventLog
      .filter(e => e.event_type === eventType)
      .slice(-limit);
  }
}

// Глобальный EventBus (singleton)
export const globalEventBus = new EventBus();

/**
 * Генератор уникальных ID для событий
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Создание события для транзакции
 */
export function createTradeEvent(
  type: 'TRADE_CREATED' | 'TRADE_COMPLETED' | 'TRADE_CANCELLED',
  data: {
    transaction_id: number;
    artwork_id: string;
    from_node_id: string;
    to_node_id: string;
    price: number;
    bank_node_id?: string;
  }
): Event {
  return {
    event_id: generateEventId(),
    event_type: type,
    timestamp: Date.now(),
    source_node_id: data.from_node_id,
    payload: data
  };
}

/**
 * Создание события для актива
 */
export function createAssetEvent(
  type: 'ASSET_CREATED' | 'ASSET_VALIDATED',
  data: {
    artwork_id: string;
    artist_node_id?: string;
    expert_node_id?: string;
    title?: string;
    validation_result?: any;
  }
): Event {
  return {
    event_id: generateEventId(),
    event_type: type,
    timestamp: Date.now(),
    source_node_id: data.artist_node_id || data.expert_node_id,
    payload: data
  };
}

/**
 * Создание события для расчёта цены
 */
export function createPriceCalculationEvent(
  data: {
    artwork_id: string;
    fair_value: number;
    risk_score: number;
    confidence_interval: [number, number];
    reasoning: any;
  }
): Event {
  return {
    event_id: generateEventId(),
    event_type: 'PRICE_CALCULATED',
    timestamp: Date.now(),
    payload: data
  };
}
