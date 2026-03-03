import { DatabaseService } from '../DatabaseService.js';
import type { ExportRecord } from '../../../types/database.types.js';
import type { ExportFormat, FilterOptions } from '../../../types/export.types.js';
import { ExportStatus } from '../../../types/export.types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Repository for managing export history records
 */
export class ExportHistoryRepository {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * Create a new export record
   */
  public create(data: {
    guildId: string;
    userId: string;
    format: ExportFormat;
    totalMembers?: number;
    filteredMembers?: number;
    filtersApplied?: FilterOptions | null;
  }): number {
    try {
      const filtersJson = data.filtersApplied ? JSON.stringify(data.filtersApplied) : null;

      const result = this.db.run(
        `INSERT INTO exports (
          guild_id, user_id, format, total_members, filtered_members,
          filters_applied, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.guildId,
          data.userId,
          data.format,
          data.totalMembers ?? 0,
          data.filteredMembers ?? 0,
          filtersJson,
          'pending',
        ],
      );

      logger.debug(`Created export record with ID: ${result.lastInsertId}`);
      return result.lastInsertId;
    } catch (error) {
      logger.error('Failed to create export record:', error);
      throw error;
    }
  }

  /**
   * Update export status
   */
  public updateStatus(exportId: number, status: ExportStatus, errorMessage?: string): void {
    try {
      const completedAt = ['completed', 'failed', 'cancelled'].includes(status)
        ? new Date().toISOString()
        : null;

      this.db.run(
        `UPDATE exports
         SET status = ?, error_message = ?, completed_at = ?
         WHERE id = ?`,
        [status, errorMessage ?? null, completedAt, exportId],
      );

      logger.debug(`Updated export ${exportId} status to: ${status}`);
    } catch (error) {
      logger.error(`Failed to update export ${exportId} status:`, error);
      throw error;
    }
  }

  /**
   * Update export with completion data
   */
  public complete(
    exportId: number,
    data: {
      totalMembers: number;
      filteredMembers: number;
      fileSize: number;
      durationMs: number;
    },
  ): void {
    try {
      this.db.run(
        `UPDATE exports
         SET total_members = ?, filtered_members = ?, file_size = ?,
             duration_ms = ?, status = ?, completed_at = ?
         WHERE id = ?`,
        [
          data.totalMembers,
          data.filteredMembers,
          data.fileSize,
          data.durationMs,
          'completed',
          new Date().toISOString(),
          exportId,
        ],
      );

      logger.debug(`Completed export ${exportId}`);
    } catch (error) {
      logger.error(`Failed to complete export ${exportId}:`, error);
      throw error;
    }
  }

  /**
   * Mark export as failed with error message
   */
  public fail(exportId: number, errorMessage: string): void {
    this.updateStatus(exportId, ExportStatus.FAILED, errorMessage);
  }

  /**
   * Get export record by ID
   */
  public getById(exportId: number): ExportRecord | null {
    try {
      const record = this.db.get<ExportRecord>('SELECT * FROM exports WHERE id = ?', [exportId]);

      return record;
    } catch (error) {
      logger.error(`Failed to get export ${exportId}:`, error);
      throw error;
    }
  }

  /**
   * Get export history for a guild
   */
  public getByGuild(
    guildId: string,
    options?: { limit?: number; offset?: number; status?: ExportStatus },
  ): ExportRecord[] {
    try {
      const { limit = 50, offset = 0, status } = options ?? {};

      let sql = 'SELECT * FROM exports WHERE guild_id = ?';
      const params: (string | number | null)[] = [guildId];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      return this.db.all<ExportRecord>(sql, params);
    } catch (error) {
      logger.error(`Failed to get exports for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get export history for a user
   */
  public getByUser(userId: string, options?: { limit?: number; offset?: number }): ExportRecord[] {
    try {
      const { limit = 50, offset = 0 } = options ?? {};

      return this.db.all<ExportRecord>(
        `SELECT * FROM exports
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset],
      );
    } catch (error) {
      logger.error(`Failed to get exports for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get recent exports
   */
  public getRecent(limit: number = 10): ExportRecord[] {
    try {
      return this.db.all<ExportRecord>('SELECT * FROM exports ORDER BY created_at DESC LIMIT ?', [
        limit,
      ]);
    } catch (error) {
      logger.error('Failed to get recent exports:', error);
      throw error;
    }
  }

  /**
   * Count exports by guild
   */
  public countByGuild(guildId: string, status?: ExportStatus): number {
    try {
      let sql = 'SELECT COUNT(*) as count FROM exports WHERE guild_id = ?';
      const params: (string | number | null)[] = [guildId];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      const result = this.db.get<{ count: number }>(sql, params);
      return result?.count ?? 0;
    } catch (error) {
      logger.error(`Failed to count exports for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get export statistics for a guild
   */
  public getGuildStats(guildId: string): {
    totalExports: number;
    completedExports: number;
    failedExports: number;
    totalMembersExported: number;
    averageDurationMs: number;
    averageFileSize: number;
    mostUsedFormat: ExportFormat;
  } {
    try {
      const stats = this.db.get<{
        total_exports: number;
        completed_exports: number;
        failed_exports: number;
        total_members_exported: number;
        avg_duration_ms: number;
        avg_file_size: number;
      }>(
        `SELECT
          COUNT(*) as total_exports,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_exports,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_exports,
          SUM(CASE WHEN status = 'completed' THEN filtered_members ELSE 0 END) as total_members_exported,
          AVG(CASE WHEN status = 'completed' THEN duration_ms ELSE NULL END) as avg_duration_ms,
          AVG(CASE WHEN status = 'completed' THEN file_size ELSE NULL END) as avg_file_size
         FROM exports
         WHERE guild_id = ?`,
        [guildId],
      );

      const formatStats = this.db.get<{ format: ExportFormat }>(
        `SELECT format, COUNT(*) as count
         FROM exports
         WHERE guild_id = ? AND status = 'completed'
         GROUP BY format
         ORDER BY count DESC
         LIMIT 1`,
        [guildId],
      );

      return {
        totalExports: stats?.total_exports ?? 0,
        completedExports: stats?.completed_exports ?? 0,
        failedExports: stats?.failed_exports ?? 0,
        totalMembersExported: stats?.total_members_exported ?? 0,
        averageDurationMs: Math.round(stats?.avg_duration_ms ?? 0),
        averageFileSize: Math.round(stats?.avg_file_size ?? 0),
        mostUsedFormat: (formatStats?.format ?? 'csv') as ExportFormat,
      };
    } catch (error) {
      logger.error(`Failed to get stats for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Delete old export records
   */
  public deleteOlderThan(days: number): number {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = this.db.run('DELETE FROM exports WHERE created_at < ?', [
        cutoffDate.toISOString(),
      ]);

      logger.info(`Deleted ${result.changes} export records older than ${days} days`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to delete old export records:', error);
      throw error;
    }
  }

  /**
   * Delete export by ID
   */
  public delete(exportId: number): void {
    try {
      this.db.run('DELETE FROM exports WHERE id = ?', [exportId]);
      logger.debug(`Deleted export ${exportId}`);
    } catch (error) {
      logger.error(`Failed to delete export ${exportId}:`, error);
      throw error;
    }
  }

  /**
   * Check if an export exists
   */
  public exists(exportId: number): boolean {
    try {
      const result = this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM exports WHERE id = ?',
        [exportId],
      );
      return (result?.count ?? 0) > 0;
    } catch (error) {
      logger.error(`Failed to check if export ${exportId} exists:`, error);
      throw error;
    }
  }
}
