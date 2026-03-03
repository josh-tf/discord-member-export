import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command, CommandContext } from './Command.interface.js';
import { ExportService } from '../services/ExportService.js';
import { DatabaseService } from '../services/database/index.js';
import { BotConfig } from '../config/bot.config.js';
import { logger } from '../utils/logger.js';
import {
  createLogoAttachment,
  createServerOnlyEmbed,
  createErrorEmbed,
} from '../utils/embeds/index.js';

/**
 * /stats command - Show export statistics for the guild
 */
const statsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View export statistics for this server')
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
      // Initialize services
      const db = DatabaseService.getInstance(BotConfig.database);
      const exportService = new ExportService(db);

      // Get guild statistics
      const stats = exportService.getGuildStats(interaction.guild.id);

      // Calculate success rate
      const successRate =
        stats.totalExports > 0
          ? ((stats.completedExports / stats.totalExports) * 100).toFixed(1)
          : '0.0';

      // Format average duration
      const avgDurationText =
        stats.averageDurationMs > 0 ? formatDuration(stats.averageDurationMs) : 'N/A';

      // Format average file size
      const avgFileSizeText =
        stats.averageFileSize > 0 ? formatBytes(stats.averageFileSize) : 'N/A';

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865f2) // Discord blurple
        .setTitle('Export Statistics')
        .setDescription(`Statistics for **${interaction.guild.name}**`)
        .setAuthor({ name: 'Member Export', iconURL: 'attachment://logo.png' })
        .addFields(
          {
            name: '📈 Total Exports',
            value: stats.totalExports.toLocaleString(),
            inline: true,
          },
          {
            name: '✅ Completed',
            value: stats.completedExports.toLocaleString(),
            inline: true,
          },
          {
            name: '❌ Failed',
            value: stats.failedExports.toLocaleString(),
            inline: true,
          },
          {
            name: '🎯 Success Rate',
            value: `${successRate}%`,
            inline: true,
          },
          {
            name: '👥 Members Exported',
            value: stats.totalMembersExported.toLocaleString(),
            inline: true,
          },
          {
            name: '📁 Most Used Format',
            value: stats.mostUsedFormat.toUpperCase(),
            inline: true,
          },
          {
            name: '⚡ Average Duration',
            value: avgDurationText,
            inline: true,
          },
          {
            name: '💾 Average File Size',
            value: avgFileSizeText,
            inline: true,
          },
          {
            name: '👤 Current Member Count',
            value: interaction.guild.memberCount.toLocaleString(),
            inline: true,
          },
        )
        .setFooter({
          text: `Use /export to create a new export`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [createLogoAttachment()] });

      logger.debug(
        `Stats command executed for guild ${interaction.guild.name} by ${interaction.user.tag}`,
      );
    } catch (error) {
      logger.error('Stats command failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      await interaction.editReply({
        embeds: [createErrorEmbed('Failed to Retrieve Statistics', errorMessage)],
        files: [createLogoAttachment()],
      });
    }
  },
};

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

export default statsCommand;
