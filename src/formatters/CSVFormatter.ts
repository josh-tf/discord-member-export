import type { Formatter, FormatOptions, FormatResult } from './Formatter.interface.js';
import type { MemberData } from '../types/export.types.js';
import { logger } from '../utils/logger.js';

/**
 * CSVFormatter - Formats member data as CSV
 */
export class CSVFormatter implements Formatter {
  /**
   * Format member data to CSV
   */
  public async format(
    members: Partial<MemberData>[],
    _options?: FormatOptions,
  ): Promise<FormatResult> {
    logger.info('Formatting data as CSV...');

    try {
      const csvContent = this.generateCSV(members);
      const buffer = Buffer.from(csvContent, 'utf-8');

      logger.info(`CSV formatted: ${buffer.length} bytes`);

      return {
        data: csvContent,
        extension: 'csv',
        mimeType: 'text/csv',
        size: buffer.length,
      };
    } catch (error) {
      logger.error('Failed to format CSV:', error);
      throw error;
    }
  }

  /**
   * Generate CSV content
   */
  private generateCSV(members: Partial<MemberData>[]): string {
    if (members.length === 0) {
      return '';
    }

    // Get headers from first item
    const headers = Object.keys(members[0]);

    // Create CSV rows
    const rows: string[] = [this.escapeCSVRow(headers)];

    for (const member of members) {
      const values = headers.map((header) => {
        const value = member[header as keyof MemberData];

        if (value === undefined || value === null) {
          return '';
        }

        if (Array.isArray(value)) {
          return value.join('; ');
        }

        if (value instanceof Date) {
          return value.toISOString();
        }

        if (typeof value === 'boolean') {
          return value ? 'true' : 'false';
        }

        return String(value);
      });

      rows.push(this.escapeCSVRow(values));
    }

    return rows.join('\n');
  }

  /**
   * Escape and format CSV row
   */
  private escapeCSVRow(values: string[]): string {
    return values
      .map((value) => {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',');
  }

  /**
   * Get file extension
   */
  public getExtension(): string {
    return 'csv';
  }

  /**
   * Get MIME type
   */
  public getMimeType(): string {
    return 'text/csv';
  }

  /**
   * Check if streaming is supported
   */
  public supportsStreaming(): boolean {
    return true; // CSV can be streamed row by row
  }
}
