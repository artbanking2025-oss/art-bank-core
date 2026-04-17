/**
 * WebSocket Routes
 * Art Bank Core v2.13 - Real-Time Communication
 */

import { Hono } from 'hono';
import { getWebSocketManager } from '../lib/websocket-manager';
import { metrics } from '../lib/metrics';
import type { Env } from '../types/env';

const app = new Hono<{ Bindings: Env }>();

/**
 * WebSocket Upgrade Endpoint
 * GET /api/ws - Upgrade HTTP connection to WebSocket
 */
app.get('/ws', async (c) => {
  // Проверяем, что это WebSocket upgrade request
  const upgradeHeader = c.req.header('Upgrade');
  
  if (upgradeHeader !== 'websocket') {
    return c.json({
      error: 'Expected WebSocket upgrade request',
      hint: 'Use WebSocket client to connect to this endpoint'
    }, 400);
  }

  // Cloudflare Workers WebSocket upgrade
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  // Принимаем WebSocket соединение
  server.accept();

  // Добавляем клиента в менеджер
  const wsManager = getWebSocketManager();
  const clientId = wsManager.addClient(server as any);

  console.log(`WebSocket client connected: ${clientId}`);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

/**
 * WebSocket Status Endpoint
 * GET /api/ws/status - Получить статус WebSocket соединений
 */
app.get('/ws/status', async (c) => {
  const wsManager = getWebSocketManager();
  
  return c.json({
    status: 'active',
    connectedClients: wsManager.getClientCount(),
    clients: wsManager.getClients(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Broadcast Test Endpoint (Admin only)
 * POST /api/ws/broadcast - Отправить тестовое сообщение всем клиентам
 */
app.post('/ws/broadcast', async (c) => {
  const wsManager = getWebSocketManager();
  const body = await c.req.json();

  wsManager.broadcast({
    type: body.type || 'alert',
    payload: body.payload || { message: 'Test broadcast message' },
    timestamp: new Date().toISOString()
  });

  return c.json({
    success: true,
    message: 'Broadcast sent',
    recipients: wsManager.getClientCount(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Функция для периодической отправки метрик через WebSocket
 * Вызывается из metrics middleware
 */
export function broadcastMetricsUpdate(): void {
  const wsManager = getWebSocketManager();

  // Отправляем только если есть подключенные клиенты
  if (wsManager.getClientCount() > 0) {
    const systemMetrics = metrics.getSystemMetrics();
    wsManager.broadcastMetrics(systemMetrics);
  }
}

export default app;
