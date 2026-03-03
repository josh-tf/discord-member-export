import * as XLSX from 'xlsx';
import type { Formatter, FormatOptions, FormatResult } from './Formatter.interface.js';
import type { MemberData } from '../types/export.types.js';
import { logger } from '../utils/logger.js';

/**
 * XLSXFormatter - Formats member data as Excel spreadsheet with multiple sheets
 */
export class XLSXFormatter implements Formatter {
  /**
   * Format member data to XLSX
   */
  public async format(
    members: Partial<MemberData>[],
    options?: FormatOptions,
  ): Promise<FormatResult> {
    logger.info('Formatting data as XLSX...');

    try {
      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Add members sheet
      this.addMembersSheet(workbook, members);

      // Add summary sheet
      if (options) {
        this.addSummarySheet(workbook, members, options);
      }

      // Add role analysis sheet (if roles are included)
      if (members.length > 0 && members[0].roles) {
        this.addRoleAnalysisSheet(workbook, members);
      }

      // Generate buffer
      const buffer = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
        compression: true,
      });

      logger.info(`XLSX formatted: ${buffer.length} bytes`);

      return {
        data: buffer,
        extension: 'xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
      };
    } catch (error) {
      logger.error('Failed to format XLSX:', error);
      throw error;
    }
  }

  /**
   * Add members sheet with formatted data
   */
  private addMembersSheet(workbook: XLSX.WorkBook, members: Partial<MemberData>[]): void {
    if (members.length === 0) {
      const emptySheet = XLSX.utils.aoa_to_sheet([['No members to export']]);
      XLSX.utils.book_append_sheet(workbook, emptySheet, 'Members');
      return;
    }

    // Convert members to worksheet data
    const worksheetData = this.convertMembersToRows(members);

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Apply column widths
    const columnWidths = this.calculateColumnWidths(members);
    worksheet['!cols'] = columnWidths;

    // Apply header styling (if supported)
    this.applyHeaderStyling(worksheet, worksheetData[0]);

    // Add autofilter
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

    // Freeze header row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Members');
  }

  /**
   * Add summary sheet with export metadata
   */
  private addSummarySheet(
    workbook: XLSX.WorkBook,
    members: Partial<MemberData>[],
    options: FormatOptions,
  ): void {
    const summaryData: (string | number | null)[][] = [
      ['Export Summary'],
      [],
      ['Property', 'Value'],
      ['Exported On', options.createdAt?.toISOString() || new Date().toISOString()],
      ['Guild Name', options.guildName || 'Unknown'],
      ['Exported By', options.exportedBy || 'Unknown'],
      ['Total Members', options.totalMembers || members.length],
      ['Filtered Members', members.length],
      [
        'Removal Rate',
        options.totalMembers
          ? `${(((options.totalMembers - members.length) / options.totalMembers) * 100).toFixed(1)}%`
          : '0%',
      ],
      [],
      ['Applied Filters'],
      [],
    ];

    // Add filter information
    if (options.filters) {
      if (options.filters.bots !== undefined) {
        summaryData.push(['Bots', options.filters.bots.includeBots ? 'Included' : 'Excluded']);
      }

      if (options.filters.roles) {
        if (options.filters.roles.include?.length) {
          summaryData.push(['Roles (Include)', options.filters.roles.include.length + ' role(s)']);
          summaryData.push(['Match Type', options.filters.roles.matchType || 'any']);
        }
        if (options.filters.roles.exclude?.length) {
          summaryData.push(['Roles (Exclude)', options.filters.roles.exclude.length + ' role(s)']);
        }
      }

      if (options.filters.joinDate) {
        if (options.filters.joinDate.after) {
          summaryData.push(['Joined After', options.filters.joinDate.after.toLocaleDateString()]);
        }
        if (options.filters.joinDate.before) {
          summaryData.push(['Joined Before', options.filters.joinDate.before.toLocaleDateString()]);
        }
      }

      if (options.filters.accountAge?.minimumAgeDays) {
        summaryData.push(['Min Account Age', `${options.filters.accountAge.minimumAgeDays} days`]);
      }

      if (options.filters.permissions?.permissions.length) {
        summaryData.push([
          'Permissions',
          options.filters.permissions.permissions.length + ' permission(s)',
        ]);
      }
    } else {
      summaryData.push(['None', 'No filters applied']);
    }

    // Add statistics
    summaryData.push([]);
    summaryData.push(['Member Statistics']);
    summaryData.push([]);

    const botCount = members.filter((m) => m.isBot).length;
    const humanCount = members.length - botCount;

    summaryData.push(['Total Members', members.length]);
    summaryData.push(['Human Members', humanCount]);
    summaryData.push(['Bot Members', botCount]);

    if (members.length > 0 && members[0].joinedAt) {
      const dates = members.filter((m) => m.joinedAt).map((m) => (m.joinedAt as Date).getTime());

      if (dates.length > 0) {
        const oldestJoin = new Date(Math.min(...dates));
        const newestJoin = new Date(Math.max(...dates));

        summaryData.push([]);
        summaryData.push(['Oldest Join Date', oldestJoin.toLocaleDateString()]);
        summaryData.push(['Newest Join Date', newestJoin.toLocaleDateString()]);
      }
    }

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(summaryData);

    // Set column widths
    worksheet['!cols'] = [{ wch: 20 }, { wch: 40 }];

    // Style the title (if supported)
    if (worksheet['A1']) {
      worksheet['A1'].s = {
        font: { bold: true, sz: 14 },
      };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Summary');
  }

  /**
   * Add role analysis sheet
   */
  private addRoleAnalysisSheet(workbook: XLSX.WorkBook, members: Partial<MemberData>[]): void {
    // Count roles
    const roleCounts = new Map<string, number>();

    for (const member of members) {
      if (member.roles && Array.isArray(member.roles)) {
        for (const role of member.roles) {
          roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
        }
      }
    }

    // Sort by count
    const sortedRoles = Array.from(roleCounts.entries()).sort((a, b) => b[1] - a[1]);

    // Create worksheet data
    const worksheetData: (string | number)[][] = [['Role Name', 'Member Count', 'Percentage']];

    for (const [role, count] of sortedRoles) {
      const percentage = ((count / members.length) * 100).toFixed(1);
      worksheetData.push([role, count, `${percentage}%`]);
    }

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    worksheet['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }];

    // Add autofilter
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Role Analysis');
  }

  /**
   * Convert members to worksheet rows
   */
  private convertMembersToRows(
    members: Partial<MemberData>[],
  ): (string | number | boolean | null)[][] {
    if (members.length === 0) {
      return [];
    }

    // Get headers from first member
    const headers = Object.keys(members[0]);
    const rows: (string | number | boolean | null)[][] = [headers];

    // Convert each member to row
    for (const member of members) {
      const row = headers.map((header) => {
        const value = member[header as keyof MemberData];

        if (value === undefined || value === null) {
          return '';
        }

        if (Array.isArray(value)) {
          return value.join(', ');
        }

        if (value instanceof Date) {
          return value.toISOString();
        }

        if (typeof value === 'boolean') {
          return value ? 'Yes' : 'No';
        }

        return value;
      });

      rows.push(row);
    }

    return rows;
  }

  /**
   * Calculate optimal column widths
   */
  private calculateColumnWidths(members: Partial<MemberData>[]): XLSX.ColInfo[] {
    if (members.length === 0) {
      return [];
    }

    const headers = Object.keys(members[0]);
    const widths: XLSX.ColInfo[] = [];

    for (const header of headers) {
      let maxWidth = header.length;

      // Sample first 100 rows for performance
      const sampleSize = Math.min(100, members.length);
      for (let i = 0; i < sampleSize; i++) {
        const value = members[i][header as keyof MemberData];
        let strValue = '';

        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            strValue = value.join(', ');
          } else if (value instanceof Date) {
            strValue = value.toISOString();
          } else {
            strValue = String(value);
          }
        }

        maxWidth = Math.max(maxWidth, strValue.length);
      }

      // Cap width between 10 and 50 characters
      const width = Math.min(Math.max(maxWidth + 2, 10), 50);
      widths.push({ wch: width });
    }

    return widths;
  }

  /**
   * Apply header styling
   */
  private applyHeaderStyling(
    worksheet: XLSX.WorkSheet,
    headers: (string | number | boolean | null)[],
  ): void {
    for (let i = 0; i < headers.length; i++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'DDDDDD' } },
          alignment: { horizontal: 'center' },
        };
      }
    }
  }

  /**
   * Get file extension
   */
  public getExtension(): string {
    return 'xlsx';
  }

  /**
   * Get MIME type
   */
  public getMimeType(): string {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  /**
   * Check if streaming is supported
   */
  public supportsStreaming(): boolean {
    return false; // XLSX requires full data in memory
  }
}
