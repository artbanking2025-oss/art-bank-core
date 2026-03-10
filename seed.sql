-- Seed data for Art Bank platform

-- Artists (Primary Source nodes)
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, status, jurisdiction, metadata) VALUES 
  ('artist-1', 'artist', 'Иван Шишкин', 0.95, 'verified', 'RU', '{"style": "Реализм", "period": "XIX век", "status": "Established"}'),
  ('artist-2', 'artist', 'Казимир Малевич', 0.98, 'verified', 'RU', '{"style": "Супрематизм", "period": "XX век", "status": "Established"}'),
  ('artist-3', 'artist', 'Анна Новикова', 0.65, 'active', 'RU', '{"style": "Современное искусство", "period": "XXI век", "status": "Emerging"}');

-- Collectors (Private Owners)
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, status, jurisdiction, metadata) VALUES 
  ('collector-1', 'collector', 'Михаил Петров', 0.85, 'verified', 'RU', '{"collection_type": "Классика", "risk_profile": "Консервативный", "transaction_frequency": "Средняя"}'),
  ('collector-2', 'collector', 'Елена Смирнова', 0.75, 'active', 'RU', '{"collection_type": "Современное", "risk_profile": "Агрессивный", "transaction_frequency": "Высокая"}');

-- Galleries (Market Makers)
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, status, jurisdiction, metadata) VALUES 
  ('gallery-1', 'gallery', 'Галерея Третьяковская', 0.95, 'verified', 'RU', '{"specialization": "Классика", "exhibition_level": "Высокий", "successful_deals": 150}'),
  ('gallery-2', 'gallery', 'ART4 Галерея', 0.78, 'active', 'RU', '{"specialization": "Современное", "exhibition_level": "Средний", "successful_deals": 45}');

-- Banks (Capital Holders)
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, status, jurisdiction, metadata) VALUES 
  ('bank-1', 'bank', 'АртБанк Private', 0.92, 'verified', 'RU', '{"art_lending_volume": 5000000, "risk_limits": "Строгие"}'),
  ('bank-2', 'bank', 'Культурный Капитал', 0.88, 'verified', 'RU', '{"art_lending_volume": 2000000, "risk_limits": "Умеренные"}');

-- Experts (Validation Layer)
INSERT OR IGNORE INTO nodes (id, node_type, name, trust_level, status, jurisdiction, metadata) VALUES 
  ('expert-1', 'expert', 'Профессор Антонов', 0.96, 'verified', 'RU', '{"accreditation": "Классика XIX-XX века", "certifications": 200}'),
  ('expert-2', 'expert', 'Мария Волкова', 0.82, 'active', 'RU', '{"accreditation": "Современное искусство", "certifications": 78}');

-- Artworks
INSERT OR IGNORE INTO artworks (id, title, artist_node_id, created_year, style, medium, dimensions, condition, current_owner_node_id, digital_signature, certification_node_id, current_fpc, last_sale_price, last_sale_date) VALUES 
  ('artwork-1', 'Утро в сосновом лесу', 'artist-1', 1889, 'Реализм', 'Масло на холсте', '139 × 213 см', 'Отличное', 'collector-1', 'SIG-SHISHKIN-001', 'expert-1', 15000000, 12000000, 1640995200),
  ('artwork-2', 'Черный квадрат', 'artist-2', 1915, 'Супрематизм', 'Масло на холсте', '79.5 × 79.5 см', 'Хорошее', 'gallery-1', 'SIG-MALEVICH-001', 'expert-1', 50000000, 48000000, 1609459200),
  ('artwork-3', 'Границы реальности', 'artist-3', 2023, 'Современное', 'Цифровое искусство', '100 × 150 см', 'Отличное', 'collector-2', 'SIG-NOVIKOVA-001', 'expert-2', 250000, 200000, 1672531200);

-- Edges (Relationships) - Building the graph
-- Artist created artwork
INSERT OR IGNORE INTO edges (from_node_id, to_node_id, edge_type, weight, metadata) VALUES 
  ('artist-1', 'artwork-1', 'created', 1.0, '{"year": 1889}'),
  ('artist-2', 'artwork-2', 'created', 1.0, '{"year": 1915}'),
  ('artist-3', 'artwork-3', 'created', 1.0, '{"year": 2023}');

-- Gallery exhibited artwork
INSERT OR IGNORE INTO edges (from_node_id, to_node_id, edge_type, weight, metadata) VALUES 
  ('gallery-1', 'artwork-1', 'exhibited', 0.9, '{"exhibition": "Русские мастера", "date": "2022-05-15"}'),
  ('gallery-1', 'artwork-2', 'exhibited', 0.95, '{"exhibition": "Авангард", "date": "2023-03-10"}'),
  ('gallery-2', 'artwork-3', 'exhibited', 0.85, '{"exhibition": "Новое поколение", "date": "2023-11-20"}');

-- Collector owns artwork
INSERT OR IGNORE INTO edges (from_node_id, to_node_id, edge_type, weight, metadata) VALUES 
  ('collector-1', 'artwork-1', 'owns', 1.0, '{"acquired": "2020-08-15", "price": 12000000}'),
  ('collector-2', 'artwork-3', 'owns', 1.0, '{"acquired": "2023-12-01", "price": 200000}');

-- Expert validated artwork
INSERT OR IGNORE INTO edges (from_node_id, to_node_id, edge_type, weight, metadata) VALUES 
  ('expert-1', 'artwork-1', 'validated', 0.96, '{"date": "2020-07-10", "report": "Подлинность подтверждена"}'),
  ('expert-1', 'artwork-2', 'validated', 0.98, '{"date": "2023-02-15", "report": "Оригинал, отличное состояние"}'),
  ('expert-2', 'artwork-3', 'validated', 0.82, '{"date": "2023-11-15", "report": "Подтверждена авторство"}');

-- Bank financed transaction
INSERT OR IGNORE INTO edges (from_node_id, to_node_id, edge_type, weight, metadata) VALUES 
  ('bank-1', 'collector-1', 'financed', 0.92, '{"artwork": "artwork-1", "amount": 8000000, "rate": 0.08}');

-- Transactions
INSERT OR IGNORE INTO transactions (artwork_id, from_node_id, to_node_id, bank_node_id, price, transaction_date, status, loan_amount, interest_rate, metadata) VALUES 
  ('artwork-1', 'gallery-1', 'collector-1', 'bank-1', 12000000, 1597449600, 'completed', 8000000, 0.08, '{"payment_terms": "5 years"}'),
  ('artwork-3', 'artist-3', 'collector-2', NULL, 200000, 1701388800, 'completed', 0, 0, '{"direct_sale": true}');

-- Validations
INSERT OR IGNORE INTO validations (artwork_id, expert_node_id, validation_type, result, estimated_value, confidence_level, validated_at) VALUES 
  ('artwork-1', 'expert-1', 'authenticity', '{"authentic": true, "condition": "excellent", "provenance": "verified"}', 15000000, 0.96, 1594166400),
  ('artwork-2', 'expert-1', 'valuation', '{"market_value": 50000000, "insurance_value": 55000000}', 50000000, 0.98, 1676419200),
  ('artwork-3', 'expert-2', 'authenticity', '{"authentic": true, "condition": "excellent", "artist_confirmed": true}', 250000, 0.82, 1700006400);

-- Activity Log
INSERT OR IGNORE INTO activity_log (node_id, action_type, details, timestamp) VALUES 
  ('artist-1', 'created', '{"artwork": "artwork-1", "title": "Утро в сосновом лесу"}', 1889),
  ('gallery-1', 'exhibited', '{"artwork": "artwork-1", "exhibition": "Русские мастера"}', 1653436800),
  ('collector-1', 'transacted', '{"artwork": "artwork-1", "action": "purchased", "price": 12000000}', 1597449600),
  ('expert-1', 'validated', '{"artwork": "artwork-1", "result": "authentic"}', 1594166400),
  ('bank-1', 'financed', '{"artwork": "artwork-1", "amount": 8000000, "collector": "collector-1"}', 1597449600);
