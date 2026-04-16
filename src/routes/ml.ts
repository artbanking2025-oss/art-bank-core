/**
 * ML API Routes - Machine Learning endpoints
 * 
 * Endpoints:
 * - POST /api/ml/train/price-prediction - Train price prediction models
 * - POST /api/ml/predict/price - Predict future prices
 * - POST /api/ml/detect/anomalies - Detect anomalies in data
 * - POST /api/ml/detect/fraud - Detect fraud patterns
 * - GET /api/ml/models - List trained models
 * - GET /api/ml/models/:type/metrics - Get model metrics
 * - GET /api/ml/health - Health check
 * 
 * @module ml-routes
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { getPricePredictionEngine } from '../lib/price-prediction';
import { getAnomalyDetector } from '../lib/anomaly-detection';
import type { DataPoint } from '../lib/ml-utils';

const app = new Hono<{ Bindings: Env }>();

const predictionEngine = getPricePredictionEngine();
const anomalyDetector = getAnomalyDetector();

// ========== PRICE PREDICTION ENDPOINTS ==========

/**
 * POST /api/ml/train/price-prediction
 * Train price prediction models
 */
app.post('/ml/train/price-prediction', async (c) => {
  try {
    const { data, models } = await c.req.json();

    if (!data || !Array.isArray(data)) {
      return c.json({ error: 'Data array is required' }, 400);
    }

    // Convert to DataPoint format
    const dataPoints: DataPoint[] = data.map((d: any) => ({
      timestamp: new Date(d.timestamp),
      value: d.value
    }));

    const results: any[] = [];

    // Train requested models
    const modelsToTrain = models || ['moving_average', 'exponential_smoothing', 'linear_trend', 'lstm_like'];

    for (const modelType of modelsToTrain) {
      try {
        let result;
        
        switch (modelType) {
          case 'moving_average':
            result = predictionEngine.trainMovingAverage(dataPoints);
            break;
          case 'exponential_smoothing':
            result = predictionEngine.trainExponentialSmoothing(dataPoints);
            break;
          case 'linear_trend':
            result = predictionEngine.trainLinearTrend(dataPoints);
            break;
          case 'lstm_like':
            result = predictionEngine.trainLSTMLike(dataPoints);
            break;
          default:
            continue;
        }

        results.push({
          model: modelType,
          success: true,
          metrics: result.metrics
        });
      } catch (error) {
        results.push({
          model: modelType,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return c.json({
      success: true,
      results,
      summary: {
        totalModels: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    console.error('Training error:', error);
    return c.json({ error: 'Training failed' }, 500);
  }
});

/**
 * POST /api/ml/predict/price
 * Predict future prices
 */
app.post('/ml/predict/price', async (c) => {
  try {
    const { history, model = 'lstm_like', steps = 7 } = await c.req.json();

    if (!history || !Array.isArray(history)) {
      return c.json({ error: 'History data is required' }, 400);
    }

    // Convert to DataPoint format
    const dataPoints: DataPoint[] = history.map((d: any) => ({
      timestamp: new Date(d.timestamp),
      value: d.value
    }));

    const predictions = predictionEngine.predict(model, dataPoints, steps);

    return c.json({
      success: true,
      model,
      steps,
      predictions
    });
  } catch (error) {
    console.error('Prediction error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Prediction failed'
    }, 500);
  }
});

// ========== ANOMALY DETECTION ENDPOINTS ==========

/**
 * POST /api/ml/detect/anomalies
 * Detect anomalies in time series data
 */
app.post('/ml/detect/anomalies', async (c) => {
  try {
    const { data, method = 'combined', threshold } = await c.req.json();

    if (!data || !Array.isArray(data)) {
      return c.json({ error: 'Data array is required' }, 400);
    }

    // Convert to format
    const dataPoints = data.map((d: any) => ({
      timestamp: new Date(d.timestamp),
      value: d.value
    }));

    let result;

    switch (method) {
      case 'zscore':
        result = anomalyDetector.detectZScore(dataPoints, threshold || 3);
        break;
      case 'iqr':
        result = anomalyDetector.detectIQR(dataPoints, threshold || 1.5);
        break;
      case 'mad':
        result = anomalyDetector.detectMAD(dataPoints, threshold || 3.5);
        break;
      case 'isolation_forest':
        result = anomalyDetector.detectIsolationForest(dataPoints);
        break;
      case 'time_series':
        result = anomalyDetector.detectTimeSeriesAnomalies(dataPoints);
        break;
      case 'combined':
        result = anomalyDetector.detectCombined(dataPoints);
        break;
      default:
        return c.json({ error: `Unknown method: ${method}` }, 400);
    }

    return c.json({
      success: true,
      method,
      result,
      summary: {
        totalPoints: data.length,
        anomalies: result.anomalyCount,
        normalPoints: result.normalCount,
        anomalyRate: `${(result.anomalyRate * 100).toFixed(2)}%`
      }
    });
  } catch (error) {
    console.error('Anomaly detection error:', error);
    return c.json({ error: 'Anomaly detection failed' }, 500);
  }
});

/**
 * POST /api/ml/detect/fraud
 * Detect fraud patterns in transactions
 */
app.post('/ml/detect/fraud', async (c) => {
  try {
    const { transactions } = await c.req.json();

    if (!transactions || !Array.isArray(transactions)) {
      return c.json({ error: 'Transactions array is required' }, 400);
    }

    // Convert to format
    const txData = transactions.map((tx: any) => ({
      timestamp: new Date(tx.timestamp),
      amount: tx.amount,
      from: tx.from,
      to: tx.to
    }));

    const fraudAnomalies = anomalyDetector.detectFraudPatterns(txData);

    return c.json({
      success: true,
      fraudAnomalies,
      summary: {
        totalTransactions: transactions.length,
        suspiciousPatterns: fraudAnomalies.length,
        patterns: [...new Set(fraudAnomalies.map(a => a.pattern))]
      }
    });
  } catch (error) {
    console.error('Fraud detection error:', error);
    return c.json({ error: 'Fraud detection failed' }, 500);
  }
});

// ========== MODEL MANAGEMENT ENDPOINTS ==========

/**
 * GET /api/ml/models
 * List all trained models with their performance
 */
app.get('/ml/models', (c) => {
  try {
    const comparison = predictionEngine.compareModels();
    const best = predictionEngine.getBestModel();

    return c.json({
      success: true,
      models: comparison,
      bestModel: best ? {
        type: best.type,
        metrics: best.model.metrics,
        trainedAt: best.model.trainedAt
      } : null,
      count: comparison.length
    });
  } catch (error) {
    console.error('Model list error:', error);
    return c.json({ error: 'Failed to list models' }, 500);
  }
});

/**
 * GET /api/ml/models/:type/metrics
 * Get detailed metrics for a specific model
 */
app.get('/ml/models/:type/metrics', (c) => {
  try {
    const modelType = c.req.param('type');
    const comparison = predictionEngine.compareModels();
    const model = comparison.find(m => m.type === modelType);

    if (!model) {
      return c.json({ error: `Model ${modelType} not found` }, 404);
    }

    return c.json({
      success: true,
      model: modelType,
      metrics: model.metrics,
      trainedAt: model.trainedAt,
      interpretation: {
        rmse: `Root Mean Squared Error: ${model.metrics.rmse.toFixed(2)}`,
        mae: `Mean Absolute Error: ${model.metrics.mae.toFixed(2)}`,
        mape: `Mean Absolute Percentage Error: ${model.metrics.mape.toFixed(2)}%`,
        r2: `R-squared: ${model.metrics.r2.toFixed(4)} (${model.metrics.r2 > 0.8 ? 'excellent' : model.metrics.r2 > 0.6 ? 'good' : 'fair'})`
      }
    });
  } catch (error) {
    console.error('Model metrics error:', error);
    return c.json({ error: 'Failed to get model metrics' }, 500);
  }
});

/**
 * GET /api/ml/health
 * ML service health check
 */
app.get('/ml/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'ML & AI Engine',
    features: [
      'Price Prediction (4 models)',
      'Anomaly Detection (6 methods)',
      'Fraud Pattern Detection',
      'Model Training & Evaluation',
      'Time Series Forecasting'
    ],
    models: {
      available: ['moving_average', 'exponential_smoothing', 'linear_trend', 'lstm_like'],
      anomalyMethods: ['zscore', 'iqr', 'mad', 'isolation_forest', 'time_series', 'combined']
    },
    version: '1.0.0'
  });
});

export default app;
