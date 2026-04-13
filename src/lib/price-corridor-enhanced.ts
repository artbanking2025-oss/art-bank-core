/**
 * Enhanced Price Corridor Model
 * 
 * Advanced mathematical model for artwork price prediction
 * Based on multiple factors and historical data
 */

import { AnalyticsEngine, TimeSeries } from './analytics-engine';

export interface ArtworkData {
  id: string;
  artist: string;
  title: string;
  year: number;
  style: string;
  medium: string;
  dimensions?: {
    width: number;
    height: number;
    depth?: number;
  };
  currentPrice?: number;
  historicalPrices?: Array<{
    price: number;
    date: Date;
    saleType: 'auction' | 'gallery' | 'private';
  }>;
}

export interface MarketFactors {
  institutionalSupport: number; // 0-1
  publicHype: number; // 0-1
  liquidity: number; // 0-1
  trendScore: number; // 0-1
  economicIndex: number; // 0-1
}

export interface PriceCorridorResult {
  artwork: string;
  currentPrice: number;
  estimatedPrice: number;
  priceRange: {
    min: number;
    max: number;
    confidence: number; // 0-1
  };
  factors: {
    artistReputation: number;
    historicalTrend: number;
    marketConditions: number;
    rarity: number;
    condition: number;
    provenance: number;
  };
  recommendations: string[];
  confidence: number;
  lastUpdated: Date;
}

export interface PricePrediction {
  predictedPrice: number;
  confidence: number;
  timeframe: 'short' | 'medium' | 'long'; // 3mo, 1yr, 3yr
  factors: Record<string, number>;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export class PriceCorridorModel {
  private artistReputationCache: Map<string, number> = new Map();
  private marketFactorsCache: MarketFactors = {
    institutionalSupport: 0.7,
    publicHype: 0.6,
    liquidity: 0.5,
    trendScore: 0.6,
    economicIndex: 0.7
  };

  /**
   * Calculate price corridor for artwork
   */
  async calculatePriceCorridor(artwork: ArtworkData): Promise<PriceCorridorResult> {
    // Factor 1: Artist Reputation (0-1)
    const artistReputation = await this.calculateArtistReputation(artwork.artist);

    // Factor 2: Historical Trend
    const historicalTrend = artwork.historicalPrices && artwork.historicalPrices.length > 0
      ? this.calculateHistoricalTrend(artwork.historicalPrices)
      : 0.5;

    // Factor 3: Market Conditions
    const marketConditions = this.calculateMarketConditions();

    // Factor 4: Rarity
    const rarity = this.calculateRarity(artwork);

    // Factor 5: Condition (assumed good if not specified)
    const condition = 0.9;

    // Factor 6: Provenance (assumed moderate if not specified)
    const provenance = 0.7;

    // Calculate weighted price
    const weights = {
      artistReputation: 0.3,
      historicalTrend: 0.25,
      marketConditions: 0.2,
      rarity: 0.15,
      condition: 0.05,
      provenance: 0.05
    };

    const compositeScore =
      artistReputation * weights.artistReputation +
      historicalTrend * weights.historicalTrend +
      marketConditions * weights.marketConditions +
      rarity * weights.rarity +
      condition * weights.condition +
      provenance * weights.provenance;

    // Base price estimation
    const currentPrice = artwork.currentPrice || this.estimateBasePrice(artwork);
    const estimatedPrice = currentPrice * (0.5 + compositeScore * 1.5);

    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(artwork, {
      artistReputation,
      historicalTrend,
      marketConditions,
      rarity,
      condition,
      provenance
    });

    // Price range (corridor)
    const margin = 0.3 * (1 - confidence); // Lower confidence = wider range
    const priceRange = {
      min: estimatedPrice * (1 - margin),
      max: estimatedPrice * (1 + margin),
      confidence
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      currentPrice,
      estimatedPrice,
      { artistReputation, historicalTrend, marketConditions, rarity, condition, provenance }
    );

    return {
      artwork: artwork.title,
      currentPrice,
      estimatedPrice: Math.round(estimatedPrice),
      priceRange: {
        min: Math.round(priceRange.min),
        max: Math.round(priceRange.max),
        confidence: priceRange.confidence
      },
      factors: {
        artistReputation,
        historicalTrend,
        marketConditions,
        rarity,
        condition,
        provenance
      },
      recommendations,
      confidence,
      lastUpdated: new Date()
    };
  }

  /**
   * Predict future price
   */
  async predictPrice(
    artwork: ArtworkData,
    timeframe: 'short' | 'medium' | 'long'
  ): Promise<PricePrediction> {
    const corridor = await this.calculatePriceCorridor(artwork);

    // Time multipliers
    const multipliers = {
      short: { growth: 0.05, volatility: 0.1 },   // 3 months: 5% growth
      medium: { growth: 0.15, volatility: 0.2 },  // 1 year: 15% growth
      long: { growth: 0.5, volatility: 0.3 }      // 3 years: 50% growth
    };

    const { growth, volatility } = multipliers[timeframe];

    // Apply trend factor
    const trendMultiplier = corridor.factors.historicalTrend > 0.6 ? 1.2 : 
                           corridor.factors.historicalTrend < 0.4 ? 0.8 : 1.0;

    // Calculate predicted price
    const predictedPrice = corridor.estimatedPrice * (1 + growth * trendMultiplier);

    // Adjust confidence based on timeframe
    const confidenceAdjustment = timeframe === 'short' ? 1.0 : 
                                timeframe === 'medium' ? 0.8 : 0.6;
    const confidence = corridor.confidence * confidenceAdjustment;

    // Determine trend
    const trend = growth * trendMultiplier > 0.1 ? 'bullish' :
                 growth * trendMultiplier < -0.05 ? 'bearish' : 'neutral';

    return {
      predictedPrice: Math.round(predictedPrice),
      confidence,
      timeframe,
      factors: corridor.factors,
      trend
    };
  }

  /**
   * Calculate artist reputation score
   */
  private async calculateArtistReputation(artist: string): Promise<number> {
    // Check cache first
    if (this.artistReputationCache.has(artist)) {
      return this.artistReputationCache.get(artist)!;
    }

    // Mock calculation (in production, this would query actual data)
    const mockScore = 0.5 + Math.random() * 0.4; // 0.5-0.9
    this.artistReputationCache.set(artist, mockScore);
    
    return mockScore;
  }

  /**
   * Calculate historical trend
   */
  private calculateHistoricalTrend(prices: ArtworkData['historicalPrices']): number {
    if (!prices || prices.length < 2) {
      return 0.5;
    }

    // Convert to time series
    const timeSeries: TimeSeries[] = prices
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(p => ({
        timestamp: p.date,
        value: p.price
      }));

    // Detect trend
    const trend = AnalyticsEngine.detectTrend(timeSeries);

    // Convert to 0-1 score
    if (trend.direction === 'up') {
      return 0.5 + Math.min(trend.strength * 0.5, 0.5);
    } else if (trend.direction === 'down') {
      return 0.5 - Math.min(trend.strength * 0.5, 0.5);
    } else {
      return 0.5;
    }
  }

  /**
   * Calculate market conditions
   */
  private calculateMarketConditions(): number {
    const factors = this.marketFactorsCache;
    
    return (
      factors.institutionalSupport * 0.3 +
      factors.publicHype * 0.2 +
      factors.liquidity * 0.25 +
      factors.trendScore * 0.15 +
      factors.economicIndex * 0.1
    );
  }

  /**
   * Calculate rarity score
   */
  private calculateRarity(artwork: ArtworkData): number {
    let score = 0.5;

    // Older works are generally rarer
    const age = new Date().getFullYear() - artwork.year;
    if (age > 100) score += 0.2;
    else if (age > 50) score += 0.1;

    // Certain mediums are rarer
    if (['oil', 'sculpture', 'installation'].includes(artwork.medium.toLowerCase())) {
      score += 0.1;
    }

    // Large or unusual dimensions
    if (artwork.dimensions) {
      const area = artwork.dimensions.width * artwork.dimensions.height;
      if (area > 10000) score += 0.1; // Very large
      if (area < 100) score += 0.1; // Very small
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate confidence in estimate
   */
  private calculateConfidence(artwork: ArtworkData, factors: Record<string, number>): number {
    let confidence = 0.5;

    // More historical data = higher confidence
    if (artwork.historicalPrices && artwork.historicalPrices.length >= 5) {
      confidence += 0.2;
    } else if (artwork.historicalPrices && artwork.historicalPrices.length >= 2) {
      confidence += 0.1;
    }

    // Complete data = higher confidence
    if (artwork.dimensions) confidence += 0.1;
    if (artwork.currentPrice) confidence += 0.1;

    // Strong factors = higher confidence
    const avgFactor = Object.values(factors).reduce((a, b) => a + b, 0) / Object.keys(factors).length;
    if (avgFactor > 0.7) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    currentPrice: number,
    estimatedPrice: number,
    factors: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];
    const ratio = estimatedPrice / currentPrice;

    if (ratio > 1.2) {
      recommendations.push('Artwork appears undervalued - potential buying opportunity');
    } else if (ratio < 0.8) {
      recommendations.push('Artwork may be overvalued - consider holding or selling');
    } else {
      recommendations.push('Artwork is fairly valued');
    }

    if (factors.historicalTrend > 0.7) {
      recommendations.push('Strong upward price trend detected');
    }

    if (factors.marketConditions > 0.7) {
      recommendations.push('Favorable market conditions');
    } else if (factors.marketConditions < 0.4) {
      recommendations.push('Caution: unfavorable market conditions');
    }

    if (factors.rarity > 0.8) {
      recommendations.push('High rarity score - good long-term hold');
    }

    if (factors.artistReputation > 0.8) {
      recommendations.push('Highly reputable artist - lower risk investment');
    }

    return recommendations;
  }

  /**
   * Estimate base price (fallback)
   */
  private estimateBasePrice(artwork: ArtworkData): number {
    // Simple base estimation
    let base = 10000;

    // Adjust by age
    const age = new Date().getFullYear() - artwork.year;
    if (age > 100) base *= 5;
    else if (age > 50) base *= 2;

    // Adjust by dimensions if available
    if (artwork.dimensions) {
      const area = artwork.dimensions.width * artwork.dimensions.height;
      base *= Math.sqrt(area / 10000); // Normalize to 1m²
    }

    return base;
  }

  /**
   * Update market factors (admin function)
   */
  updateMarketFactors(factors: Partial<MarketFactors>): void {
    this.marketFactorsCache = {
      ...this.marketFactorsCache,
      ...factors
    };
  }

  /**
   * Get current market factors
   */
  getMarketFactors(): MarketFactors {
    return { ...this.marketFactorsCache };
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.artistReputationCache.clear();
  }
}

// Singleton instance
export const priceCorridorModel = new PriceCorridorModel();
