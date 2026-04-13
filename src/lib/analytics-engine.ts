/**
 * Analytics Engine - Advanced Data Processing
 * 
 * Provides statistical analysis, trend detection, and predictions
 * Similar to Pandas/NumPy but in TypeScript for edge deployment
 */

export interface TimeSeries {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface StatisticalSummary {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q25: number;
  q75: number;
  skewness: number;
  kurtosis: number;
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  strength: number; // 0-1
  slope: number;
  r_squared: number;
  prediction: number[];
}

export interface AnomalyDetection {
  anomalies: Array<{
    index: number;
    value: number;
    timestamp: Date;
    score: number;
    type: 'spike' | 'drop' | 'outlier';
  }>;
  threshold: number;
  method: 'zscore' | 'iqr' | 'mad';
}

export class AnalyticsEngine {
  /**
   * Calculate statistical summary
   */
  static summarize(values: number[]): StatisticalSummary {
    if (values.length === 0) {
      throw new Error('Cannot summarize empty array');
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;

    // Mean
    const mean = values.reduce((a, b) => a + b, 0) / n;

    // Median
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Quartiles
    const q25 = sorted[Math.floor(n * 0.25)];
    const q75 = sorted[Math.floor(n * 0.75)];

    // Skewness
    const skewness = values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) / n;

    // Kurtosis
    const kurtosis = values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 4), 0) / n - 3;

    return {
      count: n,
      mean,
      median,
      stdDev,
      min: sorted[0],
      max: sorted[n - 1],
      q25,
      q75,
      skewness,
      kurtosis
    };
  }

  /**
   * Linear regression
   */
  static linearRegression(x: number[], y: number[]): {
    slope: number;
    intercept: number;
    r_squared: number;
  } {
    if (x.length !== y.length || x.length === 0) {
      throw new Error('Invalid input for linear regression');
    }

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const meanY = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const r_squared = 1 - (ssResidual / ssTotal);

    return { slope, intercept, r_squared };
  }

  /**
   * Detect trend in time series
   */
  static detectTrend(timeSeries: TimeSeries[], predictionSteps: number = 5): TrendAnalysis {
    if (timeSeries.length < 3) {
      throw new Error('Need at least 3 data points for trend analysis');
    }

    // Convert to numeric indices
    const x = timeSeries.map((_, i) => i);
    const y = timeSeries.map(ts => ts.value);

    // Linear regression
    const { slope, intercept, r_squared } = this.linearRegression(x, y);

    // Determine direction
    const direction = Math.abs(slope) < 0.01 ? 'stable' : slope > 0 ? 'up' : 'down';

    // Strength based on R-squared
    const strength = Math.abs(r_squared);

    // Generate predictions
    const prediction: number[] = [];
    for (let i = 0; i < predictionSteps; i++) {
      const futureX = timeSeries.length + i;
      prediction.push(slope * futureX + intercept);
    }

    return {
      direction,
      strength,
      slope,
      r_squared,
      prediction
    };
  }

  /**
   * Detect anomalies using Z-score method
   */
  static detectAnomalies(
    timeSeries: TimeSeries[],
    threshold: number = 3,
    method: 'zscore' | 'iqr' | 'mad' = 'zscore'
  ): AnomalyDetection {
    const values = timeSeries.map(ts => ts.value);
    const anomalies: AnomalyDetection['anomalies'] = [];

    if (method === 'zscore') {
      const summary = this.summarize(values);
      
      for (let i = 0; i < values.length; i++) {
        const zScore = Math.abs((values[i] - summary.mean) / summary.stdDev);
        
        if (zScore > threshold) {
          anomalies.push({
            index: i,
            value: values[i],
            timestamp: timeSeries[i].timestamp,
            score: zScore,
            type: values[i] > summary.mean ? 'spike' : 'drop'
          });
        }
      }
    } else if (method === 'iqr') {
      const summary = this.summarize(values);
      const iqr = summary.q75 - summary.q25;
      const lowerBound = summary.q25 - threshold * iqr;
      const upperBound = summary.q75 + threshold * iqr;

      for (let i = 0; i < values.length; i++) {
        if (values[i] < lowerBound || values[i] > upperBound) {
          const score = values[i] < lowerBound
            ? (lowerBound - values[i]) / iqr
            : (values[i] - upperBound) / iqr;

          anomalies.push({
            index: i,
            value: values[i],
            timestamp: timeSeries[i].timestamp,
            score,
            type: values[i] > upperBound ? 'spike' : 'drop'
          });
        }
      }
    } else if (method === 'mad') {
      // Median Absolute Deviation
      const median = this.summarize(values).median;
      const deviations = values.map(v => Math.abs(v - median));
      const mad = this.summarize(deviations).median;

      for (let i = 0; i < values.length; i++) {
        const modifiedZScore = 0.6745 * (values[i] - median) / mad;
        
        if (Math.abs(modifiedZScore) > threshold) {
          anomalies.push({
            index: i,
            value: values[i],
            timestamp: timeSeries[i].timestamp,
            score: Math.abs(modifiedZScore),
            type: 'outlier'
          });
        }
      }
    }

    return {
      anomalies,
      threshold,
      method
    };
  }

  /**
   * Calculate moving average
   */
  static movingAverage(values: number[], windowSize: number): number[] {
    if (windowSize > values.length) {
      throw new Error('Window size cannot be larger than array length');
    }

    const result: number[] = [];
    
    for (let i = 0; i <= values.length - windowSize; i++) {
      const window = values.slice(i, i + windowSize);
      const avg = window.reduce((a, b) => a + b, 0) / windowSize;
      result.push(avg);
    }

    return result;
  }

  /**
   * Calculate exponential moving average
   */
  static exponentialMovingAverage(values: number[], alpha: number = 0.3): number[] {
    if (values.length === 0) {
      return [];
    }

    const result: number[] = [values[0]];

    for (let i = 1; i < values.length; i++) {
      const ema = alpha * values[i] + (1 - alpha) * result[i - 1];
      result.push(ema);
    }

    return result;
  }

  /**
   * Calculate correlation between two series
   */
  static correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) {
      throw new Error('Arrays must have same non-zero length');
    }

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

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
   * Group by time period
   */
  static groupByPeriod(
    timeSeries: TimeSeries[],
    period: 'hour' | 'day' | 'week' | 'month'
  ): Map<string, TimeSeries[]> {
    const groups = new Map<string, TimeSeries[]>();

    for (const ts of timeSeries) {
      let key: string;
      
      switch (period) {
        case 'hour':
          key = ts.timestamp.toISOString().substring(0, 13); // YYYY-MM-DDTHH
          break;
        case 'day':
          key = ts.timestamp.toISOString().substring(0, 10); // YYYY-MM-DD
          break;
        case 'week':
          const week = this.getWeekNumber(ts.timestamp);
          key = `${ts.timestamp.getFullYear()}-W${week}`;
          break;
        case 'month':
          key = ts.timestamp.toISOString().substring(0, 7); // YYYY-MM
          break;
      }

      const existing = groups.get(key) || [];
      existing.push(ts);
      groups.set(key, existing);
    }

    return groups;
  }

  /**
   * Aggregate grouped data
   */
  static aggregate(
    grouped: Map<string, TimeSeries[]>,
    method: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Map<string, number> {
    const result = new Map<string, number>();

    for (const [key, series] of grouped) {
      const values = series.map(ts => ts.value);
      
      let aggregated: number;
      switch (method) {
        case 'sum':
          aggregated = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          aggregated = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'min':
          aggregated = Math.min(...values);
          break;
        case 'max':
          aggregated = Math.max(...values);
          break;
        case 'count':
          aggregated = values.length;
          break;
      }

      result.set(key, aggregated);
    }

    return result;
  }

  /**
   * Calculate percentage change
   */
  static percentageChange(values: number[]): number[] {
    const result: number[] = [];

    for (let i = 1; i < values.length; i++) {
      const change = ((values[i] - values[i - 1]) / values[i - 1]) * 100;
      result.push(change);
    }

    return result;
  }

  /**
   * Simple forecasting using linear regression
   */
  static forecast(values: number[], steps: number): number[] {
    const x = values.map((_, i) => i);
    const { slope, intercept } = this.linearRegression(x, values);

    const forecast: number[] = [];
    for (let i = 0; i < steps; i++) {
      const futureX = values.length + i;
      forecast.push(slope * futureX + intercept);
    }

    return forecast;
  }

  private static getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
}
