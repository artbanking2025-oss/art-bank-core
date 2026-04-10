-- Migration: Performance Indexes
-- Created: 2026-04-10
-- Description: Add indexes for query optimization

-- ========== USERS TABLE INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);

-- ========== ARTWORKS TABLE INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_artworks_artist_id ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);
CREATE INDEX IF NOT EXISTS idx_artworks_created_at ON artworks(created_at);
CREATE INDEX IF NOT EXISTS idx_artworks_price ON artworks(price);
CREATE INDEX IF NOT EXISTS idx_artworks_artist_status ON artworks(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_artworks_status_created ON artworks(status, created_at);

-- ========== TRANSACTIONS TABLE INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_transactions_from_node ON transactions(from_node_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_node ON transactions(to_node_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_transactions_from_status ON transactions(from_node_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_to_status ON transactions(to_node_id, status);

-- ========== NODES TABLE INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_type_status ON nodes(type, status);

-- ========== EDGES TABLE INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_weight ON edges(weight);
CREATE INDEX IF NOT EXISTS idx_edges_source_target ON edges(source_id, target_id);
CREATE INDEX IF NOT EXISTS idx_edges_source_type ON edges(source_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_target_type ON edges(target_id, type);

-- ========== REFRESH_TOKENS TABLE INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_valid ON refresh_tokens(user_id, expires_at, revoked);

-- ========== USER_SESSIONS TABLE INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, is_active);

-- ========== COLLECTIONS TABLE INDEXES (if exists) ==========
CREATE INDEX IF NOT EXISTS idx_collections_collector ON collections(collector_id);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at);

-- ========== EXHIBITIONS TABLE INDEXES (if exists) ==========
CREATE INDEX IF NOT EXISTS idx_exhibitions_gallery ON exhibitions(gallery_id);
CREATE INDEX IF NOT EXISTS idx_exhibitions_start_date ON exhibitions(start_date);
CREATE INDEX IF NOT EXISTS idx_exhibitions_end_date ON exhibitions(end_date);
CREATE INDEX IF NOT EXISTS idx_exhibitions_status ON exhibitions(status);

-- ========== VALUATIONS TABLE INDEXES (if exists) ==========
CREATE INDEX IF NOT EXISTS idx_valuations_artwork ON valuations(artwork_id);
CREATE INDEX IF NOT EXISTS idx_valuations_expert ON valuations(expert_id);
CREATE INDEX IF NOT EXISTS idx_valuations_created_at ON valuations(created_at);

-- ========== MEDIA TABLE INDEXES (if exists) ==========
CREATE INDEX IF NOT EXISTS idx_media_entity_type ON media(entity_type);
CREATE INDEX IF NOT EXISTS idx_media_entity_id ON media(entity_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);
CREATE INDEX IF NOT EXISTS idx_media_entity_type_id ON media(entity_type, entity_id);

-- Analyze tables to update statistics
ANALYZE;
