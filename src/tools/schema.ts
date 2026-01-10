import { DatabaseConnection } from '../utils/connection.js';
import { z } from 'zod';
import type { SierraTool, GetConnectionStringFn, ToolOutput } from '../types/tool.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { PoolClient } from 'pg';

interface TableInfo {
  tableName: string;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  indexes: IndexInfo[];
}

interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
}

interface ConstraintInfo {
  name: string;
  type: string;
  definition: string;
}

interface IndexInfo {
  name: string;
  definition: string;
}

interface EnumInfo {
  enum_schema: string;
  enum_name: string;
  enum_values: string[];
}

const GetSchemaInfoInputSchema = z.object({
  connectionString: z.string().optional(),
  tableName: z.string().optional().describe("Optional table name to get detailed schema for"),
});
type GetSchemaInfoInput = z.infer<typeof GetSchemaInfoInputSchema>;

async function executeGetSchemaInfo(
  input: GetSchemaInfoInput,
  getConnectionString: GetConnectionStringFn
): Promise<TableInfo | string[]> {
  const resolvedConnectionString = getConnectionString(input.connectionString);
  const db = DatabaseConnection.getInstance();
  const { tableName } = input;

  try {
    await db.connect(resolvedConnectionString);

    if (tableName) {
      return await getTableInfo(db, tableName);
    }

    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    return tables.map(t => t.table_name);

  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to get schema information: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await db.disconnect();
  }
}

const CreateTableColumnSchema = z.object({
  name: z.string(),
  type: z.string().describe("PostgreSQL data type"),
  nullable: z.boolean().optional(),
  default: z.string().optional().describe("Default value expression"),
});

const CreateTableInputSchema = z.object({
  connectionString: z.string().optional(),
  tableName: z.string(),
  columns: z.array(CreateTableColumnSchema).min(1),
});
type CreateTableInput = z.infer<typeof CreateTableInputSchema>;

async function executeCreateTable(
  input: CreateTableInput,
  getConnectionString: GetConnectionStringFn
): Promise<{ tableName: string; columns: z.infer<typeof CreateTableColumnSchema>[] }> {
  const resolvedConnectionString = getConnectionString(input.connectionString);
  const db = DatabaseConnection.getInstance();
  const { tableName, columns } = input;

  try {
    await db.connect(resolvedConnectionString);

    const columnDefs = columns.map(col => {
      let def = `"${col.name}" ${col.type}`;
      if (col.nullable === false) def += ' NOT NULL';
      if (col.default !== undefined) def += ` DEFAULT ${col.default}`;
      return def;
    }).join(', ');

    const createTableSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs})`;

    await db.query(createTableSQL);

    return { tableName, columns };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to create table: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await db.disconnect();
  }
}

const AlterTableOperationSchema = z.object({
  type: z.enum(['add', 'alter', 'drop']),
  columnName: z.string(),
  dataType: z.string().optional().describe("PostgreSQL data type (for add/alter)"),
  nullable: z.boolean().optional().describe("Whether the column can be NULL (for add/alter)"),
  default: z.string().optional().describe("Default value expression (for add/alter)"),
});

const AlterTableInputSchema = z.object({
  connectionString: z.string().optional(),
  tableName: z.string(),
  operations: z.array(AlterTableOperationSchema).min(1),
});
type AlterTableInput = z.infer<typeof AlterTableInputSchema>;

async function executeAlterTable(
  input: AlterTableInput,
  getConnectionString: GetConnectionStringFn
): Promise<{ tableName: string; operations: z.infer<typeof AlterTableOperationSchema>[] }> {
  const resolvedConnectionString = getConnectionString(input.connectionString);
  const db = DatabaseConnection.getInstance();
  const { tableName, operations } = input;

  try {
    await db.connect(resolvedConnectionString);

    await db.transaction(async (client: PoolClient) => {
      for (const op of operations) {
        let sql = '';
        const colNameQuoted = `"${op.columnName}"`;

        switch (op.type) {
          case 'add':
            if (!op.dataType) throw new Error('Data type is required for ADD operation');
            sql = `ALTER TABLE "${tableName}" ADD COLUMN ${colNameQuoted} ${op.dataType}`;
            if (op.nullable === false) sql += ' NOT NULL';
            if (op.default !== undefined) sql += ` DEFAULT ${op.default}`;
            break;

          case 'alter': {
            sql = `ALTER TABLE "${tableName}" ALTER COLUMN ${colNameQuoted}`;
            const alterActions: string[] = [];
            if (op.dataType) alterActions.push(`TYPE ${op.dataType}`);
            if (op.nullable !== undefined) {
              alterActions.push(op.nullable ? 'DROP NOT NULL' : 'SET NOT NULL');
            }
            if (op.default !== undefined) {
              alterActions.push(op.default === null || op.default === ''
                ? 'DROP DEFAULT'
                : `SET DEFAULT ${op.default}`);
            }
            if (alterActions.length === 0) throw new Error('No alter operation specified for column.');
            sql += ` ${alterActions.join(' ')}`;
            break;
          }

          case 'drop':
            sql = `ALTER TABLE "${tableName}" DROP COLUMN ${colNameQuoted}`;
            break;
        }
        if (sql) {
            await client.query(sql);
        }
      }
    });

    return { tableName, operations };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to alter table: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await db.disconnect();
  }
}

async function getTableInfo(db: DatabaseConnection, tableName: string): Promise<TableInfo> {
  const columns = await db.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );

  const constraints = await db.query<{
    constraint_name: string;
    constraint_type: string;
    definition: string;
  }>(
    `SELECT
       c.conname as constraint_name,
       CASE
         WHEN c.contype = 'p' THEN 'PRIMARY KEY'
         WHEN c.contype = 'f' THEN 'FOREIGN KEY'
         WHEN c.contype = 'u' THEN 'UNIQUE'
         WHEN c.contype = 'c' THEN 'CHECK'
         ELSE c.contype::text
       END as constraint_type,
       pg_get_constraintdef(c.oid) as definition
     FROM pg_constraint c
     JOIN pg_namespace n ON n.oid = c.connamespace
     JOIN pg_class cl ON cl.oid = c.conrelid
     WHERE n.nspname = 'public' AND cl.relname = $1`,
    [tableName]
  );

  const indexes = await db.query<{
    indexname: string;
    indexdef: string;
  }>(
    `SELECT
       i.relname as indexname,
       pg_get_indexdef(i.oid) as indexdef
     FROM pg_index x
     JOIN pg_class c ON c.oid = x.indrelid
     JOIN pg_class i ON i.oid = x.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public' AND c.relname = $1`,
    [tableName]
  );

  return {
    tableName,
    columns: columns.map(col => ({
      name: col.column_name,
      dataType: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default
    })),
    constraints: constraints.map(con => ({
      name: con.constraint_name,
      type: con.constraint_type,
      definition: con.definition
    })),
    indexes: indexes.map(idx => ({
      name: idx.indexname,
      definition: idx.indexdef
    }))
  };
}

async function executeGetEnumsInSchema(
  connectionString: string,
  schema = 'public',
  enumName?: string,
  getConnectionString?: GetConnectionStringFn
): Promise<EnumInfo[]> {
  const resolvedConnectionString = getConnectionString ? getConnectionString(connectionString) : connectionString;
  const db = DatabaseConnection.getInstance();
  try {
    await db.connect(resolvedConnectionString);
    let query = `
      SELECT
          n.nspname as enum_schema,
          t.typname as enum_name,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1 AND t.typtype = 'e'
    `;
    const params: (string | undefined)[] = [schema];

    if (enumName) {
      query += ' AND t.typname = $2';
      params.push(enumName);
    }

    query += ' GROUP BY n.nspname, t.typname ORDER BY n.nspname, t.typname;';

    const result = await db.query<EnumInfo>(query, params.filter(p => p !== undefined) as string[]);
    return result;

  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to fetch ENUMs: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await db.disconnect();
  }
}

async function executeCreateEnumInSchema(
  connectionString: string,
  enumName: string,
  values: string[],
  schema = 'public',
  ifNotExists = false,
  getConnectionString?: GetConnectionStringFn
): Promise<{ schema: string; enumName: string; values: string[]}> {
  const resolvedConnectionString = getConnectionString ? getConnectionString(connectionString) : connectionString;
  const db = DatabaseConnection.getInstance();
  try {
    await db.connect(resolvedConnectionString);
    const qualifiedSchema = `"${schema}"`;
    const qualifiedEnumName = `"${enumName}"`;
    const fullEnumName = `${qualifiedSchema}.${qualifiedEnumName}`;
    const valuesPlaceholders = values.map((_: string, i: number) => `$${i + 1}`).join(', ');
    const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS' : '';

    const query = `CREATE TYPE ${ifNotExistsClause} ${fullEnumName} AS ENUM (${valuesPlaceholders});`;

    await db.query(query, values);
    return { schema, enumName, values };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to create ENUM ${enumName}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
      await db.disconnect();
  }
}

export const manageSchemaTools: SierraTool = {
  name: 'sierra_manage_schema',
  description: 'Manage PostgreSQL schema - get schema info, create/alter tables, manage enums. Examples: operation="get_info" for table lists, operation="create_table" with tableName and columns, operation="get_enums" to list enums, operation="create_enum" with enumName and values',
  inputSchema: z.object({
    connectionString: z.string().optional().describe('PostgreSQL connection string (optional)'),
    operation: z.enum(['get_info', 'create_table', 'alter_table', 'get_enums', 'create_enum']).describe('Operation: get_info (schema/table info), create_table (new table), alter_table (modify table), get_enums (list ENUMs), create_enum (new ENUM)'),
    tableName: z.string().optional().describe('Table name (optional for get_info to get specific table info, required for create_table/alter_table)'),
    schema: z.string().optional().describe('Schema name (defaults to public)'),
    columns: z.array(z.object({
      name: z.string(),
      type: z.string().describe("PostgreSQL data type"),
      nullable: z.boolean().optional(),
      default: z.string().optional().describe("Default value expression"),
    })).optional().describe('Column definitions (required for create_table)'),
    operations: z.array(z.object({
      type: z.enum(['add', 'alter', 'drop']),
      columnName: z.string(),
      dataType: z.string().optional().describe("PostgreSQL data type (for add/alter)"),
      nullable: z.boolean().optional().describe("Whether the column can be NULL (for add/alter)"),
      default: z.string().optional().describe("Default value expression (for add/alter)"),
    })).optional().describe('Alter operations (required for alter_table)'),
    enumName: z.string().optional().describe('ENUM name (optional for get_enums to filter, required for create_enum)'),
    values: z.array(z.string()).optional().describe('ENUM values (required for create_enum)'),
    ifNotExists: z.boolean().optional().describe('Include IF NOT EXISTS clause (for create_enum)')
  }),
  execute: async (args: unknown, getConnectionStringVal: GetConnectionStringFn): Promise<ToolOutput> => {
    const {
      connectionString: connStringArg,
      operation,
      tableName,
      schema,
      columns,
      operations,
      enumName,
      values,
      ifNotExists
    } = args as {
      connectionString?: string;
      operation: 'get_info' | 'create_table' | 'alter_table' | 'get_enums' | 'create_enum';
      tableName?: string;
      schema?: string;
      columns?: Array<{
        name: string;
        type: string;
        nullable?: boolean;
        default?: string;
      }>;
      operations?: Array<{
        type: 'add' | 'alter' | 'drop';
        columnName: string;
        dataType?: string;
        nullable?: boolean;
        default?: string;
      }>;
      enumName?: string;
      values?: string[];
      ifNotExists?: boolean;
    };

    try {
      switch (operation) {
        case 'get_info': {
          const result = await executeGetSchemaInfo({
            connectionString: connStringArg,
            tableName
          }, getConnectionStringVal);
          const message = tableName
            ? `Schema information for table ${tableName}`
            : 'List of tables in database';
          return { content: [{ type: 'text', text: message }, { type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'create_table': {
          if (!tableName || !columns || columns.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: tableName and columns are required for create_table operation' }],
              isError: true
            };
          }
          const result = await executeCreateTable({
            connectionString: connStringArg,
            tableName,
            columns
          }, getConnectionStringVal);
          return { content: [{ type: 'text', text: `Table ${result.tableName} created successfully (if not exists).` }, { type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'alter_table': {
          if (!tableName || !operations || operations.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: tableName and operations are required for alter_table operation' }],
              isError: true
            };
          }
          const result = await executeAlterTable({
            connectionString: connStringArg,
            tableName,
            operations
          }, getConnectionStringVal);
          return { content: [{ type: 'text', text: `Table ${result.tableName} altered successfully.` }, { type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'get_enums': {
          const result = await executeGetEnumsInSchema(
            connStringArg || '',
            schema || 'public',
            enumName,
            getConnectionStringVal
          );
          return { content: [{ type: 'text', text: `Fetched ${result.length} ENUM(s).` }, { type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'create_enum': {
          if (!enumName || !values || values.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: enumName and values are required for create_enum operation' }],
              isError: true
            };
          }
          const result = await executeCreateEnumInSchema(
            connStringArg || '',
            enumName,
            values,
            schema || 'public',
            ifNotExists || false,
            getConnectionStringVal
          );
          return { content: [{ type: 'text', text: `ENUM type ${result.schema ? `${result.schema}.` : ''}${result.enumName} created successfully.` }, { type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown operation "${operation}". Supported operations: get_info, create_table, alter_table, get_enums, create_enum` }],
            isError: true
          };
      }

    } catch (error) {
      const errorMessage = error instanceof McpError ? error.message : (error instanceof Error ? error.message : String(error));
      return { content: [{ type: 'text', text: `Error executing ${operation} operation: ${errorMessage}` }], isError: true };
    }
  }
};
