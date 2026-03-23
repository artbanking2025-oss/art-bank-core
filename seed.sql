-- Seed data for Art Bank Platform
-- Initial test data for production deployment

-- ========== NODES ==========

-- Artists
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, jurisdiction, status, metadata, created_at, updated_at) VALUES
('artist-1', 'artist', 'Иван Шишкин', 0.95, 'RU', 'verified', '{"style": "Реализм"}', 1773170654, 1773170654),
('artist-2', 'artist', 'Василий Кандинский', 0.98, 'RU', 'verified', '{"style": "Абстракционизм"}', 1773170654, 1773170654);

-- Collectors
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, jurisdiction, status, metadata, created_at, updated_at) VALUES
('collector-1', 'collector', 'Михаил Петров', 0.85, 'RU', 'verified', '{"collection_type": "Классика"}', 1773170654, 1773170654),
('collector-2', 'collector', 'Анна Смирнова', 0.82, 'RU', 'active', '{"collection_type": "Современное искусство"}', 1773170654, 1773170654);

-- Galleries
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, jurisdiction, status, metadata, created_at, updated_at) VALUES
('gallery-1', 'gallery', 'Галерея Третьяковская', 0.95, 'RU', 'verified', '{"specialization": "Классика"}', 1773170654, 1773170654),
('gallery-2', 'gallery', 'Эрмитаж', 0.99, 'RU', 'verified', '{"specialization": "Мировое искусство"}', 1773170654, 1773170654);

-- Banks
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, jurisdiction, status, metadata, created_at, updated_at) VALUES
('bank-1', 'bank', 'АртБанк Private', 0.92, 'RU', 'verified', '{"art_lending_volume": 5000000}', 1773170654, 1773170654);

-- Experts
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, jurisdiction, status, metadata, created_at, updated_at) VALUES
('expert-1', 'expert', 'Сергей Иванов', 0.88, 'RU', 'verified', '{"specialization": "XIX век"}', 1773170654, 1773170654),
('expert-2', 'expert', 'Елена Смирнова', 0.90, 'RU', 'verified', '{"specialization": "Современное искусство"}', 1773170654, 1773170654);

-- ========== EDGES ==========

-- Creation edges
INSERT OR IGNORE INTO edges (id, source_node_id, target_node_id, edge_type, weight, metadata, created_at) VALUES
('edge-1', 'artist-1', 'artwork-1', 'created', 1.0, '{}', 1773170660),
('edge-2', 'artist-2', 'artwork-2', 'created', 1.0, '{}', 1773170660);

-- Ownership edges
INSERT OR IGNORE INTO edges (id, source_node_id, target_node_id, edge_type, weight, metadata, created_at) VALUES
('edge-3', 'gallery-1', 'artwork-1', 'owns', 1.0, '{}', 1773170660),
('edge-4', 'collector-1', 'artwork-2', 'owns', 1.0, '{}', 1773170660);

-- Validation edges
INSERT OR IGNORE INTO edges (id, source_node_id, target_node_id, edge_type, weight, metadata, created_at) VALUES
('edge-5', 'expert-1', 'artwork-1', 'validated', 0.95, '{"confidence": 0.95}', 1773170660);

-- ========== ARTWORKS ==========

INSERT OR IGNORE INTO artworks (
  id, title, artist_node_id, created_year, style, medium, dimensions, condition,
  current_owner_node_id, digital_signature, certification_node_id, current_fpc,
  last_sale_price, created_at, updated_at
) VALUES
-- Шишкин
('artwork-1', 'Утро в сосновом лесу', 'artist-1', 1889, 'Реализм', 'Масло на холсте', '139 × 213 см', 'Отличное',
 'gallery-1', 'SIG-SHISHKIN-001', 'expert-1', 15000000, 12000000, 1773170669, 1773266149),

-- Кандинский
('artwork-2', 'Композиция VIII', 'artist-2', 1923, 'Абстракционизм', 'Масло на холсте', '140 × 201 см', 'Хорошее',
 'collector-1', 'SIG-KANDINSKY-002', 'expert-2', 85000000, 78000000, 1773170669, 1773170669);

-- ========== TRANSACTIONS ==========

INSERT OR IGNORE INTO transactions (
  id, artwork_id, from_node_id, to_node_id, bank_node_id, price, loan_amount,
  interest_rate, transaction_date, status, metadata, created_at
) VALUES
('tx-1', 'artwork-1', 'collector-2', 'gallery-1', 'bank-1', 12000000, 0, 0,
 1773000000, 'completed', '{"note": "Прямая покупка"}', 1773000000),

('tx-2', 'artwork-2', 'gallery-2', 'collector-1', 'bank-1', 78000000, 50000000, 0.08,
 1773100000, 'completed', '{"note": "Кредит под залог"}', 1773100000);

-- ========== VALIDATIONS ==========

INSERT OR IGNORE INTO validations (
  id, artwork_id, expert_node_id, validation_type, result, estimated_value,
  confidence_level, validated_at, created_at
) VALUES
('val-1', 'artwork-1', 'expert-1', 'authenticity', '{"authentic": true, "method": "signature_analysis"}',
 15000000, 0.95, 1773170680, 1773170680),

('val-2', 'artwork-2', 'expert-2', 'appraisal', '{"condition": "good", "market_value": 85000000}',
 85000000, 0.92, 1773170680, 1773170680);

-- ========== EXHIBITIONS ==========

INSERT OR IGNORE INTO artwork_exhibitions (
  id, artwork_id, gallery_node_id, start_date, end_date, curator, notes, created_at
) VALUES
('exh-1', 'artwork-1', 'gallery-1', 1773000000, 1776000000, 'Мария Иванова', 'Постоянная экспозиция', 1773170700);

-- ========== MEDIA MENTIONS ==========

INSERT OR IGNORE INTO media_items (
  id, type, source, url, title, content, author, published_at,
  sentiment_score, influence_score, created_at
) VALUES
('media-1', 'article', 'artsy', 'https://www.artsy.net/article/shishkin', 
 'Картина Шишкина установила новый рекорд на аукционе',
 'Произведение Ивана Шишкина "Утро в сосновом лесу" было продано за рекордную сумму...',
 'Art Critic', 1773000000, 0.9, 0.85, 1773000000),

('media-2', 'article', 'Artnet News', 'https://news.artnet.com/kandinsky',
 'Kandinsky Masterpiece Sets New Record at Auction',
 'An exceptional and rare painting by Wassily Kandinsky has achieved a record price...',
 'Art Reporter', 1773100000, 1.0, 0.9, 1773100000);

-- Media mentions junction
INSERT OR IGNORE INTO media_mentions (
  id, media_item_id, entity_type, entity_id, context, relevance, created_at
) VALUES
('mm-1', 'media-1', 'artwork', 'artwork-1', 'Auction record', 0.95, 1773000000),
('mm-2', 'media-2', 'artwork', 'artwork-2', 'Price achievement', 0.98, 1773100000);

-- ========== PRICE HISTORY ==========

INSERT OR IGNORE INTO price_history (
  id, artwork_id, price, source, transaction_id, recorded_at
) VALUES
('ph-1', 'artwork-1', 10000000, 'auction', NULL, 1770000000),
('ph-2', 'artwork-1', 12000000, 'sale', 'tx-1', 1773000000),
('ph-3', 'artwork-1', 15000000, 'appraisal', NULL, 1773170000),

('ph-4', 'artwork-2', 75000000, 'auction', NULL, 1772000000),
('ph-5', 'artwork-2', 78000000, 'sale', 'tx-2', 1773100000),
('ph-6', 'artwork-2', 85000000, 'appraisal', NULL, 1773170000);

-- ========== ACTIVITY LOG ==========

INSERT OR IGNORE INTO activity_log (
  id, node_id, action_type, details, created_at
) VALUES
('log-1', 'artist-1', 'artwork_created', '{"artwork_id": "artwork-1", "title": "Утро в сосновом лесу"}', 1773170669),
('log-2', 'gallery-1', 'artwork_acquired', '{"artwork_id": "artwork-1", "price": 12000000}', 1773000000),
('log-3', 'expert-1', 'validation_completed', '{"artwork_id": "artwork-1", "result": "authentic"}', 1773170680);

-- Commit transaction
COMMIT;
