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
import auth from './routes/auth';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth-middleware';
import { rateLimitMiddleware, strictRateLimitMiddleware } from './middleware/rate-limit';

const app = new Hono<{ Bindings: Env }>();

// ========== GLOBAL MIDDLEWARE ==========
// Rate Limiting (applies to all API routes)
app.use('/api/*', rateLimitMiddleware);

// Enable CORS for API
app.use('/api/*', cors());

// NOTE: Static files are served automatically by Cloudflare Pages from dist/
// No need for serveStatic middleware - wrangler handles it

// ========== AUTH ROUTES (PUBLIC) ==========
// Apply strict rate limiting to auth endpoints (10 req/min)
app.use('/api/auth/*', strictRateLimitMiddleware);
app.route('/api/auth', auth);

// ========== PROTECTED ROLE-SPECIFIC ROUTES ==========
// Apply JWT middleware to all role-specific routes
app.use('/api/artist/*', authMiddleware);
app.use('/api/collector/*', authMiddleware);
app.use('/api/gallery/*', authMiddleware);
app.use('/api/bank/*', authMiddleware);
app.use('/api/expert/*', authMiddleware);

app.route('/api/artist', artist);
app.route('/api/collector', collector);
app.route('/api/gallery', gallery);
app.route('/api/bank', bank);
app.route('/api/expert', expert);

// ========== ANALYTICS EXTENDED ROUTES (PROTECTED) ==========
app.use('/api/analytics-extended/*', authMiddleware);
app.route('/api/analytics-extended', analyticsExtended);

// ========== MEDIA HUB ROUTES (PROTECTED) ==========
app.use('/api/media-hub/*', authMiddleware);
app.route('/api/media-hub', mediaHub);

// ========== GRAPH SEGMENTATION ROUTES (PROTECTED) ==========
app.use('/api/graph-segmentation/*', authMiddleware);
app.route('/api/graph-segmentation', graphSegmentation);

// ========== API ROUTES ==========

// ===== PUBLIC ENDPOINTS (no auth required) =====

// Graph Data API (for visualization on landing page)
app.get('/api/graph-data', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const graphData = await db.getGraphData();
  return c.json(graphData);
});

// ===== PROTECTED ENDPOINTS (auth required) =====

// Export API - Universal data export in CSV or JSON (PROTECTED)
app.get('/api/export/:type', authMiddleware, async (c) => {
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

// Nodes API (public read, protected write)
app.get('/api/nodes', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const type = c.req.query('type');
  
  const nodes = type ? await db.getNodesByType(type) : await db.getAllNodes();
  return c.json({ nodes });
});

app.get('/api/nodes/:id', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const node = await db.getNode(c.req.param('id'));
  
  if (!node) {
    return c.json({ error: 'Node not found' }, 404);
  }
  
  return c.json({ node });
});

app.post('/api/nodes', authMiddleware, async (c) => {
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

// Edges API (public read, protected write)
app.get('/api/edges', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const nodeId = c.req.query('node_id');
  
  const edges = nodeId ? await db.getEdgesByNode(nodeId) : await db.getAllEdges();
  return c.json({ edges });
});

app.post('/api/edges', authMiddleware, async (c) => {
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

// Artworks API (public read, protected write)
app.get('/api/artworks', optionalAuthMiddleware, async (c) => {
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

app.get('/api/artworks/:id', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artwork = await db.getArtwork(c.req.param('id'));
  
  if (!artwork) {
    return c.json({ error: 'Artwork not found' }, 404);
  }
  
  return c.json({ artwork });
});

app.post('/api/artworks', authMiddleware, async (c) => {
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

// Transactions API (public read, protected write)
app.get('/api/transactions', optionalAuthMiddleware, async (c) => {
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

app.post('/api/transactions', authMiddleware, async (c) => {
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

app.patch('/api/transactions/:id/status', authMiddleware, async (c) => {
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
app.post('/api/transactions/saga', authMiddleware, async (c) => {
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
app.post('/api/analytics/fair-price', authMiddleware, async (c) => {
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

app.post('/api/analytics/risk-score', authMiddleware, async (c) => {
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
app.get('/api/analytics/status', optionalAuthMiddleware, (c) => {
  const stats = circuitBreakers.analyticsService.getStats();
  return c.json({
    service: 'Analytics Service',
    circuit_breaker: stats,
    health: stats.state === 'CLOSED' ? 'healthy' : 'degraded'
  });
});

// Validations API (public read, protected write)
app.get('/api/validations', optionalAuthMiddleware, async (c) => {
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

app.post('/api/validations', authMiddleware, async (c) => {
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
app.get('/api/events', authMiddleware, async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const type = c.req.query('type');
  
  const events = type 
    ? globalEventBus.getEventsByType(type as any, limit)
    : globalEventBus.getRecentEvents(limit);
  
  return c.json({ events, count: events.length });
});

// ========== MEDIA HUB API ==========

// Create media item (news, article, social post)
app.post('/api/media', authMiddleware, async (c) => {
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
app.get('/api/media/by-entity', optionalAuthMiddleware, async (c) => {
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
app.post('/api/exhibitions', authMiddleware, async (c) => {
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
app.get('/api/artworks/:id/exhibitions', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  
  const exhibitions = await db.getExhibitionsByArtwork(artworkId);
  return c.json({ exhibitions });
});

// Get exhibitions by gallery
app.get('/api/galleries/:id/exhibitions', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const galleryId = c.req.param('id');
  
  const exhibitions = await db.getExhibitionsByGallery(galleryId);
  return c.json({ exhibitions });
});

// Add tags to artwork
app.post('/api/artworks/:id/tags', authMiddleware, async (c) => {
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
app.get('/api/artworks/:id/tags', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  
  const tags = await db.getArtworkTags(artworkId);
  return c.json({ tags });
});

// Get artworks by tag
app.get('/api/tags/:id/artworks', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const tagId = c.req.param('id');
  
  const artworks = await db.getArtworksByTag(tagId);
  return c.json({ artworks });
});

// Get price history
app.get('/api/artworks/:id/price-history', optionalAuthMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '100');
  
  const priceHistory = await db.getPriceHistory(artworkId, limit);
  return c.json({ price_history: priceHistory });
});

// Get Saga logs
app.get('/api/saga-logs', authMiddleware, async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const limit = parseInt(c.req.query('limit') || '50');
  
  const logs = await db.getSagaLogs(limit);
  return c.json({ saga_logs: logs });
});

// Circuit Breaker Monitoring API
app.get('/api/health/circuit-breakers', optionalAuthMiddleware, async (c) => {
  const stats = {
    analytics_service: circuitBreakers.analyticsService.getStats(),
    timestamp: new Date().toISOString(),
    healthy: circuitBreakers.analyticsService.getStats().state === 'CLOSED'
  };
  
  return c.json(stats);
});

// STOP Mechanism - Force Circuit Breaker Open (экстренное отключение сервиса)
app.post('/api/admin/emergency-stop', authMiddleware, async (c) => {
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
app.post('/api/admin/reset-circuit-breaker', authMiddleware, async (c) => {
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

app.get('/api/nodes/:id/activity', optionalAuthMiddleware, async (c) => {
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

// Auth page (login/register)
app.get('/auth', (c) => {
  return c.html(renderAuthPage());
});

// User Profile page
app.get('/profile', (c) => {
  return c.html(renderProfilePage());
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
    <!-- Top Navigation -->
    <div class="bg-white/10 backdrop-blur-lg border-b border-white/20">
        <div class="container mx-auto px-4 py-3 md:py-4">
            <div class="flex justify-between items-center">
                <div class="text-xl md:text-2xl font-bold text-white">
                    <i class="fas fa-palette mr-2"></i>
                    <span class="hidden sm:inline">Art Bank</span>
                    <span class="sm:hidden">AB</span>
                </div>
                
                <!-- Desktop Auth Buttons -->
                <div id="authButtons" class="hidden md:flex gap-3">
                    <!-- Will be populated by JavaScript -->
                </div>
                
                <!-- Mobile Menu Button -->
                <button id="mobileMenuBtn" class="md:hidden text-white text-2xl" onclick="toggleMobileMenu()">
                    <i class="fas fa-bars"></i>
                </button>
            </div>
            
            <!-- Mobile Menu -->
            <div id="mobileMenu" class="hidden md:hidden mt-4 pt-4 border-t border-white/20">
                <div id="mobileAuthButtons" class="flex flex-col gap-2">
                    <!-- Will be populated by JavaScript -->
                </div>
            </div>
        </div>
    </div>

    <div class="container mx-auto px-4 py-8 md:py-12">
        <div class="text-center mb-12 md:mb-16">
            <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
                <i class="fas fa-project-diagram mr-2 md:mr-4"></i>
                <span class="block sm:inline mt-2 sm:mt-0">Art Bank Core</span>
            </h1>
            <p class="text-lg md:text-xl lg:text-2xl text-blue-200 px-4">
                Графовая система для арт-рынка с репутационной моделью
            </p>
        </div>

        <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-6 md:p-8 mb-8 md:mb-12">
            <h2 class="text-2xl md:text-3xl font-bold text-white mb-4 md:mb-6">
                <i class="fas fa-info-circle mr-2"></i>
                О платформе
            </h2>
            <p class="text-base md:text-lg text-blue-100 mb-3 md:mb-4">
                Art Bank Core - это математическая модель арт-рынка, представленная в виде графа. 
                Каждый участник рынка - это узел (Node) с уникальным цифровым паспортом и репутационным весом.
            </p>
            <p class="text-base md:text-lg text-blue-100">
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

        <div class="text-center mb-8 md:mb-12">
            <h2 class="text-2xl md:text-3xl font-bold text-white mb-4 md:mb-8 px-4">
                <i class="fas fa-users mr-2"></i>
                <span class="block sm:inline mt-2 sm:mt-0">Выберите роль для входа</span>
            </h2>
            <p class="text-base md:text-lg text-blue-200 mb-4 md:mb-8 px-4">
                Каждая роль имеет свой интерфейс и набор функций
            </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <!-- Artist -->
            <a href="/dashboard/artist" class="group bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-palette"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Художник</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Создание работ, цифровая подпись, отслеживание провенанса
                </p>
            </a>

            <!-- Collector -->
            <a href="/dashboard/collector" class="group bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-gem"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Коллекционер</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Управление коллекцией, покупка, история владения
                </p>
            </a>

            <!-- Gallery -->
            <a href="/dashboard/gallery" class="group bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-store"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Галерея</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Экспонирование работ, организация продаж
                </p>
            </a>

            <!-- Bank -->
            <a href="/dashboard/bank" class="group bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-university"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Банк</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Кредитование под арт, валидация сделок
                </p>
            </a>

            <!-- Expert -->
            <a href="/dashboard/expert" class="group bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-certificate"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Эксперт</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Оценка подлинности, экспертиза, сертификация
                </p>
            </a>

            <!-- Analytics Dashboard -->
            <a href="/dashboard/analytics" class="group bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-chart-line"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Аналитика 2D</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Коридор цены, факторы рынка, графики
                </p>
            </a>

            <!-- 3D Visualization -->
            <a href="/dashboard/3d-visualization" class="group bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-cube"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">3D Визуализация</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Трёхмерная модель рыночного давления
                </p>
            </a>

            <!-- Media Hub -->
            <a href="/dashboard/media" class="group bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-newspaper"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Media Hub</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Анализ медиа, trending, влияние на цены
                </p>
            </a>

            <!-- Public View -->
            <a href="/dashboard/public" class="group bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-chart-network"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">Публичный просмотр</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    Граф связей, статистика рынка, аналитика
                </p>
            </a>

            <!-- API Documentation -->
            <a href="/api-docs" class="group bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl p-6 md:p-8 hover:scale-105 transition-transform cursor-pointer border-2 border-white/30">
                <div class="text-5xl md:text-6xl text-white mb-3 md:mb-4 text-center">
                    <i class="fas fa-book"></i>
                </div>
                <h3 class="text-xl md:text-2xl font-bold text-white mb-2 text-center">API Документация</h3>
                <p class="text-sm md:text-base text-white/80 text-center">
                    REST API Reference v2.3
                </p>
            </a>
        </div>
    </div>

    <!-- Network Graph Section -->
    <div class="max-w-7xl mx-auto px-4 py-12 md:py-16">
        <h2 class="text-2xl md:text-3xl font-bold text-white mb-6 md:mb-8 text-center px-4">
            <i class="fas fa-project-diagram mr-2 md:mr-3"></i>
            <span class="block sm:inline mt-2 sm:mt-0">Граф рынка искусства</span>
        </h2>
        <div id="network-graph" class="bg-white rounded-xl shadow-2xl p-2 md:p-4" style="height: 400px; md:height: 600px;"></div>
        <div class="mt-4 flex flex-wrap justify-center gap-3 md:gap-4 text-white/80 text-xs md:text-sm px-4">
            <div class="flex items-center"><span class="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full bg-purple-500 mr-2"></span>Художники</div>
            <div class="flex items-center"><span class="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full bg-green-500 mr-2"></span>Коллекционеры</div>
            <div class="flex items-center"><span class="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full bg-blue-500 mr-2"></span>Галереи</div>
            <div class="flex items-center"><span class="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full bg-yellow-500 mr-2"></span>Банки</div>
            <div class="flex items-center"><span class="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full bg-red-500 mr-2"></span>Эксперты</div>
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

        // Auth UI
        function updateAuthUI() {
            const token = localStorage.getItem('access_token');
            const user = localStorage.getItem('user');
            const authButtons = document.getElementById('authButtons');
            const mobileAuthButtons = document.getElementById('mobileAuthButtons');
            
            if (token && user) {
                const userData = JSON.parse(user);
                const desktopHTML = \`
                    <a href="/profile" class="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition backdrop-blur-sm">
                        <i class="fas fa-user-circle mr-2"></i>\${userData.full_name}
                    </a>
                    <a href="/dashboard/\${userData.role}" class="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition">
                        <i class="fas fa-tachometer-alt mr-2"></i>Дашборд
                    </a>
                    <button onclick="logout()" class="px-4 py-2 bg-red-500/80 text-white rounded-lg hover:bg-red-600 transition backdrop-blur-sm">
                        <i class="fas fa-sign-out-alt mr-2"></i>Выйти
                    </button>
                \`;
                const mobileHTML = \`
                    <a href="/profile" class="px-4 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 transition text-center">
                        <i class="fas fa-user-circle mr-2"></i>\${userData.full_name}
                    </a>
                    <a href="/dashboard/\${userData.role}" class="px-4 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition text-center">
                        <i class="fas fa-tachometer-alt mr-2"></i>Дашборд
                    </a>
                    <button onclick="logout()" class="w-full px-4 py-3 bg-red-500/80 text-white rounded-lg hover:bg-red-600 transition">
                        <i class="fas fa-sign-out-alt mr-2"></i>Выйти
                    </button>
                \`;
                authButtons.innerHTML = desktopHTML;
                mobileAuthButtons.innerHTML = mobileHTML;
            } else {
                const desktopHTML = \`
                    <a href="/auth" class="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition backdrop-blur-sm">
                        <i class="fas fa-sign-in-alt mr-2"></i>Войти
                    </a>
                    <a href="/auth" class="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition">
                        <i class="fas fa-user-plus mr-2"></i>Регистрация
                    </a>
                \`;
                const mobileHTML = \`
                    <a href="/auth" class="px-4 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 transition text-center">
                        <i class="fas fa-sign-in-alt mr-2"></i>Войти
                    </a>
                    <a href="/auth" class="px-4 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition text-center">
                        <i class="fas fa-user-plus mr-2"></i>Регистрация
                    </a>
                \`;
                authButtons.innerHTML = desktopHTML;
                mobileAuthButtons.innerHTML = mobileHTML;
            }
        }

        function toggleMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const btn = document.getElementById('mobileMenuBtn');
            const isHidden = menu.classList.contains('hidden');
            
            if (isHidden) {
                menu.classList.remove('hidden');
                btn.innerHTML = '<i class="fas fa-times"></i>';
            } else {
                menu.classList.add('hidden');
                btn.innerHTML = '<i class="fas fa-bars"></i>';
            }
        }

        function logout() {
            if (confirm('Вы уверены, что хотите выйти?')) {
                localStorage.clear();
                window.location.reload();
            }
        }

        // Initialize auth UI
        updateAuthUI();
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

function renderAuthPage() {
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Вход / Регистрация - Art Bank</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
</head>
<body class="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 min-h-screen flex items-center justify-center">
    <a href="/" class="absolute top-4 left-4 px-4 py-2 bg-white text-gray-700 rounded-lg shadow hover:shadow-lg transition">
        <i class="fas fa-home mr-2"></i>На главную
    </a>
    <div class="w-full max-w-md p-6">
        <div class="text-center mb-8">
            <div class="text-6xl mb-4">
                <i class="fas fa-palette text-indigo-600"></i>
            </div>
            <h1 class="text-3xl font-bold text-gray-800">Art Bank</h1>
            <p class="text-gray-600 mt-2">Граф-платформа рынка искусства</p>
        </div>
        <div class="bg-white rounded-xl shadow-xl overflow-hidden">
            <div class="flex border-b">
                <button id="loginTab" class="flex-1 py-3 px-4 font-semibold text-indigo-600 border-b-2 border-indigo-600 transition" onclick="showTab('login')">
                    Вход
                </button>
                <button id="registerTab" class="flex-1 py-3 px-4 font-semibold text-gray-500 hover:text-indigo-600 transition" onclick="showTab('register')">
                    Регистрация
                </button>
            </div>
            <div id="loginForm" class="p-6">
                <form onsubmit="handleLogin(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-envelope mr-2"></i>Email
                        </label>
                        <input type="email" id="loginEmail" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="your@email.com">
                    </div>
                    <div class="mb-6">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-lock mr-2"></i>Пароль
                        </label>
                        <input type="password" id="loginPassword" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="••••••••">
                    </div>
                    <div id="loginError" class="hidden mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"></div>
                    <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                        <i class="fas fa-sign-in-alt mr-2"></i>Войти
                    </button>
                </form>
                <div class="mt-4 p-3 bg-gray-50 rounded-lg text-xs">
                    <p class="font-semibold text-gray-700 mb-1">Тестовый аккаунт:</p>
                    <p class="text-gray-600">Email: test@artbank.io</p>
                    <p class="text-gray-600">Пароль: Test123!</p>
                </div>
            </div>
            <div id="registerForm" class="p-6 hidden">
                <form onsubmit="handleRegister(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-user mr-2"></i>Полное имя
                        </label>
                        <input type="text" id="registerName" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Иван Иванов">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-envelope mr-2"></i>Email
                        </label>
                        <input type="email" id="registerEmail" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="your@email.com">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-users mr-2"></i>Роль
                        </label>
                        <select id="registerRole" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                            <option value="">Выберите роль...</option>
                            <option value="artist">Художник</option>
                            <option value="collector">Коллекционер</option>
                            <option value="gallery">Галерея</option>
                            <option value="bank">Банк</option>
                            <option value="expert">Эксперт</option>
                            <option value="public">Публичный доступ</option>
                        </select>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-lock mr-2"></i>Пароль
                        </label>
                        <input type="password" id="registerPassword" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Минимум 8 символов">
                        <p class="text-xs text-gray-500 mt-1">Должен содержать: заглавную букву, строчную букву, цифру</p>
                    </div>
                    <div class="mb-6">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-lock mr-2"></i>Подтвердите пароль
                        </label>
                        <input type="password" id="registerPasswordConfirm" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Повторите пароль">
                    </div>
                    <div id="registerError" class="hidden mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"></div>
                    <button type="submit" class="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition">
                        <i class="fas fa-user-plus mr-2"></i>Зарегистрироваться
                    </button>
                </form>
            </div>
        </div>
    </div>
    <script>
        function showTab(tab) {
            if (tab === 'login') {
                document.getElementById('loginForm').classList.remove('hidden');
                document.getElementById('registerForm').classList.add('hidden');
                document.getElementById('loginTab').classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');
                document.getElementById('loginTab').classList.remove('text-gray-500');
                document.getElementById('registerTab').classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
                document.getElementById('registerTab').classList.add('text-gray-500');
            } else {
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('registerForm').classList.remove('hidden');
                document.getElementById('registerTab').classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');
                document.getElementById('registerTab').classList.remove('text-gray-500');
                document.getElementById('loginTab').classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
                document.getElementById('loginTab').classList.add('text-gray-500');
            }
        }
        async function handleLogin(event) {
            event.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const errorDiv = document.getElementById('loginError');
            try {
                const response = await axios.post('/api/auth/login', { email, password });
                localStorage.setItem('access_token', response.data.tokens.access_token);
                localStorage.setItem('refresh_token', response.data.tokens.refresh_token);
                localStorage.setItem('user', JSON.stringify(response.data.user));
                const role = response.data.user.role;
                window.location.href = \`/dashboard/\${role}\`;
            } catch (error) {
                errorDiv.classList.remove('hidden');
                errorDiv.textContent = error.response?.data?.error || 'Ошибка входа';
            }
        }
        async function handleRegister(event) {
            event.preventDefault();
            const name = document.getElementById('registerName').value;
            const email = document.getElementById('registerEmail').value;
            const role = document.getElementById('registerRole').value;
            const password = document.getElementById('registerPassword').value;
            const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
            const errorDiv = document.getElementById('registerError');
            if (password !== passwordConfirm) {
                errorDiv.classList.remove('hidden');
                errorDiv.textContent = 'Пароли не совпадают';
                return;
            }
            try {
                const response = await axios.post('/api/auth/register', {
                    email, password, role, full_name: name
                });
                localStorage.setItem('access_token', response.data.tokens.access_token);
                localStorage.setItem('refresh_token', response.data.tokens.refresh_token);
                localStorage.setItem('user', JSON.stringify(response.data.user));
                window.location.href = \`/dashboard/\${role}\`;
            } catch (error) {
                errorDiv.classList.remove('hidden');
                const errorData = error.response?.data;
                if (errorData?.details && Array.isArray(errorData.details)) {
                    errorDiv.innerHTML = errorData.details.join('<br>');
                } else {
                    errorDiv.textContent = errorData?.error || 'Ошибка регистрации';
                }
            }
        }
        const token = localStorage.getItem('access_token');
        const user = localStorage.getItem('user');
        if (token && user) {
            const userData = JSON.parse(user);
            if (confirm('Вы уже вошли в систему. Перейти в личный кабинет?')) {
                window.location.href = \`/dashboard/\${userData.role}\`;
            }
        }
    </script>
</body>
</html>
  `;
}

function renderProfilePage() {
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Профиль - Art Bank</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
</head>
<body class="bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 min-h-screen">
    <!-- Top Navigation -->
    <div class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 py-3 md:py-4">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div class="flex items-center gap-3 md:gap-4">
                    <a href="/" class="text-xl md:text-2xl font-bold text-indigo-600">
                        <i class="fas fa-palette mr-2"></i>Art Bank
                    </a>
                    <span class="text-gray-400 hidden sm:inline">|</span>
                    <h1 class="text-lg md:text-xl font-semibold text-gray-700">
                        <i class="fas fa-user-circle mr-2"></i>Профиль
                    </h1>
                </div>
                <div class="flex gap-2 md:gap-3 w-full sm:w-auto">
                    <a href="/" class="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-center text-sm md:text-base">
                        <i class="fas fa-home mr-2"></i>Главная
                    </a>
                    <button onclick="logout()" class="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm md:text-base">
                        <i class="fas fa-sign-out-alt mr-2"></i>Выйти
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-4xl mx-auto p-4 md:p-6">
        <!-- Loading State -->
        <div id="loadingState" class="text-center py-12">
            <div class="animate-spin inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
            <p class="text-gray-600 mt-4">Загрузка профиля...</p>
        </div>

        <!-- Profile Content -->
        <div id="profileContent" class="hidden">
            <!-- Profile Card -->
            <div class="bg-white rounded-xl shadow-lg p-4 md:p-8 mb-4 md:mb-6">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
                    <div class="flex flex-col sm:flex-row items-center sm:items-start gap-4 md:gap-6">
                        <div class="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl md:text-4xl font-bold">
                            <span id="userInitials">AB</span>
                        </div>
                        <div class="text-center sm:text-left">
                            <h2 id="userName" class="text-2xl md:text-3xl font-bold text-gray-800 mb-2">Имя пользователя</h2>
                            <p id="userEmail" class="text-sm md:text-base text-gray-600 mb-1">
                                <i class="fas fa-envelope mr-2"></i><span class="break-all">email@example.com</span>
                            </p>
                            <div class="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                                <span id="userRoleBadge" class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs md:text-sm font-semibold">
                                    <i class="fas fa-user-tag mr-1"></i>Роль
                                </span>
                                <span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs md:text-sm font-semibold">
                                    <i class="fas fa-check-circle mr-1"></i>Активен
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onclick="showEditForm()" class="w-full md:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm md:text-base">
                        <i class="fas fa-edit mr-2"></i>Редактировать
                    </button>
                </div>

                <!-- Profile Stats -->
                <div class="grid grid-cols-3 gap-2 md:gap-4 pt-4 md:pt-6 border-t">
                    <div class="text-center">
                        <div class="text-lg md:text-2xl font-bold text-indigo-600" id="memberSince">-</div>
                        <div class="text-xs md:text-sm text-gray-600 mt-1">Регистрация</div>
                    </div>
                    <div class="text-center">
                        <div class="text-lg md:text-2xl font-bold text-purple-600" id="lastLogin">-</div>
                        <div class="text-xs md:text-sm text-gray-600 mt-1">Последний вход</div>
                    </div>
                    <div class="text-center">
                        <div class="text-lg md:text-2xl font-bold text-green-600 truncate" id="userId">-</div>
                        <div class="text-xs md:text-sm text-gray-600 mt-1">ID</div>
                    </div>
                </div>
            </div>

            <!-- Edit Form (Hidden by default) -->
            <div id="editForm" class="hidden bg-white rounded-xl shadow-lg p-4 md:p-8 mb-4 md:mb-6">
                <h3 class="text-xl md:text-2xl font-bold text-gray-800 mb-4 md:mb-6">
                    <i class="fas fa-edit mr-2"></i>Редактировать профиль
                </h3>
                <form onsubmit="handleUpdateProfile(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-user mr-2"></i>Полное имя
                        </label>
                        <input type="text" id="editName" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    </div>
                    <div id="updateError" class="hidden mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"></div>
                    <div id="updateSuccess" class="hidden mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm"></div>
                    <div class="flex flex-col sm:flex-row gap-3">
                        <button type="submit" class="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                            <i class="fas fa-save mr-2"></i>Сохранить
                        </button>
                        <button type="button" onclick="hideEditForm()" class="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition">
                            <i class="fas fa-times mr-2"></i>Отмена
                        </button>
                    </div>
                </form>
            </div>

            <!-- Change Password Form -->
            <div class="bg-white rounded-xl shadow-lg p-4 md:p-8 mb-4 md:mb-6">
                <h3 class="text-xl md:text-2xl font-bold text-gray-800 mb-4 md:mb-6">
                    <i class="fas fa-lock mr-2"></i>Изменить пароль
                </h3>
                <form onsubmit="handleChangePassword(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-key mr-2"></i>Текущий пароль
                        </label>
                        <input type="password" id="currentPassword" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-lock mr-2"></i>Новый пароль
                        </label>
                        <input type="password" id="newPassword" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                        <p class="text-xs text-gray-500 mt-1">Минимум 8 символов: заглавная буква, строчная буква, цифра</p>
                    </div>
                    <div class="mb-6">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            <i class="fas fa-lock mr-2"></i>Подтвердите новый пароль
                        </label>
                        <input type="password" id="confirmPassword" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    </div>
                    <div id="passwordError" class="hidden mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"></div>
                    <div id="passwordSuccess" class="hidden mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm"></div>
                    <button type="submit" class="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition">
                        <i class="fas fa-check mr-2"></i>Изменить пароль
                    </button>
                </form>
            </div>

            <!-- Quick Links -->
            <div class="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h3 class="text-lg md:text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-link mr-2"></i>Быстрые ссылки
                </h3>
                <div class="grid grid-cols-2 gap-3">
                    <a id="dashboardLink" href="/dashboard/collector" class="p-3 md:p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition text-center">
                        <i class="fas fa-tachometer-alt text-xl md:text-2xl text-indigo-600 mb-2"></i>
                        <div class="font-semibold text-gray-800 text-xs md:text-base">Мой дашборд</div>
                    </a>
                    <a href="/api-docs" class="p-3 md:p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-center">
                        <i class="fas fa-book text-xl md:text-2xl text-purple-600 mb-2"></i>
                        <div class="font-semibold text-gray-800 text-xs md:text-base">API Docs</div>
                    </a>
                    <a href="/dashboard/media" class="p-3 md:p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition text-center">
                        <i class="fas fa-newspaper text-xl md:text-2xl text-green-600 mb-2"></i>
                        <div class="font-semibold text-gray-800 text-xs md:text-base">Media Hub</div>
                    </a>
                    <a href="/dashboard/analytics" class="p-3 md:p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-center">
                        <i class="fas fa-chart-line text-xl md:text-2xl text-blue-600 mb-2"></i>
                        <div class="font-semibold text-gray-800 text-xs md:text-base">Аналитика</div>
                    </a>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentUser = null;

        function checkAuth() {
            const token = localStorage.getItem('access_token');
            const user = localStorage.getItem('user');
            if (!token || !user) {
                window.location.href = '/auth';
                return false;
            }
            currentUser = JSON.parse(user);
            return true;
        }

        async function loadProfile() {
            if (!checkAuth()) return;
            try {
                const token = localStorage.getItem('access_token');
                const response = await axios.get('/api/auth/me', {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const user = response.data;
                currentUser = user;
                localStorage.setItem('user', JSON.stringify(user));
                displayProfile(user);
                document.getElementById('loadingState').classList.add('hidden');
                document.getElementById('profileContent').classList.remove('hidden');
            } catch (error) {
                console.error('Error loading profile:', error);
                if (error.response?.status === 401) {
                    localStorage.clear();
                    window.location.href = '/auth';
                } else {
                    alert('Ошибка загрузки профиля');
                }
            }
        }

        function displayProfile(user) {
            const names = user.full_name.split(' ');
            const initials = names.map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('userInitials').textContent = initials;
            document.getElementById('userName').textContent = user.full_name;
            document.getElementById('userEmail').textContent = user.email;
            
            const roleNames = {
                'artist': 'Художник', 'collector': 'Коллекционер', 'gallery': 'Галерея',
                'bank': 'Банк', 'expert': 'Эксперт', 'admin': 'Администратор', 'public': 'Публичный'
            };
            document.getElementById('userRoleBadge').innerHTML = 
                \`<i class="fas fa-user-tag mr-1"></i>\${roleNames[user.role] || user.role}\`;

            const createdDate = new Date(user.created_at * 1000);
            document.getElementById('memberSince').textContent = createdDate.toLocaleDateString('ru-RU');
            
            if (user.last_login_at) {
                const lastLoginDate = new Date(user.last_login_at * 1000);
                document.getElementById('lastLogin').textContent = lastLoginDate.toLocaleDateString('ru-RU');
            } else {
                document.getElementById('lastLogin').textContent = 'Впервые';
            }
            
            document.getElementById('userId').textContent = user.id.substring(0, 8) + '...';
            document.getElementById('dashboardLink').href = \`/dashboard/\${user.role}\`;
        }

        function showEditForm() {
            document.getElementById('editName').value = currentUser.full_name;
            document.getElementById('editForm').classList.remove('hidden');
            document.getElementById('updateError').classList.add('hidden');
            document.getElementById('updateSuccess').classList.add('hidden');
        }

        function hideEditForm() {
            document.getElementById('editForm').classList.add('hidden');
        }

        async function handleUpdateProfile(event) {
            event.preventDefault();
            const name = document.getElementById('editName').value;
            const token = localStorage.getItem('access_token');
            const errorDiv = document.getElementById('updateError');
            const successDiv = document.getElementById('updateSuccess');
            try {
                await axios.put('/api/auth/profile', { full_name: name }, {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                currentUser.full_name = name;
                localStorage.setItem('user', JSON.stringify(currentUser));
                displayProfile(currentUser);
                errorDiv.classList.add('hidden');
                successDiv.classList.remove('hidden');
                successDiv.textContent = 'Профиль успешно обновлён!';
                setTimeout(() => hideEditForm(), 2000);
            } catch (error) {
                successDiv.classList.add('hidden');
                errorDiv.classList.remove('hidden');
                errorDiv.textContent = error.response?.data?.error || 'Ошибка обновления профиля';
            }
        }

        async function handleChangePassword(event) {
            event.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const token = localStorage.getItem('access_token');
            const errorDiv = document.getElementById('passwordError');
            const successDiv = document.getElementById('passwordSuccess');
            if (newPassword !== confirmPassword) {
                errorDiv.classList.remove('hidden');
                errorDiv.textContent = 'Новые пароли не совпадают';
                return;
            }
            try {
                await axios.post('/api/auth/change-password', 
                    { current_password: currentPassword, new_password: newPassword },
                    { headers: { 'Authorization': \`Bearer \${token}\` } }
                );
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
                errorDiv.classList.add('hidden');
                successDiv.classList.remove('hidden');
                successDiv.textContent = 'Пароль успешно изменён!';
                setTimeout(() => successDiv.classList.add('hidden'), 3000);
            } catch (error) {
                successDiv.classList.add('hidden');
                errorDiv.classList.remove('hidden');
                const errorData = error.response?.data;
                if (errorData?.details && Array.isArray(errorData.details)) {
                    errorDiv.innerHTML = errorData.details.join('<br>');
                } else {
                    errorDiv.textContent = errorData?.error || 'Ошибка изменения пароля';
                }
            }
        }

        function logout() {
            if (confirm('Вы уверены, что хотите выйти?')) {
                localStorage.clear();
                window.location.href = '/auth';
            }
        }

        loadProfile();
    </script>
</body>
</html>
  `;
}
