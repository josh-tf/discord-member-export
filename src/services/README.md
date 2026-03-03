# Services Layer

Core business logic services for the Discord Member Export Bot.

## Architecture

The services layer is organized into four main components:

```
services/
├── MemberFetcher.ts      # Rate-limited member fetching with pagination
├── FilterService.ts      # Member filtering logic
├── ProgressTracker.ts    # Real-time progress tracking
├── ExportService.ts      # Export orchestration
├── database/             # Database layer
└── index.ts             # Main exports
```

## Services Overview

### 1. MemberFetcher

Handles fetching guild members from Discord API with built-in rate limiting and retry logic.

**Features:**

- Rate-limited requests (45 req/s with buffer below Discord's 50 limit)
- Automatic pagination for large guilds
- Exponential backoff retry logic
- Cache support for repeated exports
- Real-time progress callbacks
- Fetch time estimation

**Usage:**

```typescript
import { MemberFetcher } from './services/index.js';

const fetcher = new MemberFetcher();

const result = await fetcher.fetchAll(guild, {
  batchSize: 1000,
  onProgress: (fetched, total) => {
    console.log(`Fetched ${fetched}/${total} members`);
  },
});

console.log(`Fetched ${result.totalFetched} members in ${result.durationMs}ms`);
```

**Key Methods:**

- `fetchAll(guild, options)` - Fetch all members with progress tracking
- `estimateFetchTime(memberCount)` - Estimate how long fetch will take
- `getRateLimitStatus()` - Get current rate limit status
- `preFetch(guild)` - Pre-fetch members into cache

### 2. FilterService

Applies various filters to member lists based on criteria.

**Supported Filters:**

- **Role filters**: Include/exclude specific roles (ANY or ALL match)
- **Join date filters**: Members who joined before/after specific dates
- **Account age filters**: Minimum account age in days
- **Permission filters**: Members with specific permissions (ANY or ALL)
- **Bot filters**: Include or exclude bots

**Usage:**

```typescript
import { FilterService } from './services/index.js';

const filterService = new FilterService();

const filtered = filterService.filter(members, {
  roles: {
    include: ['123456789'], // Role IDs
    matchType: 'any',
  },
  bots: {
    includeBots: false, // Exclude bots
  },
  joinDate: {
    after: new Date('2023-01-01'),
  },
});

const stats = filterService.getFilterStats(members.length, filtered.length, filters);
```

**Key Methods:**

- `filter(members, filters)` - Apply filters to member list
- `validateFilters(filters)` - Validate filter configuration
- `getFilterSummary(filters)` - Get human-readable filter summary
- `getFilterStats(...)` - Get statistics about filtering results

### 3. ProgressTracker

Tracks and displays real-time progress updates through Discord messages.

**Features:**

- Multi-stage progress tracking (Fetching → Filtering → Formatting → Saving)
- Real-time speed calculation with smoothing
- ETA estimation
- Animated progress bars
- Automatic message updates (5-second interval)
- Completion/failure messages

**Usage:**

```typescript
import { ProgressTracker, ProgressStage } from './services/index.js';

const tracker = new ProgressTracker();

// Start tracking
await tracker.start(exportId, interaction, totalMembers);

// Update progress
await tracker.update(exportId, processedCount);

// Change stage
await tracker.setStage(exportId, ProgressStage.FILTERING);

// Complete
await tracker.complete(exportId, {
  totalMembers: 1000,
  filteredMembers: 500,
  fileSize: 51200,
  durationMs: 5000,
});
```

**Progress Stages:**

1. `INITIALIZING` - Setting up export
2. `FETCHING` - Fetching members from Discord API
3. `FILTERING` - Applying filters
4. `FORMATTING` - Formatting data
5. `SAVING` - Saving to file
6. `COMPLETED` - Export completed

### 4. ExportService

Main orchestration service that coordinates all other services.

**Features:**

- Full export workflow orchestration
- Database integration for history tracking
- Multiple export formats (CSV, JSON, TXT, XLSX\*)
- Error handling and recovery
- Export history and statistics
- Cleanup of old exports

**Usage:**

```typescript
import { ExportService } from './services/index.js';
import { DatabaseService } from './services/database/index.js';

const db = DatabaseService.getInstance(config.database);
await db.initialize();

const exportService = new ExportService(db);

const result = await exportService.export(guild, interaction, {
  guildId: guild.id,
  userId: interaction.user.id,
  format: 'csv',
  includeFields: ['id', 'username', 'roles', 'joinedAt'],
  filters: {
    bots: { includeBots: false },
    roles: { include: ['123456789'], matchType: 'any' },
  },
});

console.log(`Export completed: ${result.filePath}`);
```

**Key Methods:**

- `export(guild, interaction, options)` - Execute full export
- `getGuildHistory(guildId, limit)` - Get export history
- `getGuildStats(guildId)` - Get guild statistics
- `getProgress(exportId)` - Get current export progress
- `estimateExportTime(memberCount)` - Estimate export duration
- `cleanup(daysToKeep)` - Clean up old exports

## Export Workflow

The export process follows these stages:

1. **Validation** - Validate filters and options
2. **Database Record** - Create export record with "pending" status
3. **Fetch Members** - Rate-limited fetch with progress tracking
4. **Apply Filters** - Filter members based on criteria
5. **Format Data** - Transform to selected format
6. **Save File** - Write to temp directory
7. **Update Database** - Mark as completed with metadata
8. **Notify User** - Final progress message with download

## Error Handling

All services implement comprehensive error handling:

- **Rate limit errors**: Automatic retry with exponential backoff
- **Network errors**: Retry logic with configurable attempts
- **Validation errors**: Clear error messages before processing
- **Partial failures**: Graceful degradation where possible
- **Database errors**: Transaction rollback and error logging

## Performance Considerations

### Rate Limiting

The bot stays safely below Discord's rate limits:

- 45 requests/second (buffer below Discord's 50/s limit)
- Automatic throttling with request tracking
- Smart retry logic for rate limit hits

### Memory Management

- Streaming approach for large exports (future enhancement)
- Configurable batch sizes
- Cache management for repeated operations
- Automatic cleanup of old exports

### Database Optimization

- Indexed queries for fast lookups
- Batch operations where possible
- Transaction support for data consistency

## Export Formats

### CSV (✅ Implemented)

- Standard comma-separated format
- Quoted strings for special characters
- Array fields joined with semicolons

### JSON (✅ Implemented)

- Pretty-printed JSON array
- Full type preservation
- Easy to parse programmatically

### TXT (✅ Implemented)

- Human-readable plain text
- Pipe-separated fields
- Section headers

### XLSX (⏳ Pending)

- Excel spreadsheet format
- Requires ExcelJS integration
- Multiple sheets support

## Future Enhancements

- [ ] Streaming exports for very large guilds (100k+ members)
- [ ] XLSX format implementation
- [ ] Custom field selection UI
- [ ] Export templates/presets
- [ ] Scheduled exports
- [ ] Export diff/comparison
- [ ] Compression for large files
- [ ] Direct upload to cloud storage

## Testing

Each service is designed to be independently testable:

```typescript
// Mock Discord.js objects for testing
const mockGuild = {
  id: '123',
  name: 'Test Guild',
  memberCount: 100,
  members: {
    fetch: jest.fn(),
    cache: new Map(),
  },
};

// Test MemberFetcher
const fetcher = new MemberFetcher();
const result = await fetcher.fetchAll(mockGuild);
expect(result.totalFetched).toBe(100);
```

## Logging

All services use the centralized logger utility:

```typescript
import { logger } from '../utils/logger.js';

logger.info('Starting export...');
logger.debug('Detailed debug info');
logger.error('Error occurred:', error);
```

Log levels: `debug`, `info`, `warn`, `error`
