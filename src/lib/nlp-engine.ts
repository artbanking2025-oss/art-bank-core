/**
 * NLP Engine - Natural Language Processing для анализа текста
 * 
 * Функции:
 * - Токенизация и лемматизация
 * - Извлечение ключевых слов (TF-IDF)
 * - Named Entity Recognition (NER)
 * - Topic Modeling
 * - Text Classification
 * - Language Detection
 * 
 * @module nlp-engine
 */

interface Token {
  word: string;
  lemma: string;
  pos: string; // Part of Speech
  tag: string;
}

interface Entity {
  text: string;
  type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'ARTWORK' | 'ARTIST';
  start: number;
  end: number;
  confidence: number;
}

interface Keyword {
  word: string;
  score: number;
  frequency: number;
}

interface Topic {
  id: string;
  keywords: string[];
  weight: number;
}

interface ClassificationResult {
  category: string;
  confidence: number;
  subcategory?: string;
}

interface NLPAnalysis {
  tokens: Token[];
  entities: Entity[];
  keywords: Keyword[];
  topics: Topic[];
  classification?: ClassificationResult;
  language: string;
  languageConfidence: number;
}

/**
 * NLP Engine для обработки естественного языка
 */
export class NLPEngine {
  private stopWords: Set<string>;
  private artTerms: Map<string, string>;
  private languagePatterns: Map<string, RegExp>;

  constructor() {
    this.stopWords = this.initStopWords();
    this.artTerms = this.initArtTerms();
    this.languagePatterns = this.initLanguagePatterns();
  }

  /**
   * Полный анализ текста
   */
  async analyze(text: string): Promise<NLPAnalysis> {
    const tokens = this.tokenize(text);
    const entities = this.extractEntities(text);
    const keywords = this.extractKeywords(text);
    const topics = this.extractTopics(text);
    const classification = this.classify(text);
    const { language, confidence } = this.detectLanguage(text);

    return {
      tokens,
      entities,
      keywords,
      topics,
      classification,
      language,
      languageConfidence: confidence
    };
  }

  /**
   * Токенизация текста
   */
  private tokenize(text: string): Token[] {
    // Нормализация
    const normalized = text.toLowerCase().trim();
    
    // Разделение на предложения и слова
    const words = normalized.match(/\b[\wа-яё]+\b/gi) || [];
    
    const tokens: Token[] = [];
    
    for (const word of words) {
      const lemma = this.lemmatize(word);
      const pos = this.getPOS(word);
      const tag = this.getTag(word);
      
      tokens.push({ word, lemma, pos, tag });
    }
    
    return tokens;
  }

  /**
   * Лемматизация слова
   */
  private lemmatize(word: string): string {
    // Простая лемматизация (реальная требует словаря)
    word = word.toLowerCase();
    
    // Английские правила
    if (word.endsWith('ing')) return word.slice(0, -3);
    if (word.endsWith('ed')) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
    
    // Русские правила
    if (word.endsWith('ами')) return word.slice(0, -3);
    if (word.endsWith('ами')) return word.slice(0, -3);
    if (word.endsWith('ов')) return word.slice(0, -2);
    if (word.endsWith('ам')) return word.slice(0, -2);
    
    return word;
  }

  /**
   * Part of Speech Tagging
   */
  private getPOS(word: string): string {
    // Упрощенное определение части речи
    if (/^\d+$/.test(word)) return 'NUM';
    if (word.length <= 2) return 'PART';
    if (this.stopWords.has(word)) return 'ADP';
    
    // Проверка на арт-термины
    if (this.artTerms.has(word)) return 'NOUN';
    
    // По умолчанию
    return 'NOUN';
  }

  /**
   * Детальная грамматическая разметка
   */
  private getTag(word: string): string {
    // Детальная разметка (упрощенная)
    const pos = this.getPOS(word);
    return `${pos}_BASIC`;
  }

  /**
   * Named Entity Recognition
   */
  private extractEntities(text: string): Entity[] {
    const entities: Entity[] = [];
    
    // Паттерны для поиска сущностей
    const patterns = {
      PERSON: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
      ORGANIZATION: /\b([A-Z][a-z]+ (?:Gallery|Museum|Foundation|Bank))\b/gi,
      LOCATION: /\b(New York|London|Paris|Moscow|Berlin|Tokyo)\b/gi,
      DATE: /\b(\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/g,
      MONEY: /\$[\d,]+(?:\.\d{2})?|\d+\s*(?:USD|EUR|GBP)/gi,
      ARTWORK: /"([^"]+)"|«([^»]+)»/g
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[1] || match[0],
          type: type as Entity['type'],
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.85
        });
      }
    }

    // Поиск известных художников
    const artistPatterns = [
      'Picasso', 'Monet', 'Van Gogh', 'Rembrandt', 'Leonardo',
      'Michelangelo', 'Caravaggio', 'Botticelli', 'Raphael'
    ];
    
    for (const artist of artistPatterns) {
      const regex = new RegExp(`\\b${artist}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type: 'ARTIST',
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.95
        });
      }
    }

    return entities.sort((a, b) => a.start - b.start);
  }

  /**
   * Извлечение ключевых слов (TF-IDF)
   */
  private extractKeywords(text: string, topN: number = 10): Keyword[] {
    const words = text.toLowerCase().match(/\b[\wа-яё]+\b/gi) || [];
    const filtered = words.filter(w => 
      w.length > 3 && !this.stopWords.has(w)
    );

    // Подсчет частоты (TF)
    const frequency = new Map<string, number>();
    for (const word of filtered) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }

    // Простой TF-IDF (без корпуса документов)
    const keywords: Keyword[] = [];
    for (const [word, freq] of frequency.entries()) {
      const tf = freq / filtered.length;
      const idf = Math.log(1 + 1 / (freq + 1)); // Упрощенный IDF
      const score = tf * idf;
      
      keywords.push({ word, score, frequency: freq });
    }

    return keywords
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  /**
   * Topic Modeling (LDA-подобный подход)
   */
  private extractTopics(text: string, numTopics: number = 3): Topic[] {
    const keywords = this.extractKeywords(text, 20);
    const topics: Topic[] = [];

    // Группировка ключевых слов по темам
    const artStyles = ['impressionism', 'baroque', 'modern', 'contemporary', 'renaissance'];
    const businessTerms = ['sale', 'price', 'auction', 'investment', 'market'];
    const exhibitionTerms = ['exhibition', 'gallery', 'museum', 'show', 'display'];

    const topicGroups = [
      { id: 'art-style', terms: artStyles, weight: 0 },
      { id: 'business', terms: businessTerms, weight: 0 },
      { id: 'exhibition', terms: exhibitionTerms, weight: 0 }
    ];

    // Подсчет весов тем
    for (const keyword of keywords) {
      for (const group of topicGroups) {
        if (group.terms.some(t => keyword.word.includes(t))) {
          group.weight += keyword.score;
        }
      }
    }

    // Формирование топиков
    for (const group of topicGroups) {
      if (group.weight > 0) {
        topics.push({
          id: group.id,
          keywords: group.terms.filter(t => 
            keywords.some(k => k.word.includes(t))
          ),
          weight: group.weight
        });
      }
    }

    return topics.sort((a, b) => b.weight - a.weight).slice(0, numTopics);
  }

  /**
   * Классификация текста
   */
  private classify(text: string): ClassificationResult {
    text = text.toLowerCase();

    // Категории и их маркеры
    const categories = {
      'review': ['review', 'opinion', 'think', 'believe', 'beautiful', 'amazing'],
      'transaction': ['sold', 'bought', 'price', 'auction', 'bid', 'payment'],
      'exhibition': ['exhibition', 'gallery', 'museum', 'show', 'display', 'curated'],
      'authentication': ['authentic', 'provenance', 'certificate', 'expert', 'verification'],
      'news': ['announced', 'revealed', 'discovered', 'reported', 'breaking']
    };

    let maxScore = 0;
    let bestCategory = 'general';

    for (const [category, markers] of Object.entries(categories)) {
      const score = markers.filter(m => text.includes(m)).length;
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }

    const confidence = Math.min(0.9, maxScore * 0.2);

    return {
      category: bestCategory,
      confidence
    };
  }

  /**
   * Определение языка текста
   */
  private detectLanguage(text: string): { language: string; confidence: number } {
    const sample = text.toLowerCase().slice(0, 500);
    
    let maxScore = 0;
    let detectedLang = 'en';

    for (const [lang, pattern] of this.languagePatterns.entries()) {
      const matches = sample.match(pattern);
      const score = matches ? matches.length : 0;
      
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }

    const confidence = Math.min(0.95, maxScore / 10);

    return { language: detectedLang, confidence };
  }

  /**
   * Инициализация стоп-слов
   */
  private initStopWords(): Set<string> {
    return new Set([
      // English
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      // Russian
      'и', 'в', 'на', 'с', 'по', 'для', 'к', 'от', 'за', 'о', 'из', 'у',
      'не', 'что', 'это', 'как', 'так', 'но', 'а', 'он', 'она', 'они',
      'мы', 'вы', 'я', 'ты', 'его', 'ее', 'их', 'был', 'была', 'были'
    ]);
  }

  /**
   * Инициализация арт-терминов
   */
  private initArtTerms(): Map<string, string> {
    return new Map([
      ['painting', 'ARTWORK'],
      ['sculpture', 'ARTWORK'],
      ['artwork', 'ARTWORK'],
      ['masterpiece', 'ARTWORK'],
      ['canvas', 'MATERIAL'],
      ['oil', 'MATERIAL'],
      ['watercolor', 'MATERIAL'],
      ['impressionism', 'STYLE'],
      ['baroque', 'STYLE'],
      ['renaissance', 'STYLE'],
      ['contemporary', 'STYLE'],
      ['gallery', 'VENUE'],
      ['museum', 'VENUE'],
      ['auction', 'EVENT'],
      ['exhibition', 'EVENT']
    ]);
  }

  /**
   * Инициализация языковых паттернов
   */
  private initLanguagePatterns(): Map<string, RegExp> {
    return new Map([
      ['en', /\b(the|and|that|this|with|for|are|was|have)\b/g],
      ['ru', /\b(это|как|что|был|для|или|они|его|была)\b/g],
      ['fr', /\b(le|la|de|un|est|dans|pour|par|sur)\b/g],
      ['de', /\b(der|die|das|und|ist|mit|von|den|zu)\b/g],
      ['es', /\b(el|la|de|que|es|en|por|para|con)\b/g]
    ]);
  }

  /**
   * Извлечение именных фраз
   */
  extractNounPhrases(text: string): string[] {
    // Паттерны для именных фраз
    const phrases: string[] = [];
    
    // Adj + Noun
    const adjNoun = text.match(/\b([A-Z][a-z]+ [a-z]+ing)\b/g) || [];
    phrases.push(...adjNoun);
    
    // Noun + Noun
    const nounNoun = text.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g) || [];
    phrases.push(...nounNoun);
    
    return [...new Set(phrases)];
  }

  /**
   * Similarity между текстами (Cosine Similarity)
   */
  calculateSimilarity(text1: string, text2: string): number {
    const words1 = this.extractKeywords(text1, 50).map(k => k.word);
    const words2 = this.extractKeywords(text2, 50).map(k => k.word);
    
    const allWords = [...new Set([...words1, ...words2])];
    
    // Векторы
    const vec1 = allWords.map(w => words1.includes(w) ? 1 : 0);
    const vec2 = allWords.map(w => words2.includes(w) ? 1 : 0);
    
    // Cosine Similarity
    const dotProduct = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    return dotProduct / (mag1 * mag2);
  }

  /**
   * Summarization (извлекающий метод)
   */
  summarize(text: string, numSentences: number = 3): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= numSentences) {
      return text;
    }

    const keywords = new Set(
      this.extractKeywords(text, 20).map(k => k.word)
    );

    // Оценка предложений
    const scores = sentences.map(sent => {
      const words = sent.toLowerCase().match(/\b[\wа-яё]+\b/gi) || [];
      const score = words.filter(w => keywords.has(w)).length;
      return { sentence: sent.trim(), score };
    });

    // Топ предложения
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, numSentences)
      .map(s => s.sentence)
      .join('. ') + '.';
  }
}

// Singleton instance
let nlpEngine: NLPEngine | null = null;

export function getNLPEngine(): NLPEngine {
  if (!nlpEngine) {
    nlpEngine = new NLPEngine();
  }
  return nlpEngine;
}
