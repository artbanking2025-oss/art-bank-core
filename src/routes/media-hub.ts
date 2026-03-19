import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/media-hub/analyze
 * Analyze media item and extract sentiment, entities, and influence
 * 
 * Simplified NLP approach:
 * - Sentiment: keyword-based scoring (-1.0 to 1.0)
 * - Entity extraction: pattern matching
 * - Influence: source credibility + engagement metrics
 */
app.post('/analyze', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { title, content, source, url, author, entity_type, entity_id } = await c.req.json();

  try {
    // 1. Sentiment Analysis (keyword-based)
    const sentiment = analyzeSentiment(title + ' ' + (content || ''));

    // 2. Influence Score (source-based)
    const influence = calculateInfluenceScore(source, author);

    // 3. Extract entities (artists, artworks, galleries)
    const entities = extractEntities(content || '', entity_type, entity_id);

    // 4. Create media item
    const mediaId = crypto.randomUUID();
    const mediaItem = await db.createMediaItem({
      id: mediaId,
      type: 'news',
      source: source || 'unknown',
      url: url || null,
      title,
      content: content || null,
      author: author || null,
      published_at: new Date().toISOString(),
      sentiment_score: sentiment,
      influence_score: influence
    });

    // 5. Add mentions for extracted entities
    for (const entity of entities) {
      await db.addMediaMention(
        mediaId,
        entity.type,
        entity.id,
        entity.context,
        entity.relevance
      );
    }

    // 6. Log event (EventBus emit disabled for Cloudflare Workers compatibility)
    console.log('[MediaHub] Media analyzed:', { 
      media_id: mediaId, 
      sentiment, 
      influence, 
      entities: entities.length 
    });

    return c.json({
      media_id: mediaId,
      sentiment: {
        score: sentiment,
        interpretation: interpretSentiment(sentiment)
      },
      influence: {
        score: influence,
        tier: getInfluenceTier(influence)
      },
      entities_extracted: entities.length,
      entities: entities.map(e => ({ type: e.type, id: e.id })),
      created_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Media analysis error:', error);
    return c.json({ error: 'Failed to analyze media' }, 500);
  }
});

/**
 * POST /api/media-hub/price-impact
 * Calculate media impact on artwork prices
 * 
 * Formula:
 * Price Impact = Sentiment * Influence * Recency Weight
 */
app.post('/price-impact', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { artwork_id, days_window = 30 } = await c.req.json();

  try {
    const artwork = await db.getArtwork(artwork_id);
    if (!artwork) {
      return c.json({ error: 'Artwork not found' }, 404);
    }

    // Get media mentions in time window
    const mediaItems = await db.getMediaByEntity('artwork', artwork_id);
    
    // Filter by time window
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days_window);
    
    const recentMedia = mediaItems.filter((m: any) => {
      const publishedDate = new Date(m.published_at || 0);
      return publishedDate >= cutoffDate;
    });

    if (recentMedia.length === 0) {
      return c.json({
        artwork_id,
        media_count: 0,
        price_impact: 0,
        sentiment_trend: 'neutral',
        recommendation: 'No recent media coverage'
      });
    }

    // Calculate weighted impact
    let totalImpact = 0;
    let sentimentSum = 0;
    let weightSum = 0;

    for (const media of recentMedia) {
      const recencyWeight = calculateRecencyWeight(
        new Date(media.published_at),
        new Date(),
        days_window
      );
      
      const impact = (media.sentiment_score || 0) * 
                     (media.influence_score || 0) * 
                     recencyWeight;
      
      totalImpact += impact;
      sentimentSum += (media.sentiment_score || 0) * recencyWeight;
      weightSum += recencyWeight;
    }

    const avgSentiment = weightSum > 0 ? sentimentSum / weightSum : 0;
    const normalizedImpact = totalImpact / recentMedia.length;

    // Estimate price adjustment
    const currentPrice = artwork.current_fpc || 0;
    const priceAdjustment = currentPrice * normalizedImpact * 0.1; // Max 10% impact

    return c.json({
      artwork_id,
      analysis_period_days: days_window,
      media_coverage: {
        total_mentions: recentMedia.length,
        average_sentiment: Math.round(avgSentiment * 100) / 100,
        average_influence: Math.round(
          recentMedia.reduce((sum: number, m: any) => sum + (m.influence_score || 0), 0) / recentMedia.length * 100
        ) / 100,
        sentiment_trend: avgSentiment > 0.3 ? 'positive' : avgSentiment < -0.3 ? 'negative' : 'neutral'
      },
      price_impact: {
        current_price: currentPrice,
        estimated_impact: Math.round(normalizedImpact * 100) / 100,
        price_adjustment: Math.round(priceAdjustment),
        adjusted_price: Math.round(currentPrice + priceAdjustment),
        confidence: recentMedia.length >= 5 ? 'high' : recentMedia.length >= 3 ? 'medium' : 'low'
      },
      recommendation: generatePriceRecommendation(avgSentiment, normalizedImpact, recentMedia.length),
      recent_headlines: recentMedia.slice(0, 5).map((m: any) => ({
        title: m.title,
        source: m.source,
        sentiment: m.sentiment_score,
        published: m.published_at
      }))
    });

  } catch (error) {
    console.error('Price impact calculation error:', error);
    return c.json({ error: 'Failed to calculate price impact' }, 500);
  }
});

/**
 * GET /api/media-hub/trending
 * Get trending artworks based on media buzz
 */
app.get('/trending', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const days = parseInt(c.req.query('days') || '7');

  try {
    // Get all artworks
    const artworks = await db.getAllArtworks();
    
    // Calculate buzz score for each
    const trendingScores = await Promise.all(
      artworks.slice(0, 20).map(async (artwork: any) => {
        const mediaItems = await db.getMediaByEntity('artwork', artwork.id);
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const recentMedia = mediaItems.filter((m: any) => 
          new Date(m.published_at || 0) >= cutoffDate
        );

        const buzzScore = recentMedia.reduce((score: number, m: any) => {
          const recency = calculateRecencyWeight(new Date(m.published_at), new Date(), days);
          return score + (m.influence_score || 0) * recency;
        }, 0);

        return {
          artwork_id: artwork.id,
          title: artwork.title,
          artist_id: artwork.artist_node_id,
          media_mentions: recentMedia.length,
          buzz_score: buzzScore,
          avg_sentiment: recentMedia.length > 0
            ? recentMedia.reduce((sum: number, m: any) => sum + (m.sentiment_score || 0), 0) / recentMedia.length
            : 0
        };
      })
    );

    // Sort by buzz score
    const trending = trendingScores
      .filter(t => t.buzz_score > 0)
      .sort((a, b) => b.buzz_score - a.buzz_score)
      .slice(0, 10);

    return c.json({
      period_days: days,
      trending_count: trending.length,
      trending_artworks: trending.map(t => ({
        ...t,
        buzz_score: Math.round(t.buzz_score * 100) / 100,
        avg_sentiment: Math.round(t.avg_sentiment * 100) / 100,
        trend: t.avg_sentiment > 0.3 ? '📈 Rising' : t.avg_sentiment < -0.3 ? '📉 Falling' : '➡️ Stable'
      }))
    });

  } catch (error) {
    console.error('Trending calculation error:', error);
    return c.json({ error: 'Failed to calculate trending' }, 500);
  }
});

// ========== HELPER FUNCTIONS ==========

/**
 * Simplified sentiment analysis using keyword matching
 */
function analyzeSentiment(text: string): number {
  const lowerText = text.toLowerCase();
  
  const positiveKeywords = [
    'excellent', 'outstanding', 'masterpiece', 'brilliant', 'acclaimed',
    'celebrated', 'prestigious', 'renowned', 'exceptional', 'remarkable',
    'stunning', 'magnificent', 'extraordinary', 'impressive', 'breakthrough',
    'success', 'triumph', 'valuable', 'rare', 'iconic', 'legendary',
    'beautiful', 'exquisite', 'wonderful', 'amazing', 'fantastic'
  ];
  
  const negativeKeywords = [
    'poor', 'disappointing', 'mediocre', 'weak', 'failure',
    'controversial', 'criticized', 'declined', 'dropped', 'fell',
    'problematic', 'questionable', 'disputed', 'fake', 'fraud',
    'scandal', 'lawsuit', 'damaged', 'deteriorated', 'worthless'
  ];

  let score = 0;
  let totalMatches = 0;

  for (const keyword of positiveKeywords) {
    if (lowerText.includes(keyword)) {
      score += 1;
      totalMatches++;
    }
  }

  for (const keyword of negativeKeywords) {
    if (lowerText.includes(keyword)) {
      score -= 1;
      totalMatches++;
    }
  }

  // Normalize to -1.0 to 1.0
  if (totalMatches === 0) return 0;
  return Math.max(-1, Math.min(1, score / Math.max(totalMatches, 3)));
}

/**
 * Calculate influence score based on source credibility
 */
function calculateInfluenceScore(source: string, author?: string): number {
  const lowerSource = (source || '').toLowerCase();
  const lowerAuthor = (author || '').toLowerCase();

  let score = 0.3; // Base score

  // Tier 1: Major international outlets
  const tier1 = ['nytimes', 'wsj', 'financial times', 'economist', 'bloomberg', 'reuters', 'artforum', 'artnet'];
  if (tier1.some(s => lowerSource.includes(s))) score += 0.5;

  // Tier 2: National outlets
  const tier2 = ['guardian', 'telegraph', 'art newspaper', 'hyperallergic', 'artnews'];
  if (tier2.some(s => lowerSource.includes(s))) score += 0.3;

  // Tier 3: Specialized art press
  const tier3 = ['frieze', 'mousse', 'e-flux', 'contemporary art daily'];
  if (tier3.some(s => lowerSource.includes(s))) score += 0.2;

  // Expert author boost
  if (lowerAuthor.includes('critic') || lowerAuthor.includes('curator')) {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

/**
 * Extract entities from text (simplified pattern matching)
 */
function extractEntities(text: string, primaryType?: string, primaryId?: string): Array<{
  type: string;
  id: string;
  context: string;
  relevance: number;
}> {
  const entities = [];

  // Always add primary entity if provided
  if (primaryType && primaryId) {
    entities.push({
      type: primaryType,
      id: primaryId,
      context: text.substring(0, 200),
      relevance: 1.0
    });
  }

  return entities;
}

function interpretSentiment(score: number): string {
  if (score > 0.5) return 'Very Positive';
  if (score > 0.2) return 'Positive';
  if (score > -0.2) return 'Neutral';
  if (score > -0.5) return 'Negative';
  return 'Very Negative';
}

function getInfluenceTier(score: number): string {
  if (score >= 0.7) return 'Tier 1 (Major Outlet)';
  if (score >= 0.5) return 'Tier 2 (National)';
  if (score >= 0.3) return 'Tier 3 (Specialized)';
  return 'Tier 4 (Local/Blog)';
}

function calculateRecencyWeight(publishedDate: Date, now: Date, windowDays: number): number {
  const daysDiff = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - (daysDiff / windowDays));
}

function generatePriceRecommendation(sentiment: number, impact: number, mentionCount: number): string {
  if (mentionCount < 3) {
    return 'Insufficient data: Need more media coverage for reliable recommendation';
  }

  if (sentiment > 0.3 && impact > 0.5) {
    return '📈 Strong Buy Signal: Positive media buzz with high influence';
  }

  if (sentiment > 0.2 && impact > 0.3) {
    return '📊 Moderate Buy Signal: Favorable coverage from credible sources';
  }

  if (sentiment < -0.3 && impact > 0.4) {
    return '📉 Sell Signal: Negative coverage from influential sources';
  }

  if (Math.abs(sentiment) < 0.2) {
    return '➡️ Hold: Neutral media sentiment, monitor for changes';
  }

  return '⚠️ Mixed Signals: Conflicting media narratives, exercise caution';
}

export default app;
