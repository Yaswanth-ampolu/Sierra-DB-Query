import { z } from 'zod';
import { DatabaseConnection } from '../utils/connection.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { SierraTool, ToolOutput, GetConnectionStringFn } from '../types/tool.js';

const ManageFunctionsInputSchema = z.object({
  connectionString: z.string().optional().describe('PostgreSQL connection string (optional)'),
  operation: z.enum(['get', 'create', 'drop']).describe('Operation: get (list/info), create (new function), or drop (remove function)'),
  schema: z.string().optional().default('public').describe('Schema name (defaults to public)'),
  functionName: z.string().optional().describe('Name of the function (required for create/drop, optional for get to filter)'),
  parameters: z.string().optional().describe('Function parameters - required for create operation, required for drop when function is overloaded. Use empty string "" for functions with no parameters'),
  returnType: z.string().optional().describe('Return type of the function (required for create operation)'),
  functionBody: z.string().optional().describe('Function body code (required for create operation)'),
  language: z.enum(['sql', 'plpgsql', 'plpython3u']).optional().describe('Function language (defaults to plpgsql for create)'),
  volatility: z.enum(['VOLATILE', 'STABLE', 'IMMUTABLE']).optional().describe('Function volatility (defaults to VOLATILE for create)'),
  security: z.enum(['INVOKER', 'DEFINER']).optional().describe('Function security context (defaults to INVOKER for create)'),
  replace: z.boolean().optional().describe('Whether to replace the function if it exists (for create operation)'),
  ifExists: z.boolean().optional().describe('Whether to include IF EXISTS clause (for drop operation)'),
  cascade: z.boolean().optional().describe('Whether to include CASCADE clause (for drop operation)')
});

type ManageFunctionsInput = z.infer<typeof ManageFunctionsInputSchema>;

export const manageFunctionsTool: SierraTool = {
  name: 'sierra_manage_functions',
  description: 'Manage PostgreSQL functions - get, create, or drop functions with a single tool. Examples: operation="get" to list functions, operation="create" with functionName="test_func", parameters="" (empty for no params), returnType="TEXT", functionBody="SELECT \'Hello\'"',
  inputSchema: ManageFunctionsInputSchema,
  execute: async (args: unknown, getConnectionStringVal: GetConnectionStringFn): Promise<ToolOutput> => {
    const {
      connectionString: connStringArg,
      operation,
      schema = 'public',
      functionName,
      parameters,
      returnType,
      functionBody,
      language = 'plpgsql',
      volatility = 'VOLATILE',
      security = 'INVOKER',
      replace,
      ifExists,
      cascade
    } = args as ManageFunctionsInput;

    const resolvedConnString = getConnectionStringVal(connStringArg);
    const db = DatabaseConnection.getInstance();

    try {
      await db.connect(resolvedConnString);

      switch (operation) {
        case 'get': {
          let query = `
            SELECT
              n.nspname as schema_name,
              p.proname as function_name,
              pg_get_function_identity_arguments(p.oid) as parameters,
              pg_get_function_result(p.oid) as return_type,
              l.lanname as language,
              CASE p.provolatile
                WHEN 'i' THEN 'IMMUTABLE'
                WHEN 's' THEN 'STABLE'
                WHEN 'v' THEN 'VOLATILE'
              END as volatility,
              CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END as security,
              pg_get_functiondef(p.oid) as definition
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            JOIN pg_language l ON l.oid = p.prolang
            WHERE n.nspname = $1
              AND p.prokind = 'f'
          `;

          const params: unknown[] = [schema];

          if (functionName) {
            query += ` AND p.proname = $2`;
            params.push(functionName);
          }

          query += ` ORDER BY p.proname`;

          const functions = await db.query(query, params);
          return {
            content: [{
              type: 'text',
              text: `Found ${functions.length} functions.\n\n${JSON.stringify(functions, null, 2)}`
            }]
          };
        }

        case 'create': {
          if (!functionName || returnType === undefined || !functionBody) {
            return {
              content: [{ type: 'text', text: 'Error: functionName, returnType, and functionBody are required for create operation' }],
              isError: true
            };
          }

          const createOrReplace = replace ? 'CREATE OR REPLACE' : 'CREATE';
          const params = parameters !== undefined ? parameters : '';

          let sql = `${createOrReplace} FUNCTION "${schema}"."${functionName}"(${params})
RETURNS ${returnType}
LANGUAGE ${language}
${volatility}
SECURITY ${security}
AS $$
${functionBody}
$$`;

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Function "${schema}"."${functionName}" created successfully.`
            }]
          };
        }

        case 'drop': {
          if (!functionName) {
            return {
              content: [{ type: 'text', text: 'Error: functionName is required for drop operation' }],
              isError: true
            };
          }

          const ifExistsClause = ifExists ? 'IF EXISTS ' : '';
          const cascadeClause = cascade ? ' CASCADE' : '';
          const params = parameters !== undefined ? `(${parameters})` : '';

          const sql = `DROP FUNCTION ${ifExistsClause}"${schema}"."${functionName}"${params}${cascadeClause}`;

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Function "${functionName}" dropped successfully.`
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
          text: `Error managing functions: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    } finally {
      await db.disconnect();
    }
  }
};
