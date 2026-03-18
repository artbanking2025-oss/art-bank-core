import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/analytics-extended/price-corridor
 * Рассчитывает Единый Коридор Платформы для произведения
 * 
 * Математика:
 * - Медиана предложений (M_gal): среднее всех ask prices верифицированных галерей
 * - Медиана сделок (M_sales): среднее всех sold prices за период
 * - Spread: разница между медианами показывает состояние рынка
 */
app.post('/price-corridor', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { artwork_id, period_months = 6 } = await c.req.json();

  try {
    // Получить произведение
    const artwork = await db.getArtwork(artwork_id);
    if (!artwork) {
      return c.json({ error: 'Artwork not found' }, 404);
    }

    // Собрать данные для расчёта коридора
    const segmentData = await db.getArtworkSegmentData(artwork_id);
    
    // Расчёт медианы предложений (Gallery Median)
    const askPrices = segmentData.similar_artworks
      .map((a: any) => a.ask_price || a.current_fpc)
      .filter((p: number) => p > 0);
    
    const galleryMedian = askPrices.length > 0
      ? askPrices.sort((a: number, b: number) => a - b)[Math.floor(askPrices.length / 2)]
      : artwork.current_fpc || 0;

    // Расчёт медианы сделок (Sales Median)
    const soldPrices = segmentData.similar_artworks
      .map((a: any) => a.last_sale_price)
      .filter((p: number) => p > 0);
    
    const salesMedian = soldPrices.length > 0
      ? soldPrices.sort((a: number, b: number) => a - b)[Math.floor(soldPrices.length / 2)]
      : galleryMedian * 0.85; // Дисконт 15% если нет сделок

    // Расчёт границ коридора (±σ)
    const stdDev = calculateStdDev(askPrices);
    const corridorLower = galleryMedian - stdDev;
    const corridorUpper = galleryMedian + stdDev;

    // Spread (разрыв ликвидности)
    const spread = galleryMedian > 0 ? (galleryMedian - salesMedian) / galleryMedian : 0;

    // Позиция текущей цены в коридоре
    const currentPrice = artwork.current_fpc || 0;
    let position = 'center';
    let growthPotential = 0;

    if (currentPrice < corridorLower) {
      position = 'undervalued';
      growthPotential = (galleryMedian - currentPrice) / currentPrice;
    } else if (currentPrice > corridorUpper) {
      position = 'overvalued';
      growthPotential = (currentPrice - galleryMedian) / galleryMedian;
    } else {
      growthPotential = (corridorUpper - currentPrice) / currentPrice;
    }

    // Оценка ликвидности
    const liquidityRating = spread < 0.15 ? 'high' : spread < 0.30 ? 'medium' : 'low';

    return c.json({
      artwork_id,
      current_price: currentPrice,
      corridor: {
        gallery_median: Math.round(galleryMedian),
        sales_median: Math.round(salesMedian),
        lower_bound: Math.round(corridorLower),
        upper_bound: Math.round(corridorUpper),
        std_deviation: Math.round(stdDev)
      },
      position: {
        relative_position: position,
        growth_potential: Math.round(growthPotential * 100) / 100,
        distance_to_median: Math.round(((currentPrice - galleryMedian) / galleryMedian) * 100)
      },
      liquidity: {
        spread_percentage: Math.round(spread * 100),
        rating: liquidityRating,
        comparable_sales: soldPrices.length,
        comparable_listings: askPrices.length
      },
      period_months,
      calculated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Price corridor calculation error:', error);
    return c.json({ error: 'Failed to calculate price corridor' }, 500);
  }
});

/**
 * POST /api/analytics-extended/market-factors
 * Рассчитывает три фактора-"нити" для актива
 * 
 * F1: Институциональная подпорка (Provenance weight)
 * F2: Рыночный ажиотаж (Media sentiment + search volume)
 * F3: Ликвидность (Time-to-sale speed)
 */
app.post('/market-factors', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { artwork_id } = await c.req.json();

  try {
    const artwork = await db.getArtwork(artwork_id);
    if (!artwork) {
      return c.json({ error: 'Artwork not found' }, 404);
    }

    // F1: Институциональная подпорка
    const validations = await db.getValidationsByArtwork(artwork_id);
    const exhibitions = await db.getExhibitionsByArtwork(artwork_id);
    
    const institutionalWeight = calculateInstitutionalWeight(
      validations.length,
      exhibitions.length,
      artwork.provenance_score || 0
    );

    // F2: Рыночный ажиотаж
    const mediaItems = await db.getMediaByEntity('artwork', artwork_id);
    const avgSentiment = mediaItems.length > 0
      ? mediaItems.reduce((sum: number, m: any) => sum + (m.sentiment_score || 0), 0) / mediaItems.length
      : 0;
    
    const hypeWeight = calculateHypeWeight(
      mediaItems.length,
      avgSentiment,
      mediaItems.reduce((sum: number, m: any) => sum + (m.influence_score || 0), 0)
    );

    // F3: Ликвидность
    const transactions = await db.getTransactionsByArtwork(artwork_id);
    const liquidityWeight = calculateLiquidityWeight(
      transactions.length,
      artwork.last_sale_date || null
    );

    // Общая оценка стабильности
    const stabilityScore = (institutionalWeight * 0.5 + liquidityWeight * 0.3 + hypeWeight * 0.2);

    return c.json({
      artwork_id,
      factors: {
        f1_institutional_support: {
          weight: Math.round(institutionalWeight * 100) / 100,
          validations_count: validations.length,
          exhibitions_count: exhibitions.length,
          provenance_score: artwork.provenance_score || 0,
          interpretation: interpretWeight(institutionalWeight)
        },
        f2_market_hype: {
          weight: Math.round(hypeWeight * 100) / 100,
          media_mentions: mediaItems.length,
          avg_sentiment: Math.round(avgSentiment * 100) / 100,
          interpretation: interpretWeight(hypeWeight)
        },
        f3_liquidity: {
          weight: Math.round(liquidityWeight * 100) / 100,
          transactions_count: transactions.length,
          last_sale: artwork.last_sale_date,
          interpretation: interpretWeight(liquidityWeight)
        }
      },
      stability: {
        overall_score: Math.round(stabilityScore * 100) / 100,
        rating: stabilityScore > 0.75 ? 'excellent' : stabilityScore > 0.50 ? 'good' : 'moderate',
        recommendation: getRecommendation(stabilityScore, institutionalWeight, hypeWeight)
      },
      calculated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Market factors calculation error:', error);
    return c.json({ error: 'Failed to calculate market factors' }, 500);
  }
});

// Helper functions
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateInstitutionalWeight(
  validationsCount: number,
  exhibitionsCount: number,
  provenanceScore: number
): number {
  // Вес растёт с количеством валидаций и выставок
  const validationWeight = Math.min(validationsCount / 10, 1.0);
  const exhibitionWeight = Math.min(exhibitionsCount / 5, 1.0);
  return (validationWeight * 0.4 + exhibitionWeight * 0.3 + provenanceScore * 0.3);
}

function calculateHypeWeight(
  mediaCount: number,
  avgSentiment: number,
  totalInfluence: number
): number {
  // Вес растёт с количеством упоминаний и позитивным sentiment
  const mediaWeight = Math.min(mediaCount / 20, 1.0);
  const sentimentWeight = (avgSentiment + 1) / 2; // Нормализация от [-1,1] к [0,1]
  const influenceWeight = Math.min(totalInfluence / 5, 1.0);
  return (mediaWeight * 0.4 + sentimentWeight * 0.3 + influenceWeight * 0.3);
}

function calculateLiquidityWeight(
  transactionsCount: number,
  lastSaleDate: string | null
): number {
  // Вес растёт с количеством сделок и недавностью последней продажи
  const transactionWeight = Math.min(transactionsCount / 10, 1.0);
  
  let recencyWeight = 0.5;
  if (lastSaleDate) {
    const daysSinceLastSale = (Date.now() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24);
    recencyWeight = Math.max(0, 1 - (daysSinceLastSale / 365)); // Снижается каждый год
  }
  
  return (transactionWeight * 0.6 + recencyWeight * 0.4);
}

function interpretWeight(weight: number): string {
  if (weight > 0.8) return 'Very Strong';
  if (weight > 0.6) return 'Strong';
  if (weight > 0.4) return 'Moderate';
  if (weight > 0.2) return 'Weak';
  return 'Very Weak';
}

function getRecommendation(
  stabilityScore: number,
  institutionalWeight: number,
  hypeWeight: number
): string {
  if (stabilityScore > 0.75 && institutionalWeight > 0.7) {
    return 'Blue Chip: Excellent institutional backing, suitable for conservative portfolios';
  }
  if (hypeWeight > 0.7 && institutionalWeight < 0.4) {
    return 'Speculative: High hype but weak fundamentals, high risk';
  }
  if (stabilityScore > 0.5) {
    return 'Balanced: Moderate stability, suitable for diversified portfolios';
  }
  return 'High Risk: Low stability indicators, thorough due diligence required';
}

export default app;
