import type { Formatter, FormatOptions, FormatResult } from './Formatter.interface.js';
import type { MemberData } from '../types/export.types.js';
import { logger } from '../utils/logger.js';

/**
 * TXTFormatter - Formats member data as plain text
 */
export class TXTFormatter implements Formatter {
  /**
   * Format member data to plain text
   */
  public async format(
    members: Partial<MemberData>[],
    options?: FormatOptions,
  ): Promise<FormatResult> {
    logger.info('Formatting data as TXT...');

    try {
      const txtContent = this.generateText(members, options);
      const buffer = Buffer.from(txtContent, 'utf-8');

      logger.info(`TXT formatted: ${buffer.length} bytes`);

      return {
        data: txtContent,
        extension: 'txt',
        mimeType: 'text/plain',
        size: buffer.length,
      };
    } catch (error) {
      logger.error('Failed to format TXT:', error);
      throw error;
    }
  }

  /**
   * Generate plain text content
   */
  private generateText(members: Partial<MemberData>[], options?: FormatOptions): string {
    const lines: string[] = [];

    // Header
    lines.push('═'.repeat(80));
    lines.push('MEMBER EXPORT');
    lines.push('═'.repeat(80));
    lines.push('');

    // Metadata
    if (options) {
      lines.push('Export Information:');
      lines.push(`  Guild: ${options.guildName || 'Unknown'}`);
      lines.push(
        `  Exported: ${options.createdAt?.toLocaleString() || new Date().toLocaleString()}`,
      );
      lines.push(`  By: ${options.exportedBy || 'Unknown'}`);
      lines.push(`  Total Members: ${options.totalMembers || members.length}`);
      lines.push(`  Filtered Members: ${members.length}`);
      lines.push('');
    }

    // Filter information
    if (options?.filters) {
      lines.push('Applied Filters:');

      if (options.filters.bots !== undefined) {
        lines.push(`  Bots: ${options.filters.bots.includeBots ? 'Included' : 'Excluded'}`);
      }

      if (options.filters.roles) {
        if (options.filters.roles.include?.length) {
          lines.push(`  Roles (Include): ${options.filters.roles.include.length} role(s)`);
        }
        if (options.filters.roles.exclude?.length) {
          lines.push(`  Roles (Exclude): ${options.filters.roles.exclude.length} role(s)`);
        }
      }

      if (options.filters.joinDate) {
        if (options.filters.joinDate.after) {
          lines.push(`  Joined After: ${options.filters.joinDate.after.toLocaleDateString()}`);
        }
        if (options.filters.joinDate.before) {
          lines.push(`  Joined Before: ${options.filters.joinDate.before.toLocaleDateString()}`);
        }
      }

      if (options.filters.accountAge?.minimumAgeDays) {
        lines.push(`  Min Account Age: ${options.filters.accountAge.minimumAgeDays} days`);
      }

      lines.push('');
    }

    lines.push('─'.repeat(80));
    lines.push('MEMBERS');
    lines.push('─'.repeat(80));
    lines.push('');

    if (members.length === 0) {
      lines.push('No members to display.');
    } else {
      // Member data
      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        lines.push(`[${i + 1}] Member:`);

        if (member.username) {
          lines.push(
            `  Username: ${member.username}${member.discriminator ? `#${member.discriminator}` : ''}`,
          );
        }

        if (member.displayName) {
          lines.push(`  Display Name: ${member.displayName}`);
        }

        if (member.id) {
          lines.push(`  ID: ${member.id}`);
        }

        if (member.joinedAt) {
          lines.push(`  Joined: ${member.joinedAt.toLocaleString()}`);
        }

        if (member.createdAt) {
          lines.push(`  Account Created: ${member.createdAt.toLocaleString()}`);
        }

        if (member.roles && member.roles.length > 0) {
          lines.push(`  Roles: ${member.roles.join(', ')}`);
        }

        if (member.isBot !== undefined) {
          lines.push(`  Bot: ${member.isBot ? 'Yes' : 'No'}`);
        }

        if (member.avatar) {
          lines.push(`  Avatar: ${member.avatar}`);
        }

        lines.push('');
      }
    }

    lines.push('─'.repeat(80));
    lines.push(`Total: ${members.length} member(s)`);
    lines.push('═'.repeat(80));

    return lines.join('\n');
  }

  /**
   * Get file extension
   */
  public getExtension(): string {
    return 'txt';
  }

  /**
   * Get MIME type
   */
  public getMimeType(): string {
    return 'text/plain';
  }

  /**
   * Check if streaming is supported
   */
  public supportsStreaming(): boolean {
    return true; // TXT can be streamed line by line
  }
}
