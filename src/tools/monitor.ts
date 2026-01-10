import { z } from 'zod';
import { DatabaseConnection } from '../utils/connection.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { SierraTool, ToolOutput, GetConnectionStringFn } from '../types/tool.js';

const MonitorDatabaseInputSchema = z.object({
  connectionString: z.string().optional().describe('PostgreSQL connection string (optional)'),
  includeQueries: z.boolean().optional().default(true).describe('Include active queries'),
  includeLocks: z.boolean().optional().default(true).describe('Include lock information'),
  includeTables: z.boolean().optional().default(true).describe('Include table statistics'),
  includeReplication: z.boolean().optional().default(false).describe('Include replication status'),
  alertThresholds: z.object({
    connectionPercentage: z.number().optional().describe('Connection usage percentage threshold'),
    longRunningQuerySeconds: z.number().optional().describe('Long-running query threshold in seconds'),
    deadTuplesPercentage: z.number().optional().describe('Dead tuples percentage threshold'),
    cacheHitRatio: z.number().optional().describe('Cache hit ratio threshold'),
    vacuumAge: z.number().optional().describe('Vacuum age threshold in days')
  }).optional().describe('Alert thresholds')
});

type MonitorDatabaseInput = z.infer<typeof MonitorDatabaseInputSchema>;

interface MonitoringResult {
  timestamp: string;
  connections: {
    active: number;
    idle: number;
    total: number;
    maxConnections: number;
    usagePercentage: number;
  };
  activeQueries?: Array<{
    pid: number;
    username: string;
    database: string;
    state: string;
    query: string;
    durationSeconds: number;
    waitEventType: string | null;
    waitEvent: string | null;
  }>;
  locks?: Array<{
    pid: number;
    lockType: string;
    database: string;
    relation: string | null;
    mode: string;
    granted: boolean;
  }>;
  tableStats?: Array<{
    schema: string;
    table: string;
    liveTuples: number;
    deadTuples: number;
    deadTuplesRatio: number;
    lastVacuum: Date | null;
    lastAutoVacuum: Date | null;
  }>;
  replication?: Array<{
    clientAddr: string | null;
    state: string;
    sentLsn: string;
    writeLsn: string;
    flushLsn: string;
    replayLsn: string;
    lagBytes: number;
  }>;
  alerts: string[];
}

export const monitorDatabaseTool: SierraTool = {
  name: 'sierra_monitor_database',
  description: 'Get real-time monitoring information for a PostgreSQL database including connections, queries, locks, and table statistics.',
  inputSchema: MonitorDatabaseInputSchema,
  execute: async (args: unknown, getConnectionStringVal: GetConnectionStringFn): Promise<ToolOutput> => {
    const {
      connectionString: connStringArg,
      includeQueries = true,
      includeLocks = true,
      includeTables = true,
      includeReplication = false,
      alertThresholds = {}
    } = args as MonitorDatabaseInput;

    const resolvedConnString = getConnectionStringVal(connStringArg);
    const db = DatabaseConnection.getInstance();

    try {
      await db.connect(resolvedConnString);

      const alerts: string[] = [];

      // Get connection stats
      const connStats = await db.queryOne<{
        active: number;
        idle: number;
        total: number;
        max_connections: number;
      }>(`
        SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle,
          (SELECT count(*) FROM pg_stat_activity) as total,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
      `);

      const connections = {
        active: connStats?.active || 0,
        idle: connStats?.idle || 0,
        total: connStats?.total || 0,
        maxConnections: connStats?.max_connections || 0,
        usagePercentage: connStats?.max_connections
          ? Math.round((connStats.total / connStats.max_connections) * 100)
          : 0
      };

      if (alertThresholds.connectionPercentage && connections.usagePercentage > alertThresholds.connectionPercentage) {
        alerts.push(`Connection usage ${connections.usagePercentage}% exceeds threshold ${alertThresholds.connectionPercentage}%`);
      }

      const result: MonitoringResult = {
        timestamp: new Date().toISOString(),
        connections,
        alerts
      };

      // Get active queries
      if (includeQueries) {
        const queries = await db.query<{
          pid: number;
          usename: string;
          datname: string;
          state: string;
          query: string;
          duration_seconds: number;
          wait_event_type: string | null;
          wait_event: string | null;
        }>(`
          SELECT
            pid,
            usename,
            datname,
            state,
            query,
            EXTRACT(EPOCH FROM (now() - query_start))::int as duration_seconds,
            wait_event_type,
            wait_event
          FROM pg_stat_activity
          WHERE state != 'idle'
            AND pid != pg_backend_pid()
          ORDER BY duration_seconds DESC
          LIMIT 50
        `);

        result.activeQueries = queries.map(q => ({
          pid: q.pid,
          username: q.usename,
          database: q.datname,
          state: q.state,
          query: q.query,
          durationSeconds: q.duration_seconds,
          waitEventType: q.wait_event_type,
          waitEvent: q.wait_event
        }));

        if (alertThresholds.longRunningQuerySeconds) {
          const longRunning = queries.filter(q => q.duration_seconds > alertThresholds.longRunningQuerySeconds!);
          if (longRunning.length > 0) {
            alerts.push(`${longRunning.length} queries running longer than ${alertThresholds.longRunningQuerySeconds}s`);
          }
        }
      }

      // Get lock information
      if (includeLocks) {
        const locks = await db.query<{
          pid: number;
          locktype: string;
          database: string;
          relation: string | null;
          mode: string;
          granted: boolean;
        }>(`
          SELECT
            l.pid,
            l.locktype,
            d.datname as database,
            c.relname as relation,
            l.mode,
            l.granted
          FROM pg_locks l
          LEFT JOIN pg_database d ON l.database = d.oid
          LEFT JOIN pg_class c ON l.relation = c.oid
          WHERE l.pid != pg_backend_pid()
          ORDER BY l.granted, l.pid
          LIMIT 100
        `);

        result.locks = locks.map(l => ({
          pid: l.pid,
          lockType: l.locktype,
          database: l.database,
          relation: l.relation,
          mode: l.mode,
          granted: l.granted
        }));

        const blockedLocks = locks.filter(l => !l.granted);
        if (blockedLocks.length > 0) {
          alerts.push(`${blockedLocks.length} blocked locks detected`);
        }
      }

      // Get table statistics
      if (includeTables) {
        const tableStats = await db.query<{
          schemaname: string;
          relname: string;
          n_live_tup: number;
          n_dead_tup: number;
          last_vacuum: Date | null;
          last_autovacuum: Date | null;
        }>(`
          SELECT
            schemaname,
            relname,
            n_live_tup,
            n_dead_tup,
            last_vacuum,
            last_autovacuum
          FROM pg_stat_user_tables
          WHERE n_live_tup > 0
          ORDER BY n_dead_tup DESC
          LIMIT 20
        `);

        result.tableStats = tableStats.map(t => {
          const deadTuplesRatio = t.n_live_tup > 0
            ? Math.round((t.n_dead_tup / t.n_live_tup) * 100)
            : 0;

          if (alertThresholds.deadTuplesPercentage && deadTuplesRatio > alertThresholds.deadTuplesPercentage) {
            alerts.push(`Table ${t.schemaname}.${t.relname} has ${deadTuplesRatio}% dead tuples`);
          }

          return {
            schema: t.schemaname,
            table: t.relname,
            liveTuples: t.n_live_tup,
            deadTuples: t.n_dead_tup,
            deadTuplesRatio,
            lastVacuum: t.last_vacuum,
            lastAutoVacuum: t.last_autovacuum
          };
        });
      }

      // Get replication status
      if (includeReplication) {
        const replicationStats = await db.query<{
          client_addr: string | null;
          state: string;
          sent_lsn: string;
          write_lsn: string;
          flush_lsn: string;
          replay_lsn: string;
          lag_bytes: number;
        }>(`
          SELECT
            client_addr,
            state,
            sent_lsn::text,
            write_lsn::text,
            flush_lsn::text,
            replay_lsn::text,
            (pg_wal_lsn_diff(sent_lsn, replay_lsn))::bigint as lag_bytes
          FROM pg_stat_replication
        `);

        result.replication = replicationStats.map(r => ({
          clientAddr: r.client_addr,
          state: r.state,
          sentLsn: r.sent_lsn,
          writeLsn: r.write_lsn,
          flushLsn: r.flush_lsn,
          replayLsn: r.replay_lsn,
          lagBytes: r.lag_bytes
        }));
      }

      return {
        content: [{
          type: 'text',
          text: `Database monitoring snapshot:\n\n${JSON.stringify(result, null, 2)}`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error monitoring database: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    } finally {
      await db.disconnect();
    }
  }
};
