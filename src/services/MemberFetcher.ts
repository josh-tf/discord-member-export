import { Guild, GuildMember, Collection } from 'discord.js';
import { logger } from '../utils/logger.js';
import { BotConfig } from '../config/bot.config.js';

/**
 * Rate limiter for Discord API requests
 */
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindowMs: number = 1000;

  constructor(maxRequestsPerSecond: number) {
    this.maxRequests = maxRequestsPerSecond;
  }

  /**
   * Wait if necessary to stay within rate limits
   */
  public async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.timeWindowMs;

    // Remove requests outside the time window
    this.requests = this.requests.filter((time) => time > windowStart);

    // If we've hit the limit, wait until the oldest request expires
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.timeWindowMs - now + 10; // +10ms buffer
      if (waitTime > 0) {
        logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.waitIfNeeded(); // Recursively check again
      }
    }

    // Record this request
    this.requests.push(now);
  }

  /**
   * Get current rate limit status
   */
  public getStatus(): { remaining: number; total: number } {
    const now = Date.now();
    const windowStart = now - this.timeWindowMs;
    this.requests = this.requests.filter((time) => time > windowStart);

    return {
      remaining: this.maxRequests - this.requests.length,
      total: this.maxRequests,
    };
  }
}

/**
 * Options for fetching members
 */
export interface FetchOptions {
  /**
   * Callback for progress updates
   */
  onProgress?: (fetched: number, total: number) => void;

  /**
   * Batch size for fetching members (default: 1000, max: 1000)
   */
  batchSize?: number;

  /**
   * Force fetch from API even if cache is available
   */
  force?: boolean;
}

/**
 * Result of fetching members
 */
export interface FetchResult {
  members: GuildMember[];
  totalFetched: number;
  durationMs: number;
  fromCache: boolean;
  retries: number;
}

/**
 * MemberFetcher - Handles fetching guild members with rate limiting and retry logic
 */
export class MemberFetcher {
  private rateLimiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor() {
    this.rateLimiter = new RateLimiter(BotConfig.rateLimiting.maxRequestsPerSecond);
    this.maxRetries = BotConfig.rateLimiting.retryAttempts;
    this.retryBackoffMs = BotConfig.rateLimiting.retryBackoffMs;
    this.maxBackoffMs = BotConfig.rateLimiting.maxBackoffMs;
  }

  /**
   * Fetch all members from a guild
   */
  public async fetchAll(guild: Guild, options: FetchOptions = {}): Promise<FetchResult> {
    const startTime = Date.now();
    const batchSize = Math.min(options.batchSize || 1000, 1000);
    let totalRetries = 0;

    logger.info(`Starting member fetch for guild: ${guild.name} (${guild.id})`);

    try {
      // Check if we should use cache
      const useCache = !options.force && BotConfig.performance.enableMemberCache;

      if (useCache && guild.members.cache.size === guild.memberCount) {
        logger.info(`Using cached members (${guild.members.cache.size}/${guild.memberCount})`);

        const members = Array.from(guild.members.cache.values());
        const durationMs = Date.now() - startTime;

        if (options.onProgress) {
          options.onProgress(members.length, members.length);
        }

        return {
          members,
          totalFetched: members.length,
          durationMs,
          fromCache: true,
          retries: 0,
        };
      }

      // Fetch members with pagination and rate limiting
      const members: GuildMember[] = [];
      let lastMemberId: string | undefined;
      let hasMore = true;

      logger.info(
        `Fetching members from API (batch size: ${batchSize}, rate limit: ${BotConfig.rateLimiting.maxRequestsPerSecond}/s)`,
      );

      while (hasMore) {
        // Safety check: stop if we've fetched all expected members
        if (members.length >= guild.memberCount) {
          logger.info(
            `Reached expected member count (${members.length}/${guild.memberCount}), stopping fetch`,
          );
          hasMore = false;
          break;
        }

        // Wait for rate limiter
        await this.rateLimiter.waitIfNeeded();

        logger.debug(
          `Fetching batch (current: ${members.length}, batch size: ${batchSize}, after: ${lastMemberId || 'none'})`,
        );

        // Fetch batch with retry logic
        const batch = await this.fetchBatchWithRetry(guild, batchSize, lastMemberId);

        totalRetries += batch.retries;

        logger.debug(`Batch received: ${batch.members.size} members`);

        if (batch.members.size === 0) {
          logger.info('No more members to fetch (empty batch)');
          hasMore = false;
          break;
        }

        // Add members to results (but don't exceed expected count)
        const batchArray = Array.from(batch.members.values());
        const remainingSlots = guild.memberCount - members.length;
        const membersToAdd = remainingSlots > 0 ? batchArray.slice(0, remainingSlots) : [];

        if (membersToAdd.length > 0) {
          members.push(...membersToAdd);
          // Update last member ID for pagination
          lastMemberId = membersToAdd[membersToAdd.length - 1].id;
        }

        // Report progress
        if (options.onProgress) {
          options.onProgress(members.length, guild.memberCount);
        }

        // Log progress
        const rateLimitStatus = this.rateLimiter.getStatus();
        logger.info(
          `Fetched ${members.length}/${guild.memberCount} members (${((members.length / guild.memberCount) * 100).toFixed(1)}%) - Rate limit: ${rateLimitStatus.remaining}/${rateLimitStatus.total}`,
        );

        // Check if we got fewer members than requested (end of list) or if we've fetched enough
        if (batch.members.size < batchSize || members.length >= guild.memberCount) {
          if (batch.members.size < batchSize) {
            logger.info(`Last batch was smaller (${batch.members.size} < ${batchSize}), stopping`);
          }
          hasMore = false;
        }
      }

      const durationMs = Date.now() - startTime;
      const membersPerSecond = (members.length / durationMs) * 1000;

      logger.info(
        `Completed member fetch: ${members.length} members in ${durationMs}ms (${membersPerSecond.toFixed(1)} members/s, ${totalRetries} retries)`,
      );

      return {
        members,
        totalFetched: members.length,
        durationMs,
        fromCache: false,
        retries: totalRetries,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(`Failed to fetch members after ${durationMs}ms:`, error);
      throw error;
    }
  }

  /**
   * Fetch a single batch of members with retry logic
   */
  private async fetchBatchWithRetry(
    guild: Guild,
    limit: number,
    after?: string,
  ): Promise<{ members: Collection<string, GuildMember>; retries: number }> {
    let lastError: Error | null = null;
    let retries = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const fetchOptions: { limit: number; after?: string } = { limit };
        if (after) {
          fetchOptions.after = after;
        }

        const members = await guild.members.fetch(fetchOptions);

        return { members, retries };
      } catch (error) {
        lastError = error as Error;
        retries++;

        // Check if it's a rate limit error
        const isRateLimitError =
          error instanceof Error &&
          (error.message.includes('rate limit') || error.message.includes('429'));

        if (attempt < this.maxRetries) {
          // Calculate backoff time
          const backoffMs = Math.min(this.retryBackoffMs * Math.pow(2, attempt), this.maxBackoffMs);

          logger.warn(
            `Fetch attempt ${attempt + 1}/${this.maxRetries + 1} failed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }. Retrying in ${backoffMs}ms...`,
          );

          await new Promise((resolve) => setTimeout(resolve, backoffMs));

          // If it was a rate limit error, wait extra time
          if (isRateLimitError) {
            logger.warn('Rate limit hit, waiting additional 5 seconds...');
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }
      }
    }

    throw new Error(
      `Failed to fetch members after ${this.maxRetries + 1} attempts: ${
        lastError?.message || 'Unknown error'
      }`,
    );
  }

  /**
   * Get estimated time to fetch all members
   */
  public estimateFetchTime(memberCount: number): number {
    // Calculate based on rate limit and batch size
    const batchSize = BotConfig.export.batchSize;
    const requestsNeeded = Math.ceil(memberCount / batchSize);
    const requestsPerSecond = BotConfig.rateLimiting.maxRequestsPerSecond;
    const secondsNeeded = requestsNeeded / requestsPerSecond;

    // Add 20% buffer for overhead
    return Math.ceil(secondsNeeded * 1000 * 1.2);
  }

  /**
   * Get current rate limit status
   */
  public getRateLimitStatus(): { remaining: number; total: number } {
    return this.rateLimiter.getStatus();
  }

  /**
   * Pre-fetch members into cache (useful for repeated exports)
   */
  public async preFetch(guild: Guild): Promise<void> {
    logger.info(`Pre-fetching members for guild: ${guild.name}`);

    await this.fetchAll(guild, {
      force: true,
      onProgress: (fetched, total) => {
        logger.debug(`Pre-fetch progress: ${fetched}/${total}`);
      },
    });

    logger.info('Pre-fetch completed');
  }

  /**
   * Clear member cache for a guild
   */
  public clearCache(guild: Guild): void {
    guild.members.cache.clear();
    logger.debug(`Cleared member cache for guild: ${guild.id}`);
  }
}
