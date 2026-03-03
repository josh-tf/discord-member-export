import type { Formatter, FormatOptions, FormatResult } from './Formatter.interface.js';
import type { MemberData } from '../types/export.types.js';
import { logger } from '../utils/logger.js';

/**
 * JSONFormatter - Formats member data as JSON
 */
export class JSONFormatter implements Formatter {
  /**
   * Format member data to JSON
   */
  public async format(
    members: Partial<MemberData>[],
    options?: FormatOptions,
  ): Promise<FormatResult> {
    logger.info('Formatting data as JSON...');

    try {
      // Create output object with metadata
      const output: { metadata: Record<string, unknown>; members: Partial<MemberData>[] } = {
        metadata: {
          exportedAt: options?.createdAt?.toISOString() || new Date().toISOString(),
          guildName: options?.guildName,
          exportedBy: options?.exportedBy,
          totalMembers: options?.totalMembers || members.length,
          filteredMembers: members.length,
          filters: options?.filters || null,
        },
        members: members,
      };

      const jsonContent = JSON.stringify(output, null, 2);
      const buffer = Buffer.from(jsonContent, 'utf-8');

      logger.info(`JSON formatted: ${buffer.length} bytes`);

      return {
        data: jsonContent,
        extension: 'json',
        mimeType: 'application/json',
        size: buffer.length,
      };
    } catch (error) {
      logger.error('Failed to format JSON:', error);
      throw error;
    }
  }

  /**
   * Get file extension
   */
  public getExtension(): string {
    return 'json';
  }

  /**
   * Get MIME type
   */
  public getMimeType(): string {
    return 'application/json';
  }

  /**
   * Check if streaming is supported
   */
  public supportsStreaming(): boolean {
    return true; // JSON can be streamed with newline-delimited JSON
  }
}
