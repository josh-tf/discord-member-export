import { CommandInteraction } from 'discord.js';
import type { ExportProgress } from '../types/export.types.js';
import { BotConfig } from '../config/bot.config.js';
import { logger } from '../utils/logger.js';
import {
  createLogoAttachment,
  createProgressEmbed,
  createProgressCompleteEmbed,
  createProgressFailureEmbed,
} from '../utils/embeds/index.js';

/**
 * Progress stage for different phases of export
 */
export enum ProgressStage {
  INITIALIZING = 'Initializing',
  FETCHING = 'Fetching members',
  FILTERING = 'Applying filters',
  FORMATTING = 'Formatting data',
  SAVING = 'Saving file',
  COMPLETED = 'Completed',
}

/**
 * Progress tracking data
 */
interface ProgressData {
  exportId: number;
  stage: ProgressStage;
  processed: number;
  total: number;
  startTime: number;
  lastUpdateTime: number;
  /** Stored so we can keep editing the original deferred reply (works for ephemeral too) */
  interaction: CommandInteraction;
  speedSamples: number[]; // Recent speeds for smoothing
  /** Whether an editReply is already in-flight (prevents concurrent edits) */
  updating: boolean;
}

/**
 * ProgressTracker - Tracks and displays real-time export progress
 */
export class ProgressTracker {
  private trackers = new Map<number, ProgressData>();
  private readonly updateIntervalMs: number;

  constructor() {
    this.updateIntervalMs = BotConfig.export.progressUpdateInterval;
  }

  /**
   * Start tracking progress for an export
   */
  public async start(
    exportId: number,
    interaction: CommandInteraction,
    total: number,
  ): Promise<void> {
    const now = Date.now();

    const tracker: ProgressData = {
      exportId,
      stage: ProgressStage.INITIALIZING,
      processed: 0,
      total,
      startTime: now,
      lastUpdateTime: now,
      interaction,
      speedSamples: [],
      updating: false,
    };

    this.trackers.set(exportId, tracker);

    // Send initial progress message
    await this.updateMessage(tracker);

    logger.info(`Started progress tracking for export ${exportId}`);
  }

  /**
   * Update progress for an export
   */
  public async update(exportId: number, processed: number, stage?: ProgressStage): Promise<void> {
    const tracker = this.trackers.get(exportId);
    if (!tracker) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - tracker.lastUpdateTime;

    if (stage) {
      tracker.stage = stage;
    }

    // Calculate speed before updating processed count
    const speed = this.calculateSpeed(tracker, processed, timeSinceLastUpdate);
    tracker.processed = processed;
    tracker.speedSamples.push(speed);

    if (tracker.speedSamples.length > 5) {
      tracker.speedSamples.shift();
    }

    if (timeSinceLastUpdate >= this.updateIntervalMs) {
      await this.updateMessage(tracker);
      tracker.lastUpdateTime = now;
    }
  }

  /**
   * Update progress stage without changing processed count
   */
  public async setStage(exportId: number, stage: ProgressStage): Promise<void> {
    const tracker = this.trackers.get(exportId);
    if (!tracker) {
      logger.warn(`setStage: no tracker found for export ${exportId}`);
      return;
    }

    tracker.stage = stage;
    await this.updateMessage(tracker);
    tracker.lastUpdateTime = Date.now();
  }

  /**
   * Complete progress tracking
   */
  public async complete(
    exportId: number,
    options?: {
      totalMembers?: number;
      filteredMembers?: number;
      fileSize?: number;
      durationMs?: number;
    },
  ): Promise<void> {
    const tracker = this.trackers.get(exportId);
    if (!tracker) {
      logger.warn(`complete: no tracker found for export ${exportId}`);
      return;
    }

    const durationMs = options?.durationMs ?? Date.now() - tracker.startTime;
    const averageSpeed =
      options?.totalMembers && durationMs > 0
        ? (options.totalMembers / durationMs) * 1000
        : undefined;

    const embed = createProgressCompleteEmbed({
      exportId,
      ...options,
      durationMs,
      averageSpeed,
    });

    try {
      await tracker.interaction.editReply({
        embeds: [embed],
        files: [createLogoAttachment()],
      });
      logger.debug(`Progress complete message sent for export ${exportId}`);
    } catch (error) {
      logger.warn(`Failed to send completion message for export ${exportId}:`, error);
    }

    this.trackers.delete(exportId);
  }

  /**
   * Mark export as failed
   */
  public async fail(exportId: number, error: string): Promise<void> {
    const tracker = this.trackers.get(exportId);
    if (!tracker) {
      logger.warn(`fail: no tracker found for export ${exportId}`);
      return;
    }

    const embed = createProgressFailureEmbed(exportId, error);

    try {
      await tracker.interaction.editReply({
        embeds: [embed],
        files: [createLogoAttachment()],
      });
    } catch (err) {
      logger.warn(`Failed to send failure message for export ${exportId}:`, err);
    }

    this.trackers.delete(exportId);
  }

  /**
   * Get current progress data
   */
  public getProgress(exportId: number): ExportProgress | null {
    const tracker = this.trackers.get(exportId);
    if (!tracker) return null;

    const rawPercentage = tracker.total > 0 ? (tracker.processed / tracker.total) * 100 : 0;
    const percentage = Math.min(100, rawPercentage);
    const averageSpeed = this.getAverageSpeed(tracker.speedSamples);
    const remaining = Math.max(0, tracker.total - tracker.processed);
    const estimatedTimeRemainingMs =
      averageSpeed > 0 && remaining > 0 ? (remaining / averageSpeed) * 1000 : undefined;

    return {
      exportId,
      processed: Math.min(tracker.processed, tracker.total),
      total: tracker.total,
      percentage: Math.round(percentage * 100) / 100,
      estimatedTimeRemainingMs,
      currentSpeed: averageSpeed,
    };
  }

  /**
   * Build the progress embed from current tracker data
   */
  private buildProgressEmbed(tracker: ProgressData) {
    const rawPercentage = tracker.total > 0 ? (tracker.processed / tracker.total) * 100 : 0;
    const percentage = Math.min(100, rawPercentage);
    const averageSpeed = this.getAverageSpeed(tracker.speedSamples);
    const remaining = Math.max(0, tracker.total - tracker.processed);
    const estimatedTimeRemainingMs =
      averageSpeed > 0 && remaining > 0 ? (remaining / averageSpeed) * 1000 : null;

    const etaText = estimatedTimeRemainingMs
      ? this.formatDuration(estimatedTimeRemainingMs)
      : tracker.processed >= tracker.total
        ? 'Complete'
        : 'Calculating...';

    const speedText = averageSpeed > 0 ? `${Math.round(averageSpeed)} members/s` : 'Calculating...';

    return createProgressEmbed({
      exportId: tracker.exportId,
      stage: tracker.stage,
      processed: Math.min(tracker.processed, tracker.total),
      total: tracker.total,
      percentage,
      progressBar: this.createProgressBar(percentage),
      speedText,
      etaText,
    });
  }

  /**
   * Calculate current speed (call BEFORE updating tracker.processed)
   */
  private calculateSpeed(
    tracker: ProgressData,
    currentProcessed: number,
    timeSinceLastUpdate: number,
  ): number {
    if (timeSinceLastUpdate === 0) return 0;
    const itemsProcessed = currentProcessed - tracker.processed;
    return Math.max(0, (itemsProcessed / timeSinceLastUpdate) * 1000);
  }

  private getAverageSpeed(samples: number[]): number {
    if (samples.length === 0) return 0;
    return samples.reduce((acc, s) => acc + s, 0) / samples.length;
  }

  private createProgressBar(percentage: number, length: number = 20): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Edit the original deferred reply with the current progress embed.
   * Always re-attaches the logo so the author icon always resolves.
   * Skips if another update is already in-flight to prevent concurrent edits.
   */
  private async updateMessage(tracker: ProgressData): Promise<void> {
    if (tracker.updating) {
      logger.debug(
        `Skipping update for export ${tracker.exportId} — previous update still in-flight`,
      );
      return;
    }

    tracker.updating = true;
    try {
      const embed = this.buildProgressEmbed(tracker);
      await tracker.interaction.editReply({
        embeds: [embed],
        files: [createLogoAttachment()],
      });
      logger.debug(
        `Progress embed updated for export ${tracker.exportId} (stage: ${tracker.stage})`,
      );
    } catch (error) {
      logger.warn(
        `Could not update progress embed for export ${tracker.exportId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      tracker.updating = false;
    }
  }

  /**
   * Clean up old trackers (in case of crashes)
   */
  public cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [exportId, tracker] of this.trackers.entries()) {
      if (now - tracker.startTime > maxAge) {
        logger.warn(`Cleaning up stale tracker for export ${exportId}`);
        this.trackers.delete(exportId);
      }
    }
  }
}
