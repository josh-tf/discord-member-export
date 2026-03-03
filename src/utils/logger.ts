import { BotConfig } from '../config/bot.config.js';
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

class Logger {
  private minLevel: number;
  private logToFile: boolean;
  private filePath: string;

  constructor() {
    this.minLevel = LOG_LEVELS[BotConfig.logging.level];
    this.logToFile = BotConfig.logging.toFile;
    this.filePath = BotConfig.logging.filePath;

    if (this.logToFile) {
      this.initLogFile();
    }
  }

  private initLogFile(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, '');
    }
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, data);
    const coloredMessage = `${LOG_COLORS[level]}${formattedMessage}${RESET_COLOR}`;

    // Console output with colors
    // eslint-disable-next-line no-console
    console.log(coloredMessage);

    // File output without colors
    if (this.logToFile) {
      appendFileSync(this.filePath, formattedMessage + '\n');
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: unknown): void {
    const errorData =
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : error;

    this.log('error', message, errorData);
  }
}

export const logger = new Logger();
