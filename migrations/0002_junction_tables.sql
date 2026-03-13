-- Junction Tables for Many-to-Many Relationships
-- Реализация паттерна из документа Notes_260312_212116.docx

-- ============================================
-- 1. Artwork Exhibitions (Many-to-Many)
-- Одно произведение может быть на многих выставках
-- Одна галерея может иметь много произведений на выставке
-- ============================================
CREATE TABLE IF NOT EXISTS artwork_exhibitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id TEXT NOT NULL,
  gallery_node_id TEXT NOT NULL,
  exhibition_name TEXT,
  start_date DATETIME,
  end_date DATETIME,
  curator TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  FOREIGN KEY (gallery_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  
  -- Уникальная пара: произведение не может быть на одной выставке дважды
  UNIQUE(artwork_id, gallery_node_id, exhibition_name)
);

CREATE INDEX idx_artwork_exhibitions_artwork ON artwork_exhibitions(artwork_id);
CREATE INDEX idx_artwork_exhibitions_gallery ON artwork_exhibitions(gallery_node_id);
CREATE INDEX idx_artwork_exhibitions_dates ON artwork_exhibitions(start_date, end_date);

-- ============================================
-- 2. Artwork Validations History (Many-to-Many)
-- Одно произведение может быть проверено многими экспертами
-- Один эксперт может проверить много произведений
-- ============================================
-- Уже есть таблица validations, но добавим индексы для junction

-- ============================================
-- 3. Artist Collaborations (Many-to-Many)
-- Художники могут создавать работы совместно
-- ============================================
CREATE TABLE IF NOT EXISTS artwork_artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id TEXT NOT NULL,
  artist_node_id TEXT NOT NULL,
  role TEXT, -- 'primary', 'co-author', 'assistant'
  contribution_percentage REAL DEFAULT 50.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  FOREIGN KEY (artist_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  
  UNIQUE(artwork_id, artist_node_id)
);

CREATE INDEX idx_artwork_artists_artwork ON artwork_artists(artwork_id);
CREATE INDEX idx_artwork_artists_artist ON artwork_artists(artist_node_id);

-- ============================================
-- 4. Artwork Tags/Categories (Many-to-Many)
-- Одно произведение может иметь много тегов
-- Один тег может быть у многих произведений
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT, -- 'style', 'subject', 'period', 'technique'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artwork_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  relevance REAL DEFAULT 1.0, -- 0.0-1.0 насколько релевантен тег
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  
  UNIQUE(artwork_id, tag_id)
);

CREATE INDEX idx_artwork_tags_artwork ON artwork_tags(artwork_id);
CREATE INDEX idx_artwork_tags_tag ON artwork_tags(tag_id);

-- ============================================
-- 5. Media Items (News, Articles, Social Media)
-- Для Media Hub из архитектуры
-- ============================================
CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'news', 'article', 'social', 'review', 'auction_result'
  source TEXT, -- 'artsy', 'christies', 'twitter', 'instagram'
  url TEXT,
  title TEXT NOT NULL,
  content TEXT,
  author TEXT,
  published_at DATETIME,
  sentiment_score REAL, -- -1.0 (negative) to 1.0 (positive)
  influence_score REAL DEFAULT 0.0, -- 0.0-1.0 влияние на цены
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);

CREATE INDEX idx_media_items_type ON media_items(type);
CREATE INDEX idx_media_items_published ON media_items(published_at);
CREATE INDEX idx_media_items_influence ON media_items(influence_score);

-- ============================================
-- 6. Media Mentions (Many-to-Many)
-- Одна статья может упоминать много произведений/художников
-- Одно произведение может быть упомянуто в многих статьях
-- ============================================
CREATE TABLE IF NOT EXISTS media_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_item_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'artwork', 'artist', 'gallery', 'collector'
  entity_id TEXT NOT NULL,
  mention_context TEXT, -- Контекст упоминания
  relevance REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE,
  
  UNIQUE(media_item_id, entity_type, entity_id)
);

CREATE INDEX idx_media_mentions_media ON media_mentions(media_item_id);
CREATE INDEX idx_media_mentions_entity ON media_mentions(entity_type, entity_id);

-- ============================================
-- 7. Price History (для расчёта трендов)
-- Не совсем junction, но важная таблица для аналитики
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id TEXT NOT NULL,
  price REAL NOT NULL,
  transaction_id TEXT, -- Может быть NULL если это не транзакция, а оценка
  source TEXT, -- 'transaction', 'appraisal', 'auction_estimate', 'analytics'
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

CREATE INDEX idx_price_history_artwork ON price_history(artwork_id);
CREATE INDEX idx_price_history_recorded ON price_history(recorded_at);

-- ============================================
-- 8. Saga Execution Log (для отслеживания Saga паттерна)
-- ============================================
CREATE TABLE IF NOT EXISTS saga_logs (
  id TEXT PRIMARY KEY,
  saga_type TEXT NOT NULL, -- 'purchase', 'loan', 'validation'
  status TEXT NOT NULL, -- 'running', 'completed', 'compensating', 'failed'
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error_message TEXT,
  context TEXT, -- JSON с деталями Saga
  affected_entities TEXT -- JSON массив затронутых сущностей
);

CREATE INDEX idx_saga_logs_status ON saga_logs(status);
CREATE INDEX idx_saga_logs_type ON saga_logs(saga_type);
CREATE INDEX idx_saga_logs_started ON saga_logs(started_at);

-- ============================================
-- Вставить начальные теги
-- ============================================
INSERT OR IGNORE INTO tags (id, name, category) VALUES
  ('tag-impressionism', 'Импрессионизм', 'style'),
  ('tag-realism', 'Реализм', 'style'),
  ('tag-modernism', 'Модернизм', 'style'),
  ('tag-landscape', 'Пейзаж', 'subject'),
  ('tag-portrait', 'Портрет', 'subject'),
  ('tag-still-life', 'Натюрморт', 'subject'),
  ('tag-19th-century', 'XIX век', 'period'),
  ('tag-20th-century', 'XX век', 'period'),
  ('tag-oil', 'Масло', 'technique'),
  ('tag-watercolor', 'Акварель', 'technique');
