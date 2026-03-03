import { Client, Events, ActivityType } from 'discord.js';
import { CommandHandler } from './commands/CommandHandler.js';
import { DatabaseService } from './services/database/index.js';
import { BotConfig } from './config/bot.config.js';
import { logger } from './utils/logger.js';

/**
 * MemberExportBot - Main bot client class
 */
export class MemberExportBot {
  private client: Client;
  private commandHandler: CommandHandler;
  private db: DatabaseService;
  private isReady = false;

  constructor() {
    // Initialize Discord client
    this.client = new Client({
      intents: BotConfig.discord.intents,
      presence: {
        status: 'online',
        activities: [
          {
            name: 'member exports',
            type: ActivityType.Watching,
          },
        ],
      },
    });

    // Initialize command handler
    this.commandHandler = new CommandHandler(this.client);

    // Initialize database
    this.db = DatabaseService.getInstance(BotConfig.database);

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup Discord event handlers
   */
  private setupEventHandlers(): void {
    // Ready event
    this.client.once(Events.ClientReady, async (client) => {
      await this.onReady(client);
    });

    // Interaction create event
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.commandHandler.handleCommand(interaction);
        } else if (interaction.isAutocomplete()) {
          await this.commandHandler.handleAutocomplete(interaction);
        }
      } catch (error) {
        logger.error('Error handling interaction:', error);
      }
    });

    // Error event
    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error:', error);
    });

    // Warning event
    this.client.on(Events.Warn, (info) => {
      logger.warn('Discord client warning:', info);
    });

    // Note: RateLimited event removed in discord.js v14
    // Rate limiting is now handled internally

    // Guild create event (bot added to server)
    this.client.on(Events.GuildCreate, (guild) => {
      logger.info(`Bot added to guild: ${guild.name} (${guild.id})`);
      logger.info(`Guild has ${guild.memberCount} members`);
    });

    // Guild delete event (bot removed from server)
    this.client.on(Events.GuildDelete, (guild) => {
      logger.info(`Bot removed from guild: ${guild.name} (${guild.id})`);
    });
  }

  /**
   * Handle ready event
   */
  private async onReady(client: Client<true>): Promise<void> {
    try {
      logger.info('='.repeat(50));
      logger.info(`Bot logged in as ${client.user.tag}`);
      logger.info(`Bot ID: ${client.user.id}`);
      logger.info(`Guilds: ${client.guilds.cache.size}`);
      logger.info('='.repeat(50));

      // Initialize database
      logger.info('Initializing database...');
      await this.db.initialize();
      logger.info('Database initialized successfully');

      // Load commands
      logger.info('Loading commands...');
      await this.commandHandler.loadCommands();

      // Register commands
      logger.info('Registering commands with Discord...');
      await this.commandHandler.registerCommands();

      // Log guild information
      logger.info('Connected to the following guilds:');
      for (const guild of client.guilds.cache.values()) {
        logger.info(`  - ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
      }

      this.isReady = true;
      logger.info('Bot is ready and operational!');
    } catch (error) {
      logger.error('Error during bot initialization:', error);
      throw error;
    }
  }

  /**
   * Start the bot
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting bot...');
      await this.client.login(BotConfig.discord.token);
    } catch (error) {
      logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * Stop the bot gracefully
   */
  public async stop(): Promise<void> {
    try {
      logger.info('Stopping bot...');

      // Close database connection
      if (this.db) {
        await this.db.close();
        logger.info('Database connection closed');
      }

      // Destroy Discord client
      this.client.destroy();
      logger.info('Discord client destroyed');

      logger.info('Bot stopped successfully');
    } catch (error) {
      logger.error('Error stopping bot:', error);
      throw error;
    }
  }

  /**
   * Get the Discord client
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * Get the command handler
   */
  public getCommandHandler(): CommandHandler {
    return this.commandHandler;
  }

  /**
   * Get the database service
   */
  public getDatabase(): DatabaseService {
    return this.db;
  }

  /**
   * Check if bot is ready
   */
  public isClientReady(): boolean {
    return this.isReady;
  }
}
