import { z } from 'zod';
import { DatabaseConnection } from '../utils/connection.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { SierraTool, ToolOutput, GetConnectionStringFn } from '../types/tool.js';

const ManageConstraintsInputSchema = z.object({
  connectionString: z.string().optional().describe('PostgreSQL connection string (optional)'),
  operation: z.enum(['get', 'create_fk', 'drop_fk', 'create', 'drop']).describe('Operation: get (list constraints), create_fk (foreign key), drop_fk (drop foreign key), create (constraint), drop (constraint)'),
  schema: z.string().optional().default('public').describe('Schema name (defaults to public)'),
  tableName: z.string().optional().describe('Table name (optional filter for get, required for create_fk/drop_fk/create/drop)'),
  constraintName: z.string().optional().describe('Constraint name (required for create_fk/drop_fk/create/drop)'),
  constraintType: z.enum(['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK']).optional().describe('Filter by constraint type (for get operation)'),
  columnNames: z.array(z.string()).optional().describe('Column names in the table (required for create_fk)'),
  referencedTable: z.string().optional().describe('Referenced table name (required for create_fk)'),
  referencedSchema: z.string().optional().describe('Referenced table schema (for create_fk, defaults to same as table schema)'),
  referencedColumns: z.array(z.string()).optional().describe('Referenced column names (required for create_fk)'),
  onDelete: z.enum(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']).optional().describe('ON DELETE action (for create_fk)'),
  onUpdate: z.enum(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']).optional().describe('ON UPDATE action (for create_fk)'),
  deferrable: z.boolean().optional().describe('Make constraint deferrable (for create_fk/create operations)'),
  initiallyDeferred: z.boolean().optional().describe('Initially deferred (for create_fk/create operations)'),
  ifExists: z.boolean().optional().describe('Include IF EXISTS clause (for drop_fk/drop operations)'),
  cascade: z.boolean().optional().describe('Include CASCADE clause (for drop_fk/drop operations)'),
  constraintTypeCreate: z.enum(['unique', 'check', 'primary_key']).optional().describe('Type of constraint to create (for create operation)'),
  checkExpression: z.string().optional().describe('Check expression (for create operation with check constraints)')
});

type ManageConstraintsInput = z.infer<typeof ManageConstraintsInputSchema>;

export const manageConstraintsTool: SierraTool = {
  name: 'sierra_manage_constraints',
  description: 'Manage PostgreSQL constraints - get, create foreign keys, drop foreign keys, create constraints, drop constraints. Examples: operation="get" to list constraints, operation="create_fk" with constraintName, tableName, columnNames, referencedTable, referencedColumns',
  inputSchema: ManageConstraintsInputSchema,
  execute: async (args: unknown, getConnectionStringVal: GetConnectionStringFn): Promise<ToolOutput> => {
    const {
      connectionString: connStringArg,
      operation,
      schema = 'public',
      tableName,
      constraintName,
      constraintType,
      columnNames,
      referencedTable,
      referencedSchema,
      referencedColumns,
      onDelete,
      onUpdate,
      deferrable,
      initiallyDeferred,
      ifExists,
      cascade,
      constraintTypeCreate,
      checkExpression
    } = args as ManageConstraintsInput;

    const resolvedConnString = getConnectionStringVal(connStringArg);
    const db = DatabaseConnection.getInstance();

    try {
      await db.connect(resolvedConnString);

      switch (operation) {
        case 'get': {
          let query = `
            SELECT
              c.conname as constraint_name,
              n.nspname as schema_name,
              t.relname as table_name,
              CASE c.contype
                WHEN 'p' THEN 'PRIMARY KEY'
                WHEN 'f' THEN 'FOREIGN KEY'
                WHEN 'u' THEN 'UNIQUE'
                WHEN 'c' THEN 'CHECK'
                WHEN 'x' THEN 'EXCLUSION'
                ELSE c.contype::text
              END as constraint_type,
              pg_get_constraintdef(c.oid) as definition,
              c.condeferrable as is_deferrable,
              c.condeferred as is_deferred
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE n.nspname = $1
          `;

          const params: unknown[] = [schema];

          if (tableName) {
            query += ` AND t.relname = $${params.length + 1}`;
            params.push(tableName);
          }

          if (constraintType) {
            const typeMap: Record<string, string> = {
              'PRIMARY KEY': 'p',
              'FOREIGN KEY': 'f',
              'UNIQUE': 'u',
              'CHECK': 'c'
            };
            query += ` AND c.contype = $${params.length + 1}`;
            params.push(typeMap[constraintType]);
          }

          query += ` ORDER BY t.relname, c.conname`;

          const constraints = await db.query(query, params);
          return {
            content: [{
              type: 'text',
              text: `Found ${constraints.length} constraints.\n\n${JSON.stringify(constraints, null, 2)}`
            }]
          };
        }

        case 'create_fk': {
          if (!constraintName || !tableName || !columnNames || !referencedTable || !referencedColumns) {
            return {
              content: [{ type: 'text', text: 'Error: constraintName, tableName, columnNames, referencedTable, and referencedColumns are required for create_fk operation' }],
              isError: true
            };
          }

          const refSchema = referencedSchema || schema;
          const columns = columnNames.map(c => `"${c}"`).join(', ');
          const refColumns = referencedColumns.map(c => `"${c}"`).join(', ');

          let sql = `ALTER TABLE "${schema}"."${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY (${columns}) REFERENCES "${refSchema}"."${referencedTable}" (${refColumns})`;

          if (onDelete) {
            sql += ` ON DELETE ${onDelete}`;
          }
          if (onUpdate) {
            sql += ` ON UPDATE ${onUpdate}`;
          }
          if (deferrable) {
            sql += ' DEFERRABLE';
            if (initiallyDeferred) {
              sql += ' INITIALLY DEFERRED';
            }
          }

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Foreign key constraint "${constraintName}" created successfully.`
            }]
          };
        }

        case 'drop_fk':
        case 'drop': {
          if (!constraintName || !tableName) {
            return {
              content: [{ type: 'text', text: 'Error: constraintName and tableName are required for drop operation' }],
              isError: true
            };
          }

          const ifExistsClause = ifExists ? 'IF EXISTS ' : '';
          const cascadeClause = cascade ? ' CASCADE' : '';

          const sql = `ALTER TABLE "${schema}"."${tableName}" DROP CONSTRAINT ${ifExistsClause}"${constraintName}"${cascadeClause}`;

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Constraint "${constraintName}" dropped successfully.`
            }]
          };
        }

        case 'create': {
          if (!constraintName || !tableName || !constraintTypeCreate) {
            return {
              content: [{ type: 'text', text: 'Error: constraintName, tableName, and constraintTypeCreate are required for create operation' }],
              isError: true
            };
          }

          let sql = `ALTER TABLE "${schema}"."${tableName}" ADD CONSTRAINT "${constraintName}"`;

          switch (constraintTypeCreate) {
            case 'unique':
              if (!columnNames || columnNames.length === 0) {
                return {
                  content: [{ type: 'text', text: 'Error: columnNames are required for unique constraint' }],
                  isError: true
                };
              }
              sql += ` UNIQUE (${columnNames.map(c => `"${c}"`).join(', ')})`;
              break;

            case 'check':
              if (!checkExpression) {
                return {
                  content: [{ type: 'text', text: 'Error: checkExpression is required for check constraint' }],
                  isError: true
                };
              }
              sql += ` CHECK (${checkExpression})`;
              break;

            case 'primary_key':
              if (!columnNames || columnNames.length === 0) {
                return {
                  content: [{ type: 'text', text: 'Error: columnNames are required for primary key constraint' }],
                  isError: true
                };
              }
              sql += ` PRIMARY KEY (${columnNames.map(c => `"${c}"`).join(', ')})`;
              break;
          }

          if (deferrable) {
            sql += ' DEFERRABLE';
            if (initiallyDeferred) {
              sql += ' INITIALLY DEFERRED';
            }
          }

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Constraint "${constraintName}" created successfully.`
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
          text: `Error managing constraints: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    } finally {
      await db.disconnect();
    }
  }
};
