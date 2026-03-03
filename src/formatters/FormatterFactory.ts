import type { Formatter } from './Formatter.interface.js';
import { CSVFormatter } from './CSVFormatter.js';
import { JSONFormatter } from './JSONFormatter.js';
import { TXTFormatter } from './TXTFormatter.js';
import { XLSXFormatter } from './XLSXFormatter.js';
import { ExportFormat } from '../types/export.types.js';

/**
 * FormatterFactory - Creates formatter instances based on format type
 */
export class FormatterFactory {
  private static formatters = new Map<string, Formatter>([
    [ExportFormat.CSV, new CSVFormatter()],
    [ExportFormat.JSON, new JSONFormatter()],
    [ExportFormat.TXT, new TXTFormatter()],
    [ExportFormat.XLSX, new XLSXFormatter()],
  ]);

  /**
   * Get formatter for specified format
   */
  public static getFormatter(format: ExportFormat): Formatter {
    const formatter = this.formatters.get(format);

    if (!formatter) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    return formatter;
  }

  /**
   * Check if format is supported
   */
  public static isFormatSupported(format: string): boolean {
    return this.formatters.has(format as ExportFormat);
  }

  /**
   * Get all supported formats
   */
  public static getSupportedFormats(): string[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * Get formatter info
   */
  public static getFormatterInfo(format: ExportFormat): {
    extension: string;
    mimeType: string;
    supportsStreaming: boolean;
  } | null {
    const formatter = this.formatters.get(format);

    if (!formatter) {
      return null;
    }

    return {
      extension: formatter.getExtension(),
      mimeType: formatter.getMimeType(),
      supportsStreaming: formatter.supportsStreaming(),
    };
  }
}
