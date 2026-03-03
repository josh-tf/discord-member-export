import type { MemberData } from '../types/export.types.js';
import type { FilterOptions } from '../types/filter.types.js';

/**
 * Options for formatting exports
 */
export interface FormatOptions {
  /**
   * Guild name for metadata
   */
  guildName?: string;

  /**
   * Applied filters for documentation
   */
  filters?: FilterOptions;

  /**
   * Total member count before filtering
   */
  totalMembers?: number;

  /**
   * Export creation date
   */
  createdAt?: Date;

  /**
   * User who initiated the export
   */
  exportedBy?: string;
}

/**
 * Result of formatting operation
 */
export interface FormatResult {
  /**
   * Formatted data (Buffer for binary formats, string for text)
   */
  data: Buffer | string;

  /**
   * File extension
   */
  extension: string;

  /**
   * MIME type
   */
  mimeType: string;

  /**
   * Size in bytes
   */
  size: number;
}

/**
 * Base interface for all formatters
 */
export interface Formatter {
  /**
   * Format member data to specific format
   */
  format(members: Partial<MemberData>[], options?: FormatOptions): Promise<FormatResult>;

  /**
   * Get supported file extension
   */
  getExtension(): string;

  /**
   * Get MIME type
   */
  getMimeType(): string;

  /**
   * Check if formatter supports streaming
   */
  supportsStreaming(): boolean;
}
