# Database Layer

This directory contains the database layer implementation using **sql.js** for SQLite database operations.

## Why sql.js?

We're using `sql.js` instead of `better-sqlite3` because it's a pure JavaScript implementation without native modules, making it compatible with WSL and various environments without compilation issues.

## Architecture

- **DatabaseService**: Core database service that handles sql.js initialization, query execution, transactions, and persistence
- **Repositories**: Higher-level abstractions for working with specific tables
- **Migrations**: SQL migration files for schema versioning

## Files

```
database/
├── DatabaseService.ts           # Core database service
├── migrations/
│   └── 001_initial_schema.sql   # Initial schema with all tables
├── repositories/
│   ├── ExportHistoryRepository.ts  # Export history operations
│   └── index.ts
├── index.ts                     # Main exports
└── README.md                    # This file
```

## Usage Example

```typescript
import { BotConfig } from '../../config/bot.config.js';
import { DatabaseService, ExportHistoryRepository } from './index.js';

// Initialize database service
const db = DatabaseService.getInstance(BotConfig.database);
await db.initialize();

// Create repository
const exportHistory = new ExportHistoryRepository(db);

// Create a new export record
const exportId = exportHistory.create({
  guildId: '123456789',
  userId: '987654321',
  format: 'csv',
  totalMembers: 1000,
  filteredMembers: 500,
  filtersApplied: {
    roles: ['123', '456'],
    includeOnline: true,
  },
});

// Update export status
exportHistory.updateStatus(exportId, 'in_progress');

// Complete export
exportHistory.complete(exportId, {
  totalMembers: 1000,
  filteredMembers: 500,
  fileSize: 1024 * 50, // 50 KB
  durationMs: 5000, // 5 seconds
});

// Query export history
const guildExports = exportHistory.getByGuild('123456789', { limit: 10 });
const stats = exportHistory.getGuildStats('123456789');

// Backup database
const backupPath = await db.backup();

// Close database (important for cleanup)
await db.close();
```

## Key Features

### DatabaseService

- **Singleton pattern**: Single instance across the application
- **Auto-save**: Automatically saves to disk after modifications (1-second debounce)
- **Transaction support**: ACID-compliant transactions
- **Backup support**: Create timestamped backups
- **Query methods**: `query()`, `run()`, `exec()`, `get()`, `all()`

### ExportHistoryRepository

- **CRUD operations**: Create, read, update, delete export records
- **Status management**: Update export status with error handling
- **Statistics**: Get aggregated stats per guild
- **Filtering**: Query by guild, user, status with pagination
- **Cleanup**: Delete old records

## Database Schema

### Tables

1. **exports**: Export operation history
2. **member_snapshots**: Daily member count snapshots
3. **role_stats**: Role distribution per day
4. **export_queue**: Export queue management
5. **guild_settings**: Per-guild configuration
6. **schema_migrations**: Migration tracking

See [001_initial_schema.sql](./migrations/001_initial_schema.sql) for full schema details.

## Performance Considerations

### sql.js Specifics

- Database is loaded entirely into memory on startup
- Changes are saved to disk with 1-second debounce
- No WAL mode (in-memory database limitation)
- Excellent read performance, good write performance for moderate loads

### Best Practices

1. **Use transactions** for multiple related writes
2. **Batch operations** when possible
3. **Close connections** properly on shutdown
4. **Regular backups** for data safety
5. **Monitor memory** usage for large databases

## Migration Management

Migrations are SQL files in the `migrations/` directory with the naming convention:

```
{version}_{description}.sql
```

The `schema_migrations` table tracks applied migrations.

## Error Handling

All database operations include try-catch blocks with appropriate logging. Errors are logged and re-thrown for handling at higher levels.

## Testing

When testing, you can use an in-memory database:

```typescript
const testDb = DatabaseService.getInstance({
  path: ':memory:',
  walMode: false,
  backupEnabled: false,
});
```

## Future Enhancements

- Additional repositories (MemberSnapshots, RoleStats, etc.)
- Query builder for complex queries
- Migration runner service
- Connection pooling (if needed for multiple instances)
- Read replicas for analytics queries
