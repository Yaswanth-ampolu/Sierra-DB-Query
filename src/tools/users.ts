import { z } from 'zod';
import { DatabaseConnection } from '../utils/connection.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { SierraTool, ToolOutput, GetConnectionStringFn } from '../types/tool.js';

const ManageUsersInputSchema = z.object({
  connectionString: z.string().optional().describe('PostgreSQL connection string (optional)'),
  operation: z.enum(['create', 'drop', 'alter', 'grant', 'revoke', 'get_permissions', 'list']).describe('Operation: create (new user), drop (remove user), alter (modify user), grant (permissions), revoke (permissions), get_permissions (view permissions), list (all users)'),
  username: z.string().optional().describe('Username (required for create/drop/alter/grant/revoke/get_permissions, optional filter for list)'),
  password: z.string().optional().describe('Password for the user (for create operation)'),
  superuser: z.boolean().optional().describe('Grant superuser privileges (for create/alter operations)'),
  createdb: z.boolean().optional().describe('Allow user to create databases (for create/alter operations)'),
  createrole: z.boolean().optional().describe('Allow user to create roles (for create/alter operations)'),
  login: z.boolean().optional().describe('Allow user to login (for create/alter operations)'),
  replication: z.boolean().optional().describe('Allow replication privileges (for create/alter operations)'),
  inherit: z.boolean().optional().describe('Inherit privileges from parent roles (for create/alter operations)'),
  connectionLimit: z.number().optional().describe('Maximum number of connections (for create/alter operations)'),
  validUntil: z.string().optional().describe('Password expiration date YYYY-MM-DD (for create/alter operations)'),
  permissions: z.array(z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'ALL'])).optional().describe('Permissions to grant/revoke: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "ALL"]'),
  targetType: z.enum(['table', 'schema', 'database', 'sequence', 'function']).optional().describe('Type of target object (for grant/revoke operations)'),
  target: z.string().optional().describe('Target object name (for grant/revoke operations)'),
  schema: z.string().optional().describe('Filter by schema (for get_permissions operation)'),
  withGrantOption: z.boolean().optional().describe('Allow user to grant these permissions to others (for grant operation)'),
  cascade: z.boolean().optional().describe('Include CASCADE to drop owned objects (for drop/revoke operations)'),
  ifExists: z.boolean().optional().describe('Include IF EXISTS clause (for drop operation)'),
  includeSystemRoles: z.boolean().optional().describe('Include system roles (for list operation)')
});

type ManageUsersInput = z.infer<typeof ManageUsersInputSchema>;

export const manageUsersTool: SierraTool = {
  name: 'sierra_manage_users',
  description: 'Manage PostgreSQL users and permissions - create, drop, alter users, grant/revoke permissions. Examples: operation="create" with username="testuser", operation="grant" with username, permissions, target, targetType',
  inputSchema: ManageUsersInputSchema,
  execute: async (args: unknown, getConnectionStringVal: GetConnectionStringFn): Promise<ToolOutput> => {
    const {
      connectionString: connStringArg,
      operation,
      username,
      password,
      superuser,
      createdb,
      createrole,
      login,
      replication,
      inherit,
      connectionLimit,
      validUntil,
      permissions,
      targetType,
      target,
      schema,
      withGrantOption,
      cascade,
      ifExists,
      includeSystemRoles
    } = args as ManageUsersInput;

    const resolvedConnString = getConnectionStringVal(connStringArg);
    const db = DatabaseConnection.getInstance();

    try {
      await db.connect(resolvedConnString);

      switch (operation) {
        case 'list': {
          let query = `
            SELECT
              r.rolname as username,
              r.rolsuper as is_superuser,
              r.rolinherit as inherit_privileges,
              r.rolcreaterole as can_create_roles,
              r.rolcreatedb as can_create_db,
              r.rolcanlogin as can_login,
              r.rolreplication as is_replication,
              r.rolconnlimit as connection_limit,
              r.rolvaliduntil as valid_until
            FROM pg_roles r
          `;

          if (!includeSystemRoles) {
            query += ` WHERE r.rolname NOT LIKE 'pg_%'`;
          }

          if (username) {
            query += includeSystemRoles ? ` WHERE` : ` AND`;
            query += ` r.rolname ILIKE $1`;
          }

          query += ` ORDER BY r.rolname`;

          const params = username ? [`%${username}%`] : [];
          const users = await db.query(query, params);

          return {
            content: [{
              type: 'text',
              text: `Found ${users.length} users/roles.\n\n${JSON.stringify(users, null, 2)}`
            }]
          };
        }

        case 'create': {
          if (!username) {
            return {
              content: [{ type: 'text', text: 'Error: username is required for create operation' }],
              isError: true
            };
          }

          const options: string[] = [];

          if (password) options.push(`PASSWORD '${password}'`);
          if (superuser !== undefined) options.push(superuser ? 'SUPERUSER' : 'NOSUPERUSER');
          if (createdb !== undefined) options.push(createdb ? 'CREATEDB' : 'NOCREATEDB');
          if (createrole !== undefined) options.push(createrole ? 'CREATEROLE' : 'NOCREATEROLE');
          if (login !== undefined) options.push(login ? 'LOGIN' : 'NOLOGIN');
          if (replication !== undefined) options.push(replication ? 'REPLICATION' : 'NOREPLICATION');
          if (inherit !== undefined) options.push(inherit ? 'INHERIT' : 'NOINHERIT');
          if (connectionLimit !== undefined) options.push(`CONNECTION LIMIT ${connectionLimit}`);
          if (validUntil) options.push(`VALID UNTIL '${validUntil}'`);

          const sql = `CREATE ROLE "${username}" ${options.join(' ')}`;
          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `User/role "${username}" created successfully.`
            }]
          };
        }

        case 'drop': {
          if (!username) {
            return {
              content: [{ type: 'text', text: 'Error: username is required for drop operation' }],
              isError: true
            };
          }

          const ifExistsClause = ifExists ? 'IF EXISTS ' : '';

          if (cascade) {
            await db.query(`REASSIGN OWNED BY "${username}" TO postgres`);
            await db.query(`DROP OWNED BY ${ifExistsClause}"${username}"`);
          }

          const sql = `DROP ROLE ${ifExistsClause}"${username}"`;
          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `User/role "${username}" dropped successfully.`
            }]
          };
        }

        case 'alter': {
          if (!username) {
            return {
              content: [{ type: 'text', text: 'Error: username is required for alter operation' }],
              isError: true
            };
          }

          const options: string[] = [];

          if (password) options.push(`PASSWORD '${password}'`);
          if (superuser !== undefined) options.push(superuser ? 'SUPERUSER' : 'NOSUPERUSER');
          if (createdb !== undefined) options.push(createdb ? 'CREATEDB' : 'NOCREATEDB');
          if (createrole !== undefined) options.push(createrole ? 'CREATEROLE' : 'NOCREATEROLE');
          if (login !== undefined) options.push(login ? 'LOGIN' : 'NOLOGIN');
          if (replication !== undefined) options.push(replication ? 'REPLICATION' : 'NOREPLICATION');
          if (inherit !== undefined) options.push(inherit ? 'INHERIT' : 'NOINHERIT');
          if (connectionLimit !== undefined) options.push(`CONNECTION LIMIT ${connectionLimit}`);
          if (validUntil) options.push(`VALID UNTIL '${validUntil}'`);

          if (options.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: At least one attribute must be specified for alter operation' }],
              isError: true
            };
          }

          const sql = `ALTER ROLE "${username}" ${options.join(' ')}`;
          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `User/role "${username}" altered successfully.`
            }]
          };
        }

        case 'grant': {
          if (!username || !permissions || !target || !targetType) {
            return {
              content: [{ type: 'text', text: 'Error: username, permissions, target, and targetType are required for grant operation' }],
              isError: true
            };
          }

          const permsList = permissions.join(', ');
          const grantOption = withGrantOption ? ' WITH GRANT OPTION' : '';

          let sql = '';
          switch (targetType) {
            case 'table':
              sql = `GRANT ${permsList} ON TABLE "${target}" TO "${username}"${grantOption}`;
              break;
            case 'schema':
              sql = `GRANT ${permsList} ON ALL TABLES IN SCHEMA "${target}" TO "${username}"${grantOption}`;
              break;
            case 'database':
              sql = `GRANT ${permsList === 'ALL' ? 'ALL PRIVILEGES' : permsList} ON DATABASE "${target}" TO "${username}"${grantOption}`;
              break;
            case 'sequence':
              sql = `GRANT ${permsList} ON SEQUENCE "${target}" TO "${username}"${grantOption}`;
              break;
            case 'function':
              sql = `GRANT EXECUTE ON FUNCTION "${target}" TO "${username}"${grantOption}`;
              break;
          }

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Permissions granted to "${username}" successfully.`
            }]
          };
        }

        case 'revoke': {
          if (!username || !permissions || !target || !targetType) {
            return {
              content: [{ type: 'text', text: 'Error: username, permissions, target, and targetType are required for revoke operation' }],
              isError: true
            };
          }

          const permsList = permissions.join(', ');
          const cascadeClause = cascade ? ' CASCADE' : '';

          let sql = '';
          switch (targetType) {
            case 'table':
              sql = `REVOKE ${permsList} ON TABLE "${target}" FROM "${username}"${cascadeClause}`;
              break;
            case 'schema':
              sql = `REVOKE ${permsList} ON ALL TABLES IN SCHEMA "${target}" FROM "${username}"${cascadeClause}`;
              break;
            case 'database':
              sql = `REVOKE ${permsList === 'ALL' ? 'ALL PRIVILEGES' : permsList} ON DATABASE "${target}" FROM "${username}"${cascadeClause}`;
              break;
            case 'sequence':
              sql = `REVOKE ${permsList} ON SEQUENCE "${target}" FROM "${username}"${cascadeClause}`;
              break;
            case 'function':
              sql = `REVOKE EXECUTE ON FUNCTION "${target}" FROM "${username}"${cascadeClause}`;
              break;
          }

          await db.query(sql);

          return {
            content: [{
              type: 'text',
              text: `Permissions revoked from "${username}" successfully.`
            }]
          };
        }

        case 'get_permissions': {
          if (!username) {
            return {
              content: [{ type: 'text', text: 'Error: username is required for get_permissions operation' }],
              isError: true
            };
          }

          let query = `
            SELECT
              n.nspname as schema_name,
              c.relname as object_name,
              CASE c.relkind
                WHEN 'r' THEN 'table'
                WHEN 'v' THEN 'view'
                WHEN 'S' THEN 'sequence'
                WHEN 'f' THEN 'function'
                ELSE c.relkind::text
              END as object_type,
              array_agg(privilege_type) as privileges
            FROM information_schema.table_privileges tp
            JOIN pg_class c ON c.relname = tp.table_name
            JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = tp.table_schema
            WHERE tp.grantee = $1
          `;

          const params: unknown[] = [username];

          if (schema) {
            query += ` AND tp.table_schema = $2`;
            params.push(schema);
          }

          query += ` GROUP BY n.nspname, c.relname, c.relkind ORDER BY n.nspname, c.relname`;

          const permissions = await db.query(query, params);

          return {
            content: [{
              type: 'text',
              text: `Permissions for user "${username}":\n\n${JSON.stringify(permissions, null, 2)}`
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
          text: `Error managing users: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    } finally {
      await db.disconnect();
    }
  }
};
