import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import type { Env } from './types';
import { ArtBankDB } from './lib/db';
import { 
  globalEventBus, 
  createTradeEvent, 
  createAssetEvent, 
  createPriceCalculationEvent 
} from './lib/events';
import { circuitBreakers, CircuitBreakerOpenError } from './lib/circuit-breaker';
import { createPurchaseSaga } from './lib/saga';
import { renderAnalyticsDashboard } from './analytics-dashboard-render';

// Import role-specific routes
import artist from './routes/artist';
import collector from './routes/collector';
import gallery from './routes/gallery';
import bank from './routes/bank';
import expert from './routes/expert';
import analyticsExtended from './routes/analytics-extended';
import mediaHub from './routes/media-hub';
import graphSegmentation from './routes/graph-segmentation';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for API
app.use('/api/*', cors());

// Serve static files from /static/* path
app.use('/static/*', serveStatic({ root: './public' }));

// ========== ROLE-SPECIFIC ROUTES ==========
app.route('/api/artist', artist);
app.route('/api/collector', collector);
app.route('/api/gallery', gallery);
app.route('/api/bank', bank);
app.route('/api/expert', expert);

// ========== ANALYTICS EXTENDED ROUTES ==========
app.route('/api/analytics-extended', analyticsExtended);

// ========== MEDIA HUB ROUTES ==========
app.route('/api/media-hub', mediaHub);

// ========== GRAPH SEGMENTATION ROUTES ==========
app.route('/api/graph-segmentation', graphSegmentation);

// ========== API ROUTES ==========

// Graph Data API (for visualization)
app.get('/api/graph-data', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const graphData = await db.getGraphData();
  return c.json(graphData);
});

// Export API - Universal data export in CSV or JSON
app.get('/api/export/:type', async (c) => {
  const exportType = c.req.param('type'); // 'nodes', 'artworks', 'transactions', 'validations'
  const format = c.req.query('format') || 'json'; // 'json' or 'csv'
  const db = new ArtBankDB(c.env.DB);
  
  try {
    let data: any[] = [];
    let filename = '';
    
    switch (exportType) {
      case 'nodes':
        data = await db.getAllNodes();
        filename = 'art_bank_nodes';
        break;
      case 'artworks':
        data = await db.getAllArtworks();
        filename = 'art_bank_artworks';
        break;
      case 'transactions':
        data = await db.getAllTransactions();
        filename = 'art_bank_transactions';
        break;
      case 'validations':
        const artworks = await db.getAllArtworks();
        const validations = [];
        for (const artwork of artworks) {
          const vals = await db.getValidationsByArtwork(artwork.id);
          validations.push(...vals);
        }
        data = validations;
        filename = 'art_bank_validations';
        break;
      default:
        return c.json({ error: 'Invalid export type' }, 400);
    }
    
    if (format === 'csv') {
      const csv = convertToCSV(data);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}_${Date.now()}.csv"`
        }
      });
    } else {
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}_${Date.now()}.json"`
        }
      });
    }
  } catch (error: any) {
    console.error('Export error:', error);
    return c.json({ error: 'Export failed', details: error.message }, 500);
  }
});

// Nodes API
app.get('/api/nodes', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const type = c.req.query('type');
  
  const nodes = type ? await db.getNodesByType(type) : await db.getAllNodes();
  return c.json({ nodes });
});

app.get('/api/nodes/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const node = await db.getNode(c.req.param('id'));
  
  if (!node) {
    return c.json({ error: 'Node not found' }, 404);
  }
  
  return c.json({ node });
});

app.post('/api/nodes', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const node = await db.createNode(data);
    await db.logActivity(node.id, 'created', { node_type: node.node_type, name: node.name });
    return c.json({ node }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Edges API
app.get('/api/edges', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const nodeId = c.req.query('node_id');
  
  const edges = nodeId ? await db.getEdgesByNode(nodeId) : await db.getAllEdges();
  return c.json({ edges });
});

app.post('/api/edges', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const edge = await db.createEdge(data);
    await db.logActivity(data.from_node_id, 'edge_created', { 
      to: data.to_node_id, 
      type: data.edge_type 
    });
    return c.json({ edge }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Artworks API
app.get('/api/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.query('artist_id');
  const ownerId = c.req.query('owner_id');
  
  let artworks;
  if (artistId) {
    artworks = await db.getArtworksByArtist(artistId);
  } else if (ownerId) {
    artworks = await db.getArtworksByOwner(ownerId);
  } else {
    artworks = await db.getAllArtworks();
  }
  
  return c.json({ artworks });
});

app.get('/api/artworks/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artwork = await db.getArtwork(c.req.param('id'));
  
  if (!artwork) {
    return c.json({ error: 'Artwork not found' }, 404);
  }
  
  return c.json({ artwork });
});

app.post('/api/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const artwork = await db.createArtwork(data);
    await db.logActivity(data.artist_node_id, 'artwork_created', { 
      artwork_id: artwork.id, 
      title: artwork.title 
    });
    
    // Create edge: Artist -> Artwork
    await db.createEdge({
      from_node_id: data.artist_node_id,
      to_node_id: artwork.id,
      edge_type: 'created',
      weight: 1.0
    });
    
    return c.json({ artwork }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Transactions API
app.get('/api/transactions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const nodeId = c.req.query('node_id');
  const artworkId = c.req.query('artwork_id');
  
  let transactions;
  if (nodeId) {
    transactions = await db.getTransactionsByNode(nodeId);
  } else if (artworkId) {
    transactions = await db.getTransactionsByArtwork(artworkId);
  } else {
    transactions = await db.getAllTransactions();
  }
  
  return c.json({ transactions });
});

app.post('/api/transactions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const transaction = await db.createTransaction(data);
    
    // Update artwork owner
    await db.updateArtworkOwner(data.artwork_id, data.to_node_id);
    
    // Log activity
    await db.logActivity(data.from_node_id, 'transaction_created', { 
      transaction_id: transaction.id,
      artwork_id: data.artwork_id,
      price: data.price 
    });
    
    // Publish TRADE_CREATED event
    const tradeEvent = createTradeEvent('TRADE_CREATED', {
      transaction_id: transaction.id,
      artwork_id: data.artwork_id,
      from_node_id: data.from_node_id,
      to_node_id: data.to_node_id,
      price: data.price,
      bank_node_id: data.bank_node_id
    });
    await globalEventBus.publish(tradeEvent);
    
    return c.json({ transaction }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

app.patch('/api/transactions/:id/status', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { status } = await c.req.json();
  
  try {
    await db.updateTransactionStatus(parseInt(c.req.param('id')), status);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Saga-based transaction endpoint (с автоматическим откатом при ошибках)
app.post('/api/transactions/saga', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    // Создаём сагу для покупки
    const saga = createPurchaseSaga({
      artwork_id: data.artwork_id,
      buyer_id: data.to_node_id,
      seller_id: data.from_node_id,
      price: data.price,
      bank_id: data.bank_node_id,
      loan_amount: data.loan_amount,
      db
    });
    
    // Выполняем сагу
    const result = await saga.execute();
    
    if (result.success) {
      // Успех - публикуем событие
      const transaction = result.results.create_transaction;
      
      const tradeEvent = createTradeEvent('TRADE_COMPLETED', {
        transaction_id: transaction.id,
        artwork_id: data.artwork_id,
        from_node_id: data.from_node_id,
        to_node_id: data.to_node_id,
        price: data.price,
        bank_node_id: data.bank_node_id
      });
      await globalEventBus.publish(tradeEvent);
      
      return c.json({
        success: true,
        transaction,
        saga_status: saga.getStatus()
      }, 201);
    } else {
      // Ошибка - сага автоматически откатила изменения
      const tradeEvent = createTradeEvent('TRADE_CANCELLED', {
        transaction_id: 0,
        artwork_id: data.artwork_id,
        from_node_id: data.from_node_id,
        to_node_id: data.to_node_id,
        price: data.price
      });
      await globalEventBus.publish(tradeEvent);
      
      return c.json({
        success: false,
        error: result.error?.message || 'Transaction failed',
        failed_step: result.failedStep,
        completed_steps: result.completedSteps,
        saga_status: saga.getStatus()
      }, 400);
    }
  } catch (error: any) {
    return c.json({ 
      success: false,
      error: error.message 
    }, 500);
  }
});

// Analytics Integration API with Circuit Breaker
app.post('/api/analytics/fair-price', async (c) => {
  const data = await c.req.json();
  const analyticsUrl = c.env.ANALYTICS_SERVICE_URL || 'http://localhost:8000';
  
  try {
    // Выполнение через Circuit Breaker
    const result = await circuitBreakers.analyticsService.execute(async () => {
      const response = await fetch(`${analyticsUrl}/analytics/calculate_fair_price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Analytics service error');
      }
      
      return await response.json();
    });
    
    // Publish PRICE_CALCULATED event
    const priceEvent = createPriceCalculationEvent({
      artwork_id: result.asset_id,
      fair_value: result.fair_value,
      risk_score: result.risk_score,
      confidence_interval: result.confidence_interval,
      reasoning: result.reasoning
    });
    await globalEventBus.publish(priceEvent);
    
    return c.json(result);
    
  } catch (error: any) {
    if (error instanceof CircuitBreakerOpenError) {
      console.error('[Analytics API] Circuit breaker is OPEN:', error.message);
      return c.json({ 
        error: 'Analytics service temporarily unavailable',
        details: 'Service is experiencing issues. Please try again later.',
        circuit_breaker_status: 'OPEN'
      }, 503);
    }
    
    console.error('[Analytics API] Error:', error.message);
    return c.json({ 
      error: 'Failed to connect to Analytics Service',
      details: error.message 
    }, 503);
  }
});

app.post('/api/analytics/risk-score', async (c) => {
  const data = await c.req.json();
  const analyticsUrl = c.env.ANALYTICS_SERVICE_URL || 'http://localhost:8000';
  
  try {
    // Выполнение через Circuit Breaker
    const result = await circuitBreakers.analyticsService.execute(async () => {
      const response = await fetch(`${analyticsUrl}/analytics/risk_score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Analytics service error');
      }
      
      return await response.json();
    });
    
    return c.json(result);
    
  } catch (error: any) {
    if (error instanceof CircuitBreakerOpenError) {
      console.error('[Analytics API] Circuit breaker is OPEN:', error.message);
      return c.json({ 
        error: 'Analytics service temporarily unavailable',
        details: 'Service is experiencing issues. Please try again later.',
        circuit_breaker_status: 'OPEN'
      }, 503);
    }
    
    console.error('[Analytics API] Error:', error.message);
    return c.json({ 
      error: 'Failed to connect to Analytics Service',
      details: error.message 
    }, 503);
  }
});

// Circuit Breaker Status endpoint
app.get('/api/analytics/status', (c) => {
  const stats = circuitBreakers.analyticsService.getStats();
  return c.json({
    service: 'Analytics Service',
    circuit_breaker: stats,
    health: stats.state === 'CLOSED' ? 'healthy' : 'degraded'
  });
});

// Validations API
app.get('/api/validations', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.query('artwork_id');
  const expertId = c.req.query('expert_id');
  
  let validations;
  if (artworkId) {
    validations = await db.getValidationsByArtwork(artworkId);
  } else if (expertId) {
    validations = await db.getValidationsByExpert(expertId);
  } else {
    validations = [];
  }
  
  return c.json({ validations });
});

app.post('/api/validations', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const validation = await db.createValidation(data);
    
    // Create edge: Expert -> Artwork
    await db.createEdge({
      from_node_id: data.expert_node_id,
      to_node_id: data.artwork_id,
      edge_type: 'validated',
      weight: data.confidence_level || 0.8
    });
    
    // Log activity
    await db.logActivity(data.expert_node_id, 'validation_created', { 
      validation_id: validation.id,
      artwork_id: data.artwork_id 
    });
    
    // Publish ASSET_VALIDATED event
    const validationEvent = createAssetEvent('ASSET_VALIDATED', {
      artwork_id: data.artwork_id,
      expert_node_id: data.expert_node_id,
      validation_result: data.result
    });
    await globalEventBus.publish(validationEvent);
    
    return c.json({ validation }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Events API (для мониторинга событийной архитектуры)
app.get('/api/events', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const type = c.req.query('type');
  
  const events = type 
    ? globalEventBus.getEventsByType(type as any, limit)
    : globalEventBus.getRecentEvents(limit);
  
  return c.json({ events, count: events.length });
});

// ========== MEDIA HUB API ==========

// Create media item (news, article, social post)
app.post('/api/media', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const mediaId = crypto.randomUUID();
    const mediaItem = await db.createMediaItem({
      id: mediaId,
      type: data.type,
      source: data.source,
      url: data.url,
      title: data.title,
      content: data.content,
      author: data.author,
      published_at: data.published_at || new Date().toISOString(),
      sentiment_score: data.sentiment_score || 0.0,
      influence_score: data.influence_score || 0.0
    });
    
    // Добавляем упоминания сущностей
    if (data.mentions && Array.isArray(data.mentions)) {
      for (const mention of data.mentions) {
        await db.addMediaMention(
          mediaId,
          mention.entity_type,
          mention.entity_id,
          mention.context,
          mention.relevance || 1.0
        );
      }
    }
    
    return c.json({ media_item: mediaItem, mentions_added: data.mentions?.length || 0 }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Get media by entity (artwork, artist, etc.)
app.get('/api/media/by-entity', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const entityType = c.req.query('entity_type');
  const entityId = c.req.query('entity_id');
  
  if (!entityType || !entityId) {
    return c.json({ error: 'entity_type and entity_id are required' }, 400);
  }
  
  const media = await db.getMediaByEntity(entityType, entityId);
  return c.json({ media, count: media.length });
});

// ========== JUNCTION TABLES API ==========

// Add exhibition
app.post('/api/exhibitions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const exhibition = await db.addExhibition(data);
    return c.json({ exhibition }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Get exhibitions by artwork
app.get('/api/artworks/:id/exhibitions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  
  const exhibitions = await db.getExhibitionsByArtwork(artworkId);
  return c.json({ exhibitions });
});

// Get exhibitions by gallery
app.get('/api/galleries/:id/exhibitions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const galleryId = c.req.param('id');
  
  const exhibitions = await db.getExhibitionsByGallery(galleryId);
  return c.json({ exhibitions });
});

// Add tags to artwork
app.post('/api/artworks/:id/tags', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  const { tag_id, relevance } = await c.req.json();
  
  try {
    await db.addArtworkTag(artworkId, tag_id, relevance);
    return c.json({ success: true }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Get artwork tags
app.get('/api/artworks/:id/tags', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  
  const tags = await db.getArtworkTags(artworkId);
  return c.json({ tags });
});

// Get artworks by tag
app.get('/api/tags/:id/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const tagId = c.req.param('id');
  
  const artworks = await db.getArtworksByTag(tagId);
  return c.json({ artworks });
});

// Get price history
app.get('/api/artworks/:id/price-history', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '100');
  
  const priceHistory = await db.getPriceHistory(artworkId, limit);
  return c.json({ price_history: priceHistory });
});

// Get Saga logs
app.get('/api/saga-logs', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const limit = parseInt(c.req.query('limit') || '50');
  
  const logs = await db.getSagaLogs(limit);
  return c.json({ saga_logs: logs });
});

// Circuit Breaker Monitoring API
app.get('/api/health/circuit-breakers', async (c) => {
  const stats = {
    analytics_service: circuitBreakers.analyticsService.getStats(),
    timestamp: new Date().toISOString(),
    healthy: circuitBreakers.analyticsService.getStats().state === 'CLOSED'
  };
  
  return c.json(stats);
});

// STOP Mechanism - Force Circuit Breaker Open (экстренное отключение сервиса)
app.post('/api/admin/emergency-stop', async (c) => {
  const { service, reason } = await c.req.json();
  
  if (!service || !reason) {
    return c.json({ 
      error: 'Service name and reason are required' 
    }, 400);
  }
  
  try {
    if (service === 'analytics') {
      circuitBreakers.analyticsService.forceOpen(reason);
      
      // Публикуем системное событие (без логирования в БД)
      console.warn(`[EMERGENCY STOP] ${service}: ${reason}`);
      
      return c.json({
        success: true,
        message: `Circuit breaker for ${service} has been opened`,
        reason,
        timestamp: new Date().toISOString(),
        status: circuitBreakers.analyticsService.getStats()
      });
    } else {
      return c.json({ 
        error: `Unknown service: ${service}` 
      }, 400);
    }
  } catch (error: any) {
    return c.json({ 
      error: error.message 
    }, 500);
  }
});

// Reset Circuit Breaker (восстановление после STOP)
app.post('/api/admin/reset-circuit-breaker', async (c) => {
  const { service } = await c.req.json();
  
  if (!service) {
    return c.json({ 
      error: 'Service name is required' 
    }, 400);
  }
  
  try {
    if (service === 'analytics') {
      circuitBreakers.analyticsService.reset();
      
      console.log(`[RECOVERY] ${service} circuit breaker reset`);
      
      return c.json({
        success: true,
        message: `Circuit breaker for ${service} has been reset`,
        timestamp: new Date().toISOString(),
        status: circuitBreakers.analyticsService.getStats()
      });
    } else {
      return c.json({ 
        error: `Unknown service: ${service}` 
      }, 400);
    }
  } catch (error: any) {
    return c.json({ 
      error: error.message 
    }, 500);
  }
});

// Dashboard & Analytics
app.get('/api/dashboard/stats', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const stats = await db.getDashboardStats();
  return c.json({ stats });
});

app.get('/api/dashboard/graph', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const graphData = await db.getGraphData();
  return c.json(graphData);
});

app.get('/api/nodes/:id/activity', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const limit = parseInt(c.req.query('limit') || '50');
  const activity = await db.getActivityByNode(c.req.param('id'), limit);
  return c.json({ activity });
});

// ========== FRONTEND ROUTES ==========

// Main landing page with role selection
app.get('/', (c) => {
  return c.html(renderLandingPage());
});

// Analytics Dashboard (redirect to static file)
app.get('/dashboard/analytics', (c) => {
  return c.html(renderAnalyticsDashboard());
});

// 3D Visualization Dashboard (redirect to static file)
app.get('/dashboard/3d-visualization', (c) => {
  return c.redirect('/static/3d-visualization.html');
});

// Media Hub Dashboard (redirect to static file)
app.get('/dashboard/media', (c) => {
  return c.redirect('/static/media-dashboard.html');
});

// API Documentation page
app.get('/api-docs', (c) => {
  return c.redirect('/static/api-docs.html');
});

// Artwork detail page
app.get('/artwork/:id', async (c) => {
  const artworkId = c.req.param('id');
  const db = new ArtBankDB(c.env.DB);
  
  try {
    const artwork = await db.getArtwork(artworkId);
    if (!artwork) {
      return c.html('<h1>Artwork not found</h1>', 404);
    }
    
    const transactions = await db.getRecentTransactionsByArtwork(artworkId, 10);
    const validations = await db.getValidationsByArtwork(artworkId);
    const priceHistory = await db.getPriceHistory(artworkId);
    
    return c.html(renderArtworkDetailPage(artwork, transactions, validations, priceHistory));
  } catch (error: any) {
    console.error('Error loading artwork:', error);
    return c.html('<h1>Error loading artwork</h1>', 500);
  }
});

// Role-specific dashboards
app.get('/dashboard/:role', (c) => {
  const role = c.req.param('role');
  return c.html(renderDashboard(role));
});

export default app;

// ========== HTML RENDERERS ==========

// Helper function to convert JSON array to CSV
function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  // Get all unique keys from all objects
  const keys = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));
  
  // Create header row
  const header = keys.join(',');
  
  // Create data rows
  const rows = data.map(obj => {
    return keys.map(key => {
      let value = obj[key];
      
      // Handle different data types
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      
      // Escape quotes and wrap in quotes if contains comma or newline
      value = String(value).replace(/"/g, '""');
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${value}"`;
      }
      return value;
    }).join(',');
  });
  
  return [header, ...rows].join('\n');
}

function renderArtworkDetailPage(artwork: any, transactions: any[], validations: any[], priceHistory: any[]) {
  const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(price);
  const formatDate = (date: any) => new Date(date * 1000).toLocaleDateString('ru-RU');
  
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${artwork.title} - Art Bank</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body class="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 min-h-screen">
    <header class="bg-white shadow-md border-b-4 border-indigo-500">
        <div class="container mx-auto px-6 py-4 flex justify-between items-center">
            <div class="flex items-center space-x-4">
                <i class="fas fa-palette text-indigo-600 text-3xl"></i>
                <div>
                    <h1 class="text-2xl font-bold text-gray-800">${artwork.title}</h1>
                    <p class="text-sm text-gray-600">Art Bank - Детальная информация</p>
                </div>
            </div>
            <a href="/" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                <i class="fas fa-home mr-2"></i> На главную
            </a>
        </div>
    </header>

    <div class="container mx-auto px-6 py-8">
        <!-- Main Info Card -->
        <div class="bg-white rounded-xl shadow-lg p-8 mb-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <!-- Left Column -->
                <div>
                    <h2 class="text-3xl font-bold text-gray-800 mb-4">${artwork.title}</h2>
                    <div class="space-y-3">
                        <div class="flex items-start">
                            <span class="text-gray-600 w-32 font-semibold">Художник:</span>
                            <span class="text-gray-800">${artwork.artist_node_id}</span>
                        </div>
                        <div class="flex items-start">
                            <span class="text-gray-600 w-32 font-semibold">Год:</span>
                            <span class="text-gray-800">${artwork.year || 'Неизвестно'}</span>
                        </div>
                        <div class="flex items-start">
                            <span class="text-gray-600 w-32 font-semibold">Стиль:</span>
                            <span class="text-gray-800">${artwork.style || 'Неизвестно'}</span>
                        </div>
                        <div class="flex items-start">
                            <span class="text-gray-600 w-32 font-semibold">Медиум:</span>
                            <span class="text-gray-800">${artwork.medium || 'Неизвестно'}</span>
                        </div>
                        <div class="flex items-start">
                            <span class="text-gray-600 w-32 font-semibold">Размеры:</span>
                            <span class="text-gray-800">${artwork.dimensions || 'Неизвестно'}</span>
                        </div>
                        <div class="flex items-start">
                            <span class="text-gray-600 w-32 font-semibold">Состояние:</span>
                            <span class="text-gray-800">${artwork.condition || 'Неизвестно'}</span>
                        </div>
                        <div class="flex items-start">
                            <span class="text-gray-600 w-32 font-semibold">Владелец:</span>
                            <span class="text-gray-800">${artwork.owner_node_id || 'Неизвестно'}</span>
                        </div>
                    </div>
                </div>

                <!-- Right Column -->
                <div>
                    <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white mb-4">
                        <h3 class="text-lg font-semibold mb-2">Текущая цена (FPC)</h3>
                        <div class="text-4xl font-bold">${formatPrice(artwork.current_fpc)}</div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-blue-50 rounded-lg p-4">
                            <p class="text-sm text-gray-600 mb-1">Создано</p>
                            <p class="text-lg font-bold text-gray-800">${formatDate(artwork.created_at)}</p>
                        </div>
                        <div class="bg-green-50 rounded-lg p-4">
                            <p class="text-sm text-gray-600 mb-1">Обновлено</p>
                            <p class="text-lg font-bold text-gray-800">${formatDate(artwork.updated_at)}</p>
                        </div>
                    </div>

                    ${artwork.digital_signature ? `
                    <div class="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                        <p class="text-sm font-semibold text-gray-700 mb-1">
                            <i class="fas fa-certificate text-yellow-600 mr-2"></i>
                            Цифровая подпись
                        </p>
                        <p class="text-xs text-gray-600 font-mono break-all">${artwork.digital_signature}</p>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>

        <!-- Price History Chart -->
        ${priceHistory.length > 0 ? `
        <div class="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-chart-line mr-2 text-indigo-600"></i>
                История цен
            </h3>
            <canvas id="priceChart" height="80"></canvas>
        </div>
        ` : ''}

        <!-- Validations -->
        ${validations.length > 0 ? `
        <div class="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-check-circle mr-2 text-green-600"></i>
                Экспертные заключения (${validations.length})
            </h3>
            <div class="space-y-4">
                ${validations.map(v => `
                    <div class="border border-gray-200 rounded-lg p-4">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <span class="text-sm font-semibold text-gray-700">Эксперт:</span>
                                <span class="text-sm text-gray-600 ml-2">${v.expert_node_id}</span>
                            </div>
                            <span class="px-3 py-1 text-xs font-semibold rounded-full ${
                              v.confidence_level >= 0.8 ? 'bg-green-100 text-green-800' : 
                              v.confidence_level >= 0.5 ? 'bg-yellow-100 text-yellow-800' : 
                              'bg-red-100 text-red-800'
                            }">
                                Уверенность: ${(v.confidence_level * 100).toFixed(0)}%
                            </span>
                        </div>
                        <div class="text-sm text-gray-600">
                            <span class="font-semibold">Тип:</span> ${v.validation_type} | 
                            <span class="font-semibold">Оценка:</span> ${formatPrice(v.estimated_value)} | 
                            <span class="font-semibold">Дата:</span> ${formatDate(v.validated_at)}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <!-- Recent Transactions -->
        ${transactions.length > 0 ? `
        <div class="bg-white rounded-xl shadow-lg p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-exchange-alt mr-2 text-purple-600"></i>
                Недавние транзакции (${transactions.length})
            </h3>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="px-4 py-2 text-left">Дата</th>
                            <th class="px-4 py-2 text-left">От</th>
                            <th class="px-4 py-2 text-left">Кому</th>
                            <th class="px-4 py-2 text-right">Цена</th>
                            <th class="px-4 py-2 text-center">Статус</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map(t => `
                            <tr class="border-b hover:bg-gray-50">
                                <td class="px-4 py-2">${formatDate(t.transaction_date)}</td>
                                <td class="px-4 py-2 text-xs">${t.from_node_id?.substring(0, 12)}...</td>
                                <td class="px-4 py-2 text-xs">${t.to_node_id?.substring(0, 12)}...</td>
                                <td class="px-4 py-2 text-right font-semibold">${formatPrice(t.price)}</td>
                                <td class="px-4 py-2 text-center">
                                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${
                                      t.status === 'completed' ? 'bg-green-100 text-green-800' : 
                                      t.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                                      'bg-red-100 text-red-800'
                                    }">
                                        ${t.status}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
    </div>

    ${priceHistory.length > 0 ? `
    <script>
        const ctx = document.getElementById('priceChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(priceHistory.map(p => formatDate(p.recorded_at)))},
                datasets: [{
                    label: 'Цена',
                    data: ${JSON.stringify(priceHistory.map(p => p.price))},
                    borderColor: 'rgb(99, 102, 241)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => new Intl.NumberFormat('ru-RU', { 
                                style: 'currency', 
                                currency: 'RUB' 
                            }).format(context.parsed.y)
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: (value) => new Intl.NumberFormat('ru-RU', { 
                                notation: 'compact', 
                                compactDisplay: 'short' 
                            }).format(value) + ' ₽'
                        }
                    }
                }
            }
        });
    </script>
    ` : ''}
</body>
</html>
  `;
}

function renderLandingPage() {
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Art Bank - Графовая платформа для арт-рынка</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 min-h-screen">
    <div class="container mx-auto px-4 py-12">
        <div class="text-center mb-16">
            <h1 class="text-6xl font-bold text-white mb-4">
                <i class="fas fa-project-diagram mr-4"></i>
                Art Bank Core
            </h1>
            <p class="text-2xl text-blue-200">
                Графовая система для арт-рынка с репутационной моделью
            </p>
        </div>

        <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-12">
            <h2 class="text-3xl font-bold text-white mb-6">
                <i class="fas fa-info-circle mr-2"></i>
                О платформе
            </h2>
            <p class="text-lg text-blue-100 mb-4">
                Art Bank Core - это математическая модель арт-рынка, представленная в виде графа. 
                Каждый участник рынка - это узел (Node) с уникальным цифровым паспортом и репутационным весом.
            </p>
            <p class="text-lg text-blue-100">
                Связи между участниками формируют "доверительную сеть", которая автоматически выявляет 
                аномалии и обеспечивает прозрачность транзакций.
            </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <!-- Stats -->
            <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-center" id="stats-loading">
                <div class="text-4xl text-white mb-2">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <div class="text-blue-200">Загрузка статистики...</div>
            </div>
        </div>

        <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-white mb-8">
                <i class="fas fa-users mr-2"></i>
                Выберите роль для входа
            </h2>
            <p class="text-lg text-blue-200 mb-8">
                Каждая роль имеет свой интерфейс и набор функций
            </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Artist -->
            <a href="/dashboard/artist" class="group bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-palette"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Художник</h3>
                <p class="text-white/80 text-center">
                    Создание работ, цифровая подпись, отслеживание провенанса
                </p>
            </a>

            <!-- Collector -->
            <a href="/dashboard/collector" class="group bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-gem"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Коллекционер</h3>
                <p class="text-white/80 text-center">
                    Управление коллекцией, покупка, история владения
                </p>
            </a>

            <!-- Gallery -->
            <a href="/dashboard/gallery" class="group bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-store"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Галерея</h3>
                <p class="text-white/80 text-center">
                    Экспонирование работ, организация продаж
                </p>
            </a>

            <!-- Bank -->
            <a href="/dashboard/bank" class="group bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-university"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Банк</h3>
                <p class="text-white/80 text-center">
                    Кредитование под арт, валидация сделок
                </p>
            </a>

            <!-- Expert -->
            <a href="/dashboard/expert" class="group bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-certificate"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Эксперт</h3>
                <p class="text-white/80 text-center">
                    Оценка подлинности, экспертиза, сертификация
                </p>
            </a>

            <!-- Analytics Dashboard -->
            <a href="/dashboard/analytics" class="group bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-chart-line"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Аналитика 2D</h3>
                <p class="text-white/80 text-center">
                    Коридор цены, факторы рынка, графики
                </p>
            </a>

            <!-- 3D Visualization -->
            <a href="/dashboard/3d-visualization" class="group bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-cube"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">3D Визуализация</h3>
                <p class="text-white/80 text-center">
                    Трёхмерная модель рыночного давления
                </p>
            </a>

            <!-- Media Hub -->
            <a href="/dashboard/media" class="group bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-newspaper"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Media Hub</h3>
                <p class="text-white/80 text-center">
                    Анализ медиа, trending, влияние на цены
                </p>
            </a>

            <!-- Public View -->
            <a href="/dashboard/public" class="group bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-chart-network"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Публичный просмотр</h3>
                <p class="text-white/80 text-center">
                    Граф связей, статистика рынка, аналитика
                </p>
            </a>

            <!-- API Documentation -->
            <a href="/api-docs" class="group bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-book"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">API Документация</h3>
                <p class="text-white/80 text-center">
                    REST API Reference v2.3
                </p>
            </a>
        </div>
    </div>

    <!-- Network Graph Section -->
    <div class="max-w-7xl mx-auto px-4 py-16">
        <h2 class="text-3xl font-bold text-white mb-8 text-center">
            <i class="fas fa-project-diagram mr-3"></i>
            Граф рынка искусства
        </h2>
        <div id="network-graph" class="bg-white rounded-xl shadow-2xl p-4" style="height: 600px;"></div>
        <div class="mt-4 flex justify-center gap-4 text-white/80 text-sm">
            <div><span class="inline-block w-4 h-4 rounded-full bg-purple-500 mr-2"></span>Художники</div>
            <div><span class="inline-block w-4 h-4 rounded-full bg-green-500 mr-2"></span>Коллекционеры</div>
            <div><span class="inline-block w-4 h-4 rounded-full bg-blue-500 mr-2"></span>Галереи</div>
            <div><span class="inline-block w-4 h-4 rounded-full bg-yellow-500 mr-2"></span>Банки</div>
            <div><span class="inline-block w-4 h-4 rounded-full bg-red-500 mr-2"></span>Эксперты</div>
        </div>
    </div>

    <script src="https://unpkg.com/vis-network@9.1.2/dist/vis-network.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script>
        // Load stats
        axios.get('/api/dashboard/stats')
            .then(response => {
                const stats = response.data.stats;
                document.getElementById('stats-loading').outerHTML = \`
                    <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                        <div class="text-4xl font-bold text-white mb-2">\${stats.total_nodes}</div>
                        <div class="text-blue-200">Участников</div>
                    </div>
                    <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                        <div class="text-4xl font-bold text-white mb-2">\${stats.total_artworks}</div>
                        <div class="text-blue-200">Произведений</div>
                    </div>
                    <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                        <div class="text-4xl font-bold text-white mb-2">\${stats.total_transactions}</div>
                        <div class="text-blue-200">Транзакций</div>
                    </div>
                \`;
            })
            .catch(error => {
                console.error('Error loading stats:', error);
            });

        // Load network graph
        axios.get('/api/graph-data')
            .then(response => {
                const { nodes, edges } = response.data;
                
                // Color map for node types
                const colorMap = {
                    artist: '#9333ea',      // purple
                    collector: '#22c55e',   // green
                    gallery: '#3b82f6',     // blue
                    bank: '#eab308',        // yellow
                    expert: '#ef4444'       // red
                };

                // Prepare vis.js data
                const visNodes = nodes.map(node => ({
                    id: node.id,
                    label: node.name,
                    title: \`\${node.name}\\nТип: \${node.type}\\nДоверие: \${(node.trust_level * 100).toFixed(0)}%\`,
                    color: {
                        background: colorMap[node.type] || '#666',
                        border: '#fff',
                        highlight: {
                            background: colorMap[node.type] || '#666',
                            border: '#fbbf24'
                        }
                    },
                    font: { color: '#fff', size: 14 },
                    size: 20 + (node.trust_level * 30), // Size based on trust level
                    shape: 'dot'
                }));

                const visEdges = edges.map(edge => ({
                    from: edge.source,
                    to: edge.target,
                    label: edge.type,
                    width: edge.weight * 3,
                    arrows: 'to',
                    color: { color: '#cbd5e1', highlight: '#fbbf24' },
                    font: { size: 10, color: '#94a3b8', strokeWidth: 0 }
                }));

                // Create network
                const container = document.getElementById('network-graph');
                const data = { nodes: visNodes, edges: visEdges };
                const options = {
                    nodes: {
                        borderWidth: 2,
                        shadow: true
                    },
                    edges: {
                        smooth: {
                            type: 'continuous',
                            roundness: 0.5
                        }
                    },
                    physics: {
                        enabled: true,
                        barnesHut: {
                            gravitationalConstant: -8000,
                            centralGravity: 0.3,
                            springLength: 150,
                            springConstant: 0.04
                        },
                        stabilization: {
                            iterations: 200
                        }
                    },
                    interaction: {
                        hover: true,
                        tooltipDelay: 100,
                        navigationButtons: true,
                        keyboard: true
                    }
                };

                new vis.Network(container, data, options);
            })
            .catch(error => {
                console.error('Error loading graph:', error);
                document.getElementById('network-graph').innerHTML = 
                    '<div class="flex items-center justify-center h-full text-gray-500">Ошибка загрузки графа</div>';
            });
    </script>
</body>
</html>
  `;
}

function renderDashboard(role: string) {
  const roleConfig: Record<string, any> = {
    artist: {
      title: 'Панель художника',
      icon: 'fa-palette',
      color: 'from-pink-500 to-purple-600',
      features: ['Создать произведение', 'Мои работы', 'История провенанса', 'Цифровая подпись']
    },
    collector: {
      title: 'Панель коллекционера',
      icon: 'fa-gem',
      color: 'from-blue-500 to-cyan-600',
      features: ['Моя коллекция', 'Купить работу', 'История транзакций', 'Оценка портфеля']
    },
    gallery: {
      title: 'Панель галереи',
      icon: 'fa-store',
      color: 'from-amber-500 to-orange-600',
      features: ['Экспозиции', 'Продажи', 'Связи с художниками', 'Статистика']
    },
    bank: {
      title: 'Панель банка',
      icon: 'fa-university',
      color: 'from-green-500 to-emerald-600',
      features: ['Заявки на кредит', 'Валидация сделок', 'Портфель залогов', 'Риск-анализ']
    },
    expert: {
      title: 'Панель эксперта',
      icon: 'fa-certificate',
      color: 'from-indigo-500 to-purple-600',
      features: ['Запросы на экспертизу', 'Выданные сертификаты', 'Индекс точности', 'Репутация']
    },
    public: {
      title: 'Публичный просмотр',
      icon: 'fa-chart-network',
      color: 'from-gray-600 to-gray-800',
      features: ['Граф рынка', 'Статистика', 'Ценовые коридоры', 'Топ художников']
    }
  };

  const config = roleConfig[role] || roleConfig['public'];

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.title} - Art Bank</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100">
    <!-- Header -->
    <div class="bg-gradient-to-r ${config.color} text-white p-6 shadow-lg">
        <div class="container mx-auto flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold">
                    <i class="fas ${config.icon} mr-2"></i>
                    ${config.title}
                </h1>
            </div>
            <div>
                <a href="/" class="bg-white/20 hover:bg-white/30 px-6 py-2 rounded-lg transition">
                    <i class="fas fa-home mr-2"></i>
                    На главную
                </a>
            </div>
        </div>
    </div>

    <!-- Dashboard Content -->
    <div class="container mx-auto px-4 py-8">
        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8" id="stats-container">
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Всего узлов</p>
                        <p class="text-2xl font-bold" id="stat-nodes">-</p>
                    </div>
                    <i class="fas fa-circle-nodes text-4xl text-blue-500"></i>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Произведений</p>
                        <p class="text-2xl font-bold" id="stat-artworks">-</p>
                    </div>
                    <i class="fas fa-image text-4xl text-purple-500"></i>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Транзакций</p>
                        <p class="text-2xl font-bold" id="stat-transactions">-</p>
                    </div>
                    <i class="fas fa-exchange-alt text-4xl text-green-500"></i>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Ср. репутация</p>
                        <p class="text-2xl font-bold" id="stat-trust">-</p>
                    </div>
                    <i class="fas fa-star text-4xl text-yellow-500"></i>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <!-- Features -->
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-tasks mr-2"></i>
                    Доступные функции
                </h2>
                <div class="space-y-3">
                    ${config.features.map((f: string) => `
                        <div class="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition">
                            <i class="fas fa-chevron-right mr-3 text-gray-400"></i>
                            <span class="font-medium">${f}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Graph Preview -->
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-project-diagram mr-2"></i>
                    Граф связей
                </h2>
                <div class="bg-gray-50 rounded-lg h-64 flex items-center justify-center">
                    <canvas id="graphChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Data Tables -->
        <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-xl font-bold mb-4">
                <i class="fas fa-table mr-2"></i>
                Недавняя активность
            </h2>
            <div id="data-container" class="overflow-x-auto">
                <p class="text-gray-500">Загрузка данных...</p>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script>
        const role = '${role}';
        
        // Load stats
        axios.get('/api/dashboard/stats')
            .then(response => {
                const stats = response.data.stats;
                document.getElementById('stat-nodes').textContent = stats.total_nodes;
                document.getElementById('stat-artworks').textContent = stats.total_artworks;
                document.getElementById('stat-transactions').textContent = stats.total_transactions;
                document.getElementById('stat-trust').textContent = stats.avg_trust_level.toFixed(2);
            });

        // Load role-specific data
        if (role === 'artist') {
            loadArtists();
        } else if (role === 'collector') {
            loadCollectors();
        } else if (role === 'gallery') {
            loadGalleries();
        } else if (role === 'bank') {
            loadBanks();
        } else if (role === 'expert') {
            loadExperts();
        } else if (role === 'public') {
            loadPublicData();
        }

        function loadArtists() {
            axios.get('/api/nodes?type=artist')
                .then(response => {
                    const artists = response.data.nodes;
                    displayTable(artists, ['Имя', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadCollectors() {
            axios.get('/api/nodes?type=collector')
                .then(response => {
                    const collectors = response.data.nodes;
                    displayTable(collectors, ['Имя', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadGalleries() {
            axios.get('/api/nodes?type=gallery')
                .then(response => {
                    const galleries = response.data.nodes;
                    displayTable(galleries, ['Название', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadBanks() {
            axios.get('/api/nodes?type=bank')
                .then(response => {
                    const banks = response.data.nodes;
                    displayTable(banks, ['Название', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadExperts() {
            axios.get('/api/nodes?type=expert')
                .then(response => {
                    const experts = response.data.nodes;
                    displayTable(experts, ['Имя', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadPublicData() {
            axios.get('/api/artworks')
                .then(response => {
                    const artworks = response.data.artworks;
                    displayArtworksTable(artworks);
                });
        }

        function displayTable(data, headers) {
            const html = \`
                <table class="min-w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            \${headers.map(h => \`<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">\${h}</th>\`).join('')}
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        \${data.map(item => {
                            const metadata = JSON.parse(item.metadata || '{}');
                            return \`
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap font-medium">\${item.name}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                            \${item.trust_level.toFixed(2)}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${item.jurisdiction || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full \${
                                            item.status === 'verified' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }">
                                            \${item.status}
                                        </span>
                                    </td>
                                </tr>
                            \`;
                        }).join('')}
                    </tbody>
                </table>
            \`;
            document.getElementById('data-container').innerHTML = html;
        }

        function displayArtworksTable(artworks) {
            const html = \`
                <table class="min-w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Художник</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Год</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Стиль</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FPC</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        \${artworks.map(artwork => \`
                            <tr class="hover:bg-gray-50">
                                <td class="px-6 py-4 whitespace-nowrap font-medium">\${artwork.title}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${artwork.artist_node_id.substring(0, 20)}...</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${artwork.created_year || '-'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${artwork.style || '-'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                                    \${artwork.current_fpc ? artwork.current_fpc.toLocaleString('ru-RU') + ' ₽' : '-'}
                                </td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
            document.getElementById('data-container').innerHTML = html;
        }
    </script>
</body>
</html>
  `;
}
