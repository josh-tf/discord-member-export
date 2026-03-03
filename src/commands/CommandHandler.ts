import {
  Client,
  Collection,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  REST,
  Routes,
} from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { pathToFileURL } from 'url';
import type { Command, CommandContext } from './Command.interface.js';
import { CooldownManager } from './Command.interface.js';
import { BotConfig } from '../config/bot.config.js';
import { logger } from '../utils/logger.js';

/**
 * CommandHandler - Manages command loading, registration, and execution
 */
export class CommandHandler {
  private client: Client;
  private commands = new Collection<string, Command>();
  private cooldownManager = new CooldownManager();

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Load all commands from the commands directory
   */
  public async loadCommands(): Promise<void> {
    logger.info('Loading commands...');

    try {
      const commandsPath = join(dirname(new URL(import.meta.url).pathname));

      // Support both .js (production) and .ts (development with tsx)
      const commandFiles = readdirSync(commandsPath).filter(
        (file) =>
          (file.endsWith('.js') || file.endsWith('.ts')) &&
          !file.includes('Command') &&
          !file.includes('Handler'),
      );

      for (const file of commandFiles) {
        try {
          const filePath = join(commandsPath, file);
          const fileURL = pathToFileURL(filePath).href;
          const commandModule = await import(fileURL);

          if ('default' in commandModule) {
            const command: Command = commandModule.default;

            if (!command.data || !command.execute) {
              logger.warn(`Command ${file} is missing required properties (data or execute)`);
              continue;
            }

            this.commands.set(command.data.name, command);
            logger.debug(`Loaded command: ${command.data.name}`);
          }
        } catch (error) {
          logger.error(`Failed to load command ${file}:`, error);
        }
      }

      logger.info(`Loaded ${this.commands.size} commands`);
    } catch (error) {
      logger.error('Failed to load commands:', error);
      throw error;
    }
  }

  /**
   * Register commands with Discord
   */
  public async registerCommands(): Promise<void> {
    logger.info('Registering commands with Discord...');

    try {
      const commandData = Array.from(this.commands.values()).map((cmd) => cmd.data.toJSON());

      const rest = new REST({ version: '10' }).setToken(BotConfig.discord.token);

      // Register commands globally or to specific guild
      if (BotConfig.discord.guildId) {
        // Development: Register to specific guild (instant updates)
        logger.info(
          `Registering ${commandData.length} commands to guild ${BotConfig.discord.guildId}`,
        );

        await rest.put(
          Routes.applicationGuildCommands(BotConfig.discord.clientId, BotConfig.discord.guildId),
          { body: commandData },
        );

        logger.info('Commands registered to guild successfully');
      } else {
        // Production: Register globally (takes ~1 hour to propagate)
        logger.info(`Registering ${commandData.length} commands globally`);

        await rest.put(Routes.applicationCommands(BotConfig.discord.clientId), {
          body: commandData,
        });

        logger.info('Commands registered globally (may take up to 1 hour to propagate)');
      }
    } catch (error) {
      logger.error('Failed to register commands:', error);
      throw error;
    }
  }

  /**
   * Handle command interaction
   */
  public async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      await interaction.reply({
        content: 'Unknown command.',
        ephemeral: true,
      });
      return;
    }

    try {
      // Check admin permissions
      if (BotConfig.commands.adminOnly && command.adminOnly !== false && interaction.guild) {
        const member = interaction.guild.members.cache.get(interaction.user.id);

        if (!member?.permissions.has('Administrator')) {
          await interaction.reply({
            content: '⛔ This command requires Administrator permissions.',
            ephemeral: true,
          });
          return;
        }
      }

      // Check required permissions
      if (command.requiredPermissions && interaction.guild) {
        const member = interaction.guild.members.cache.get(interaction.user.id);

        const missingPermissions = command.requiredPermissions.filter(
          (perm) => !member?.permissions.has(perm),
        );

        if (missingPermissions.length > 0) {
          await interaction.reply({
            content: `⛔ You are missing required permissions: ${missingPermissions.join(', ')}`,
            ephemeral: true,
          });
          return;
        }
      }

      // Check cooldown
      if (command.cooldown && command.cooldown > 0) {
        const cooldownCheck = this.cooldownManager.isOnCooldown(
          command.data.name,
          interaction.user.id,
          command.cooldown,
        );

        if (cooldownCheck.onCooldown) {
          await interaction.reply({
            content: `⏳ Please wait ${cooldownCheck.remainingSeconds} seconds before using this command again.`,
            ephemeral: true,
          });
          return;
        }
      }

      // Execute command
      logger.info(`Executing command: ${interaction.commandName} (user: ${interaction.user.tag})`);

      const context: CommandContext = { interaction };
      await command.execute(context);

      logger.debug(`Command executed successfully: ${interaction.commandName}`);
    } catch (error) {
      logger.error(`Error executing command ${interaction.commandName}:`, error);

      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

      const replyOptions = {
        content: `❌ Error: ${errorMessage}`,
        ephemeral: true,
      };

      // Reply or edit reply depending on interaction state
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(replyOptions);
      } else {
        await interaction.reply(replyOptions);
      }
    }
  }

  /**
   * Handle autocomplete interaction
   */
  public async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      logger.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
    }
  }

  /**
   * Get all loaded commands
   */
  public getCommands(): Collection<string, Command> {
    return this.commands;
  }

  /**
   * Get a specific command
   */
  public getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  /**
   * Clear cooldowns for a user
   */
  public clearUserCooldowns(userId: string): void {
    this.cooldownManager.clearUserCooldowns(userId);
  }
}
