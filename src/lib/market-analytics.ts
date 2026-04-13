/**
 * Market Analytics Service
 * 
 * Comprehensive market analysis for art trading
 * - Volume tracking
 * - Liquidity analysis
 * - Trend detection
 * - Market sentiment
 */

import { AnalyticsEngine, TimeSeries, TrendAnalysis } from './analytics-engine';

export interface MarketSnapshot {
  timestamp: Date;
  totalVolume: number;
  transactionCount: number;
  avgPrice: number;
  medianPrice: number;
  activeArtworks: number;
  activeBuyers: number;
  activeSellers: number;
}

export interface VolumeAnalysis {
  period: string;
  totalVolume: number;
  transactionCount: number;
  avgTransactionSize: number;
  volumeChange: number; // percentage
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface LiquidityMetrics {
  bidAskSpread: number; // percentage
  depth: number; // number of orders within 5% of market price
  turnoverRate: number; // volume / total market cap
  liquidityScore: number; // 0-100
  rating: 'high' | 'medium' | 'low';
}

export interface MarketTrend {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  momentum: number; // rate of change
  volatility: number; // standard deviation
  support: number; // price level
  resistance: number; // price level
}

export interface SentimentAnalysis {
  score: number; // -1 to 1 (negative to positive)
  confidence: number; // 0-1
  indicators: {
    priceAction: number;
    volume: number;
    velocity: number;
    breadth: number;
  };
  label: 'very_bearish' | 'bearish' | 'neutral' | 'bullish' | 'very_bullish';
}

export class MarketAnalytics {
  private snapshots: MarketSnapshot[] = [];
  private maxSnapshots: number = 1000;

  /**
   * Add market snapshot
   */
  addSnapshot(snapshot: MarketSnapshot): void {
    this.snapshots.push(snapshot);
    
    // Maintain size limit
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Analyze volume over period
   */
  analyzeVolume(period: 'day' | 'week' | 'month'): VolumeAnalysis {
    const filtered = this.filterByPeriod(period);
    
    if (filtered.length === 0) {
      return this.getEmptyVolumeAnalysis(period);
    }

    const totalVolume = filtered.reduce((sum, s) => sum + s.totalVolume, 0);
    const transactionCount = filtered.reduce((sum, s) => sum + s.transactionCount, 0);
    const avgTransactionSize = transactionCount > 0 ? totalVolume / transactionCount : 0;

    // Compare with previous period
    const previousFiltered = this.filterByPreviousPeriod(period);
    const previousVolume = previousFiltered.reduce((sum, s) => sum + s.totalVolume, 0);
    const volumeChange = previousVolume > 0
      ? ((totalVolume - previousVolume) / previousVolume) * 100
      : 0;

    const trend = Math.abs(volumeChange) < 5 ? 'stable' :
                 volumeChange > 0 ? 'increasing' : 'decreasing';

    return {
      period,
      totalVolume,
      transactionCount,
      avgTransactionSize,
      volumeChange,
      trend
    };
  }

  /**
   * Calculate liquidity metrics
   */
  calculateLiquidity(): LiquidityMetrics {
    if (this.snapshots.length < 10) {
      return {
        bidAskSpread: 0,
        depth: 0,
        turnoverRate: 0,
        liquidityScore: 0,
        rating: 'low'
      };
    }

    const recent = this.snapshots.slice(-10);
    
    // Mock bid-ask spread (would calculate from order book in production)
    const prices = recent.map(s => s.avgPrice);
    const priceVolatility = AnalyticsEngine.summarize(prices).stdDev / AnalyticsEngine.summarize(prices).mean;
    const bidAskSpread = priceVolatility * 100;

    // Depth: estimate based on transaction count
    const depth = recent.reduce((sum, s) => sum + s.transactionCount, 0) / recent.length;

    // Turnover rate: volume / market cap (estimated)
    const avgVolume = recent.reduce((sum, s) => sum + s.totalVolume, 0) / recent.length;
    const estimatedMarketCap = recent[recent.length - 1].activeArtworks * recent[recent.length - 1].avgPrice;
    const turnoverRate = estimatedMarketCap > 0 ? (avgVolume / estimatedMarketCap) * 100 : 0;

    // Composite liquidity score
    const spreadScore = Math.max(0, 100 - bidAskSpread * 10);
    const depthScore = Math.min(100, depth * 2);
    const turnoverScore = Math.min(100, turnoverRate * 20);
    
    const liquidityScore = (spreadScore * 0.4 + depthScore * 0.3 + turnoverScore * 0.3);

    const rating = liquidityScore > 70 ? 'high' :
                  liquidityScore > 40 ? 'medium' : 'low';

    return {
      bidAskSpread: Math.round(bidAskSpread * 100) / 100,
      depth: Math.round(depth),
      turnoverRate: Math.round(turnoverRate * 100) / 100,
      liquidityScore: Math.round(liquidityScore),
      rating
    };
  }

  /**
   * Detect market trend
   */
  detectMarketTrend(): MarketTrend {
    if (this.snapshots.length < 20) {
      return {
        direction: 'neutral',
        strength: 0,
        momentum: 0,
        volatility: 0,
        support: 0,
        resistance: 0
      };
    }

    // Convert to time series
    const timeSeries: TimeSeries[] = this.snapshots.map(s => ({
      timestamp: s.timestamp,
      value: s.avgPrice
    }));

    // Detect trend
    const trend = AnalyticsEngine.detectTrend(timeSeries);

    // Calculate volatility
    const prices = timeSeries.map(ts => ts.value);
    const volatility = AnalyticsEngine.summarize(prices).stdDev;

    // Calculate momentum (rate of change over last 10 periods)
    const recent = prices.slice(-10);
    const momentum = recent.length > 1
      ? ((recent[recent.length - 1] - recent[0]) / recent[0]) * 100
      : 0;

    // Support and resistance levels
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const support = sortedPrices[Math.floor(sortedPrices.length * 0.25)];
    const resistance = sortedPrices[Math.floor(sortedPrices.length * 0.75)];

    // Determine direction
    const direction = trend.slope > 0.5 && trend.r_squared > 0.5 ? 'bullish' :
                     trend.slope < -0.5 && trend.r_squared > 0.5 ? 'bearish' : 'neutral';

    return {
      direction,
      strength: Math.round(trend.strength * 100),
      momentum: Math.round(momentum * 100) / 100,
      volatility: Math.round(volatility),
      support: Math.round(support),
      resistance: Math.round(resistance)
    };
  }

  /**
   * Analyze market sentiment
   */
  analyzeSentiment(): SentimentAnalysis {
    if (this.snapshots.length < 20) {
      return {
        score: 0,
        confidence: 0,
        indicators: {
          priceAction: 0,
          volume: 0,
          velocity: 0,
          breadth: 0
        },
        label: 'neutral'
      };
    }

    const recent = this.snapshots.slice(-20);

    // Price action indicator (-1 to 1)
    const prices = recent.map(s => s.avgPrice);
    const priceChange = (prices[prices.length - 1] - prices[0]) / prices[0];
    const priceAction = Math.max(-1, Math.min(1, priceChange * 5));

    // Volume indicator (-1 to 1)
    const volumes = recent.map(s => s.totalVolume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volumeIndicator = Math.max(-1, Math.min(1, (recentVolume - avgVolume) / avgVolume));

    // Velocity indicator (transaction speed)
    const txCounts = recent.map(s => s.transactionCount);
    const avgTxCount = txCounts.reduce((a, b) => a + b, 0) / txCounts.length;
    const recentTxCount = txCounts.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const velocity = Math.max(-1, Math.min(1, (recentTxCount - avgTxCount) / avgTxCount));

    // Market breadth (active participants)
    const buyers = recent.map(s => s.activeBuyers);
    const sellers = recent.map(s => s.activeSellers);
    const recentBuyers = buyers.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const recentSellers = sellers.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const breadth = recentSellers > 0
      ? Math.max(-1, Math.min(1, (recentBuyers - recentSellers) / recentSellers))
      : 0;

    // Composite sentiment score
    const score = (
      priceAction * 0.4 +
      volumeIndicator * 0.3 +
      velocity * 0.2 +
      breadth * 0.1
    );

    // Confidence based on data consistency
    const indicators = [priceAction, volumeIndicator, velocity, breadth];
    const agreementScore = indicators.filter(i => Math.sign(i) === Math.sign(score)).length / indicators.length;
    const confidence = Math.min(1, agreementScore * 1.2);

    // Label
    const label = score > 0.5 ? 'very_bullish' :
                 score > 0.2 ? 'bullish' :
                 score < -0.5 ? 'very_bearish' :
                 score < -0.2 ? 'bearish' : 'neutral';

    return {
      score: Math.round(score * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      indicators: {
        priceAction: Math.round(priceAction * 100) / 100,
        volume: Math.round(volumeIndicator * 100) / 100,
        velocity: Math.round(velocity * 100) / 100,
        breadth: Math.round(breadth * 100) / 100
      },
      label
    };
  }

  /**
   * Get market summary
   */
  getMarketSummary(): {
    latest: MarketSnapshot | null;
    volume24h: VolumeAnalysis;
    liquidity: LiquidityMetrics;
    trend: MarketTrend;
    sentiment: SentimentAnalysis;
  } {
    return {
      latest: this.snapshots[this.snapshots.length - 1] || null,
      volume24h: this.analyzeVolume('day'),
      liquidity: this.calculateLiquidity(),
      trend: this.detectMarketTrend(),
      sentiment: this.analyzeSentiment()
    };
  }

  /**
   * Get historical data
   */
  getHistory(limit: number = 100): MarketSnapshot[] {
    return this.snapshots.slice(-limit);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.snapshots = [];
  }

  private filterByPeriod(period: 'day' | 'week' | 'month'): MarketSnapshot[] {
    const now = Date.now();
    const cutoff = period === 'day' ? 24 * 60 * 60 * 1000 :
                  period === 'week' ? 7 * 24 * 60 * 60 * 1000 :
                  30 * 24 * 60 * 60 * 1000;

    return this.snapshots.filter(s => now - s.timestamp.getTime() < cutoff);
  }

  private filterByPreviousPeriod(period: 'day' | 'week' | 'month'): MarketSnapshot[] {
    const now = Date.now();
    const periodMs = period === 'day' ? 24 * 60 * 60 * 1000 :
                    period === 'week' ? 7 * 24 * 60 * 60 * 1000 :
                    30 * 24 * 60 * 60 * 1000;

    return this.snapshots.filter(s => {
      const age = now - s.timestamp.getTime();
      return age >= periodMs && age < 2 * periodMs;
    });
  }

  private getEmptyVolumeAnalysis(period: string): VolumeAnalysis {
    return {
      period,
      totalVolume: 0,
      transactionCount: 0,
      avgTransactionSize: 0,
      volumeChange: 0,
      trend: 'stable'
    };
  }
}

// Singleton instance
export const marketAnalytics = new MarketAnalytics();
