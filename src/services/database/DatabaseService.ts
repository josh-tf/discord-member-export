import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { DatabaseConfig } from '../../types/database.types.js';
import { logger } from '../../utils/logger.js';

/**
 * DatabaseService - Manages SQLite database operations using sql.js
 *
 * sql.js is used instead of better-sqlite3 for WSL compatibility (no native modules).
 * Database is loaded into memory on startup and persisted to disk on changes.
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private config: DatabaseConfig;
  private isInitialized = false;
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly SAVE_DEBOUNCE_MS = 1000; // Auto-save after 1 second of inactivity

  private constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Get singleton instance of DatabaseService
   */
  public static getInstance(config?: DatabaseConfig): DatabaseService {
    if (!DatabaseService.instance) {
      if (!config) {
        throw new Error('DatabaseService requires config on first initialization');
      }
      DatabaseService.instance = new DatabaseService(config);
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize the database service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('DatabaseService already initialized');
      return;
    }

    try {
      logger.info('Initializing DatabaseService with sql.js...');

      // Initialize sql.js
      this.SQL = await initSqlJs();
      logger.debug('sql.js initialized successfully');

      // Ensure database directory exists
      const dbDir = dirname(this.config.path);
      if (!existsSync(dbDir)) {
        await mkdir(dbDir, { recursive: true });
        logger.debug(`Created database directory: ${dbDir}`);
      }

      // Load existing database or create new one
      if (existsSync(this.config.path)) {
        logger.info(`Loading existing database from ${this.config.path}`);
        const buffer = await readFile(this.config.path);
        this.db = new this.SQL.Database(buffer);
      } else {
        logger.info('Creating new database');
        this.db = new this.SQL.Database();
      }

      // Run migrations
      await this.runMigrations();

      // Enable foreign keys
      this.db.run('PRAGMA foreign_keys = ON;');

      // Note: WAL mode is not available in sql.js (in-memory database)
      if (this.config.walMode) {
        logger.warn('WAL mode not supported in sql.js - using default journaling');
      }

      // Save database to disk
      await this.saveDatabase();

      this.isInitialized = true;
      logger.info('DatabaseService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize DatabaseService:', error);
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      logger.info('Running database migrations...');

      // Read migration file
      const migrationPath = join(
        dirname(new URL(import.meta.url).pathname),
        'migrations',
        '001_initial_schema.sql',
      );

      const migrationSQL = await readFile(migrationPath, 'utf-8');

      // Execute migration
      this.db.exec(migrationSQL);

      logger.info('Database migrations completed successfully');
    } catch (error) {
      logger.error('Failed to run migrations:', error);
      throw error;
    }
  }

  /**
   * Save database to disk
   */
  private async saveDatabase(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      await writeFile(this.config.path, buffer);
      logger.debug(`Database saved to ${this.config.path}`);
    } catch (error) {
      logger.error('Failed to save database:', error);
      throw error;
    }
  }

  /**
   * Schedule auto-save with debouncing
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        await this.saveDatabase();
      } catch (error) {
        logger.error('Auto-save failed:', error);
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Execute a SQL query that returns results
   */
  public query<T = unknown>(sql: string, params: (string | number | null)[] = []): T[] {
    this.ensureInitialized();

    try {
      const stmt = (this.db as Database).prepare(sql);
      stmt.bind(params);

      const results: T[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as T;
        results.push(row);
      }
      stmt.free();

      return results;
    } catch (error) {
      logger.error(`Query failed: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Execute a SQL query that doesn't return results (INSERT, UPDATE, DELETE)
   */
  public run(
    sql: string,
    params: (string | number | null)[] = [],
  ): { changes: number; lastInsertId: number } {
    this.ensureInitialized();

    try {
      const db = this.db as Database;
      db.run(sql, params);

      // Get changes and last insert ID
      const changes = (db.exec('SELECT changes() as changes')[0]?.values[0]?.[0] as number) || 0;
      const lastInsertId =
        (db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number) || 0;

      // Schedule auto-save
      this.scheduleSave();

      return { changes, lastInsertId };
    } catch (error) {
      logger.error(`Run failed: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Execute a single SQL query (for queries that don't need results)
   */
  public exec(sql: string): void {
    this.ensureInitialized();

    try {
      (this.db as Database).exec(sql);
      this.scheduleSave();
    } catch (error) {
      logger.error(`Exec failed: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Get a single row from a query
   */
  public get<T = unknown>(sql: string, params: (string | number | null)[] = []): T | null {
    const results = this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get all rows from a query
   */
  public all<T = unknown>(sql: string, params: (string | number | null)[] = []): T[] {
    return this.query<T>(sql, params);
  }

  /**
   * Execute multiple statements in a transaction
   */
  public async transaction<T>(callback: () => T | Promise<T>): Promise<T> {
    this.ensureInitialized();

    try {
      this.exec('BEGIN TRANSACTION');
      const result = await callback();
      this.exec('COMMIT');
      return result;
    } catch (error) {
      this.exec('ROLLBACK');
      logger.error('Transaction failed and was rolled back:', error);
      throw error;
    }
  }

  /**
   * Create a backup of the database
   */
  public async backup(): Promise<string> {
    this.ensureInitialized();

    if (!this.config.backupEnabled || !this.config.backupPath) {
      throw new Error('Backup is not enabled in configuration');
    }

    try {
      // Ensure backup directory exists
      if (!existsSync(this.config.backupPath)) {
        await mkdir(this.config.backupPath, { recursive: true });
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `backup_${timestamp}.db`;
      const backupFilePath = join(this.config.backupPath, backupFileName);

      // Save current state first
      await this.saveDatabase();

      // Copy database file to backup location
      await copyFile(this.config.path, backupFilePath);

      logger.info(`Database backup created: ${backupFilePath}`);
      return backupFilePath;
    } catch (error) {
      logger.error('Failed to create database backup:', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Clear any pending save timeout
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }

      // Save final state
      await this.saveDatabase();

      // Close database
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this.isInitialized = false;
      logger.info('DatabaseService closed successfully');
    } catch (error) {
      logger.error('Failed to close DatabaseService:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  public getStats(): {
    isInitialized: boolean;
    databasePath: string;
    backupEnabled: boolean;
  } {
    return {
      isInitialized: this.isInitialized,
      databasePath: this.config.path,
      backupEnabled: this.config.backupEnabled,
    };
  }

  /**
   * Ensure database is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.db) {
      throw new Error('DatabaseService not initialized. Call initialize() first.');
    }
  }

  /**
   * Get the underlying Database instance (for advanced operations)
   */
  public getDatabase(): Database {
    this.ensureInitialized();
    return this.db as Database;
  }
}
