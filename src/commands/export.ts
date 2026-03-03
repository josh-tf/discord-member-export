import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import type { Command, CommandContext } from './Command.interface.js';
import { ExportService } from '../services/ExportService.js';
import { DatabaseService } from '../services/database/index.js';
import type { ExportFormat, MemberField } from '../types/export.types.js';
import type { FilterOptions } from '../types/filter.types.js';
import { BotConfig } from '../config/bot.config.js';
import { logger } from '../utils/logger.js';
import {
  createLogoAttachment,
  createServerOnlyEmbed,
  createErrorEmbed,
  createExportReadyEmbed,
} from '../utils/embeds/index.js';

/**
 * /export command - Export guild members with filters
 */
const exportCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export guild members to a file')
    .addStringOption((option) =>
      option
        .setName('format')
        .setDescription('Export file format')
        .setRequired(true)
        .addChoices(
          { name: 'CSV (Spreadsheet)', value: 'csv' },
          { name: 'JSON (Data)', value: 'json' },
          { name: 'TXT (Plain Text)', value: 'txt' },
          { name: 'XLSX (Excel)', value: 'xlsx' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('fields')
        .setDescription('Fields to include (comma-separated)')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('include-bots')
        .setDescription('Include bot accounts (default: false)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('role-ids')
        .setDescription('Filter by role IDs (comma-separated)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('role-match')
        .setDescription('Role match type')
        .setRequired(false)
        .addChoices({ name: 'Any (OR)', value: 'any' }, { name: 'All (AND)', value: 'all' }),
    )
    .addStringOption((option) =>
      option
        .setName('joined-after')
        .setDescription('Members who joined after this date (YYYY-MM-DD)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('joined-before')
        .setDescription('Members who joined before this date (YYYY-MM-DD)')
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('min-account-age')
        .setDescription('Minimum account age in days')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7300),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as SlashCommandBuilder,

  adminOnly: true,
  cooldown: 30, // 30 second cooldown

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

    // Defer reply since this will take time
    await interaction.deferReply({
      ephemeral: BotConfig.commands.ephemeralByDefault,
    });

    try {
      // Parse options
      const format = interaction.options.getString('format', true) as ExportFormat;
      const fieldsInput = interaction.options.getString('fields');
      const includeBots = interaction.options.getBoolean('include-bots') ?? false;
      const roleIds = interaction.options.getString('role-ids');
      const roleMatch = interaction.options.getString('role-match') as 'any' | 'all' | null;
      const joinedAfter = interaction.options.getString('joined-after');
      const joinedBefore = interaction.options.getString('joined-before');
      const minAccountAge = interaction.options.getInteger('min-account-age');

      // Parse fields
      const includeFields = parseFields(fieldsInput);

      // Build filters
      const filters: FilterOptions = {
        bots: { includeBots },
      };

      // Role filter
      if (roleIds) {
        const roleIdArray = roleIds.split(',').map((id) => id.trim());
        filters.roles = {
          include: roleIdArray,
          matchType: roleMatch || 'any',
        };
      }

      // Date filters
      if (joinedAfter || joinedBefore) {
        filters.joinDate = {};

        if (joinedAfter) {
          const afterDate = parseDate(joinedAfter);
          if (!afterDate) {
            await interaction.editReply({
              embeds: [
                createErrorEmbed(
                  'Invalid Date',
                  'Invalid format for `joined-after`. Use `YYYY-MM-DD`.',
                ),
              ],
              files: [createLogoAttachment()],
            });
            return;
          }
          filters.joinDate.after = afterDate;
        }

        if (joinedBefore) {
          const beforeDate = parseDate(joinedBefore);
          if (!beforeDate) {
            await interaction.editReply({
              embeds: [
                createErrorEmbed(
                  'Invalid Date',
                  'Invalid format for `joined-before`. Use `YYYY-MM-DD`.',
                ),
              ],
              files: [createLogoAttachment()],
            });
            return;
          }
          filters.joinDate.before = beforeDate;
        }
      }

      // Account age filter
      if (minAccountAge !== null) {
        filters.accountAge = {
          minimumAgeDays: minAccountAge,
        };
      }

      // Initialize services
      const db = DatabaseService.getInstance(BotConfig.database);
      const exportService = new ExportService(db);

      // Estimate time
      const estimatedMs = exportService.estimateExportTime(interaction.guild.memberCount);
      const estimatedSeconds = Math.ceil(estimatedMs / 1000);

      logger.info(
        `Starting export for guild ${interaction.guild.name} (${interaction.guild.memberCount} members, estimated ${estimatedSeconds}s)`,
      );

      // Execute export
      const result = await exportService.export(interaction.guild, interaction, {
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        format,
        includeFields,
        filters: Object.keys(filters).length > 1 ? filters : undefined,
      });

      // Send file to user
      const attachment = new AttachmentBuilder(result.filePath, {
        name: `members.${format}`,
        description: `Member export for ${interaction.guild.name}`,
      });

      await interaction.followUp({
        embeds: [
          createExportReadyEmbed({
            guildName: interaction.guild.name,
            totalMembers: result.totalMembers,
            filteredMembers: result.filteredMembers,
            fileSize: result.fileSize,
            durationMs: result.durationMs,
            format,
          }),
        ],
        files: [createLogoAttachment(), attachment],
        ephemeral: BotConfig.commands.ephemeralByDefault,
      });

      logger.info(`Export ${result.exportId} completed and sent to user ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Export command failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      await interaction.editReply({
        embeds: [createErrorEmbed('Export Failed', errorMessage)],
        files: [createLogoAttachment()],
      });
    }
  },
};

/**
 * Parse fields from comma-separated string
 */
function parseFields(fieldsInput: string | null): MemberField[] {
  const defaultFields: MemberField[] = [
    'id',
    'username',
    'discriminator',
    'displayName',
    'joinedAt',
    'roles',
    'isBot',
  ];

  if (!fieldsInput) {
    return defaultFields;
  }

  const validFields: MemberField[] = [
    'id',
    'username',
    'discriminator',
    'displayName',
    'joinedAt',
    'createdAt',
    'roles',
    'isBot',
    'avatar',
  ];

  const requestedFields = fieldsInput
    .split(',')
    .map((field) => field.trim())
    .filter((field) => validFields.includes(field as MemberField)) as MemberField[];

  return requestedFields.length > 0 ? requestedFields : defaultFields;
}

/**
 * Parse date string (YYYY-MM-DD)
 */
function parseDate(dateString: string): Date | null {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export default exportCommand;
