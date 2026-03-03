import { Guild, GuildMember, CommandInteraction } from 'discord.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { MemberFetcher } from './MemberFetcher.js';
import { FilterService } from './FilterService.js';
import { ProgressTracker, ProgressStage } from './ProgressTracker.js';
import { DatabaseService, ExportHistoryRepository } from './database/index.js';
import { FormatterFactory } from '../formatters/index.js';
import type {
  ExportOptions,
  ExportResult,
  MemberData,
  MemberField,
  FilterOptions,
} from '../types/export.types.js';
import { ExportStatus, ExportFormat } from '../types/export.types.js';
import { BotConfig } from '../config/bot.config.js';
import { logger } from '../utils/logger.js';

/**
 * ExportService - Orchestrates the entire export process
 */
export class ExportService {
  private memberFetcher: MemberFetcher;
  private filterService: FilterService;
  private progressTracker: ProgressTracker;
  private exportHistory: ExportHistoryRepository;

  constructor(db: DatabaseService) {
    this.memberFetcher = new MemberFetcher();
    this.filterService = new FilterService();
    this.progressTracker = new ProgressTracker();
    this.exportHistory = new ExportHistoryRepository(db);
  }

  /**
   * Execute a full export operation
   */
  public async export(
    guild: Guild,
    interaction: CommandInteraction,
    options: ExportOptions,
  ): Promise<ExportResult> {
    const startTime = Date.now();

    // Validate filters
    if (options.filters) {
      const validation = this.filterService.validateFilters(options.filters);
      if (!validation.valid) {
        throw new Error(`Invalid filters: ${validation.errors.join(', ')}`);
      }
    }

    // Create export record in database
    const exportId = this.exportHistory.create({
      guildId: options.guildId,
      userId: options.userId,
      format: options.format,
      filtersApplied: options.filters,
    });

    logger.info(`Starting export ${exportId} for guild ${guild.name} (format: ${options.format})`);

    try {
      // Update status to in_progress
      this.exportHistory.updateStatus(exportId, ExportStatus.IN_PROGRESS);

      // Start progress tracking
      await this.progressTracker.start(exportId, interaction, guild.memberCount);

      // Stage 1: Fetch members
      await this.progressTracker.setStage(exportId, ProgressStage.FETCHING);
      logger.info(`[Export ${exportId}] Fetching members...`);

      const fetchResult = await this.memberFetcher.fetchAll(guild, {
        batchSize: BotConfig.export.batchSize,
        onProgress: async (fetched) => {
          await this.progressTracker.update(exportId, fetched);
        },
      });

      logger.info(
        `[Export ${exportId}] Fetched ${fetchResult.totalFetched} members in ${fetchResult.durationMs}ms`,
      );

      // Stage 2: Apply filters
      await this.progressTracker.setStage(exportId, ProgressStage.FILTERING);
      logger.info(`[Export ${exportId}] Applying filters...`);

      const filteredMembers = this.filterService.filter(fetchResult.members, options.filters);

      const filterStats = this.filterService.getFilterStats(
        fetchResult.totalFetched,
        filteredMembers.length,
        options.filters,
      );

      logger.info(
        `[Export ${exportId}] Filtered to ${filteredMembers.length}/${fetchResult.totalFetched} members (${filterStats.removalPercentage}% removed)`,
      );

      // Stage 3: Format data
      await this.progressTracker.setStage(exportId, ProgressStage.FORMATTING);
      logger.info(`[Export ${exportId}] Formatting data...`);

      const memberData = this.transformMembers(filteredMembers, options.includeFields);

      // Stage 4: Save to file
      await this.progressTracker.setStage(exportId, ProgressStage.SAVING);
      logger.info(`[Export ${exportId}] Saving to file...`);

      const filePath = await this.saveToFile(
        exportId,
        options.guildId,
        options.format,
        memberData,
        guild,
        options.userId,
        options.filters,
      );

      // Get file size
      const { size: fileSize } = await import('fs').then((fs) => fs.promises.stat(filePath));

      // Calculate total duration
      const durationMs = Date.now() - startTime;

      // Update database with completion
      this.exportHistory.complete(exportId, {
        totalMembers: fetchResult.totalFetched,
        filteredMembers: filteredMembers.length,
        fileSize,
        durationMs,
      });

      // Complete progress tracking
      await this.progressTracker.complete(exportId, {
        totalMembers: fetchResult.totalFetched,
        filteredMembers: filteredMembers.length,
        fileSize,
        durationMs,
      });

      logger.info(
        `[Export ${exportId}] Completed successfully in ${durationMs}ms (${filePath}, ${fileSize} bytes)`,
      );

      return {
        exportId,
        filePath,
        fileSize,
        totalMembers: fetchResult.totalFetched,
        filteredMembers: filteredMembers.length,
        durationMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`[Export ${exportId}] Failed:`, error);

      // Update database with failure
      this.exportHistory.fail(exportId, errorMessage);

      // Update progress tracker with failure
      await this.progressTracker.fail(exportId, errorMessage);

      throw error;
    }
  }

  /**
   * Transform GuildMembers to MemberData objects
   */
  private transformMembers(
    members: GuildMember[],
    includeFields: MemberField[],
  ): Partial<MemberData>[] {
    return members.map((member) => {
      const data: Partial<MemberData> = {};

      if (includeFields.includes('id')) {
        data.id = member.id;
      }

      if (includeFields.includes('username')) {
        data.username = member.user.username;
      }

      if (includeFields.includes('discriminator')) {
        data.discriminator = member.user.discriminator;
      }

      if (includeFields.includes('displayName')) {
        data.displayName = member.displayName;
      }

      if (includeFields.includes('joinedAt') && member.joinedAt) {
        data.joinedAt = member.joinedAt;
      }

      if (includeFields.includes('createdAt')) {
        data.createdAt = member.user.createdAt;
      }

      if (includeFields.includes('roles')) {
        data.roles = member.roles.cache
          .filter((role) => role.id !== member.guild.id) // Exclude @everyone
          .map((role) => role.name);
      }

      if (includeFields.includes('isBot')) {
        data.isBot = member.user.bot;
      }

      if (includeFields.includes('avatar')) {
        data.avatar = member.user.displayAvatarURL({ size: 256 });
      }

      return data;
    });
  }

  /**
   * Save export data to file using appropriate formatter
   */
  private async saveToFile(
    exportId: number,
    guildId: string,
    format: string,
    data: Partial<MemberData>[],
    guild?: Guild,
    userId?: string,
    filters?: FilterOptions,
  ): Promise<string> {
    // Ensure temp export directory exists
    const exportDir = BotConfig.export.tempExportPath;
    if (!existsSync(exportDir)) {
      await mkdir(exportDir, { recursive: true });
    }

    // Get formatter for the specified format
    const formatter = FormatterFactory.getFormatter(format as ExportFormat);

    // Format the data
    const formatResult = await formatter.format(data, {
      guildName: guild?.name,
      filters: filters,
      totalMembers: guild?.memberCount,
      createdAt: new Date(),
      exportedBy: userId,
    });

    // Generate filename with correct extension
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `export_${guildId}_${exportId}_${timestamp}.${formatResult.extension}`;
    const filePath = join(exportDir, filename);

    // Write to file
    if (formatResult.data instanceof Buffer) {
      await writeFile(filePath, formatResult.data);
    } else {
      await writeFile(filePath, formatResult.data, 'utf-8');
    }

    return filePath;
  }

  /**
   * Get export history for a guild
   */
  public getGuildHistory(guildId: string, limit: number = 10) {
    return this.exportHistory.getByGuild(guildId, { limit });
  }

  /**
   * Get export statistics for a guild
   */
  public getGuildStats(guildId: string) {
    return this.exportHistory.getGuildStats(guildId);
  }

  /**
   * Get current progress for an export
   */
  public getProgress(exportId: number) {
    return this.progressTracker.getProgress(exportId);
  }

  /**
   * Estimate export time
   */
  public estimateExportTime(memberCount: number): number {
    return this.memberFetcher.estimateFetchTime(memberCount);
  }

  /**
   * Clean up old export files and database records
   */
  public async cleanup(daysToKeep: number = 7): Promise<void> {
    logger.info(`Cleaning up exports older than ${daysToKeep} days...`);

    // Clean up database records
    const deletedRecords = this.exportHistory.deleteOlderThan(daysToKeep);

    logger.info(`Cleanup completed: ${deletedRecords} records deleted`);

    // TODO: Clean up old export files from disk
  }
}
