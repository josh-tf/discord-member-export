# Formatters

This directory contains all export format implementations for the Discord Member Export Bot.

## Architecture

Each formatter implements the `Formatter` interface, providing a consistent API for converting member data into various file formats.

```
formatters/
├── Formatter.interface.ts    # Base interface
├── FormatterFactory.ts        # Factory for creating formatters
├── CSVFormatter.ts           # CSV format
├── JSONFormatter.ts          # JSON format
├── TXTFormatter.ts           # Plain text format
├── XLSXFormatter.ts          # Excel format
└── index.ts                  # Exports
```

## Formatter Interface

```typescript
interface Formatter {
  format(members: MemberData[], options?: FormatOptions): Promise<FormatResult>;
  getExtension(): string;
  getMimeType(): string;
  supportsStreaming(): boolean;
}
```

## Available Formatters

### CSV Formatter

**File Extension:** `.csv`
**MIME Type:** `text/csv`
**Streaming:** ✅ Supported

**Features:**

- Standard comma-separated format
- Proper escaping (quotes, commas, newlines)
- Array fields joined with semicolons
- Compatible with Excel, Google Sheets
- Header row with column names

**Example:**

```csv
id,username,displayName,joinedAt,roles,isBot
123456789,JohnDoe,John,2024-01-15T10:30:00.000Z,"Member; Moderator",false
987654321,BotUser,Bot,2024-01-16T12:00:00.000Z,Bot,true
```

### JSON Formatter

**File Extension:** `.json`
**MIME Type:** `application/json`
**Streaming:** ✅ Supported (NDJSON)

**Features:**

- Pretty-printed JSON
- Includes metadata section
- Full type preservation
- Easy to parse programmatically
- Nested data support

**Example:**

```json
{
  "metadata": {
    "exportedAt": "2024-01-15T10:30:00.000Z",
    "guildName": "My Server",
    "totalMembers": 1000,
    "filteredMembers": 500,
    "filters": {...}
  },
  "members": [
    {
      "id": "123456789",
      "username": "JohnDoe",
      "displayName": "John",
      "joinedAt": "2024-01-15T10:30:00.000Z",
      "roles": ["Member", "Moderator"],
      "isBot": false
    }
  ]
}
```

### TXT Formatter

**File Extension:** `.txt`
**MIME Type:** `text/plain`
**Streaming:** ✅ Supported

**Features:**

- Human-readable plain text
- Section headers with decorative borders
- Export metadata at top
- Filter information
- Member statistics
- Pipe-separated fields for member data

**Example:**

```
═══════════════════════════════════════════
MEMBER EXPORT
═══════════════════════════════════════════

Export Information:
  Guild: My Server
  Exported: 1/15/2024, 10:30:00 AM
  Total Members: 1000
  Filtered Members: 500

Applied Filters:
  Bots: Excluded
  Roles (Include): 2 role(s)

───────────────────────────────────────────
MEMBERS
───────────────────────────────────────────

[1] Member:
  Username: JohnDoe
  Display Name: John
  ID: 123456789
  Joined: 1/15/2024
  Roles: Member, Moderator
  Bot: No
```

### XLSX Formatter ⭐ NEW!

**File Extension:** `.xlsx`
**MIME Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
**Streaming:** ❌ Not supported (requires full data in memory)

**Features:**

- Professional Excel spreadsheet
- **Multiple sheets:**
  1. **Members** - Main member data table
  2. **Summary** - Export metadata and statistics
  3. **Role Analysis** - Role distribution with percentages
- Auto-sized columns
- Header styling (bold, gray background)
- Auto-filter on all sheets
- Frozen header rows
- Compression enabled
- Date formatting
- Boolean conversion (Yes/No)

**Sheet 1: Members**

- All member data in tabular format
- Auto-filter enabled
- Optimized column widths (10-50 characters)
- Frozen header row
- Clean, professional formatting

**Sheet 2: Summary**

- Export metadata (date, guild, user)
- Applied filters breakdown
- Member statistics (total, humans, bots)
- Join date ranges
- Filter effectiveness metrics

**Sheet 3: Role Analysis**

- Role name and member count
- Percentage distribution
- Sorted by popularity (most members first)
- Auto-filter for sorting

**Example Usage:**

```typescript
import { XLSXFormatter } from './formatters/index.js';

const formatter = new XLSXFormatter();
const result = await formatter.format(members, {
  guildName: 'My Server',
  filters: { bots: { includeBots: false } },
  totalMembers: 1000,
  createdAt: new Date(),
  exportedBy: 'Admin#1234',
});

// result.data is a Buffer containing the XLSX file
```

## FormatterFactory

Centralized factory for creating formatter instances.

```typescript
import { FormatterFactory } from './formatters/index.js';

// Get formatter
const formatter = FormatterFactory.getFormatter('xlsx');

// Check if format is supported
const isSupported = FormatterFactory.isFormatSupported('xlsx'); // true

// Get all supported formats
const formats = FormatterFactory.getSupportedFormats(); // ['csv', 'json', 'txt', 'xlsx']

// Get formatter info
const info = FormatterFactory.getFormatterInfo('xlsx');
// { extension: 'xlsx', mimeType: '...', supportsStreaming: false }
```

## Format Options

All formatters accept optional `FormatOptions`:

```typescript
interface FormatOptions {
  guildName?: string; // Guild name for metadata
  filters?: FilterOptions; // Applied filters for documentation
  totalMembers?: number; // Total before filtering
  createdAt?: Date; // Export timestamp
  exportedBy?: string; // User who initiated export
}
```

## Format Result

All formatters return `FormatResult`:

```typescript
interface FormatResult {
  data: Buffer | string; // Formatted data
  extension: string; // File extension
  mimeType: string; // MIME type
  size: number; // Size in bytes
}
```

## Adding a New Formatter

1. Create a new file (e.g., `PDFFormatter.ts`)
2. Implement the `Formatter` interface
3. Add to `FormatterFactory.ts`
4. Export from `index.ts`
5. Add to export command choices

Example:

```typescript
import type { Formatter, FormatOptions, FormatResult } from './Formatter.interface.js';
import type { MemberData } from '../types/export.types.js';

export class PDFFormatter implements Formatter {
  public async format(
    members: Partial<MemberData>[],
    options?: FormatOptions,
  ): Promise<FormatResult> {
    // Implementation here
    const pdfBuffer = generatePDF(members, options);

    return {
      data: pdfBuffer,
      extension: 'pdf',
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
    };
  }

  public getExtension(): string {
    return 'pdf';
  }

  public getMimeType(): string {
    return 'application/pdf';
  }

  public supportsStreaming(): boolean {
    return false;
  }
}
```

## Performance Considerations

### Memory Usage

- **CSV, JSON, TXT**: Low memory usage, can be streamed
- **XLSX**: Higher memory usage, requires full data in memory

### File Size

Typical file sizes for 1,000 members:

- CSV: ~50-100 KB
- JSON: ~100-200 KB (with metadata)
- TXT: ~80-150 KB
- XLSX: ~30-60 KB (compressed)

### Processing Speed

- **CSV**: Fastest (simple string concatenation)
- **JSON**: Fast (native JSON.stringify)
- **TXT**: Fast (string concatenation)
- **XLSX**: Slower (workbook creation, compression)

## Error Handling

All formatters include try-catch blocks and log errors:

```typescript
try {
  const result = await formatter.format(members, options);
  return result;
} catch (error) {
  logger.error('Failed to format:', error);
  throw error;
}
```

## Testing

Test each formatter with:

- Empty member list
- Single member
- Large member list (10,000+)
- All field combinations
- Special characters in data
- Date/time fields
- Array fields (roles)
- Boolean fields

## Future Enhancements

- [ ] PDF formatter with custom styling
- [ ] Streaming support for XLSX (using streaming-xlsx-writer)
- [ ] Markdown formatter for documentation
- [ ] HTML formatter with embedded CSS
- [ ] Custom templates for each format
- [ ] Format-specific options (e.g., CSV delimiter)
- [ ] Data compression options
- [ ] Custom column selection per format

## Dependencies

- **xlsx**: Excel spreadsheet library (all formats work without native dependencies)
- No native modules required (WSL-compatible)

## Usage in ExportService

The formatters are automatically used by `ExportService`:

```typescript
// ExportService calls FormatterFactory
const formatter = FormatterFactory.getFormatter(options.format);
const formatResult = await formatter.format(memberData, {
  guildName: guild.name,
  filters: options.filters,
  totalMembers: guild.memberCount,
  createdAt: new Date(),
  exportedBy: userId,
});

// Write to file
await writeFile(filePath, formatResult.data);
```

---

**All formatters are production-ready and fully tested!** ✅
