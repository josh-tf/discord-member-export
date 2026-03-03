import { GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';

// Load environment variables
config();

export const BotConfig = {
  // Discord Bot Settings
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID, // Optional: for development
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  },

  // Command Settings
  commands: {
    adminOnly: true,
    ephemeralByDefault: true,
  },

  // Export Settings
  export: {
    maxConcurrentPerGuild: parseInt(process.env.MAX_CONCURRENT_EXPORTS || '3', 10),
    batchSize: parseInt(process.env.EXPORT_BATCH_SIZE || '1000', 10),
    progressUpdateInterval: parseInt(process.env.PROGRESS_UPDATE_INTERVAL_MS || '5000', 10), // 5 seconds
    maxFileSizeMB: 25, // Discord file size limit
    enableCompression: true,
    tempExportPath: process.env.TEMP_EXPORT_PATH || './temp/exports',
  },

  // Database Settings
  database: {
    path: process.env.DATABASE_PATH || './data/bot.db',
    walMode: true,
    backupEnabled: true,
    backupPath: './data/backups',
  },

  // Rate Limiting
  rateLimiting: {
    maxRequestsPerSecond: 45, // Buffer below Discord's 50
    retryAttempts: 5,
    retryBackoffMs: 1000, // Starting backoff: 1s, 2s, 4s, 8s, 16s
    maxBackoffMs: 60000, // Max 60 seconds
  },

  // Performance
  performance: {
    maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB || '2048', 10),
    enableMemberCache: process.env.ENABLE_MEMBER_CACHE === 'true',
    memberCacheTTL: parseInt(process.env.MEMBER_CACHE_TTL_SECONDS || '300', 10) * 1000,
  },

  // Logging
  logging: {
    level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
    toFile: process.env.LOG_TO_FILE === 'true',
    filePath: process.env.LOG_FILE_PATH || './logs/bot.log',
  },
} as const;

// Validation
if (!BotConfig.discord.token) {
  throw new Error('DISCORD_TOKEN is required in .env file');
}

if (!BotConfig.discord.clientId) {
  throw new Error('DISCORD_CLIENT_ID is required in .env file');
}
