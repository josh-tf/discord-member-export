import type { FilterOptions } from './filter.types.js';

// Re-export FilterOptions for convenience
export type { FilterOptions };

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  XLSX = 'xlsx',
  TXT = 'txt',
}

export enum ExportStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface ExportOptions {
  guildId: string;
  userId: string;
  format: ExportFormat;
  filters?: FilterOptions;
  includeFields: MemberField[];
}

export type MemberField =
  | 'id'
  | 'username'
  | 'discriminator'
  | 'displayName'
  | 'joinedAt'
  | 'createdAt'
  | 'roles'
  | 'isBot'
  | 'avatar';

export interface MemberData {
  id: string;
  username: string;
  discriminator: string;
  displayName: string;
  joinedAt: Date;
  createdAt: Date;
  roles: string[];
  isBot: boolean;
  avatar?: string;
}

export interface ExportResult {
  exportId: number;
  filePath: string;
  fileSize: number;
  totalMembers: number;
  filteredMembers: number;
  durationMs: number;
}

export interface ExportProgress {
  exportId: number;
  processed: number;
  total: number;
  percentage: number;
  estimatedTimeRemainingMs?: number;
  currentSpeed: number; // members per second
}

export interface QueuedExport {
  exportId: number;
  position: number;
  estimatedWaitTimeMs?: number;
}
