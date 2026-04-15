/**
 * NLP & Sentiment Analysis API Routes
 * 
 * Endpoints:
 * - POST /api/nlp/analyze - Полный NLP анализ текста
 * - POST /api/nlp/entities - Извлечение сущностей (NER)
 * - POST /api/nlp/keywords - Извлечение ключевых слов
 * - POST /api/nlp/topics - Topic modeling
 * - POST /api/nlp/similarity - Сравнение текстов
 * - POST /api/nlp/summarize - Суммаризация текста
 * - POST /api/sentiment/analyze - Анализ настроений
 * - POST /api/sentiment/emotions - Анализ эмоций
 * - POST /api/sentiment/aspects - Aspect-based sentiment
 * - POST /api/sentiment/compare - Сравнение настроений
 * - POST /api/sentiment/trends - Временная динамика
 * - POST /api/sentiment/shifts - Обнаружение смены настроения
 * 
 * @module nlp-routes
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { getNLPEngine } from '../lib/nlp-engine';
import { getSentimentAnalyzer } from '../lib/sentiment-analysis';

const app = new Hono<{ Bindings: Env }>();

const nlp = getNLPEngine();
const sentiment = getSentimentAnalyzer();

// ========== NLP ENDPOINTS ==========

/**
 * POST /api/nlp/analyze
 * Полный NLP анализ текста
 */
app.post('/nlp/analyze', async (c) => {
  try {
    const { text } = await c.req.json();

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Text is required' }, 400);
    }

    const analysis = await nlp.analyze(text);

    return c.json({
      success: true,
      data: analysis,
      metadata: {
        textLength: text.length,
        processingTime: Date.now()
      }
    });
  } catch (error) {
    console.error('NLP Analysis error:', error);
    return c.json({ error: 'Analysis failed' }, 500);
  }
});

/**
 * POST /api/nlp/entities
 * Извлечение именованных сущностей
 */
app.post('/nlp/entities', async (c) => {
  try {
    const { text, types } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const analysis = await nlp.analyze(text);
    let entities = analysis.entities;

    // Фильтрация по типам
    if (types && Array.isArray(types)) {
      entities = entities.filter(e => types.includes(e.type));
    }

    return c.json({
      success: true,
      count: entities.length,
      entities,
      types: [...new Set(entities.map(e => e.type))]
    });
  } catch (error) {
    console.error('Entity extraction error:', error);
    return c.json({ error: 'Entity extraction failed' }, 500);
  }
});

/**
 * POST /api/nlp/keywords
 * Извлечение ключевых слов (TF-IDF)
 */
app.post('/nlp/keywords', async (c) => {
  try {
    const { text, limit = 10 } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const analysis = await nlp.analyze(text);
    const keywords = analysis.keywords.slice(0, limit);

    return c.json({
      success: true,
      count: keywords.length,
      keywords,
      totalScore: keywords.reduce((sum, k) => sum + k.score, 0)
    });
  } catch (error) {
    console.error('Keyword extraction error:', error);
    return c.json({ error: 'Keyword extraction failed' }, 500);
  }
});

/**
 * POST /api/nlp/topics
 * Topic modeling
 */
app.post('/nlp/topics', async (c) => {
  try {
    const { text, numTopics = 3 } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const analysis = await nlp.analyze(text);
    const topics = analysis.topics.slice(0, numTopics);

    return c.json({
      success: true,
      count: topics.length,
      topics,
      totalWeight: topics.reduce((sum, t) => sum + t.weight, 0)
    });
  } catch (error) {
    console.error('Topic modeling error:', error);
    return c.json({ error: 'Topic modeling failed' }, 500);
  }
});

/**
 * POST /api/nlp/similarity
 * Similarity между текстами
 */
app.post('/nlp/similarity', async (c) => {
  try {
    const { text1, text2 } = await c.req.json();

    if (!text1 || !text2) {
      return c.json({ error: 'Both text1 and text2 are required' }, 400);
    }

    const similarity = nlp.calculateSimilarity(text1, text2);

    return c.json({
      success: true,
      similarity,
      interpretation: similarity > 0.7 ? 'very similar' : 
                      similarity > 0.4 ? 'similar' :
                      similarity > 0.2 ? 'somewhat similar' : 'different'
    });
  } catch (error) {
    console.error('Similarity calculation error:', error);
    return c.json({ error: 'Similarity calculation failed' }, 500);
  }
});

/**
 * POST /api/nlp/summarize
 * Суммаризация текста
 */
app.post('/nlp/summarize', async (c) => {
  try {
    const { text, sentences = 3 } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const summary = nlp.summarize(text, sentences);
    const compressionRatio = summary.length / text.length;

    return c.json({
      success: true,
      summary,
      originalLength: text.length,
      summaryLength: summary.length,
      compressionRatio: Math.round(compressionRatio * 100) / 100
    });
  } catch (error) {
    console.error('Summarization error:', error);
    return c.json({ error: 'Summarization failed' }, 500);
  }
});

// ========== SENTIMENT ANALYSIS ENDPOINTS ==========

/**
 * POST /api/sentiment/analyze
 * Полный анализ настроений
 */
app.post('/sentiment/analyze', async (c) => {
  try {
    const { text } = await c.req.json();

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Text is required' }, 400);
    }

    const analysis = sentiment.analyze(text);

    return c.json({
      success: true,
      data: analysis,
      interpretation: {
        polarity: analysis.overall.polarity > 0 ? 'positive' : 
                  analysis.overall.polarity < 0 ? 'negative' : 'neutral',
        subjectivity: analysis.overall.subjectivity > 0.5 ? 'subjective' : 'objective',
        emotion: analysis.dominantEmotion,
        confidence: `${Math.round(analysis.overall.confidence * 100)}%`
      }
    });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    return c.json({ error: 'Sentiment analysis failed' }, 500);
  }
});

/**
 * POST /api/sentiment/emotions
 * Детальный анализ эмоций
 */
app.post('/sentiment/emotions', async (c) => {
  try {
    const { text } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const analysis = sentiment.analyze(text);
    const emotions = analysis.emotions;

    // Сортировка эмоций по убыванию
    const sortedEmotions = Object.entries(emotions)
      .map(([emotion, score]) => ({ emotion, score }))
      .sort((a, b) => b.score - a.score);

    return c.json({
      success: true,
      dominantEmotion: analysis.dominantEmotion,
      emotions,
      ranked: sortedEmotions
    });
  } catch (error) {
    console.error('Emotion analysis error:', error);
    return c.json({ error: 'Emotion analysis failed' }, 500);
  }
});

/**
 * POST /api/sentiment/aspects
 * Aspect-based sentiment analysis
 */
app.post('/sentiment/aspects', async (c) => {
  try {
    const { text } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const analysis = sentiment.analyze(text);
    const aspects = analysis.aspects;

    return c.json({
      success: true,
      count: aspects.length,
      aspects,
      summary: aspects.map(a => ({
        aspect: a.aspect,
        sentiment: a.sentiment.polarity > 0 ? 'positive' :
                   a.sentiment.polarity < 0 ? 'negative' : 'neutral',
        confidence: a.sentiment.confidence
      }))
    });
  } catch (error) {
    console.error('Aspect sentiment error:', error);
    return c.json({ error: 'Aspect sentiment analysis failed' }, 500);
  }
});

/**
 * POST /api/sentiment/compare
 * Сравнение настроений двух текстов
 */
app.post('/sentiment/compare', async (c) => {
  try {
    const { text1, text2 } = await c.req.json();

    if (!text1 || !text2) {
      return c.json({ error: 'Both text1 and text2 are required' }, 400);
    }

    const comparison = sentiment.compareTexts(text1, text2);

    return c.json({
      success: true,
      data: comparison,
      summary: {
        text1Sentiment: comparison.text1.label,
        text2Sentiment: comparison.text2.label,
        polarityDifference: Math.round(comparison.polarityDiff * 100) / 100,
        interpretation: Math.abs(comparison.polarityDiff) > 0.5 ? 
          'significant difference' : 'similar sentiment'
      }
    });
  } catch (error) {
    console.error('Sentiment comparison error:', error);
    return c.json({ error: 'Sentiment comparison failed' }, 500);
  }
});

/**
 * POST /api/sentiment/trends
 * Временная динамика настроений
 */
app.post('/sentiment/trends', async (c) => {
  try {
    const { texts } = await c.req.json();

    if (!texts || !Array.isArray(texts)) {
      return c.json({ error: 'Texts array is required' }, 400);
    }

    if (texts.some(t => !t.text || !t.timestamp)) {
      return c.json({ error: 'Each item must have text and timestamp' }, 400);
    }

    const trends = sentiment.analyzeTrends(texts);

    return c.json({
      success: true,
      count: trends.length,
      trends,
      summary: {
        startPolarity: trends[0]?.sentiment.polarity || 0,
        endPolarity: trends[trends.length - 1]?.sentiment.polarity || 0,
        averagePolarity: trends.reduce((sum, t) => sum + t.movingAverage, 0) / trends.length,
        volatility: Math.max(...trends.map(t => Math.abs(t.sentiment.polarity)))
      }
    });
  } catch (error) {
    console.error('Trend analysis error:', error);
    return c.json({ error: 'Trend analysis failed' }, 500);
  }
});

/**
 * POST /api/sentiment/shifts
 * Обнаружение смены настроения
 */
app.post('/sentiment/shifts', async (c) => {
  try {
    const { text, threshold = 0.5 } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const shifts = sentiment.detectShifts(text);

    return c.json({
      success: true,
      count: shifts.length,
      shifts,
      summary: {
        hasSignificantShifts: shifts.length > 0,
        maxShift: Math.max(...shifts.map(s => s.shift), 0),
        averageShift: shifts.length > 0 ? 
          shifts.reduce((sum, s) => sum + s.shift, 0) / shifts.length : 0
      }
    });
  } catch (error) {
    console.error('Shift detection error:', error);
    return c.json({ error: 'Shift detection failed' }, 500);
  }
});

/**
 * GET /api/nlp/health
 * Health check endpoint
 */
app.get('/nlp/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'NLP & Sentiment Analysis',
    features: [
      'NLP Analysis',
      'Entity Recognition',
      'Keyword Extraction',
      'Topic Modeling',
      'Text Similarity',
      'Summarization',
      'Sentiment Analysis',
      'Emotion Detection',
      'Aspect-based Sentiment',
      'Trend Analysis',
      'Shift Detection'
    ],
    version: '1.0.0'
  });
});

export default app;
