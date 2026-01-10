import { z } from 'zod';
import { DatabaseConnection } from '../utils/connection.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { SierraTool, ToolOutput, GetConnectionStringFn } from '../types/tool.js';

const ManageIndexesInputSchema = z.object({
  connectionString: z.string().optional().describe('PostgreSQL connection string (optional)'),
  operation: z.enum(['get', 'create', 'drop', 'reindex', 'analyze_usage']).describe('Operation: get (list indexes), create (new index), drop (remove index), reindex (rebuild), analyze_usage (find unused/duplicate)'),
  schema: z.string().optional().default('public').describe('Schema name (defaults to public)'),
  tableName: z.string().optional().describe('Table name (optional for get/analyze_usage, required for create)'),
  indexName: z.string().optional().describe('Index name (required for create/drop)'),
  columns: z.array(z.string()).optional().describe('Column names for the index (required for create operation)'),
  unique: z.boolean().optional().describe('Create unique index (for create operation)'),
  method: z.enum(['btree', 'hash', 'gist', 'spgist', 'gin', 'brin']).optional().describe('Index method (for create operation, defaults to btree)'),
  where: z.string().optional().describe('WHERE clause for partial index (for create operation)'),
  concurrent: z.boolean().optional().describe('Create/drop index concurrently (for create/drop operations)'),
  ifNotExists: z.boolean().optional().describe('Include IF NOT EXISTS clause (for create operation)'),
  ifExists: z.boolean().optional().describe('Include IF EXISTS clause (for drop operation)'),
  cascade: z.boolean().optional().describe('Include CASCADE clause (for drop operation)'),
  includeStats: z.boolean().optional().describe('Include usage statistics (for get operation)'),
  type: z.enum(['index', 'table', 'schema', 'database']).optional().describe('Type of target for reindex (required for reindex operation)'),
  target: z.string().optional().describe('Target name for reindex (required for reindex operation)'),
  showUnused: z.boolean().optional().describe('Include unused indexes (for analyze_usage operation)'),
  showDuplicates: z.boolean().optional().describe('Detect duplicate indexes (for analyze_usage operation)'),
  minSizeBytes: z.number().optional().describe('Minimum index size in bytes (for analyze_usage operation)')
});

type ManageIndexesInput = z.infer<typeof ManageIndexesInputSchema>;

export const manageIndexesTool: SierraTool = {
  name: 'sierra_manage_indexes',
  description: 'Manage PostgreSQL indexes - get, create, drop, reindex, and analyze usage with a single tool. Examples: operation="get" to list indexes, operation="create" with indexName, tableName, columns, operation="analyze_usage" for performance analysis',
  inputSchema: ManageIndexesInputSchema,
  execute: async (args: unknown, getConnectionStringVal: GetConnectionStringFn): Promise<ToolOutput> => {
    const {
      connectionString: connStringArg,
      operation,
      schema = 'public',
      tableName,
      indexName,
      columns,
      unique,
      method = 'btree',
      where,
      concurrent,
      ifNotExists,
      ifExists,
      cascade,
      includeStats,
      type,
      target,
      showUnused,
      showDuplicates,
      minSizeBytes
    } = args as ManageIndexesInput;

    const resolvedConnString = getConnectionStringVal(connStringArg);
    const db = DatabaseConnection.getInstance();

    try {
      await db.connect(resolvedConnString);

      switch (operation) {
        case 'get': {
          let query = `
            SELECT
              i.relname as index_name,
              t.relname as table_name,
              n.nspname as schema_name,
              am.amname as index_type,
              pg_get_indexdef(i.oid) as index_definition,
              pg_relation_size(i.oid) as index_size_bytes,
              pg_size_pretty(pg_relation_size(i.oid)) as index_size
          `;

          if (includeStats) {
            query += `,
              s.idx_scan as scans,
              s.idx_tup_read as tuples_read,
              s.idx_tup_fetch as tuples_fetched
            `;
          }

          query += `
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
          `;

          if (includeStats) {
            query += `
              LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
            `;
          }

          query += ` WHERE n.nspname = $1`;
          const params: unknown[] = [schema];

          if (tableName) {
            query += ` AND t.relname = $2`;
            params.push(tableName);
          }

          query += ` ORDER BY t.relname, i.relname`;

          const indexes = await db.query(query, params);
          return {
            content: [{
              type: 'text',
              text: `Found ${indexes.length} indexes.\n\n${JSON.stringify(indexes, null, 2)}`
            }]
          };
        }

        case 'create': {
          if (!indexName || !tableName || !columns || columns.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: indexName, tableName, and columns are required for create operation' }],
              isError: true
            };
          }

          const uniqueClause = unique ? 'UNIQUE ' : '';
          const concurrentClause = concurrent ? 'CONCURRENTLY ' : '';
          const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : '';
          const columnList = columns.map(c => `"${c}"`).join(', ');
          const whereClause = where ? ` WHERE ${where}` : '';

          const sql = `CREATE ${uniqueClause}INDEX ${concurrentClause}${ifNotExistsClause}"${indexName}" ON "${schema}"."${tableName}" USING ${method} (${columnList})${whereClause}`;

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Index "${indexName}" created successfully on table "${schema}"."${tableName}".`
            }]
          };
        }

        case 'drop': {
          if (!indexName) {
            return {
              content: [{ type: 'text', text: 'Error: indexName is required for drop operation' }],
              isError: true
            };
          }

          const concurrentClause = concurrent ? 'CONCURRENTLY ' : '';
          const ifExistsClause = ifExists ? 'IF EXISTS ' : '';
          const cascadeClause = cascade ? ' CASCADE' : '';

          const sql = `DROP INDEX ${concurrentClause}${ifExistsClause}"${schema}"."${indexName}"${cascadeClause}`;

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Index "${indexName}" dropped successfully.`
            }]
          };
        }

        case 'reindex': {
          if (!type || !target) {
            return {
              content: [{ type: 'text', text: 'Error: type and target are required for reindex operation' }],
              isError: true
            };
          }

          let sql = '';
          switch (type) {
            case 'index':
              sql = `REINDEX INDEX "${schema}"."${target}"`;
              break;
            case 'table':
              sql = `REINDEX TABLE "${schema}"."${target}"`;
              break;
            case 'schema':
              sql = `REINDEX SCHEMA "${target}"`;
              break;
            case 'database':
              sql = `REINDEX DATABASE "${target}"`;
              break;
          }

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Reindex completed for ${type} "${target}".`
            }]
          };
        }

        case 'analyze_usage': {
          const results: { unused?: unknown[]; duplicates?: unknown[] } = {};

          if (showUnused !== false) {
            let unusedQuery = `
              SELECT
                s.schemaname as schema_name,
                s.relname as table_name,
                s.indexrelname as index_name,
                s.idx_scan as scans,
                pg_relation_size(i.indexrelid) as size_bytes,
                pg_size_pretty(pg_relation_size(i.indexrelid)) as size
              FROM pg_stat_user_indexes s
              JOIN pg_index i ON s.indexrelid = i.indexrelid
              WHERE s.idx_scan = 0
                AND NOT i.indisunique
                AND NOT i.indisprimary
            `;

            if (minSizeBytes) {
              unusedQuery += ` AND pg_relation_size(i.indexrelid) >= ${minSizeBytes}`;
            }

            unusedQuery += ` ORDER BY pg_relation_size(i.indexrelid) DESC`;

            results.unused = await db.query(unusedQuery);
          }

          if (showDuplicates) {
            const duplicateQuery = `
              SELECT
                n.nspname as schema_name,
                c.relname as table_name,
                array_agg(i.relname) as duplicate_indexes,
                pg_get_indexdef(x.indexrelid) as index_definition
              FROM pg_index x
              JOIN pg_class c ON c.oid = x.indrelid
              JOIN pg_class i ON i.oid = x.indexrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
              GROUP BY n.nspname, c.relname, x.indkey, pg_get_indexdef(x.indexrelid)
              HAVING count(*) > 1
            `;

            results.duplicates = await db.query(duplicateQuery);
          }

          return {
            content: [{
              type: 'text',
              text: `Index usage analysis completed.\n\n${JSON.stringify(results, null, 2)}`
            }]
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown operation "${operation}"` }],
            isError: true
          };
      }

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error managing indexes: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    } finally {
      await db.disconnect();
    }
  }
};
