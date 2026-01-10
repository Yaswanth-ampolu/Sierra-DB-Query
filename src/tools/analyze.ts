import { z } from 'zod';
import { DatabaseConnection } from '../utils/connection.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { SierraTool, ToolOutput, GetConnectionStringFn } from '../types/tool.js';

const AnalyzeDatabaseInputSchema = z.object({
  connectionString: z.string().optional().describe('PostgreSQL connection string (optional)'),
  analysisType: z.enum(['configuration', 'performance', 'security']).describe('Type of analysis to perform')
});

type AnalyzeDatabaseInput = z.infer<typeof AnalyzeDatabaseInputSchema>;

interface AnalysisResult {
  type: string;
  timestamp: string;
  findings: unknown;
}

async function analyzeConfiguration(db: DatabaseConnection): Promise<unknown> {
  const settings = await db.query<{
    name: string;
    setting: string;
    unit: string | null;
    category: string;
    short_desc: string;
  }>(`
    SELECT name, setting, unit, category, short_desc
    FROM pg_settings
    WHERE name IN (
      'max_connections', 'shared_buffers', 'effective_cache_size',
      'maintenance_work_mem', 'checkpoint_completion_target',
      'wal_buffers', 'default_statistics_target', 'random_page_cost',
      'effective_io_concurrency', 'work_mem', 'min_wal_size', 'max_wal_size',
      'max_worker_processes', 'max_parallel_workers_per_gather',
      'max_parallel_workers', 'max_parallel_maintenance_workers'
    )
    ORDER BY category, name
  `);

  const version = await db.queryOne<{ version: string }>('SELECT version()');

  return {
    version: version?.version,
    settings: settings.reduce((acc, s) => {
      acc[s.name] = {
        value: s.setting,
        unit: s.unit,
        category: s.category,
        description: s.short_desc
      };
      return acc;
    }, {} as Record<string, unknown>)
  };
}

async function analyzePerformance(db: DatabaseConnection): Promise<unknown> {
  const tableStats = await db.query<{
    schemaname: string;
    relname: string;
    seq_scan: number;
    seq_tup_read: number;
    idx_scan: number;
    idx_tup_fetch: number;
    n_tup_ins: number;
    n_tup_upd: number;
    n_tup_del: number;
    n_live_tup: number;
    n_dead_tup: number;
    last_vacuum: Date | null;
    last_autovacuum: Date | null;
    last_analyze: Date | null;
    last_autoanalyze: Date | null;
  }>(`
    SELECT
      schemaname, relname, seq_scan, seq_tup_read,
      idx_scan, idx_tup_fetch, n_tup_ins, n_tup_upd, n_tup_del,
      n_live_tup, n_dead_tup, last_vacuum, last_autovacuum,
      last_analyze, last_autoanalyze
    FROM pg_stat_user_tables
    ORDER BY n_dead_tup DESC
    LIMIT 20
  `);

  const indexStats = await db.query<{
    schemaname: string;
    relname: string;
    indexrelname: string;
    idx_scan: number;
    idx_tup_read: number;
    idx_tup_fetch: number;
  }>(`
    SELECT schemaname, relname, indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
    FROM pg_stat_user_indexes
    ORDER BY idx_scan ASC
    LIMIT 20
  `);

  const cacheHitRatio = await db.queryOne<{
    ratio: number;
  }>(`
    SELECT
      CASE
        WHEN (sum(heap_blks_hit) + sum(heap_blks_read)) = 0 THEN 0
        ELSE round(sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100, 2)
      END as ratio
    FROM pg_statio_user_tables
  `);

  const databaseSize = await db.queryOne<{ size: string }>(`
    SELECT pg_size_pretty(pg_database_size(current_database())) as size
  `);

  return {
    databaseSize: databaseSize?.size,
    cacheHitRatio: cacheHitRatio?.ratio,
    tableStats,
    indexStats
  };
}

async function analyzeSecurity(db: DatabaseConnection): Promise<unknown> {
  const roles = await db.query<{
    rolname: string;
    rolsuper: boolean;
    rolinherit: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolcanlogin: boolean;
    rolreplication: boolean;
    rolconnlimit: number;
  }>(`
    SELECT rolname, rolsuper, rolinherit, rolcreaterole,
           rolcreatedb, rolcanlogin, rolreplication, rolconnlimit
    FROM pg_roles
    WHERE rolname NOT LIKE 'pg_%'
    ORDER BY rolname
  `);

  const superusers = roles.filter(r => r.rolsuper);

  const tablesWithoutRLS = await db.query<{
    schemaname: string;
    tablename: string;
  }>(`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    AND tablename NOT IN (
      SELECT relname FROM pg_class
      WHERE relrowsecurity = true
    )
  `);

  const sslStatus = await db.queryOne<{ ssl: string }>(`
    SELECT setting as ssl FROM pg_settings WHERE name = 'ssl'
  `);

  return {
    roles,
    superuserCount: superusers.length,
    superusers: superusers.map(s => s.rolname),
    tablesWithoutRLS: tablesWithoutRLS.length,
    sslEnabled: sslStatus?.ssl === 'on'
  };
}

export const analyzeDatabaseTool: SierraTool = {
  name: 'sierra_analyze_database',
  description: 'Analyze PostgreSQL database configuration and performance. analysisType can be "configuration", "performance", or "security".',
  inputSchema: AnalyzeDatabaseInputSchema,
  execute: async (args: unknown, getConnectionStringVal: GetConnectionStringFn): Promise<ToolOutput> => {
    const { connectionString: connStringArg, analysisType } = args as AnalyzeDatabaseInput;
    const resolvedConnString = getConnectionStringVal(connStringArg);
    const db = DatabaseConnection.getInstance();

    try {
      await db.connect(resolvedConnString);

      let findings: unknown;

      switch (analysisType) {
        case 'configuration':
          findings = await analyzeConfiguration(db);
          break;
        case 'performance':
          findings = await analyzePerformance(db);
          break;
        case 'security':
          findings = await analyzeSecurity(db);
          break;
        default:
          throw new McpError(ErrorCode.InvalidParams, `Unknown analysis type: ${analysisType}`);
      }

      const result: AnalysisResult = {
        type: analysisType,
        timestamp: new Date().toISOString(),
        findings
      };

      return {
        content: [{
          type: 'text',
          text: `Database ${analysisType} analysis completed.\n\n${JSON.stringify(result, null, 2)}`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error analyzing database: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    } finally {
      await db.disconnect();
    }
  }
};
