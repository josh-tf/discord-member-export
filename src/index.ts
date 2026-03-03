import { MemberExportBot } from './bot.js';
import { logger } from './utils/logger.js';

/**
 * Main entry point for the Discord Member Export Bot
 */

// Create bot instance
const bot = new MemberExportBot();

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await bot.stop();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Error handlers
 */
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception:', error);
  await shutdown('UNCAUGHT_EXCEPTION');
});

/**
 * Shutdown signals
 */
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/**
 * Start the bot
 */
(async () => {
  try {
    logger.info('='.repeat(50));
    logger.info('Discord Member Export Bot');
    logger.info('High-performance member exporting with filtering');
    logger.info('='.repeat(50));
    logger.info('');

    await bot.start();
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
})();
