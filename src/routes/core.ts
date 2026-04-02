/**
 * Core API Routes
 * 
 * Public and protected endpoints for core entities:
 * - Nodes (artists, collectors, galleries, banks, experts)
 * - Edges (relationships)
 * - Artworks (art pieces)
 * - Transactions (financial operations)
 * - Validations (expert validations)
 * - Events (event bus)
 * - Saga logs (distributed transactions)
 * - Admin operations (emergency controls)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';
import { 
  globalEventBus, 
  createTradeEvent, 
  createAssetEvent, 
  createPriceCalculationEvent 
} from '../lib/events';
import { circuitBreakers, CircuitBreakerOpenError } from '../lib/circuit-breaker';
import { createPurchaseSaga } from '../lib/saga';
import { authMiddleware } from '../middleware/auth-middleware';
import { cacheArtworks } from '../middleware/cache';
import { getLogger } from '../middleware/logger';

const coreRoutes = new Hono<{ Bindings: Env }>();

// ===== EXPORT API (PROTECTED) =====

coreRoutes.get('/export/:type', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const exportType = c.req.param('type');
  const format = c.req.query('format') || 'json';
  const db = new ArtBankDB(c.env.DB);

  logger.info('Export request', { exportType, format });

  try {
    let data: any[];
    
    switch (exportType) {
      case 'nodes':
        data = await db.getAllNodes();
        break;
      case 'artworks':
        data = await db.getAllArtworks();
        break;
      case 'transactions':
        data = await db.getAllTransactions();
        break;
      case 'validations':
        data = await db.getAllValidations();
        break;
      default:
        return c.json({ error: 'Invalid export type' }, 400);
    }

    if (format === 'csv') {
      const csv = convertToCSV(data);
      return c.text(csv, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${exportType}-${Date.now()}.csv"`
      });
    }

    return c.json(data);
  } catch (error: any) {
    logger.error('Export failed', error, { exportType, format });
    return c.json({ error: 'Export failed', message: error.message }, 500);
  }
});

// ===== NODES API =====

coreRoutes.get('/nodes', async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const nodes = await db.getAllNodes();
    logger.info('Nodes fetched', { count: nodes.length });
    return c.json(nodes);
  } catch (error: any) {
    logger.error('Failed to fetch nodes', error);
    return c.json({ error: 'Failed to fetch nodes' }, 500);
  }
});

coreRoutes.get('/nodes/:id', async (c) => {
  const logger = getLogger(c);
  const id = c.req.param('id');
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const node = await db.getNode(id);
    if (!node) {
      return c.json({ error: 'Node not found' }, 404);
    }
    logger.info('Node fetched', { nodeId: id });
    return c.json(node);
  } catch (error: any) {
    logger.error('Failed to fetch node', error, { nodeId: id });
    return c.json({ error: 'Failed to fetch node' }, 500);
  }
});

coreRoutes.post('/nodes', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const body = await c.req.json();
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const node = await db.createNode(body);
    logger.info('Node created', { nodeId: node.id, type: body.node_type });
    return c.json(node, 201);
  } catch (error: any) {
    logger.error('Failed to create node', error, { body });
    return c.json({ error: 'Failed to create node' }, 500);
  }
});

coreRoutes.put('/nodes/:id', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const node = await db.updateNode(id, body);
    logger.info('Node updated', { nodeId: id });
    return c.json(node);
  } catch (error: any) {
    logger.error('Failed to update node', error, { nodeId: id, body });
    return c.json({ error: 'Failed to update node' }, 500);
  }
});

coreRoutes.delete('/nodes/:id', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const id = c.req.param('id');
  const db = new ArtBankDB(c.env.DB);
  
  try {
    await db.deleteNode(id);
    logger.info('Node deleted', { nodeId: id });
    return c.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete node', error, { nodeId: id });
    return c.json({ error: 'Failed to delete node' }, 500);
  }
});

// ===== EDGES API =====

coreRoutes.get('/edges', async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const edges = await db.getAllEdges();
    logger.info('Edges fetched', { count: edges.length });
    return c.json(edges);
  } catch (error: any) {
    logger.error('Failed to fetch edges', error);
    return c.json({ error: 'Failed to fetch edges' }, 500);
  }
});

coreRoutes.post('/edges', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const body = await c.req.json();
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const edge = await db.createEdge(body);
    logger.info('Edge created', { edgeId: edge.id, type: body.edge_type });
    return c.json(edge, 201);
  } catch (error: any) {
    logger.error('Failed to create edge', error, { body });
    return c.json({ error: 'Failed to create edge' }, 500);
  }
});

// ===== ARTWORKS API =====

coreRoutes.get('/artworks', cacheArtworks, async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const artworks = await db.getAllArtworks();
    logger.info('Artworks fetched', { count: artworks.length });
    return c.json(artworks);
  } catch (error: any) {
    logger.error('Failed to fetch artworks', error);
    return c.json({ error: 'Failed to fetch artworks' }, 500);
  }
});

coreRoutes.get('/artworks/:id', async (c) => {
  const logger = getLogger(c);
  const id = c.req.param('id');
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const artwork = await db.getArtwork(id);
    if (!artwork) {
      return c.json({ error: 'Artwork not found' }, 404);
    }
    logger.info('Artwork fetched', { artworkId: id });
    return c.json(artwork);
  } catch (error: any) {
    logger.error('Failed to fetch artwork', error, { artworkId: id });
    return c.json({ error: 'Failed to fetch artwork' }, 500);
  }
});

coreRoutes.post('/artworks', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const body = await c.req.json();
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const artwork = await db.createArtwork(body);
    
    // Publish asset creation event
    const event = createAssetEvent(artwork.id, 'created', {
      title: body.title,
      artist_id: body.artist_id
    });
    globalEventBus.publish(event);
    
    logger.info('Artwork created', { artworkId: artwork.id, title: body.title });
    return c.json(artwork, 201);
  } catch (error: any) {
    logger.error('Failed to create artwork', error, { body });
    return c.json({ error: 'Failed to create artwork' }, 500);
  }
});

coreRoutes.get('/artworks/:id/price-history', async (c) => {
  const logger = getLogger(c);
  const artworkId = c.req.param('id');
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const history = await db.getArtworkPriceHistory(artworkId);
    logger.info('Price history fetched', { artworkId, count: history.length });
    return c.json(history);
  } catch (error: any) {
    logger.error('Failed to fetch price history', error, { artworkId });
    return c.json({ error: 'Failed to fetch price history' }, 500);
  }
});

coreRoutes.post('/artworks/:id/tags', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const artworkId = c.req.param('id');
  const { tags } = await c.req.json();
  const db = new ArtBankDB(c.env.DB);
  
  try {
    await db.addArtworkTags(artworkId, tags);
    logger.info('Tags added to artwork', { artworkId, tags });
    return c.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to add tags', error, { artworkId, tags });
    return c.json({ error: 'Failed to add tags' }, 500);
  }
});

// ===== TRANSACTIONS API =====

coreRoutes.get('/transactions', async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const transactions = await db.getAllTransactions();
    logger.info('Transactions fetched', { count: transactions.length });
    return c.json(transactions);
  } catch (error: any) {
    logger.error('Failed to fetch transactions', error);
    return c.json({ error: 'Failed to fetch transactions' }, 500);
  }
});

coreRoutes.post('/transactions', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const body = await c.req.json();
  const db = new ArtBankDB(c.env.DB);
  
  try {
    // Start distributed saga for purchase
    const saga = createPurchaseSaga(
      body.from_node_id,
      body.to_node_id,
      body.artwork_id,
      body.amount
    );
    
    const result = await saga.execute();
    
    if (result.status === 'completed') {
      const transaction = await db.createTransaction(body);
      
      // Publish trade event
      const event = createTradeEvent(
        body.from_node_id,
        body.to_node_id,
        body.artwork_id,
        body.amount
      );
      globalEventBus.publish(event);
      
      logger.info('Transaction completed', { 
        transactionId: transaction.id, 
        amount: body.amount,
        sagaId: saga.id 
      });
      
      return c.json({ transaction, saga: result }, 201);
    } else {
      logger.warn('Transaction saga failed', { 
        sagaId: saga.id, 
        status: result.status 
      });
      return c.json({ 
        error: 'Transaction failed', 
        saga: result 
      }, 400);
    }
  } catch (error: any) {
    logger.error('Failed to create transaction', error, { body });
    
    if (error instanceof CircuitBreakerOpenError) {
      return c.json({ 
        error: 'Service temporarily unavailable', 
        message: error.message 
      }, 503);
    }
    
    return c.json({ error: 'Failed to create transaction' }, 500);
  }
});

// ===== VALIDATIONS API =====

coreRoutes.get('/validations', async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const validations = await db.getAllValidations();
    logger.info('Validations fetched', { count: validations.length });
    return c.json(validations);
  } catch (error: any) {
    logger.error('Failed to fetch validations', error);
    return c.json({ error: 'Failed to fetch validations' }, 500);
  }
});

coreRoutes.post('/validations', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const body = await c.req.json();
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const validation = await db.createValidation(body);
    logger.info('Validation created', { 
      validationId: validation.id, 
      artworkId: body.artwork_id 
    });
    return c.json(validation, 201);
  } catch (error: any) {
    logger.error('Failed to create validation', error, { body });
    return c.json({ error: 'Failed to create validation' }, 500);
  }
});

// ===== EVENTS & SAGA LOGS =====

coreRoutes.get('/events', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const limit = parseInt(c.req.query('limit') || '100');
  
  try {
    const events = globalEventBus.getRecentEvents(limit);
    logger.info('Events fetched', { count: events.length });
    return c.json(events);
  } catch (error: any) {
    logger.error('Failed to fetch events', error);
    return c.json({ error: 'Failed to fetch events' }, 500);
  }
});

coreRoutes.get('/saga-logs', async (c) => {
  const logger = getLogger(c);
  const db = new ArtBankDB(c.env.DB);
  const limit = parseInt(c.req.query('limit') || '50');
  
  try {
    const logs = await db.getSagaLogs(limit);
    logger.info('Saga logs fetched', { count: logs.length });
    return c.json(logs);
  } catch (error: any) {
    logger.error('Failed to fetch saga logs', error);
    return c.json({ error: 'Failed to fetch saga logs' }, 500);
  }
});

// ===== ADMIN OPERATIONS =====

coreRoutes.post('/admin/emergency-stop', authMiddleware, async (c) => {
  const logger = getLogger(c);
  
  try {
    circuitBreakers.openAll();
    logger.warn('Emergency stop triggered', { user: c.get('jwtPayload') });
    return c.json({ 
      message: 'All circuit breakers opened. System in safe mode.' 
    });
  } catch (error: any) {
    logger.error('Emergency stop failed', error);
    return c.json({ error: 'Emergency stop failed' }, 500);
  }
});

coreRoutes.post('/admin/reset-circuit-breaker/:name', authMiddleware, async (c) => {
  const logger = getLogger(c);
  const name = c.req.param('name');
  
  try {
    circuitBreakers.reset(name);
    logger.info('Circuit breaker reset', { breakerName: name });
    return c.json({ 
      message: `Circuit breaker '${name}' reset successfully.` 
    });
  } catch (error: any) {
    logger.error('Circuit breaker reset failed', error, { breakerName: name });
    return c.json({ error: 'Circuit breaker reset failed' }, 500);
  }
});

// ===== HELPER FUNCTIONS =====

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}

export default coreRoutes;
