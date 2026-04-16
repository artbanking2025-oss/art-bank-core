/**
 * ML Utilities - Data preprocessing, feature engineering, model evaluation
 * 
 * Functions:
 * - Data normalization & standardization
 * - Feature engineering & selection
 * - Train/test split
 * - Cross-validation
 * - Model evaluation metrics
 * - Time series windowing
 * 
 * @module ml-utils
 */

export interface DataPoint {
  timestamp: Date;
  value: number;
  features?: Record<string, number>;
}

export interface TrainTestSplit<T> {
  train: T[];
  test: T[];
  trainSize: number;
  testSize: number;
}

export interface NormalizationParams {
  min: number;
  max: number;
  mean: number;
  std: number;
}

export interface ModelMetrics {
  mse: number;          // Mean Squared Error
  rmse: number;         // Root Mean Squared Error
  mae: number;          // Mean Absolute Error
  mape: number;         // Mean Absolute Percentage Error
  r2: number;           // R-squared
  accuracy?: number;    // For classification
}

export interface TimeSeriesWindow {
  input: number[];
  target: number;
  timestamp: Date;
}

/**
 * ML Utils Class
 */
export class MLUtils {
  /**
   * Normalize data to [0, 1] range
   */
  static normalize(data: number[]): { normalized: number[]; params: NormalizationParams } {
    const min = Math.min(...data);
    const max = Math.max(...data);
    
    const normalized = data.map(x => (x - min) / (max - min));
    
    const mean = data.reduce((sum, x) => sum + x, 0) / data.length;
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    
    return {
      normalized,
      params: { min, max, mean, std }
    };
  }

  /**
   * Standardize data (z-score normalization)
   */
  static standardize(data: number[]): { standardized: number[]; params: NormalizationParams } {
    const mean = data.reduce((sum, x) => sum + x, 0) / data.length;
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
    const std = Math.sqrt(variance);
    
    const standardized = data.map(x => (x - mean) / std);
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    
    return {
      standardized,
      params: { min, max, mean, std }
    };
  }

  /**
   * Denormalize data
   */
  static denormalize(normalized: number[], params: NormalizationParams): number[] {
    return normalized.map(x => x * (params.max - params.min) + params.min);
  }

  /**
   * Destandardize data
   */
  static destandardize(standardized: number[], params: NormalizationParams): number[] {
    return standardized.map(x => x * params.std + params.mean);
  }

  /**
   * Train/Test split
   */
  static trainTestSplit<T>(data: T[], testSize: number = 0.2, shuffle: boolean = true): TrainTestSplit<T> {
    let shuffled = [...data];
    
    if (shuffle) {
      // Fisher-Yates shuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }
    
    const splitIndex = Math.floor(data.length * (1 - testSize));
    const train = shuffled.slice(0, splitIndex);
    const test = shuffled.slice(splitIndex);
    
    return {
      train,
      test,
      trainSize: train.length,
      testSize: test.length
    };
  }

  /**
   * Create time series windows for LSTM/RNN
   */
  static createTimeSeriesWindows(
    data: DataPoint[],
    windowSize: number,
    predictionHorizon: number = 1
  ): TimeSeriesWindow[] {
    const windows: TimeSeriesWindow[] = [];
    
    for (let i = 0; i < data.length - windowSize - predictionHorizon + 1; i++) {
      const window = data.slice(i, i + windowSize);
      const target = data[i + windowSize + predictionHorizon - 1];
      
      windows.push({
        input: window.map(d => d.value),
        target: target.value,
        timestamp: target.timestamp
      });
    }
    
    return windows;
  }

  /**
   * Calculate model evaluation metrics
   */
  static calculateMetrics(actual: number[], predicted: number[]): ModelMetrics {
    if (actual.length !== predicted.length) {
      throw new Error('Actual and predicted arrays must have same length');
    }

    const n = actual.length;
    
    // Mean Squared Error
    const mse = actual.reduce((sum, y, i) => {
      return sum + Math.pow(y - predicted[i], 2);
    }, 0) / n;
    
    // Root Mean Squared Error
    const rmse = Math.sqrt(mse);
    
    // Mean Absolute Error
    const mae = actual.reduce((sum, y, i) => {
      return sum + Math.abs(y - predicted[i]);
    }, 0) / n;
    
    // Mean Absolute Percentage Error
    const mape = actual.reduce((sum, y, i) => {
      if (y === 0) return sum;
      return sum + Math.abs((y - predicted[i]) / y);
    }, 0) / n * 100;
    
    // R-squared
    const meanActual = actual.reduce((sum, y) => sum + y, 0) / n;
    const ssTotal = actual.reduce((sum, y) => sum + Math.pow(y - meanActual, 2), 0);
    const ssResidual = actual.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0);
    const r2 = 1 - (ssResidual / ssTotal);
    
    return { mse, rmse, mae, mape, r2 };
  }

  /**
   * Moving Average
   */
  static movingAverage(data: number[], windowSize: number): number[] {
    const result: number[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = data.slice(start, i + 1);
      const avg = window.reduce((sum, x) => sum + x, 0) / window.length;
      result.push(avg);
    }
    
    return result;
  }

  /**
   * Exponential Moving Average
   */
  static exponentialMovingAverage(data: number[], alpha: number = 0.3): number[] {
    const result: number[] = [];
    let ema = data[0];
    
    for (const value of data) {
      ema = alpha * value + (1 - alpha) * ema;
      result.push(ema);
    }
    
    return result;
  }

  /**
   * Calculate correlation coefficient
   */
  static correlation(x: number[], y: number[]): number {
    if (x.length !== y.length) {
      throw new Error('Arrays must have same length');
    }

    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;
    
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;
    
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }
    
    return numerator / Math.sqrt(denomX * denomY);
  }

  /**
   * Feature engineering - lag features
   */
  static createLagFeatures(data: number[], lags: number[]): number[][] {
    const features: number[][] = [];
    
    const maxLag = Math.max(...lags);
    
    for (let i = maxLag; i < data.length; i++) {
      const row: number[] = [];
      for (const lag of lags) {
        row.push(data[i - lag]);
      }
      features.push(row);
    }
    
    return features;
  }

  /**
   * Feature engineering - rolling statistics
   */
  static createRollingFeatures(
    data: number[],
    windowSize: number
  ): Array<{ mean: number; std: number; min: number; max: number }> {
    const features: Array<{ mean: number; std: number; min: number; max: number }> = [];
    
    for (let i = windowSize - 1; i < data.length; i++) {
      const window = data.slice(i - windowSize + 1, i + 1);
      const mean = window.reduce((sum, x) => sum + x, 0) / windowSize;
      const variance = window.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / windowSize;
      const std = Math.sqrt(variance);
      const min = Math.min(...window);
      const max = Math.max(...window);
      
      features.push({ mean, std, min, max });
    }
    
    return features;
  }

  /**
   * Detect outliers using IQR method
   */
  static detectOutliers(data: number[], threshold: number = 1.5): number[] {
    const sorted = [...data].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - threshold * iqr;
    const upperBound = q3 + threshold * iqr;
    
    return data.map((x, i) => {
      if (x < lowerBound || x > upperBound) {
        return i;
      }
      return -1;
    }).filter(i => i !== -1);
  }

  /**
   * K-Fold Cross Validation indices
   */
  static kFoldSplit(dataLength: number, k: number = 5): Array<{ train: number[]; test: number[] }> {
    const folds: Array<{ train: number[]; test: number[] }> = [];
    const foldSize = Math.floor(dataLength / k);
    
    for (let i = 0; i < k; i++) {
      const testStart = i * foldSize;
      const testEnd = i === k - 1 ? dataLength : (i + 1) * foldSize;
      
      const test = Array.from({ length: testEnd - testStart }, (_, j) => testStart + j);
      const train = [
        ...Array.from({ length: testStart }, (_, j) => j),
        ...Array.from({ length: dataLength - testEnd }, (_, j) => testEnd + j)
      ];
      
      folds.push({ train, test });
    }
    
    return folds;
  }

  /**
   * Compute confusion matrix (for classification)
   */
  static confusionMatrix(actual: number[], predicted: number[], numClasses: number): number[][] {
    const matrix: number[][] = Array(numClasses).fill(0).map(() => Array(numClasses).fill(0));
    
    for (let i = 0; i < actual.length; i++) {
      matrix[actual[i]][predicted[i]]++;
    }
    
    return matrix;
  }

  /**
   * Calculate precision, recall, F1-score
   */
  static classificationMetrics(
    actual: number[],
    predicted: number[],
    numClasses: number
  ): {
    precision: number[];
    recall: number[];
    f1: number[];
    accuracy: number;
  } {
    const cm = this.confusionMatrix(actual, predicted, numClasses);
    const precision: number[] = [];
    const recall: number[] = [];
    const f1: number[] = [];
    
    let correct = 0;
    
    for (let i = 0; i < numClasses; i++) {
      let tp = cm[i][i];
      let fp = 0;
      let fn = 0;
      
      for (let j = 0; j < numClasses; j++) {
        if (j !== i) {
          fp += cm[j][i];
          fn += cm[i][j];
        }
      }
      
      const p = tp / (tp + fp) || 0;
      const r = tp / (tp + fn) || 0;
      const f = 2 * (p * r) / (p + r) || 0;
      
      precision.push(p);
      recall.push(r);
      f1.push(f);
      
      correct += tp;
    }
    
    const accuracy = correct / actual.length;
    
    return { precision, recall, f1, accuracy };
  }
}

export default MLUtils;
