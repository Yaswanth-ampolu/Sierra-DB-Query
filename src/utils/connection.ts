import pkg from 'pg';
import type { Pool as PoolType, PoolClient as PoolClientType, PoolConfig, QueryResultRow } from 'pg';
const { Pool } = pkg;

const poolCache = new Map<string, PoolType>();

interface ConnectionOptions {
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statementTimeout?: number;
  queryTimeout?: number;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: PoolType | null = null;
  private client: PoolClientType | null = null;
  private connectionString = '';
  private lastError: Error | null = null;
  private connectionOptions: ConnectionOptions = {};

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(connectionString?: string, options: ConnectionOptions = {}): Promise<void> {
    try {
      const connString = connectionString || process.env.POSTGRES_CONNECTION_STRING;

      if (!connString) {
        throw new Error('No connection string provided and POSTGRES_CONNECTION_STRING environment variable is not set');
      }

      if (this.pool && this.connectionString === connString) {
        return;
      }

      if (this.pool) {
        await this.disconnect();
      }

      this.connectionString = connString;
      this.connectionOptions = options;

      if (poolCache.has(connString)) {
        this.pool = poolCache.get(connString) as PoolType;
      } else {
        const config: PoolConfig = {
          connectionString: connString,
          max: options.maxConnections || 20,
          idleTimeoutMillis: options.idleTimeoutMillis || 30000,
          connectionTimeoutMillis: options.connectionTimeoutMillis || 2000,
          allowExitOnIdle: true,
          ssl: options.ssl
        };

        this.pool = new Pool(config);

        this.pool.on('error', (err: Error) => {
          console.error('Unexpected error on idle client', err);
          this.lastError = err;
        });

        poolCache.set(connString, this.pool);
      }

      this.client = await this.pool.connect();

      if (options.statementTimeout) {
        await this.client.query(`SET statement_timeout = ${options.statementTimeout}`);
      }

      await this.client.query('SELECT 1');

    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));

      if (this.client) {
        this.client.release();
        this.client = null;
      }

      if (this.pool) {
        poolCache.delete(this.connectionString);
        await this.pool.end();
        this.pool = null;
      }

      throw new Error(`Failed to connect to database: ${this.lastError.message}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      this.client.release();
      this.client = null;
    }
    this.connectionString = '';
  }

  public async query<T extends QueryResultRow = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
    options: { timeout?: number } = {}
  ): Promise<T[]> {
    if (!this.client || !this.pool) {
      throw new Error('Not connected to database');
    }

    try {
      const queryConfig: { text: string; values: unknown[]; timeout?: number } = {
        text,
        values
      };

      if (options.timeout || this.connectionOptions.queryTimeout) {
        queryConfig.timeout = options.timeout || this.connectionOptions.queryTimeout;
      }

      const result = await this.client.query<T>(queryConfig);
      return result.rows;
    } catch (error) {
      this.lastError = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Query failed: ${this.lastError.message}`);
    }
  }

  public async queryOne<T extends QueryResultRow = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
    options: { timeout?: number } = {}
  ): Promise<T | null> {
    const rows = await this.query<T>(text, values, options);
    return rows.length > 0 ? rows[0] : null;
  }

  public async transaction<T>(callback: (client: PoolClientType) => Promise<T>): Promise<T> {
    if (!this.client || !this.pool) {
      throw new Error('Not connected to database');
    }

    try {
      await this.client.query('BEGIN');
      const result = await callback(this.client);
      await this.client.query('COMMIT');
      return result;
    } catch (error) {
      await this.client.query('ROLLBACK');
      this.lastError = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Transaction failed: ${this.lastError.message}`);
    }
  }

  public getPool(): PoolType | null {
    return this.pool;
  }

  public getClient(): PoolClientType | null {
    return this.client;
  }

  public isConnected(): boolean {
    return this.pool !== null && this.client !== null;
  }

  public static async cleanupPools(): Promise<void> {
    for (const [connectionString, pool] of poolCache.entries()) {
      try {
        await pool.end();
        poolCache.delete(connectionString);
      } catch (error) {
        console.error(`Error closing pool for ${connectionString}:`, error);
      }
    }
  }
}
