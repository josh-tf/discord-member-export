-- Migration: 001_initial_schema.sql
-- Description: Initial database schema for Discord Member Export Bot
-- Created: 2026-02-02

-- ============================================================================
-- EXPORTS TABLE
-- Stores history of all member export operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'json', 'xlsx', 'txt')),
  total_members INTEGER NOT NULL DEFAULT 0,
  filtered_members INTEGER NOT NULL DEFAULT 0,
  filters_applied TEXT, -- JSON string of applied filters
  file_size INTEGER, -- Size in bytes
  duration_ms INTEGER, -- Export duration in milliseconds
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Indexes for exports table
CREATE INDEX IF NOT EXISTS idx_exports_guild_id ON exports(guild_id);
CREATE INDEX IF NOT EXISTS idx_exports_user_id ON exports(user_id);
CREATE INDEX IF NOT EXISTS idx_exports_status ON exports(status);
CREATE INDEX IF NOT EXISTS idx_exports_created_at ON exports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_guild_created ON exports(guild_id, created_at DESC);

-- ============================================================================
-- MEMBER SNAPSHOTS TABLE
-- Stores daily snapshots of guild member statistics
-- ============================================================================
CREATE TABLE IF NOT EXISTS member_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  online_count INTEGER, -- NULL if presence intent not available
  bot_count INTEGER NOT NULL DEFAULT 0,
  human_count INTEGER NOT NULL DEFAULT 0,
  snapshot_date TEXT NOT NULL, -- DATE format: YYYY-MM-DD
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, snapshot_date) -- One snapshot per guild per day
);

-- Indexes for member_snapshots table
CREATE INDEX IF NOT EXISTS idx_member_snapshots_guild_id ON member_snapshots(guild_id);
CREATE INDEX IF NOT EXISTS idx_member_snapshots_date ON member_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_member_snapshots_guild_date ON member_snapshots(guild_id, snapshot_date DESC);

-- ============================================================================
-- ROLE STATS TABLE
-- Stores role distribution statistics for each snapshot
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  snapshot_date TEXT NOT NULL, -- DATE format: YYYY-MM-DD
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, role_id, snapshot_date) -- One entry per role per day
);

-- Indexes for role_stats table
CREATE INDEX IF NOT EXISTS idx_role_stats_guild_id ON role_stats(guild_id);
CREATE INDEX IF NOT EXISTS idx_role_stats_role_id ON role_stats(role_id);
CREATE INDEX IF NOT EXISTS idx_role_stats_date ON role_stats(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_role_stats_guild_date ON role_stats(guild_id, snapshot_date DESC);

-- ============================================================================
-- EXPORT QUEUE TABLE
-- Manages queue for rate-limited export operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS export_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  position INTEGER NOT NULL, -- Queue position
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'cancelled')) DEFAULT 'queued',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (export_id) REFERENCES exports(id) ON DELETE CASCADE
);

-- Indexes for export_queue table
CREATE INDEX IF NOT EXISTS idx_export_queue_export_id ON export_queue(export_id);
CREATE INDEX IF NOT EXISTS idx_export_queue_guild_id ON export_queue(guild_id);
CREATE INDEX IF NOT EXISTS idx_export_queue_status ON export_queue(status);
CREATE INDEX IF NOT EXISTS idx_export_queue_position ON export_queue(position);

-- ============================================================================
-- GUILD SETTINGS TABLE
-- Stores per-guild configuration and preferences
-- ============================================================================
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  max_concurrent_exports INTEGER NOT NULL DEFAULT 1,
  default_export_format TEXT NOT NULL CHECK (default_export_format IN ('csv', 'json', 'xlsx', 'txt')) DEFAULT 'csv',
  auto_snapshot_enabled INTEGER NOT NULL DEFAULT 0, -- SQLite boolean: 0=false, 1=true
  snapshot_frequency_hours INTEGER NOT NULL DEFAULT 24,
  last_snapshot_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for guild_settings table
CREATE INDEX IF NOT EXISTS idx_guild_settings_last_snapshot ON guild_settings(last_snapshot_at);
CREATE INDEX IF NOT EXISTS idx_guild_settings_auto_snapshot ON guild_settings(auto_snapshot_enabled);

-- ============================================================================
-- METADATA TABLE
-- Stores database version and migration info
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert initial migration record
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (1, '001_initial_schema');
