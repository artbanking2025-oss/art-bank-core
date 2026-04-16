/**
 * Price Prediction Model - LSTM-like time series forecasting
 * 
 * Простая реализация recurrent neural network для предсказания цен
 * В production используйте TensorFlow.js или подключение к Python ML service
 * 
 * Features:
 * - Multi-step ahead prediction
 * - Sequence-to-sequence modeling
 * - Moving average baseline
 * - Exponential smoothing
 * - Trend decomposition
 * 
 * @module price-prediction
 */

import { MLUtils, type DataPoint, type TimeSeriesWindow, type ModelMetrics } from './ml-utils';

export interface PricePrediction {
  timestamp: Date;
  predicted: number;
  confidence: number;
  lower_bound: number;
  upper_bound: number;
}

export interface PredictionModel {
  type: 'moving_average' | 'exponential_smoothing' | 'linear_trend' | 'lstm_like';
  windowSize: number;
  params: Record<string, number>;
  metrics?: ModelMetrics;
  trainedAt: Date;
}

export interface TrainingResult {
  model: PredictionModel;
  metrics: ModelMetrics;
  predictions: number[];
  actual: number[];
}

/**
 * Price Prediction Engine
 */
export class PricePredictionEngine {
  private models: Map<string, PredictionModel> = new Map();
  
  /**
   * Train moving average model
   */
  trainMovingAverage(
    data: DataPoint[],
    windowSize: number = 7
  ): TrainingResult {
    const values = data.map(d => d.value);
    
    // Split data
    const { train, test } = MLUtils.trainTestSplit(values, 0.2, false);
    
    // Predict on test set
    const predictions: number[] = [];
    const actual: number[] = [];
    
    for (let i = 0; i < test.length; i++) {
      const history = [...train, ...test.slice(0, i)];
      const window = history.slice(-windowSize);
      const prediction = window.reduce((sum, x) => sum + x, 0) / window.length;
      
      predictions.push(prediction);
      actual.push(test[i]);
    }
    
    // Calculate metrics
    const metrics = MLUtils.calculateMetrics(actual, predictions);
    
    // Create model
    const model: PredictionModel = {
      type: 'moving_average',
      windowSize,
      params: {},
      metrics,
      trainedAt: new Date()
    };
    
    this.models.set('moving_average', model);
    
    return { model, metrics, predictions, actual };
  }

  /**
   * Train exponential smoothing model
   */
  trainExponentialSmoothing(
    data: DataPoint[],
    alpha: number = 0.3,
    beta: number = 0.1
  ): TrainingResult {
    const values = data.map(d => d.value);
    
    // Split data
    const { train, test } = MLUtils.trainTestSplit(values, 0.2, false);
    
    // Initialize level and trend
    let level = train[0];
    let trend = 0;
    
    // Train on training set
    for (const value of train) {
      const prevLevel = level;
      level = alpha * value + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }
    
    // Predict on test set
    const predictions: number[] = [];
    const actual: number[] = [];
    
    for (let i = 0; i < test.length; i++) {
      const prediction = level + trend;
      predictions.push(prediction);
      actual.push(test[i]);
      
      // Update model with actual value
      const prevLevel = level;
      level = alpha * test[i] + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }
    
    // Calculate metrics
    const metrics = MLUtils.calculateMetrics(actual, predictions);
    
    // Create model
    const model: PredictionModel = {
      type: 'exponential_smoothing',
      windowSize: 0,
      params: { alpha, beta, level, trend },
      metrics,
      trainedAt: new Date()
    };
    
    this.models.set('exponential_smoothing', model);
    
    return { model, metrics, predictions, actual };
  }

  /**
   * Train linear trend model
   */
  trainLinearTrend(data: DataPoint[]): TrainingResult {
    const values = data.map(d => d.value);
    
    // Split data
    const { train, test } = MLUtils.trainTestSplit(values, 0.2, false);
    
    // Calculate linear regression on training data
    const n = train.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = train.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * train[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict on test set
    const predictions: number[] = [];
    const actual: number[] = [];
    
    for (let i = 0; i < test.length; i++) {
      const t = train.length + i;
      const prediction = slope * t + intercept;
      predictions.push(prediction);
      actual.push(test[i]);
    }
    
    // Calculate metrics
    const metrics = MLUtils.calculateMetrics(actual, predictions);
    
    // Create model
    const model: PredictionModel = {
      type: 'linear_trend',
      windowSize: 0,
      params: { slope, intercept },
      metrics,
      trainedAt: new Date()
    };
    
    this.models.set('linear_trend', model);
    
    return { model, metrics, predictions, actual };
  }

  /**
   * LSTM-like sequential prediction
   * Simplified version using weighted moving average with recency bias
   */
  trainLSTMLike(
    data: DataPoint[],
    windowSize: number = 30,
    hiddenSize: number = 10
  ): TrainingResult {
    const values = data.map(d => d.value);
    
    // Normalize data
    const { normalized, params: normParams } = MLUtils.normalize(values);
    
    // Split data
    const { train, test } = MLUtils.trainTestSplit(normalized, 0.2, false);
    
    // Initialize weights (simplified LSTM)
    const weights = Array.from({ length: windowSize }, (_, i) => {
      // Exponential decay: recent values have higher weights
      return Math.exp(-0.1 * (windowSize - i - 1));
    });
    
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);
    
    // Predict on test set
    const predictions: number[] = [];
    const actual: number[] = [];
    
    for (let i = 0; i < test.length; i++) {
      const history = [...train, ...test.slice(0, i)];
      const window = history.slice(-windowSize);
      
      // Weighted prediction
      let prediction = 0;
      for (let j = 0; j < window.length; j++) {
        const weight = normalizedWeights[windowSize - window.length + j];
        prediction += window[j] * weight;
      }
      
      predictions.push(prediction);
      actual.push(test[i]);
    }
    
    // Denormalize predictions
    const denormalizedPredictions = MLUtils.denormalize(predictions, normParams);
    const denormalizedActual = MLUtils.denormalize(actual, normParams);
    
    // Calculate metrics
    const metrics = MLUtils.calculateMetrics(denormalizedActual, denormalizedPredictions);
    
    // Create model
    const model: PredictionModel = {
      type: 'lstm_like',
      windowSize,
      params: {
        hiddenSize,
        weights: normalizedWeights.join(','),
        ...normParams
      },
      metrics,
      trainedAt: new Date()
    };
    
    this.models.set('lstm_like', model);
    
    return {
      model,
      metrics,
      predictions: denormalizedPredictions,
      actual: denormalizedActual
    };
  }

  /**
   * Predict future prices
   */
  predict(
    modelType: 'moving_average' | 'exponential_smoothing' | 'linear_trend' | 'lstm_like',
    history: DataPoint[],
    steps: number = 7
  ): PricePrediction[] {
    const model = this.models.get(modelType);
    if (!model) {
      throw new Error(`Model ${modelType} not trained`);
    }

    const predictions: PricePrediction[] = [];
    const values = history.map(d => d.value);
    
    switch (modelType) {
      case 'moving_average':
        return this.predictMovingAverage(values, model, steps, history[history.length - 1].timestamp);
      
      case 'exponential_smoothing':
        return this.predictExponentialSmoothing(values, model, steps, history[history.length - 1].timestamp);
      
      case 'linear_trend':
        return this.predictLinearTrend(values, model, steps, history[history.length - 1].timestamp);
      
      case 'lstm_like':
        return this.predictLSTMLike(values, model, steps, history[history.length - 1].timestamp);
      
      default:
        throw new Error(`Unknown model type: ${modelType}`);
    }
  }

  /**
   * Predict with moving average
   */
  private predictMovingAverage(
    history: number[],
    model: PredictionModel,
    steps: number,
    lastTimestamp: Date
  ): PricePrediction[] {
    const predictions: PricePrediction[] = [];
    const values = [...history];
    
    for (let i = 0; i < steps; i++) {
      const window = values.slice(-model.windowSize);
      const prediction = window.reduce((sum, x) => sum + x, 0) / window.length;
      
      // Calculate confidence interval (±2 standard deviations)
      const std = Math.sqrt(
        window.reduce((sum, x) => sum + Math.pow(x - prediction, 2), 0) / window.length
      );
      
      const nextTimestamp = new Date(lastTimestamp.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      
      predictions.push({
        timestamp: nextTimestamp,
        predicted: prediction,
        confidence: Math.max(0, 1 - (std / prediction)),
        lower_bound: prediction - 2 * std,
        upper_bound: prediction + 2 * std
      });
      
      values.push(prediction);
    }
    
    return predictions;
  }

  /**
   * Predict with exponential smoothing
   */
  private predictExponentialSmoothing(
    history: number[],
    model: PredictionModel,
    steps: number,
    lastTimestamp: Date
  ): PricePrediction[] {
    const predictions: PricePrediction[] = [];
    let level = model.params.level;
    let trend = model.params.trend;
    
    for (let i = 0; i < steps; i++) {
      const prediction = level + trend * (i + 1);
      
      // Calculate confidence based on historical error
      const historicalError = model.metrics?.rmse || 0;
      const confidence = Math.max(0, 1 - (historicalError / prediction));
      
      const nextTimestamp = new Date(lastTimestamp.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      
      predictions.push({
        timestamp: nextTimestamp,
        predicted: prediction,
        confidence,
        lower_bound: prediction - 2 * historicalError,
        upper_bound: prediction + 2 * historicalError
      });
    }
    
    return predictions;
  }

  /**
   * Predict with linear trend
   */
  private predictLinearTrend(
    history: number[],
    model: PredictionModel,
    steps: number,
    lastTimestamp: Date
  ): PricePrediction[] {
    const predictions: PricePrediction[] = [];
    const slope = model.params.slope;
    const intercept = model.params.intercept;
    const t0 = history.length;
    
    for (let i = 0; i < steps; i++) {
      const t = t0 + i;
      const prediction = slope * t + intercept;
      
      const historicalError = model.metrics?.rmse || 0;
      const confidence = Math.max(0, 1 - (historicalError / prediction));
      
      const nextTimestamp = new Date(lastTimestamp.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      
      predictions.push({
        timestamp: nextTimestamp,
        predicted: prediction,
        confidence,
        lower_bound: prediction - 2 * historicalError,
        upper_bound: prediction + 2 * historicalError
      });
    }
    
    return predictions;
  }

  /**
   * Predict with LSTM-like model
   */
  private predictLSTMLike(
    history: number[],
    model: PredictionModel,
    steps: number,
    lastTimestamp: Date
  ): PricePrediction[] {
    const predictions: PricePrediction[] = [];
    const values = [...history];
    
    // Normalize
    const normParams = {
      min: model.params.min,
      max: model.params.max,
      mean: model.params.mean,
      std: model.params.std
    };
    const { normalized } = MLUtils.normalize(values);
    const normalizedValues = [...normalized];
    
    const weights = model.params.weights.split(',').map(Number);
    
    for (let i = 0; i < steps; i++) {
      const window = normalizedValues.slice(-model.windowSize);
      
      // Weighted prediction
      let prediction = 0;
      for (let j = 0; j < window.length; j++) {
        const weight = weights[model.windowSize - window.length + j];
        prediction += window[j] * weight;
      }
      
      normalizedValues.push(prediction);
      
      // Denormalize
      const denormalized = MLUtils.denormalize([prediction], normParams)[0];
      
      const historicalError = model.metrics?.rmse || 0;
      const confidence = Math.max(0, 1 - (historicalError / denormalized));
      
      const nextTimestamp = new Date(lastTimestamp.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      
      predictions.push({
        timestamp: nextTimestamp,
        predicted: denormalized,
        confidence,
        lower_bound: denormalized - 2 * historicalError,
        upper_bound: denormalized + 2 * historicalError
      });
    }
    
    return predictions;
  }

  /**
   * Compare model performance
   */
  compareModels(): Array<{ type: string; metrics: ModelMetrics; trainedAt: Date }> {
    const comparison: Array<{ type: string; metrics: ModelMetrics; trainedAt: Date }> = [];
    
    for (const [type, model] of this.models.entries()) {
      if (model.metrics) {
        comparison.push({
          type,
          metrics: model.metrics,
          trainedAt: model.trainedAt
        });
      }
    }
    
    return comparison.sort((a, b) => a.metrics.rmse - b.metrics.rmse);
  }

  /**
   * Get best model
   */
  getBestModel(): { type: string; model: PredictionModel } | null {
    const comparison = this.compareModels();
    if (comparison.length === 0) return null;
    
    const best = comparison[0];
    return {
      type: best.type,
      model: this.models.get(best.type)!
    };
  }
}

// Singleton
let pricePredictionEngine: PricePredictionEngine | null = null;

export function getPricePredictionEngine(): PricePredictionEngine {
  if (!pricePredictionEngine) {
    pricePredictionEngine = new PricePredictionEngine();
  }
  return pricePredictionEngine;
}
