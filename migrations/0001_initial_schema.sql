-- Art Bank Core Database Schema
-- Graph-based system for art market participants

-- Nodes (Participants) - Main entities in the graph
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY, -- UUID
  node_type TEXT NOT NULL, -- artist, collector, gallery, bank, expert, artwork
  name TEXT NOT NULL,
  trust_level REAL DEFAULT 0.5, -- 0.0 - 1.0 reputation weight
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  
  -- Common attributes for all nodes
  jurisdiction TEXT,
  status TEXT DEFAULT 'active', -- active, suspended, verified
  
  -- Type-specific JSON data
  metadata TEXT DEFAULT '{}' -- JSON: specific attributes by type
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_trust ON nodes(trust_level);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);

-- Edges (Relationships) - Connections between nodes
CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  edge_type TEXT NOT NULL, -- created, exhibited, owns, validated, financed, etc
  weight REAL DEFAULT 1.0, -- importance/trust weight of this relationship
  created_at INTEGER DEFAULT (unixepoch()),
  
  -- Transaction details (if applicable)
  metadata TEXT DEFAULT '{}', -- JSON: price, date, conditions, etc
  
  FOREIGN KEY (from_node_id) REFERENCES nodes(id),
  FOREIGN KEY (to_node_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type);

-- Activity Log - Timeline of all actions for ML training
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  action_type TEXT NOT NULL, -- created, updated, transacted, validated
  details TEXT DEFAULT '{}', -- JSON
  timestamp INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (node_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_node ON activity_log(node_id);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);

-- Artworks - Central asset node
CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY, -- UUID
  title TEXT NOT NULL,
  artist_node_id TEXT NOT NULL,
  created_year INTEGER,
  style TEXT, -- impressionism, contemporary, etc
  medium TEXT, -- oil, digital, sculpture, etc
  dimensions TEXT,
  condition TEXT,
  
  -- Provenance chain
  current_owner_node_id TEXT,
  
  -- Digital passport
  digital_signature TEXT, -- artist's unique identifier
  certification_node_id TEXT, -- expert who certified
  
  -- Financial
  current_fpc REAL, -- Fair Price Corridor
  last_sale_price REAL,
  last_sale_date INTEGER,
  
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (artist_node_id) REFERENCES nodes(id),
  FOREIGN KEY (current_owner_node_id) REFERENCES nodes(id),
  FOREIGN KEY (certification_node_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_node_id);
CREATE INDEX IF NOT EXISTS idx_artworks_owner ON artworks(current_owner_node_id);

-- Transactions - Financial operations
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL, -- seller/gallery
  to_node_id TEXT NOT NULL, -- buyer
  bank_node_id TEXT, -- financing bank (if applicable)
  
  price REAL NOT NULL,
  transaction_date INTEGER DEFAULT (unixepoch()),
  status TEXT DEFAULT 'pending', -- pending, completed, cancelled
  
  -- Bank financing
  loan_amount REAL DEFAULT 0,
  interest_rate REAL DEFAULT 0,
  
  metadata TEXT DEFAULT '{}', -- JSON: additional details
  
  FOREIGN KEY (artwork_id) REFERENCES artworks(id),
  FOREIGN KEY (from_node_id) REFERENCES nodes(id),
  FOREIGN KEY (to_node_id) REFERENCES nodes(id),
  FOREIGN KEY (bank_node_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_artwork ON transactions(artwork_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Validations - Expert certifications
CREATE TABLE IF NOT EXISTS validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id TEXT NOT NULL,
  expert_node_id TEXT NOT NULL,
  validation_type TEXT NOT NULL, -- authenticity, condition, valuation
  result TEXT NOT NULL, -- JSON: detailed report
  estimated_value REAL,
  confidence_level REAL, -- 0.0 - 1.0
  validated_at INTEGER DEFAULT (unixepoch()),
  
  FOREIGN KEY (artwork_id) REFERENCES artworks(id),
  FOREIGN KEY (expert_node_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_validations_artwork ON validations(artwork_id);
CREATE INDEX IF NOT EXISTS idx_validations_expert ON validations(expert_node_id);

-- User sessions (for demo - in production would use proper auth)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,
  node_id TEXT NOT NULL,
  role TEXT NOT NULL, -- artist, collector, gallery, bank, expert
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER,
  
  FOREIGN KEY (node_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_node ON user_sessions(node_id);
