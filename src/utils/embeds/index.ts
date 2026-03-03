import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { join } from 'path';

const Colors = {
  PRIMARY: 0x5865f2, // Discord blurple
  SUCCESS: 0x57f287, // Green
  ERROR: 0xed4245, // Red
} as const;

/** Path to the logo file, relative to project root */
export const LOGO_PATH = join(process.cwd(), 'assets', 'logo.png');

/** Attachment — re-create each time so discord.js doesn't reuse a consumed stream */
export function createLogoAttachment(): AttachmentBuilder {
  return new AttachmentBuilder(LOGO_PATH, { name: 'logo.png' });
}

/** Apply the logo as the embed author icon via the local attachment scheme */
function withAuthor(embed: EmbedBuilder): EmbedBuilder {
  return embed.setAuthor({
    name: 'Member Export',
    iconURL: 'attachment://logo.png',
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ─── Progress ────────────────────────────────────────────────────────────────

export function createProgressEmbed(options: {
  exportId: number;
  stage: string;
  processed: number;
  total: number;
  percentage: number;
  progressBar: string;
  speedText: string;
  etaText: string;
}): EmbedBuilder {
  const { exportId, stage, processed, total, percentage, progressBar, speedText, etaText } =
    options;

  return withAuthor(
    new EmbedBuilder()
      .setColor(Colors.PRIMARY)
      .setTitle('Exporting Members...')
      .setDescription(`\`${progressBar}\` **${Math.round(percentage)}%**`)
      .addFields(
        { name: 'Stage', value: stage, inline: true },
        {
          name: 'Processed',
          value: `${processed.toLocaleString()} / ${total.toLocaleString()}`,
          inline: true,
        },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: 'Speed', value: speedText, inline: true },
        { name: 'ETA', value: etaText, inline: true },
      )
      .setFooter({ text: `Export #${exportId}` })
      .setTimestamp(),
  );
}

// ─── Completion (ProgressTracker) ────────────────────────────────────────────

export function createProgressCompleteEmbed(options: {
  exportId: number;
  totalMembers?: number;
  filteredMembers?: number;
  fileSize?: number;
  durationMs: number;
  averageSpeed?: number;
}): EmbedBuilder {
  const { exportId, totalMembers, filteredMembers, fileSize, durationMs, averageSpeed } = options;

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setTitle('Export Complete')
    .setFooter({ text: `Export #${exportId}` })
    .setTimestamp();

  if (totalMembers !== undefined && filteredMembers !== undefined) {
    embed.addFields({
      name: 'Members Exported',
      value: `${filteredMembers.toLocaleString()} / ${totalMembers.toLocaleString()}`,
      inline: true,
    });
  }

  if (fileSize !== undefined) {
    embed.addFields({ name: 'File Size', value: formatBytes(fileSize), inline: true });
  }

  embed.addFields({ name: 'Duration', value: formatDuration(durationMs), inline: true });

  if (averageSpeed && averageSpeed > 0) {
    embed.addFields({
      name: 'Avg Speed',
      value: `${Math.round(averageSpeed)} members/s`,
      inline: true,
    });
  }

  return withAuthor(embed);
}

// ─── Failure (ProgressTracker) ───────────────────────────────────────────────

export function createProgressFailureEmbed(exportId: number, error: string): EmbedBuilder {
  return withAuthor(
    new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('Export Failed')
      .setDescription(error)
      .setFooter({ text: `Export #${exportId}` })
      .setTimestamp(),
  );
}

// ─── Export complete followUp (export.ts) ─────────────────────────────────────

export function createExportReadyEmbed(options: {
  guildName: string;
  totalMembers: number;
  filteredMembers: number;
  fileSize: number;
  durationMs: number;
  format: string;
}): EmbedBuilder {
  const { guildName, totalMembers, filteredMembers, fileSize, durationMs, format } = options;

  return withAuthor(
    new EmbedBuilder()
      .setColor(Colors.SUCCESS)
      .setTitle('Export Ready')
      .setDescription('Your member export file is attached above.')
      .addFields(
        { name: 'Total Members', value: totalMembers.toLocaleString(), inline: true },
        { name: 'Exported', value: filteredMembers.toLocaleString(), inline: true },
        { name: 'Format', value: format.toUpperCase(), inline: true },
        { name: 'File Size', value: formatBytes(fileSize), inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
      )
      .setFooter({ text: guildName })
      .setTimestamp(),
  );
}

// ─── Generic errors ───────────────────────────────────────────────────────────

export function createErrorEmbed(title: string, description: string): EmbedBuilder {
  return withAuthor(
    new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp(),
  );
}

export function createServerOnlyEmbed(): EmbedBuilder {
  return createErrorEmbed('Server Only', 'This command can only be used in a server.');
}
