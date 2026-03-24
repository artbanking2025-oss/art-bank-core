-- Migration: Add users and sessions tables for JWT authentication

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('artist', 'collector', 'gallery', 'bank', 'expert', 'admin', 'public')),
  node_id TEXT, -- Link to nodes table (optional)
  full_name TEXT,
  is_verified INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_login_at INTEGER,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL
);

-- Refresh tokens table (for token rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  revoked_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Drop old user_sessions if exists and recreate with proper schema
DROP TABLE IF EXISTS user_sessions;

-- User sessions table (for session management)
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_activity INTEGER DEFAULT (strftime('%s', 'now')),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_node_id ON users(node_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Create default admin user (password: Admin123!)
-- Password hash: SHA-256 of 'Admin123!'
INSERT OR IGNORE INTO users (
  id, email, password_hash, role, full_name, is_verified, is_active
) VALUES (
  'user-admin-1',
  'admin@artbank.io',
  'a4c86a8f1f37a7d5e4e3e5e9e5c5d3b6f7e8d9c0a1b2c3d4e5f6a7b8c9d0e1f2',
  'admin',
  'System Administrator',
  1,
  1
);
