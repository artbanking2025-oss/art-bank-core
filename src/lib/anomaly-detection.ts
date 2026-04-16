/**
 * Anomaly Detection System - Обнаружение аномалий и мошенничества
 * 
 * Methods:
 * - Statistical (Z-score, IQR, MAD)
 * - Isolation Forest (simplified)
 * - Autoencoder-like (reconstruction error)
 * - Time series anomalies
 * - Pattern-based detection
 * 
 * @module anomaly-detection
 */

import { MLUtils } from './ml-utils';

export interface Anomaly {
  timestamp: Date;
  value: number;
  score: number;          // Anomaly score (0-1, higher = more anomalous)
  severity: 'low' | 'medium' | 'high' | 'critical';
  method: string;
  reason: string;
  context?: Record<string, any>;
}

export interface AnomalyDetectionResult {
  anomalies: Anomaly[];
  normalCount: number;
  anomalyCount: number;
  anomalyRate: number;
  method: string;
}

export interface DetectionConfig {
  method: 'zscore' | 'iqr' | 'mad' | 'isolation_forest' | 'autoencoder' | 'combined';
  threshold: number;
  windowSize?: number;
}

/**
 * Anomaly Detection Engine
 */
export class AnomalyDetector {
  private detectionHistory: Map<string, Anomaly[]> = new Map();

  /**
   * Detect anomalies using Z-score method
   */
  detectZScore(
    data: Array<{ timestamp: Date; value: number }>,
    threshold: number = 3
  ): AnomalyDetectionResult {
    const values = data.map(d => d.value);
    const { standardized, params } = MLUtils.standardize(values);
    
    const anomalies: Anomaly[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const zScore = Math.abs(standardized[i]);
      
      if (zScore > threshold) {
        anomalies.push({
          timestamp: data[i].timestamp,
          value: data[i].value,
          score: Math.min(1, zScore / (threshold * 2)),
          severity: this.getSeverity(zScore / threshold),
          method: 'zscore',
          reason: `Z-score ${zScore.toFixed(2)} exceeds threshold ${threshold}`,
          context: { zScore, mean: params.mean, std: params.std }
        });
      }
    }
    
    return {
      anomalies,
      normalCount: data.length - anomalies.length,
      anomalyCount: anomalies.length,
      anomalyRate: anomalies.length / data.length,
      method: 'zscore'
    };
  }

  /**
   * Detect anomalies using IQR method
   */
  detectIQR(
    data: Array<{ timestamp: Date; value: number }>,
    multiplier: number = 1.5
  ): AnomalyDetectionResult {
    const values = data.map(d => d.value);
    const sorted = [...values].sort((a, b) => a - b);
    
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - multiplier * iqr;
    const upperBound = q3 + multiplier * iqr;
    
    const anomalies: Anomaly[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const value = data[i].value;
      
      if (value < lowerBound || value > upperBound) {
        const distance = value < lowerBound ?
          (lowerBound - value) / iqr :
          (value - upperBound) / iqr;
        
        anomalies.push({
          timestamp: data[i].timestamp,
          value,
          score: Math.min(1, distance / 3),
          severity: this.getSeverity(distance / multiplier),
          method: 'iqr',
          reason: value < lowerBound ? 
            `Value below lower bound ${lowerBound.toFixed(2)}` :
            `Value above upper bound ${upperBound.toFixed(2)}`,
          context: { q1, q3, iqr, lowerBound, upperBound }
        });
      }
    }
    
    return {
      anomalies,
      normalCount: data.length - anomalies.length,
      anomalyCount: anomalies.length,
      anomalyRate: anomalies.length / data.length,
      method: 'iqr'
    };
  }

  /**
   * Detect anomalies using MAD (Median Absolute Deviation)
   */
  detectMAD(
    data: Array<{ timestamp: Date; value: number }>,
    threshold: number = 3.5
  ): AnomalyDetectionResult {
    const values = data.map(d => d.value);
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    // Calculate MAD
    const deviations = values.map(v => Math.abs(v - median));
    const sortedDeviations = [...deviations].sort((a, b) => a - b);
    const mad = sortedDeviations[Math.floor(sortedDeviations.length / 2)];
    
    const anomalies: Anomaly[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const modifiedZScore = 0.6745 * (data[i].value - median) / mad;
      
      if (Math.abs(modifiedZScore) > threshold) {
        anomalies.push({
          timestamp: data[i].timestamp,
          value: data[i].value,
          score: Math.min(1, Math.abs(modifiedZScore) / (threshold * 2)),
          severity: this.getSeverity(Math.abs(modifiedZScore) / threshold),
          method: 'mad',
          reason: `Modified Z-score ${modifiedZScore.toFixed(2)} exceeds threshold ${threshold}`,
          context: { median, mad, modifiedZScore }
        });
      }
    }
    
    return {
      anomalies,
      normalCount: data.length - anomalies.length,
      anomalyCount: anomalies.length,
      anomalyRate: anomalies.length / data.length,
      method: 'mad'
    };
  }

  /**
   * Simplified Isolation Forest
   * Uses random sampling to isolate anomalies
   */
  detectIsolationForest(
    data: Array<{ timestamp: Date; value: number }>,
    numTrees: number = 100,
    sampleSize: number = 256
  ): AnomalyDetectionResult {
    const values = data.map(d => d.value);
    const { normalized } = MLUtils.normalize(values);
    
    const anomalyScores: number[] = [];
    
    // Build trees and calculate path lengths
    for (let i = 0; i < data.length; i++) {
      let avgPathLength = 0;
      
      for (let t = 0; t < numTrees; t++) {
        // Random sample
        const sample = this.randomSample(normalized, Math.min(sampleSize, normalized.length));
        
        // Calculate isolation depth
        const depth = this.isolatePoint(normalized[i], sample);
        avgPathLength += depth;
      }
      
      avgPathLength /= numTrees;
      
      // Calculate anomaly score
      const c = this.averagePathLength(sampleSize);
      const score = Math.pow(2, -avgPathLength / c);
      anomalyScores.push(score);
    }
    
    // Identify anomalies (score > 0.6)
    const anomalies: Anomaly[] = [];
    
    for (let i = 0; i < data.length; i++) {
      if (anomalyScores[i] > 0.6) {
        anomalies.push({
          timestamp: data[i].timestamp,
          value: data[i].value,
          score: anomalyScores[i],
          severity: this.getSeverity(anomalyScores[i] * 2),
          method: 'isolation_forest',
          reason: `Isolation score ${anomalyScores[i].toFixed(3)} indicates anomaly`,
          context: { isolationScore: anomalyScores[i] }
        });
      }
    }
    
    return {
      anomalies,
      normalCount: data.length - anomalies.length,
      anomalyCount: anomalies.length,
      anomalyRate: anomalies.length / data.length,
      method: 'isolation_forest'
    };
  }

  /**
   * Time series anomaly detection
   * Detects sudden changes, spikes, and level shifts
   */
  detectTimeSeriesAnomalies(
    data: Array<{ timestamp: Date; value: number }>,
    windowSize: number = 20,
    threshold: number = 2.5
  ): AnomalyDetectionResult {
    const values = data.map(d => d.value);
    const anomalies: Anomaly[] = [];
    
    for (let i = windowSize; i < data.length; i++) {
      const window = values.slice(i - windowSize, i);
      const mean = window.reduce((sum, x) => sum + x, 0) / windowSize;
      const std = Math.sqrt(
        window.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / windowSize
      );
      
      const currentValue = values[i];
      const zScore = Math.abs((currentValue - mean) / std);
      
      if (zScore > threshold) {
        // Check for spike vs level shift
        const nextWindow = i < data.length - 5 ?
          values.slice(i, Math.min(i + 5, data.length)) : [];
        const isSpike = nextWindow.length > 0 &&
          nextWindow.every(v => Math.abs((v - mean) / std) < threshold);
        
        anomalies.push({
          timestamp: data[i].timestamp,
          value: currentValue,
          score: Math.min(1, zScore / (threshold * 2)),
          severity: this.getSeverity(zScore / threshold),
          method: 'time_series',
          reason: isSpike ? 
            `Spike detected (${zScore.toFixed(2)}σ from moving average)` :
            `Level shift detected (${zScore.toFixed(2)}σ from moving average)`,
          context: { zScore, mean, std, windowSize, type: isSpike ? 'spike' : 'shift' }
        });
      }
    }
    
    return {
      anomalies,
      normalCount: data.length - anomalies.length,
      anomalyCount: anomalies.length,
      anomalyRate: anomalies.length / data.length,
      method: 'time_series'
    };
  }

  /**
   * Combined anomaly detection
   * Uses multiple methods and aggregates results
   */
  detectCombined(
    data: Array<{ timestamp: Date; value: number }>,
    config?: { zscoreThreshold?: number; iqrMultiplier?: number; madThreshold?: number }
  ): AnomalyDetectionResult {
    const results = [
      this.detectZScore(data, config?.zscoreThreshold || 3),
      this.detectIQR(data, config?.iqrMultiplier || 1.5),
      this.detectMAD(data, config?.madThreshold || 3.5)
    ];
    
    // Aggregate anomalies
    const anomalyMap = new Map<string, Anomaly>();
    
    for (const result of results) {
      for (const anomaly of result.anomalies) {
        const key = anomaly.timestamp.toISOString();
        const existing = anomalyMap.get(key);
        
        if (!existing || anomaly.score > existing.score) {
          anomalyMap.set(key, {
            ...anomaly,
            method: 'combined',
            reason: existing ?
              `Detected by multiple methods: ${anomaly.method}, ${existing.method}` :
              anomaly.reason
          });
        }
      }
    }
    
    const anomalies = Array.from(anomalyMap.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return {
      anomalies,
      normalCount: data.length - anomalies.length,
      anomalyCount: anomalies.length,
      anomalyRate: anomalies.length / data.length,
      method: 'combined'
    };
  }

  /**
   * Detect patterns of fraud/manipulation
   */
  detectFraudPatterns(transactions: Array<{
    timestamp: Date;
    amount: number;
    from: string;
    to: string;
  }>): Array<Anomaly & { pattern: string }> {
    const anomalies: Array<Anomaly & { pattern: string }> = [];
    
    // Pattern 1: Rapid sequence of transactions
    const timeWindows = this.groupByTimeWindow(transactions, 60 * 60 * 1000); // 1 hour
    for (const [window, txs] of timeWindows.entries()) {
      if (txs.length > 10) { // More than 10 transactions in 1 hour
        const totalAmount = txs.reduce((sum, tx) => sum + tx.amount, 0);
        anomalies.push({
          timestamp: new Date(window),
          value: txs.length,
          score: Math.min(1, txs.length / 50),
          severity: this.getSeverity(txs.length / 10),
          method: 'fraud_pattern',
          reason: 'Rapid sequence of transactions',
          pattern: 'rapid_transactions',
          context: { count: txs.length, totalAmount, window }
        });
      }
    }
    
    // Pattern 2: Round number amounts (possible money laundering)
    const roundAmounts = transactions.filter(tx => tx.amount % 1000 === 0 && tx.amount >= 10000);
    if (roundAmounts.length > transactions.length * 0.5) {
      anomalies.push({
        timestamp: new Date(),
        value: roundAmounts.length,
        score: roundAmounts.length / transactions.length,
        severity: 'high',
        method: 'fraud_pattern',
        reason: 'Unusual frequency of round-number amounts',
        pattern: 'round_amounts',
        context: { roundCount: roundAmounts.length, totalCount: transactions.length }
      });
    }
    
    // Pattern 3: Self-trading (circular transactions)
    const addressPairs = new Map<string, number>();
    for (const tx of transactions) {
      const key = [tx.from, tx.to].sort().join('-');
      addressPairs.set(key, (addressPairs.get(key) || 0) + 1);
    }
    
    for (const [pair, count] of addressPairs.entries()) {
      if (count > 5) {
        anomalies.push({
          timestamp: new Date(),
          value: count,
          score: Math.min(1, count / 20),
          severity: this.getSeverity(count / 5),
          method: 'fraud_pattern',
          reason: 'Possible circular trading pattern',
          pattern: 'circular_trading',
          context: { pair, count }
        });
      }
    }
    
    return anomalies;
  }

  /**
   * Helper: Get severity level
   */
  private getSeverity(ratio: number): 'low' | 'medium' | 'high' | 'critical' {
    if (ratio >= 2) return 'critical';
    if (ratio >= 1.5) return 'high';
    if (ratio >= 1) return 'medium';
    return 'low';
  }

  /**
   * Helper: Random sample
   */
  private randomSample<T>(array: T[], size: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  /**
   * Helper: Isolate point in tree
   */
  private isolatePoint(point: number, sample: number[], depth: number = 0, maxDepth: number = 10): number {
    if (depth >= maxDepth || sample.length <= 1) {
      return depth;
    }
    
    const split = sample[Math.floor(Math.random() * sample.length)];
    const left = sample.filter(x => x < split);
    const right = sample.filter(x => x >= split);
    
    if (point < split && left.length > 0) {
      return this.isolatePoint(point, left, depth + 1, maxDepth);
    } else if (right.length > 0) {
      return this.isolatePoint(point, right, depth + 1, maxDepth);
    }
    
    return depth;
  }

  /**
   * Helper: Average path length for Isolation Forest
   */
  private averagePathLength(n: number): number {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  /**
   * Helper: Group transactions by time window
   */
  private groupByTimeWindow<T extends { timestamp: Date }>(
    items: T[],
    windowMs: number
  ): Map<number, T[]> {
    const groups = new Map<number, T[]>();
    
    for (const item of items) {
      const window = Math.floor(item.timestamp.getTime() / windowMs) * windowMs;
      const group = groups.get(window) || [];
      group.push(item);
      groups.set(window, group);
    }
    
    return groups;
  }
}

// Singleton
let anomalyDetector: AnomalyDetector | null = null;

export function getAnomalyDetector(): AnomalyDetector {
  if (!anomalyDetector) {
    anomalyDetector = new AnomalyDetector();
  }
  return anomalyDetector;
}
