import type { ExportFormat, ExportStatus } from './export.types.js';

export interface ExportRecord {
  id: number;
  guild_id: string;
  user_id: string;
  format: ExportFormat;
  total_members: number;
  filtered_members: number;
  filters_applied: string | null; // JSON string
  file_size: number | null;
  duration_ms: number | null;
  status: ExportStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface MemberSnapshotRecord {
  id: number;
  guild_id: string;
  member_count: number;
  online_count: number | null;
  bot_count: number;
  human_count: number;
  snapshot_date: string; // DATE format: YYYY-MM-DD
  created_at: string;
}

export interface RoleStatsRecord {
  id: number;
  guild_id: string;
  role_id: string;
  role_name: string;
  member_count: number;
  snapshot_date: string; // DATE format: YYYY-MM-DD
  created_at: string;
}

export interface ExportQueueRecord {
  id: number;
  export_id: number;
  guild_id: string;
  position: number;
  status: 'queued' | 'processing' | 'completed' | 'cancelled';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface GuildSettingsRecord {
  guild_id: string;
  max_concurrent_exports: number;
  default_export_format: ExportFormat;
  auto_snapshot_enabled: boolean;
  snapshot_frequency_hours: number;
  last_snapshot_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatabaseConfig {
  path: string;
  walMode: boolean;
  backupEnabled: boolean;
  backupPath?: string;
}
