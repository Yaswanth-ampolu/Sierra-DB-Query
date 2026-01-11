# Sierra DB Query - Tools Reference

Complete reference documentation for all 10 Sierra DB Query MCP tools.

---

## Table of Contents

1. [sierra_manage_schema](#1-sierra_manage_schema)
2. [sierra_execute_query](#2-sierra_execute_query)
3. [sierra_execute_mutation](#3-sierra_execute_mutation)
4. [sierra_execute_sql](#4-sierra_execute_sql)
5. [sierra_analyze_database](#5-sierra_analyze_database)
6. [sierra_monitor_database](#6-sierra_monitor_database)
7. [sierra_manage_indexes](#7-sierra_manage_indexes)
8. [sierra_manage_constraints](#8-sierra_manage_constraints)
9. [sierra_manage_functions](#9-sierra_manage_functions)
10. [sierra_manage_users](#10-sierra_manage_users)

---

## 1. sierra_manage_schema

Manage PostgreSQL schema - tables, columns, and ENUMs.

### Operations

#### `get_info` - Get Schema Information

List all tables or get specific table details.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"get_info"` |
| `tableName` | string | No | Specific table name (omit to list all) |
| `schema` | string | No | Schema name (default: `"public"`) |
| `connectionString` | string | No | PostgreSQL connection string |

**Example - List all tables:**
```json
{
  "operation": "get_info"
}
```

**Example - Get table details:**
```json
{
  "operation": "get_info",
  "tableName": "users"
}
```

**Response:**
```json
{
  "tables": ["users", "orders", "products"],
  "columns": [
    {"name": "id", "type": "integer", "nullable": false},
    {"name": "email", "type": "character varying(255)", "nullable": false}
  ]
}
```

---

#### `create_table` - Create New Table

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"create_table"` |
| `tableName` | string | Yes | Name for the new table |
| `columns` | array | Yes | Column definitions |
| `schema` | string | No | Schema name (default: `"public"`) |

**Column Definition:**
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Column name |
| `type` | string | Yes | PostgreSQL data type |
| `nullable` | boolean | No | Allow NULL (default: true) |
| `default` | string | No | Default value expression |

**Example:**
```json
{
  "operation": "create_table",
  "tableName": "products",
  "columns": [
    {"name": "id", "type": "SERIAL PRIMARY KEY"},
    {"name": "name", "type": "VARCHAR(255)", "nullable": false},
    {"name": "price", "type": "DECIMAL(10,2)", "default": "0.00"},
    {"name": "created_at", "type": "TIMESTAMP", "default": "NOW()"}
  ]
}
```

---

#### `alter_table` - Modify Table Structure

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"alter_table"` |
| `tableName` | string | Yes | Table to modify |
| `operations` | array | Yes | List of alter operations |

**Alter Operations:**
| Type | Description | Required Properties |
|------|-------------|---------------------|
| `add` | Add column | `columnName`, `dataType` |
| `alter` | Modify column | `columnName`, `dataType` |
| `drop` | Remove column | `columnName` |

**Example:**
```json
{
  "operation": "alter_table",
  "tableName": "users",
  "operations": [
    {"type": "add", "columnName": "phone", "dataType": "VARCHAR(20)"},
    {"type": "alter", "columnName": "name", "dataType": "VARCHAR(500)"},
    {"type": "drop", "columnName": "old_field"}
  ]
}
```

---

#### `get_enums` - List ENUM Types

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"get_enums"` |
| `enumName` | string | No | Filter by ENUM name |

**Example:**
```json
{
  "operation": "get_enums"
}
```

---

#### `create_enum` - Create ENUM Type

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"create_enum"` |
| `enumName` | string | Yes | Name for the ENUM |
| `values` | array | Yes | ENUM values |

**Example:**
```json
{
  "operation": "create_enum",
  "enumName": "order_status",
  "values": ["pending", "processing", "shipped", "delivered", "cancelled"]
}
```

---

## 2. sierra_execute_query

Execute SELECT queries and data retrieval operations.

### Operations

#### `select` - Fetch Rows

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"select"` |
| `query` | string | Yes | SQL SELECT query |
| `parameters` | array | No | Query parameters ($1, $2, etc.) |
| `limit` | number | No | Max rows to return |
| `timeout` | number | No | Query timeout in ms |
| `connectionString` | string | No | PostgreSQL connection string |

**Example:**
```json
{
  "operation": "select",
  "query": "SELECT * FROM users WHERE active = $1 AND created_at > $2",
  "parameters": [true, "2024-01-01"],
  "limit": 100
}
```

**Response:**
```json
{
  "rows": [
    {"id": 1, "name": "Alice", "email": "alice@example.com"},
    {"id": 2, "name": "Bob", "email": "bob@example.com"}
  ],
  "rowCount": 2
}
```

---

#### `count` - Count Rows

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"count"` |
| `query` | string | Yes | SQL query to count |
| `parameters` | array | No | Query parameters |

**Example:**
```json
{
  "operation": "count",
  "query": "SELECT * FROM orders WHERE status = $1",
  "parameters": ["pending"]
}
```

**Response:**
```json
{
  "count": 42
}
```

---

#### `exists` - Check Existence

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"exists"` |
| `query` | string | Yes | SQL query to check |
| `parameters` | array | No | Query parameters |

**Example:**
```json
{
  "operation": "exists",
  "query": "SELECT 1 FROM users WHERE email = $1",
  "parameters": ["test@example.com"]
}
```

**Response:**
```json
{
  "exists": true
}
```

---

## 3. sierra_execute_mutation

Execute data modification operations (INSERT/UPDATE/DELETE/UPSERT).

### Operations

#### `insert` - Insert Data

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"insert"` |
| `table` | string | Yes | Target table |
| `data` | object | Yes | Column-value pairs |
| `returning` | string | No | RETURNING clause (e.g., `"*"`, `"id"`) |
| `schema` | string | No | Schema name (default: `"public"`) |

**Example:**
```json
{
  "operation": "insert",
  "table": "users",
  "data": {
    "name": "Alice",
    "email": "alice@example.com",
    "active": true
  },
  "returning": "*"
}
```

---

#### `update` - Update Data

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"update"` |
| `table` | string | Yes | Target table |
| `data` | object | Yes | Column-value pairs to update |
| `where` | string | Yes | WHERE clause (without `WHERE` keyword) |
| `returning` | string | No | RETURNING clause |

**Example:**
```json
{
  "operation": "update",
  "table": "users",
  "data": {
    "active": false,
    "updated_at": "NOW()"
  },
  "where": "id = 123"
}
```

---

#### `delete` - Delete Data

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"delete"` |
| `table` | string | Yes | Target table |
| `where` | string | Yes | WHERE clause (without `WHERE` keyword) |

**Example:**
```json
{
  "operation": "delete",
  "table": "sessions",
  "where": "expires_at < NOW()"
}
```

---

#### `upsert` - Insert or Update

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"upsert"` |
| `table` | string | Yes | Target table |
| `data` | object | Yes | Column-value pairs |
| `conflictColumns` | array | Yes | Columns for conflict detection |
| `returning` | string | No | RETURNING clause |

**Example:**
```json
{
  "operation": "upsert",
  "table": "user_settings",
  "data": {
    "user_id": 1,
    "theme": "dark",
    "notifications": true
  },
  "conflictColumns": ["user_id"],
  "returning": "*"
}
```

---

## 4. sierra_execute_sql

Execute arbitrary SQL statements with transaction support.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sql` | string | Yes | SQL statement to execute |
| `parameters` | array | No | Query parameters |
| `expectRows` | boolean | No | Expect rows back (default: true) |
| `timeout` | number | No | Query timeout in ms |
| `transactional` | boolean | No | Wrap in transaction (default: false) |
| `connectionString` | string | No | PostgreSQL connection string |

**Example - Create Index:**
```json
{
  "sql": "CREATE INDEX CONCURRENTLY idx_users_email ON users(email)",
  "expectRows": false
}
```

**Example - Complex CTE:**
```json
{
  "sql": "WITH active_users AS (SELECT * FROM users WHERE active = true) SELECT COUNT(*) FROM active_users",
  "expectRows": true
}
```

**Example - Transaction:**
```json
{
  "sql": "INSERT INTO audit_log (action, user_id) VALUES ($1, $2)",
  "parameters": ["login", 123],
  "transactional": true
}
```

---

## 5. sierra_analyze_database

Analyze PostgreSQL database configuration, performance, and security.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `analysisType` | string | Yes | `"configuration"`, `"performance"`, or `"security"` |
| `connectionString` | string | No | PostgreSQL connection string |

### Analysis Types

#### `configuration`
Analyzes PostgreSQL settings including:
- `max_connections`
- `shared_buffers`
- `work_mem`
- `effective_cache_size`
- WAL settings
- Checkpoint settings

#### `performance`
Analyzes performance metrics:
- Cache hit ratio
- Index usage
- Table bloat
- Slow queries
- Connection stats

#### `security`
Audits security settings:
- User permissions
- SSL configuration
- Password policies
- Public schema access

**Example:**
```json
{
  "analysisType": "performance"
}
```

---

## 6. sierra_monitor_database

Get real-time monitoring information.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeQueries` | boolean | No | Include active queries (default: true) |
| `includeLocks` | boolean | No | Include lock info (default: true) |
| `includeTables` | boolean | No | Include table stats (default: true) |
| `includeReplication` | boolean | No | Include replication status (default: false) |
| `alertThresholds` | object | No | Alert configuration |
| `connectionString` | string | No | PostgreSQL connection string |

**Alert Thresholds:**
| Property | Type | Description |
|----------|------|-------------|
| `connectionPercentage` | number | Alert if connection usage exceeds % |
| `longRunningQuerySeconds` | number | Alert for queries running longer |
| `deadTuplesPercentage` | number | Alert for dead tuple % |
| `cacheHitRatio` | number | Alert if cache hit ratio below % |
| `vacuumAge` | number | Alert if vacuum older than days |

**Example:**
```json
{
  "includeQueries": true,
  "includeLocks": true,
  "alertThresholds": {
    "connectionPercentage": 80,
    "longRunningQuerySeconds": 30,
    "cacheHitRatio": 95
  }
}
```

---

## 7. sierra_manage_indexes

Manage PostgreSQL indexes.

### Operations

#### `get` - List Indexes

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"get"` |
| `tableName` | string | No | Filter by table |
| `includeStats` | boolean | No | Include usage statistics |
| `schema` | string | No | Schema name |

**Example:**
```json
{
  "operation": "get",
  "tableName": "users",
  "includeStats": true
}
```

---

#### `create` - Create Index

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"create"` |
| `indexName` | string | Yes | Name for the index |
| `tableName` | string | Yes | Target table |
| `columns` | array | Yes | Column names |
| `unique` | boolean | No | Create unique index |
| `method` | string | No | Index method: `btree`, `hash`, `gist`, `gin`, `brin` |
| `where` | string | No | Partial index WHERE clause |
| `concurrent` | boolean | No | Create concurrently |
| `ifNotExists` | boolean | No | Skip if exists |

**Example:**
```json
{
  "operation": "create",
  "indexName": "idx_users_email",
  "tableName": "users",
  "columns": ["email"],
  "unique": true,
  "concurrent": true
}
```

**Example - Partial Index:**
```json
{
  "operation": "create",
  "indexName": "idx_active_users",
  "tableName": "users",
  "columns": ["created_at"],
  "where": "active = true"
}
```

---

#### `drop` - Drop Index

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"drop"` |
| `indexName` | string | Yes | Index to drop |
| `concurrent` | boolean | No | Drop concurrently |
| `ifExists` | boolean | No | Skip if not exists |
| `cascade` | boolean | No | Drop dependent objects |

---

#### `reindex` - Rebuild Index

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"reindex"` |
| `type` | string | Yes | `"index"`, `"table"`, `"schema"`, `"database"` |
| `target` | string | Yes | Target name |

---

#### `analyze_usage` - Analyze Index Usage

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"analyze_usage"` |
| `showUnused` | boolean | No | Include unused indexes |
| `showDuplicates` | boolean | No | Detect duplicate indexes |
| `minSizeBytes` | number | No | Minimum size filter |

---

## 8. sierra_manage_constraints

Manage PostgreSQL constraints.

### Operations

#### `get` - List Constraints

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"get"` |
| `tableName` | string | No | Filter by table |
| `constraintType` | string | No | `"PRIMARY KEY"`, `"FOREIGN KEY"`, `"UNIQUE"`, `"CHECK"` |
| `schema` | string | No | Schema name |

---

#### `create_fk` - Create Foreign Key

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"create_fk"` |
| `constraintName` | string | Yes | Constraint name |
| `tableName` | string | Yes | Source table |
| `columnNames` | array | Yes | Source columns |
| `referencedTable` | string | Yes | Target table |
| `referencedColumns` | array | Yes | Target columns |
| `onDelete` | string | No | `NO ACTION`, `RESTRICT`, `CASCADE`, `SET NULL`, `SET DEFAULT` |
| `onUpdate` | string | No | Same as onDelete options |
| `deferrable` | boolean | No | Make deferrable |

**Example:**
```json
{
  "operation": "create_fk",
  "constraintName": "fk_orders_user",
  "tableName": "orders",
  "columnNames": ["user_id"],
  "referencedTable": "users",
  "referencedColumns": ["id"],
  "onDelete": "CASCADE"
}
```

---

#### `create` - Create Constraint

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"create"` |
| `constraintName` | string | Yes | Constraint name |
| `tableName` | string | Yes | Target table |
| `constraintTypeCreate` | string | Yes | `"unique"`, `"check"`, `"primary_key"` |
| `columnNames` | array | Yes* | Columns (for unique/pk) |
| `checkExpression` | string | Yes* | Expression (for check) |

**Example - Unique Constraint:**
```json
{
  "operation": "create",
  "constraintName": "uq_users_email",
  "tableName": "users",
  "constraintTypeCreate": "unique",
  "columnNames": ["email"]
}
```

**Example - Check Constraint:**
```json
{
  "operation": "create",
  "constraintName": "chk_positive_price",
  "tableName": "products",
  "constraintTypeCreate": "check",
  "checkExpression": "price >= 0"
}
```

---

## 9. sierra_manage_functions

Manage PostgreSQL functions.

### Operations

#### `get` - List Functions

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"get"` |
| `functionName` | string | No | Filter by name |
| `schema` | string | No | Schema name |

---

#### `create` - Create Function

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"create"` |
| `functionName` | string | Yes | Function name |
| `parameters` | string | Yes | Parameters (empty string for none) |
| `returnType` | string | Yes | Return type |
| `functionBody` | string | Yes | Function body |
| `language` | string | No | `"sql"`, `"plpgsql"`, `"plpython3u"` |
| `volatility` | string | No | `"VOLATILE"`, `"STABLE"`, `"IMMUTABLE"` |
| `security` | string | No | `"INVOKER"`, `"DEFINER"` |
| `replace` | boolean | No | Replace if exists |

**Example - Simple SQL Function:**
```json
{
  "operation": "create",
  "functionName": "get_active_users_count",
  "parameters": "",
  "returnType": "INTEGER",
  "functionBody": "SELECT COUNT(*) FROM users WHERE active = true",
  "language": "sql",
  "volatility": "STABLE",
  "replace": true
}
```

**Example - PL/pgSQL Function:**
```json
{
  "operation": "create",
  "functionName": "update_modified_column",
  "parameters": "",
  "returnType": "TRIGGER",
  "functionBody": "BEGIN NEW.updated_at = NOW(); RETURN NEW; END;",
  "language": "plpgsql",
  "replace": true
}
```

---

#### `drop` - Drop Function

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"drop"` |
| `functionName` | string | Yes | Function to drop |
| `parameters` | string | No | Required if function is overloaded |
| `ifExists` | boolean | No | Skip if not exists |
| `cascade` | boolean | No | Drop dependent objects |

---

## 10. sierra_manage_users

Manage PostgreSQL users and permissions.

### Operations

#### `list` - List Users

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"list"` |
| `username` | string | No | Filter by username |
| `includeSystemRoles` | boolean | No | Include system roles |

---

#### `create` - Create User

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"create"` |
| `username` | string | Yes | Username |
| `password` | string | No | Password |
| `superuser` | boolean | No | Grant superuser |
| `createdb` | boolean | No | Allow creating databases |
| `createrole` | boolean | No | Allow creating roles |
| `login` | boolean | No | Allow login |
| `replication` | boolean | No | Allow replication |
| `connectionLimit` | number | No | Max connections |
| `validUntil` | string | No | Password expiration (YYYY-MM-DD) |

**Example:**
```json
{
  "operation": "create",
  "username": "app_user",
  "password": "secure_password",
  "login": true,
  "connectionLimit": 10
}
```

---

#### `grant` - Grant Permissions

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"grant"` |
| `username` | string | Yes | User to grant to |
| `permissions` | array | Yes | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `ALL`, etc. |
| `targetType` | string | Yes | `"table"`, `"schema"`, `"database"`, `"sequence"`, `"function"` |
| `target` | string | Yes | Target object name |
| `withGrantOption` | boolean | No | Allow granting to others |

**Example:**
```json
{
  "operation": "grant",
  "username": "app_user",
  "permissions": ["SELECT", "INSERT", "UPDATE"],
  "targetType": "table",
  "target": "users"
}
```

---

#### `revoke` - Revoke Permissions

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"revoke"` |
| `username` | string | Yes | User to revoke from |
| `permissions` | array | Yes | Permissions to revoke |
| `targetType` | string | Yes | Target type |
| `target` | string | Yes | Target object |
| `cascade` | boolean | No | Revoke from dependents |

---

#### `get_permissions` - View Permissions

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"get_permissions"` |
| `username` | string | Yes | User to check |
| `schema` | string | No | Filter by schema |

---

#### `alter` - Modify User

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"alter"` |
| `username` | string | Yes | User to modify |
| (other options) | | | Same as create |

---

#### `drop` - Drop User

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"drop"` |
| `username` | string | Yes | User to drop |
| `ifExists` | boolean | No | Skip if not exists |
| `cascade` | boolean | No | Drop owned objects |
