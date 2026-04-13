/**
 * Analytics API Routes
 * 
 * Endpoints for analytics, price corridor, and market analysis
 */

import { Hono } from 'hono';
import { AnalyticsEngine, TimeSeries } from '../lib/analytics-engine';
import { priceCorridorModel } from '../lib/price-corridor-enhanced';
import { marketAnalytics } from '../lib/market-analytics';

const app = new Hono();

// ========== ANALYTICS ENGINE ENDPOINTS ==========

/**
 * POST /api/analytics/summarize
 * Calculate statistical summary
 */
app.post('/summarize', async (c) => {
  const body = await c.req.json();
  const { values } = body;

  if (!Array.isArray(values) || values.length === 0) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'values must be a non-empty array of numbers'
    }, 400);
  }

  try {
    const summary = AnalyticsEngine.summarize(values);
    
    return c.json({
      success: true,
      summary
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Calculation Failed',
      message: (error as Error).message
    }, 400);
  }
});

/**
 * POST /api/analytics/trend
 * Detect trend in time series
 */
app.post('/trend', async (c) => {
  const body = await c.req.json();
  const { timeSeries, predictionSteps = 5 } = body;

  if (!Array.isArray(timeSeries) || timeSeries.length < 3) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'timeSeries must contain at least 3 data points'
    }, 400);
  }

  try {
    const trend = AnalyticsEngine.detectTrend(
      timeSeries.map((ts: any) => ({
        timestamp: new Date(ts.timestamp),
        value: ts.value
      })),
      predictionSteps
    );
    
    return c.json({
      success: true,
      trend
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Analysis Failed',
      message: (error as Error).message
    }, 400);
  }
});

/**
 * POST /api/analytics/anomalies
 * Detect anomalies in time series
 */
app.post('/anomalies', async (c) => {
  const body = await c.req.json();
  const { timeSeries, threshold = 3, method = 'zscore' } = body;

  if (!Array.isArray(timeSeries) || timeSeries.length === 0) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'timeSeries must be a non-empty array'
    }, 400);
  }

  try {
    const result = AnalyticsEngine.detectAnomalies(
      timeSeries.map((ts: any) => ({
        timestamp: new Date(ts.timestamp),
        value: ts.value
      })),
      threshold,
      method
    );
    
    return c.json({
      success: true,
      result
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Detection Failed',
      message: (error as Error).message
    }, 400);
  }
});

/**
 * POST /api/analytics/forecast
 * Forecast future values
 */
app.post('/forecast', async (c) => {
  const body = await c.req.json();
  const { values, steps = 5 } = body;

  if (!Array.isArray(values) || values.length < 3) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'values must contain at least 3 data points'
    }, 400);
  }

  try {
    const forecast = AnalyticsEngine.forecast(values, steps);
    
    return c.json({
      success: true,
      forecast,
      steps
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Forecast Failed',
      message: (error as Error).message
    }, 400);
  }
});

// ========== PRICE CORRIDOR ENDPOINTS ==========

/**
 * POST /api/analytics/price-corridor
 * Calculate price corridor for artwork
 */
app.post('/price-corridor', async (c) => {
  const body = await c.req.json();
  const { artwork } = body;

  if (!artwork || !artwork.id) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'artwork data with id is required'
    }, 400);
  }

  try {
    const result = await priceCorridorModel.calculatePriceCorridor(artwork);
    
    return c.json({
      success: true,
      result
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Calculation Failed',
      message: (error as Error).message
    }, 400);
  }
});

/**
 * POST /api/analytics/predict-price
 * Predict future price
 */
app.post('/predict-price', async (c) => {
  const body = await c.req.json();
  const { artwork, timeframe = 'medium' } = body;

  if (!artwork || !artwork.id) {
    return c.json({
      success: false,
      error: 'Bad Request',
      message: 'artwork data with id is required'
    }, 400);
  }

  try {
    const prediction = await priceCorridorModel.predictPrice(artwork, timeframe);
    
    return c.json({
      success: true,
      prediction
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Prediction Failed',
      message: (error as Error).message
    }, 400);
  }
});

/**
 * GET /api/analytics/market-factors
 * Get current market factors
 */
app.get('/market-factors', (c) => {
  const factors = priceCorridorModel.getMarketFactors();
  
  return c.json({
    success: true,
    factors
  });
});

/**
 * PUT /api/analytics/market-factors
 * Update market factors (admin only)
 */
app.put('/market-factors', async (c) => {
  const body = await c.req.json();
  
  priceCorridorModel.updateMarketFactors(body);
  
  return c.json({
    success: true,
    message: 'Market factors updated',
    factors: priceCorridorModel.getMarketFactors()
  });
});

// ========== MARKET ANALYTICS ENDPOINTS ==========

/**
 * GET /api/analytics/market/summary
 * Get comprehensive market summary
 */
app.get('/market/summary', (c) => {
  const summary = marketAnalytics.getMarketSummary();
  
  return c.json({
    success: true,
    summary
  });
});

/**
 * POST /api/analytics/market/snapshot
 * Add market snapshot (admin only)
 */
app.post('/market/snapshot', async (c) => {
  const body = await c.req.json();
  
  const snapshot = {
    timestamp: new Date(),
    ...body
  };
  
  marketAnalytics.addSnapshot(snapshot);
  
  return c.json({
    success: true,
    message: 'Snapshot added',
    snapshot
  });
});

/**
 * GET /api/analytics/market/volume
 * Analyze volume
 */
app.get('/market/volume', (c) => {
  const period = c.req.query('period') as 'day' | 'week' | 'month' || 'day';
  
  const analysis = marketAnalytics.analyzeVolume(period);
  
  return c.json({
    success: true,
    analysis
  });
});

/**
 * GET /api/analytics/market/liquidity
 * Get liquidity metrics
 */
app.get('/market/liquidity', (c) => {
  const metrics = marketAnalytics.calculateLiquidity();
  
  return c.json({
    success: true,
    metrics
  });
});

/**
 * GET /api/analytics/market/trend
 * Detect market trend
 */
app.get('/market/trend', (c) => {
  const trend = marketAnalytics.detectMarketTrend();
  
  return c.json({
    success: true,
    trend
  });
});

/**
 * GET /api/analytics/market/sentiment
 * Analyze market sentiment
 */
app.get('/market/sentiment', (c) => {
  const sentiment = marketAnalytics.analyzeSentiment();
  
  return c.json({
    success: true,
    sentiment
  });
});

/**
 * GET /api/analytics/market/history
 * Get market history
 */
app.get('/market/history', (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  
  const history = marketAnalytics.getHistory(limit);
  
  return c.json({
    success: true,
    count: history.length,
    history
  });
});

export default app;
