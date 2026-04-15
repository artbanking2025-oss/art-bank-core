/**
 * Sentiment Analysis Engine - Анализ эмоциональной окраски текста
 * 
 * Функции:
 * - Определение полярности (positive/negative/neutral)
 * - Анализ эмоций (радость, грусть, гнев, страх, удивление)
 * - Субъективность vs Объективность
 * - Анализ тональности по аспектам
 * - Временная динамика настроений
 * 
 * @module sentiment-analysis
 */

interface SentimentScore {
  polarity: number; // -1 (negative) to +1 (positive)
  subjectivity: number; // 0 (objective) to 1 (subjective)
  confidence: number;
}

interface EmotionScores {
  joy: number;
  sadness: number;
  anger: number;
  fear: number;
  surprise: number;
  disgust: number;
}

interface AspectSentiment {
  aspect: string;
  sentiment: SentimentScore;
  mentions: string[];
}

interface SentimentAnalysis {
  overall: SentimentScore;
  emotions: EmotionScores;
  aspects: AspectSentiment[];
  label: 'positive' | 'negative' | 'neutral';
  dominantEmotion: string;
}

interface SentimentTrend {
  timestamp: string;
  sentiment: SentimentScore;
  movingAverage: number;
}

/**
 * Sentiment Analysis Engine
 */
export class SentimentAnalyzer {
  private positiveWords: Set<string>;
  private negativeWords: Set<string>;
  private emotionLexicon: Map<string, EmotionScores>;
  private intensifiers: Map<string, number>;
  private negators: Set<string>;

  constructor() {
    this.positiveWords = this.initPositiveWords();
    this.negativeWords = this.initNegativeWords();
    this.emotionLexicon = this.initEmotionLexicon();
    this.intensifiers = this.initIntensifiers();
    this.negators = this.initNegators();
  }

  /**
   * Полный анализ настроений
   */
  analyze(text: string): SentimentAnalysis {
    const overall = this.analyzeSentiment(text);
    const emotions = this.analyzeEmotions(text);
    const aspects = this.extractAspectSentiments(text);
    
    const label = this.getLabel(overall.polarity);
    const dominantEmotion = this.getDominantEmotion(emotions);

    return {
      overall,
      emotions,
      aspects,
      label,
      dominantEmotion
    };
  }

  /**
   * Анализ полярности и субъективности
   */
  private analyzeSentiment(text: string): SentimentScore {
    const words = text.toLowerCase().match(/\b[\wа-яё]+\b/gi) || [];
    
    let polaritySum = 0;
    let subjectivitySum = 0;
    let count = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Проверка на отрицание
      const hasNegation = i > 0 && this.negators.has(words[i - 1]);
      
      // Проверка на усилители
      const intensifier = i > 0 ? (this.intensifiers.get(words[i - 1]) || 1) : 1;

      if (this.positiveWords.has(word)) {
        const score = hasNegation ? -0.5 : 1.0;
        polaritySum += score * intensifier;
        subjectivitySum += 0.8;
        count++;
      } else if (this.negativeWords.has(word)) {
        const score = hasNegation ? 0.5 : -1.0;
        polaritySum += score * intensifier;
        subjectivitySum += 0.8;
        count++;
      }
    }

    if (count === 0) {
      return { polarity: 0, subjectivity: 0, confidence: 0.5 };
    }

    const polarity = Math.max(-1, Math.min(1, polaritySum / count));
    const subjectivity = Math.min(1, subjectivitySum / words.length);
    const confidence = Math.min(0.95, count / Math.max(10, words.length) + 0.3);

    return { polarity, subjectivity, confidence };
  }

  /**
   * Анализ эмоций
   */
  private analyzeEmotions(text: string): EmotionScores {
    const words = text.toLowerCase().match(/\b[\wа-яё]+\b/gi) || [];
    
    const emotions: EmotionScores = {
      joy: 0,
      sadness: 0,
      anger: 0,
      fear: 0,
      surprise: 0,
      disgust: 0
    };

    let count = 0;

    for (const word of words) {
      const emotionScores = this.emotionLexicon.get(word);
      if (emotionScores) {
        emotions.joy += emotionScores.joy;
        emotions.sadness += emotionScores.sadness;
        emotions.anger += emotionScores.anger;
        emotions.fear += emotionScores.fear;
        emotions.surprise += emotionScores.surprise;
        emotions.disgust += emotionScores.disgust;
        count++;
      }
    }

    if (count > 0) {
      // Нормализация
      const total = Object.values(emotions).reduce((sum, v) => sum + v, 0);
      if (total > 0) {
        for (const key in emotions) {
          emotions[key as keyof EmotionScores] /= total;
        }
      }
    }

    return emotions;
  }

  /**
   * Извлечение настроений по аспектам (Aspect-based Sentiment Analysis)
   */
  private extractAspectSentiments(text: string): AspectSentiment[] {
    const aspects: AspectSentiment[] = [];
    
    // Аспекты для арт-рынка
    const artAspects = [
      { name: 'quality', keywords: ['quality', 'masterpiece', 'excellent', 'beautiful', 'stunning', 'poor', 'mediocre'] },
      { name: 'price', keywords: ['price', 'expensive', 'cheap', 'value', 'affordable', 'overpriced', 'bargain'] },
      { name: 'authenticity', keywords: ['authentic', 'genuine', 'fake', 'forgery', 'provenance', 'certificate'] },
      { name: 'condition', keywords: ['condition', 'restored', 'damaged', 'pristine', 'deteriorated', 'preserved'] },
      { name: 'investment', keywords: ['investment', 'return', 'profit', 'loss', 'appreciation', 'depreciation'] }
    ];

    for (const aspect of artAspects) {
      const mentions: string[] = [];
      let aspectText = '';

      // Поиск упоминаний аспекта
      for (const keyword of aspect.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b.*?[.!?]`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          mentions.push(...matches);
          aspectText += ' ' + matches.join(' ');
        }
      }

      if (mentions.length > 0) {
        const sentiment = this.analyzeSentiment(aspectText);
        aspects.push({
          aspect: aspect.name,
          sentiment,
          mentions: mentions.slice(0, 3) // Первые 3 упоминания
        });
      }
    }

    return aspects;
  }

  /**
   * Получение метки sentiment
   */
  private getLabel(polarity: number): 'positive' | 'negative' | 'neutral' {
    if (polarity > 0.1) return 'positive';
    if (polarity < -0.1) return 'negative';
    return 'neutral';
  }

  /**
   * Определение доминирующей эмоции
   */
  private getDominantEmotion(emotions: EmotionScores): string {
    let maxEmotion = 'neutral';
    let maxScore = 0;

    for (const [emotion, score] of Object.entries(emotions)) {
      if (score > maxScore) {
        maxScore = score;
        maxEmotion = emotion;
      }
    }

    return maxScore > 0.2 ? maxEmotion : 'neutral';
  }

  /**
   * Comparative Sentiment Analysis (сравнение текстов)
   */
  compareTexts(text1: string, text2: string): {
    text1: SentimentAnalysis;
    text2: SentimentAnalysis;
    polarityDiff: number;
    emotionDiff: EmotionScores;
  } {
    const sentiment1 = this.analyze(text1);
    const sentiment2 = this.analyze(text2);

    const polarityDiff = sentiment1.overall.polarity - sentiment2.overall.polarity;
    
    const emotionDiff: EmotionScores = {
      joy: sentiment1.emotions.joy - sentiment2.emotions.joy,
      sadness: sentiment1.emotions.sadness - sentiment2.emotions.sadness,
      anger: sentiment1.emotions.anger - sentiment2.emotions.anger,
      fear: sentiment1.emotions.fear - sentiment2.emotions.fear,
      surprise: sentiment1.emotions.surprise - sentiment2.emotions.surprise,
      disgust: sentiment1.emotions.disgust - sentiment2.emotions.disgust
    };

    return {
      text1: sentiment1,
      text2: sentiment2,
      polarityDiff,
      emotionDiff
    };
  }

  /**
   * Временная динамика настроений
   */
  analyzeTrends(texts: Array<{ text: string; timestamp: string }>): SentimentTrend[] {
    const trends: SentimentTrend[] = [];
    const window = 5; // Окно для скользящего среднего

    for (let i = 0; i < texts.length; i++) {
      const sentiment = this.analyzeSentiment(texts[i].text);
      
      // Скользящее среднее
      const start = Math.max(0, i - window + 1);
      const windowTexts = texts.slice(start, i + 1);
      const avgPolarity = windowTexts.reduce((sum, t) => 
        sum + this.analyzeSentiment(t.text).polarity, 0
      ) / windowTexts.length;

      trends.push({
        timestamp: texts[i].timestamp,
        sentiment,
        movingAverage: avgPolarity
      });
    }

    return trends;
  }

  /**
   * Sentiment Shift Detection (обнаружение смены настроения)
   */
  detectShifts(text: string): Array<{ position: number; before: number; after: number; shift: number }> {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const shifts: Array<{ position: number; before: number; after: number; shift: number }> = [];

    for (let i = 1; i < sentences.length; i++) {
      const beforeSentiment = this.analyzeSentiment(sentences[i - 1]);
      const afterSentiment = this.analyzeSentiment(sentences[i]);
      
      const shift = Math.abs(afterSentiment.polarity - beforeSentiment.polarity);
      
      if (shift > 0.5) { // Значительная смена настроения
        shifts.push({
          position: i,
          before: beforeSentiment.polarity,
          after: afterSentiment.polarity,
          shift
        });
      }
    }

    return shifts;
  }

  /**
   * Инициализация позитивных слов
   */
  private initPositiveWords(): Set<string> {
    return new Set([
      // English
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
      'beautiful', 'stunning', 'impressive', 'remarkable', 'outstanding',
      'exceptional', 'superb', 'magnificent', 'brilliant', 'masterpiece',
      'perfect', 'best', 'love', 'like', 'enjoy', 'happy', 'pleased',
      'satisfied', 'delighted', 'recommended', 'authentic', 'genuine',
      // Russian
      'хороший', 'отличный', 'прекрасный', 'замечательный', 'восхитительный',
      'красивый', 'потрясающий', 'впечатляющий', 'выдающийся', 'шедевр',
      'идеальный', 'лучший', 'нравится', 'рад', 'доволен', 'подлинный'
    ]);
  }

  /**
   * Инициализация негативных слов
   */
  private initNegativeWords(): Set<string> {
    return new Set([
      // English
      'bad', 'terrible', 'awful', 'horrible', 'poor', 'disappointing',
      'mediocre', 'inferior', 'substandard', 'fake', 'forgery', 'damaged',
      'deteriorated', 'overpriced', 'expensive', 'hate', 'dislike', 'unhappy',
      'dissatisfied', 'waste', 'avoid', 'worst', 'useless', 'questionable',
      // Russian
      'плохой', 'ужасный', 'отвратительный', 'разочаровывающий', 'посредственный',
      'фальшивый', 'подделка', 'поврежденный', 'дорогой', 'переоцененный',
      'недоволен', 'худший', 'бесполезный', 'сомнительный'
    ]);
  }

  /**
   * Инициализация лексикона эмоций
   */
  private initEmotionLexicon(): Map<string, EmotionScores> {
    return new Map([
      // Joy
      ['happy', { joy: 0.9, sadness: 0, anger: 0, fear: 0, surprise: 0.1, disgust: 0 }],
      ['delighted', { joy: 0.95, sadness: 0, anger: 0, fear: 0, surprise: 0.05, disgust: 0 }],
      ['wonderful', { joy: 0.85, sadness: 0, anger: 0, fear: 0, surprise: 0.15, disgust: 0 }],
      
      // Sadness
      ['sad', { joy: 0, sadness: 0.9, anger: 0, fear: 0.1, surprise: 0, disgust: 0 }],
      ['disappointing', { joy: 0, sadness: 0.7, anger: 0.2, fear: 0, surprise: 0.1, disgust: 0 }],
      ['unfortunate', { joy: 0, sadness: 0.8, anger: 0, fear: 0.1, surprise: 0.1, disgust: 0 }],
      
      // Anger
      ['angry', { joy: 0, sadness: 0, anger: 0.9, fear: 0, surprise: 0, disgust: 0.1 }],
      ['furious', { joy: 0, sadness: 0, anger: 0.95, fear: 0, surprise: 0.05, disgust: 0 }],
      ['outrageous', { joy: 0, sadness: 0, anger: 0.8, fear: 0, surprise: 0.1, disgust: 0.1 }],
      
      // Fear
      ['afraid', { joy: 0, sadness: 0.2, anger: 0, fear: 0.8, surprise: 0, disgust: 0 }],
      ['worried', { joy: 0, sadness: 0.3, anger: 0, fear: 0.7, surprise: 0, disgust: 0 }],
      ['concerned', { joy: 0, sadness: 0.2, anger: 0, fear: 0.6, surprise: 0.1, disgust: 0.1 }],
      
      // Surprise
      ['surprised', { joy: 0.2, sadness: 0, anger: 0, fear: 0.1, surprise: 0.7, disgust: 0 }],
      ['amazing', { joy: 0.6, sadness: 0, anger: 0, fear: 0, surprise: 0.4, disgust: 0 }],
      ['unexpected', { joy: 0, sadness: 0.1, anger: 0, fear: 0.2, surprise: 0.7, disgust: 0 }],
      
      // Disgust
      ['disgusting', { joy: 0, sadness: 0, anger: 0.2, fear: 0.1, surprise: 0, disgust: 0.7 }],
      ['awful', { joy: 0, sadness: 0.3, anger: 0.2, fear: 0, surprise: 0, disgust: 0.5 }],
      ['terrible', { joy: 0, sadness: 0.4, anger: 0.1, fear: 0.1, surprise: 0, disgust: 0.4 }]
    ]);
  }

  /**
   * Инициализация усилителей
   */
  private initIntensifiers(): Map<string, number> {
    return new Map([
      ['very', 1.5],
      ['extremely', 2.0],
      ['absolutely', 2.0],
      ['incredibly', 1.8],
      ['remarkably', 1.6],
      ['quite', 1.3],
      ['rather', 1.2],
      ['somewhat', 0.8],
      ['slightly', 0.7],
      // Russian
      ['очень', 1.5],
      ['чрезвычайно', 2.0],
      ['крайне', 1.8],
      ['весьма', 1.4]
    ]);
  }

  /**
   * Инициализация отрицаний
   */
  private initNegators(): Set<string> {
    return new Set([
      'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
      'none', "n't", 'hardly', 'scarcely', 'barely',
      // Russian
      'не', 'нет', 'никогда', 'никто', 'ничто', 'никакой', 'ни'
    ]);
  }
}

// Singleton instance
let sentimentAnalyzer: SentimentAnalyzer | null = null;

export function getSentimentAnalyzer(): SentimentAnalyzer {
  if (!sentimentAnalyzer) {
    sentimentAnalyzer = new SentimentAnalyzer();
  }
  return sentimentAnalyzer;
}
