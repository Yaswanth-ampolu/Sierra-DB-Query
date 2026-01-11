# Sierra DB Query - Architecture & File Structure

This document provides a comprehensive overview of the Sierra DB Query MCP server's architecture, explaining each file and its purpose.

## Project Structure

```
sierra-db-query/
├── src/
│   ├── index.ts              # Main entry point & server setup
│   ├── types/
│   │   └── tool.ts           # Type definitions for tools
│   ├── utils/
│   │   └── connection.ts     # Database connection management
│   └── tools/
│       ├── schema.ts         # Schema management tool
│       ├── data.ts           # Query, mutation, SQL tools
│       ├── analyze.ts        # Database analysis tool
│       ├── monitor.ts        # Real-time monitoring tool
│       ├── indexes.ts        # Index management tool
│       ├── constraints.ts    # Constraint management tool
│       ├── functions.ts      # Function management tool
│       └── users.ts          # User/permission management tool
├── build/                    # Compiled JavaScript (generated)
├── docker/                   # Docker configuration files
├── docs/                     # Documentation
├── package.json              # Dependencies & scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # Project overview
```

---

## Core Files

### `src/index.ts` - Main Entry Point

The heart of the MCP server. This file:

1. **CLI Configuration** - Uses `commander` to parse command-line arguments:
   - `--connection-string` - PostgreSQL connection string
   - `--tools-config` - Path to tools configuration file
   - `--http` - Enable HTTP transport mode
   - `--port` - HTTP server port (default: 7409)

2. **Server Class (`SierraDBServer`)** - Main server implementation:
   - Manages tool registration and filtering
   - Handles MCP protocol requests
   - Supports both stdio and HTTP transports

3. **Transport Modes**:
   - **Stdio** (`runStdio()`) - For local MCP clients (Claude Desktop, Cursor)
   - **HTTP** (`runHttp()`) - For remote access via URL (Smithery, web clients)

4. **Request Handlers**:
   - `ListToolsRequestSchema` - Returns available tools
   - `CallToolRequestSchema` - Executes tool with arguments

**Key Code Flow:**
```
CLI Args → SierraDBServer → Transport Selection → Tool Registration → Request Handling
```

---

### `src/types/tool.ts` - Type Definitions

Defines the structure for all Sierra tools:

```typescript
interface SierraTool {
  name: string;              // Tool identifier (e.g., "sierra_manage_schema")
  description: string;       // Human-readable description
  inputSchema: ZodSchema;    // Zod schema for input validation
  execute: Function;         // Tool execution function
}

interface ToolOutput {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
```

This ensures type safety and consistent tool interfaces across the codebase.

---

### `src/utils/connection.ts` - Database Connection Management

Handles PostgreSQL connection pooling and management:

1. **Connection Pool** - Maintains reusable database connections
2. **Connection String Validation** - Ensures valid PostgreSQL URLs
3. **Error Handling** - Graceful handling of connection failures
4. **Cleanup** - Proper pool termination on server shutdown

**Key Features:**
- Connection pooling for performance
- Automatic reconnection on failure
- SSL/TLS support for secure connections
- Per-request connection string support

---

## Tool Files

### `src/tools/schema.ts` - Schema Management

**Tool Name:** `sierra_manage_schema`

**Operations:**
| Operation | Description |
|-----------|-------------|
| `get_info` | List all tables or get specific table info |
| `create_table` | Create new table with columns |
| `alter_table` | Add, modify, or drop columns |
| `get_enums` | List PostgreSQL ENUM types |
| `create_enum` | Create new ENUM type |

**Example:**
```json
{
  "operation": "create_table",
  "tableName": "users",
  "columns": [
    { "name": "id", "type": "SERIAL PRIMARY KEY" },
    { "name": "email", "type": "VARCHAR(255) NOT NULL" }
  ]
}
```

---

### `src/tools/data.ts` - Data Operations

Contains three tools for data manipulation:

#### 1. `sierra_execute_query`
**Purpose:** Read-only SELECT operations

| Operation | Description |
|-----------|-------------|
| `select` | Execute SELECT query, return rows |
| `count` | Count matching rows |
| `exists` | Check if rows exist |

**Example:**
```json
{
  "operation": "select",
  "query": "SELECT * FROM users WHERE active = $1",
  "parameters": [true],
  "limit": 100
}
```

#### 2. `sierra_execute_mutation`
**Purpose:** Data modification operations

| Operation | Description |
|-----------|-------------|
| `insert` | Insert new row(s) |
| `update` | Update existing rows |
| `delete` | Delete rows |
| `upsert` | Insert or update on conflict |

**Example:**
```json
{
  "operation": "insert",
  "table": "users",
  "data": { "name": "John", "email": "john@example.com" },
  "returning": "*"
}
```

#### 3. `sierra_execute_sql`
**Purpose:** Execute arbitrary SQL statements

**Features:**
- Any valid PostgreSQL SQL
- Transaction support
- Parameterized queries
- Configurable row expectation

---

### `src/tools/analyze.ts` - Database Analysis

**Tool Name:** `sierra_analyze_database`

**Analysis Types:**
| Type | Description |
|------|-------------|
| `configuration` | PostgreSQL settings analysis |
| `performance` | Query performance metrics |
| `security` | Security audit findings |

**Returns:** Detailed JSON with findings, recommendations, and metrics.

---

### `src/tools/monitor.ts` - Real-time Monitoring

**Tool Name:** `sierra_monitor_database`

**Features:**
- Active query monitoring
- Lock detection
- Connection statistics
- Table statistics
- Replication status
- Alert thresholds

**Options:**
```json
{
  "includeQueries": true,
  "includeLocks": true,
  "includeTables": true,
  "alertThresholds": {
    "connectionPercentage": 80,
    "longRunningQuerySeconds": 30
  }
}
```

---

### `src/tools/indexes.ts` - Index Management

**Tool Name:** `sierra_manage_indexes`

**Operations:**
| Operation | Description |
|-----------|-------------|
| `get` | List indexes with optional stats |
| `create` | Create new index |
| `drop` | Remove index |
| `reindex` | Rebuild index |
| `analyze_usage` | Find unused/duplicate indexes |

**Supported Index Types:** btree, hash, gist, spgist, gin, brin

---

### `src/tools/constraints.ts` - Constraint Management

**Tool Name:** `sierra_manage_constraints`

**Operations:**
| Operation | Description |
|-----------|-------------|
| `get` | List all constraints |
| `create_fk` | Create foreign key |
| `drop_fk` | Drop foreign key |
| `create` | Create unique/check/PK constraint |
| `drop` | Drop constraint |

**Constraint Types:** PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK

---

### `src/tools/functions.ts` - Function Management

**Tool Name:** `sierra_manage_functions`

**Operations:**
| Operation | Description |
|-----------|-------------|
| `get` | List functions |
| `create` | Create new function |
| `drop` | Remove function |

**Languages:** SQL, PL/pgSQL, PL/Python

---

### `src/tools/users.ts` - User Management

**Tool Name:** `sierra_manage_users`

**Operations:**
| Operation | Description |
|-----------|-------------|
| `list` | List all users/roles |
| `create` | Create new user |
| `drop` | Remove user |
| `alter` | Modify user properties |
| `grant` | Grant permissions |
| `revoke` | Revoke permissions |
| `get_permissions` | View user permissions |

---

## Configuration Files

### `package.json`
- **Dependencies:** pg, express, cors, commander, zod, @modelcontextprotocol/sdk
- **Scripts:** build, dev, clean, start
- **Engine:** Node.js >= 18.0.0

### `tsconfig.json`
- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- Output: ./build

---

## Data Flow

```
┌─────────────────┐
│   MCP Client    │
│ (Claude/Cursor) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Transport     │
│ (stdio or HTTP) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  index.ts       │
│  Request Router │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Tool Handler  │
│ (schema/data/..)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  connection.ts  │
│   DB Pool       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│    Database     │
└─────────────────┘
```

---

## Security Considerations

1. **Parameterized Queries** - All user inputs are parameterized to prevent SQL injection
2. **Connection Validation** - Connection strings are validated before use
3. **Non-root Docker** - Docker containers run as non-root user
4. **No Credential Storage** - Connection strings are not logged or stored
5. **Per-request Connections** - Supports per-request connection strings for multi-tenant scenarios
