/**
 * WebSocket Manager для Real-Time обновлений
 * Art Bank Core v2.13 - WebSocket Integration
 * 
 * Поддерживает:
 * - Live обновления метрик
 * - Broadcast событий всем подключенным клиентам
 * - Управление соединениями (подключение/отключение)
 * - Heartbeat для проверки соединений
 */

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  lastPing: Date;
  subscriptions: Set<string>;
}

export interface WebSocketMessage {
  type: 'metrics' | 'logs' | 'health' | 'alert' | 'ping' | 'pong' | 'subscribe' | 'unsubscribe';
  payload?: any;
  timestamp: string;
}

/**
 * WebSocket Manager для управления соединениями
 */
export class WebSocketManager {
  private clients: Map<string, WebSocketClient> = new Map();
  private heartbeatInterval: number = 30000; // 30 секунд
  private heartbeatTimer?: NodeJS.Timeout;

  constructor() {
    // Запускаем heartbeat проверку
    this.startHeartbeat();
  }

  /**
   * Добавить нового клиента
   */
  addClient(socket: WebSocket): string {
    const clientId = this.generateClientId();
    const client: WebSocketClient = {
      id: clientId,
      socket,
      connectedAt: new Date(),
      lastPing: new Date(),
      subscriptions: new Set(['metrics']) // По умолчанию подписка на метрики
    };

    this.clients.set(clientId, client);
    
    // Настраиваем обработчики событий
    socket.addEventListener('message', (event) => {
      this.handleMessage(clientId, event.data);
    });

    socket.addEventListener('close', () => {
      this.removeClient(clientId);
    });

    // Отправляем приветственное сообщение
    this.sendToClient(clientId, {
      type: 'ping',
      payload: { clientId, message: 'Connected to Art Bank Core WebSocket' },
      timestamp: new Date().toISOString()
    });

    return clientId;
  }

  /**
   * Удалить клиента
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.socket.close();
      } catch (error) {
        console.error(`Error closing socket for client ${clientId}:`, error);
      }
      this.clients.delete(clientId);
    }
  }

  /**
   * Обработка входящего сообщения
   */
  private handleMessage(clientId: string, data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);
      const client = this.clients.get(clientId);
      
      if (!client) return;

      switch (message.type) {
        case 'pong':
          client.lastPing = new Date();
          break;
        
        case 'subscribe':
          if (message.payload?.channel) {
            client.subscriptions.add(message.payload.channel);
            this.sendToClient(clientId, {
              type: 'subscribe',
              payload: { channel: message.payload.channel, status: 'subscribed' },
              timestamp: new Date().toISOString()
            });
          }
          break;
        
        case 'unsubscribe':
          if (message.payload?.channel) {
            client.subscriptions.delete(message.payload.channel);
            this.sendToClient(clientId, {
              type: 'unsubscribe',
              payload: { channel: message.payload.channel, status: 'unsubscribed' },
              timestamp: new Date().toISOString()
            });
          }
          break;
      }
    } catch (error) {
      console.error(`Error handling message from client ${clientId}:`, error);
    }
  }

  /**
   * Отправить сообщение конкретному клиенту
   */
  sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      try {
        client.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to client ${clientId}:`, error);
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Broadcast сообщение всем клиентам (с фильтрацией по подписке)
   */
  broadcast(message: WebSocketMessage, channel?: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      // Если указан канал, проверяем подписку
      if (channel && !client.subscriptions.has(channel)) {
        continue;
      }

      this.sendToClient(clientId, message);
    }
  }

  /**
   * Broadcast метрик всем подписанным клиентам
   */
  broadcastMetrics(metrics: any): void {
    this.broadcast({
      type: 'metrics',
      payload: metrics,
      timestamp: new Date().toISOString()
    }, 'metrics');
  }

  /**
   * Broadcast логов всем подписанным клиентам
   */
  broadcastLogs(logs: any): void {
    this.broadcast({
      type: 'logs',
      payload: logs,
      timestamp: new Date().toISOString()
    }, 'logs');
  }

  /**
   * Broadcast health статуса всем подписанным клиентам
   */
  broadcastHealth(health: any): void {
    this.broadcast({
      type: 'health',
      payload: health,
      timestamp: new Date().toISOString()
    }, 'health');
  }

  /**
   * Broadcast алертов всем клиентам
   */
  broadcastAlert(alert: any): void {
    this.broadcast({
      type: 'alert',
      payload: alert,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Heartbeat проверка соединений
   * Note: В Cloudflare Workers нельзя использовать setInterval
   * Heartbeat должен быть реализован через scheduled events или вызываться вручную
   */
  private startHeartbeat(): void {
    // DISABLED для Cloudflare Workers
    // В production используйте Durable Objects или Cloudflare Cron Triggers
    console.log('Heartbeat disabled in Cloudflare Workers environment');
  }

  /**
   * Остановить heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  /**
   * Получить количество подключенных клиентов
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Получить список подключенных клиентов
   */
  getClients(): Array<{ id: string; connectedAt: string; subscriptions: string[] }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt.toISOString(),
      subscriptions: Array.from(client.subscriptions)
    }));
  }

  /**
   * Генерация уникального ID клиента
   */
  private generateClientId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Cleanup при завершении работы
   */
  shutdown(): void {
    this.stopHeartbeat();
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}
