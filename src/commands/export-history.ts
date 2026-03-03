import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import type { FilterOptions } from '../types/filter.types.js';
import type { Command, CommandContext } from './Command.interface.js';
import { ExportService } from '../services/ExportService.js';
import { DatabaseService } from '../services/database/index.js';
import type { ExportRecord } from '../types/database.types.js';
import { BotConfig } from '../config/bot.config.js';
import { logger } from '../utils/logger.js';
import {
  createLogoAttachment,
  createServerOnlyEmbed,
  createErrorEmbed,
} from '../utils/embeds/index.js';

/**
 * /export-history command - View recent export history
 */
const exportHistoryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('export-history')
    .setDescription('View recent export history for this server')
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('Number of recent exports to show (default: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as SlashCommandBuilder,

  adminOnly: true,
  cooldown: 5, // 5 second cooldown

  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;

    if (!interaction.guild) {
      await interaction.reply({
        embeds: [createServerOnlyEmbed()],
        files: [createLogoAttachment()],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({
      ephemeral: BotConfig.commands.ephemeralByDefault,
    });

    try {
      const limit = interaction.options.getInteger('limit') ?? 10;

      // Initialize services
      const db = DatabaseService.getInstance(BotConfig.database);
      const exportService = new ExportService(db);

      // Get export history
      const history = exportService.getGuildHistory(interaction.guild.id, limit);

      if (history.length === 0) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              'No Export History',
              'No exports found for this server. Use `/export` to create your first export!',
            ).setColor(0x5865f2), // Use primary colour for informational state
          ],
          files: [createLogoAttachment()],
        });
        return;
      }

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865f2) // Discord blurple
        .setTitle('Export History')
        .setDescription(
          `Recent exports for **${interaction.guild.name}** (showing ${history.length})`,
        )
        .setAuthor({ name: 'Member Export', iconURL: 'attachment://logo.png' })
        .setFooter({ text: 'Use /export to create a new export' })
        .setTimestamp();

      // Add fields for each export
      for (const record of history) {
        const fieldValue = formatExportRecord(record, interaction.guild.name);
        const fieldName = `${getStatusEmoji(record.status)} Export #${record.id} - ${record.format.toUpperCase()}`;

        embed.addFields({
          name: fieldName,
          value: fieldValue,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed], files: [createLogoAttachment()] });

      logger.debug(
        `Export history command executed for guild ${interaction.guild.name} by ${interaction.user.tag}`,
      );
    } catch (error) {
      logger.error('Export history command failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      await interaction.editReply({
        embeds: [createErrorEmbed('Failed to Retrieve History', errorMessage)],
        files: [createLogoAttachment()],
      });
    }
  },
};

/**
 * Format export record for display
 */
function formatExportRecord(record: ExportRecord, _guildName: string): string {
  const parts: string[] = [];

  // Status and basic info
  parts.push(`**Status:** ${record.status}`);

  // Members
  if (record.status === 'completed') {
    parts.push(
      `**Members:** ${record.filtered_members.toLocaleString()}/${record.total_members.toLocaleString()}`,
    );
  }

  // File size
  if (record.file_size) {
    parts.push(`**Size:** ${formatBytes(record.file_size)}`);
  }

  // Duration
  if (record.duration_ms) {
    parts.push(`**Duration:** ${formatDuration(record.duration_ms)}`);
  }

  // Error message
  if (record.error_message) {
    parts.push(`**Error:** ${record.error_message.substring(0, 100)}`);
  }

  // Filters applied
  if (record.filters_applied) {
    try {
      const filters = JSON.parse(record.filters_applied);
      const filterSummary = summarizeFilters(filters);
      if (filterSummary) {
        parts.push(`**Filters:** ${filterSummary}`);
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Date
  const createdDate = new Date(record.created_at);
  parts.push(`**Created:** <t:${Math.floor(createdDate.getTime() / 1000)}:R>`);

  return parts.join('\n');
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'completed':
      return '✅';
    case 'in_progress':
      return '⏳';
    case 'failed':
      return '❌';
    case 'cancelled':
      return '🚫';
    default:
      return '📄';
  }
}

/**
 * Summarize filters
 */
function summarizeFilters(filters: FilterOptions): string {
  const parts: string[] = [];

  if (filters.bots && !filters.bots.includeBots) {
    parts.push('No bots');
  }

  if ((filters.roles?.include?.length ?? 0) > 0) {
    parts.push(`${filters.roles?.include?.length} role(s)`);
  }

  if (filters.joinDate) {
    parts.push('Date range');
  }

  if (filters.accountAge) {
    parts.push(`Min age ${filters.accountAge.minimumAgeDays}d`);
  }

  if ((filters.permissions?.permissions?.length ?? 0) > 0) {
    parts.push(`${filters.permissions?.permissions?.length} permission(s)`);
  }

  return parts.length > 0 ? parts.join(', ') : 'None';
}

/**
 * Format bytes in human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export default exportHistoryCommand;
