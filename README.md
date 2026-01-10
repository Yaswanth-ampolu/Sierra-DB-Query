# Sierra DB Query

A Model Context Protocol (MCP) server for PostgreSQL database management. Sierra DB Query provides a comprehensive set of tools for managing PostgreSQL databases through AI assistants.

## Features

- **Schema Management**: Get schema info, create/alter tables, manage ENUMs
- **Query Execution**: Execute SELECT queries with count/exists operations
- **Data Mutations**: INSERT, UPDATE, DELETE, UPSERT operations
- **SQL Execution**: Run arbitrary SQL with transaction support
- **Database Analysis**: Configuration, performance, and security analysis
- **Real-time Monitoring**: Active queries, locks, connection stats
- **Index Management**: Create, drop, reindex, analyze usage
- **Constraint Management**: Foreign keys, unique, check, primary key constraints
- **Function Management**: Create, drop, and list PostgreSQL functions
- **User Management**: Create users, manage permissions, grant/revoke access

## Installation

```bash
npm install @sierra/db-query
```

## Usage

### As an MCP Server

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "sierra-db-query": {
      "command": "npx",
      "args": ["@sierra/db-query"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:password@host:5432/database"
      }
    }
  }
}
```

### CLI Options

```bash
sierra-db-query --connection-string "postgresql://user:password@host:5432/database"
sierra-db-query --tools-config ./tools-config.json
```

### Tools Configuration

Create a `tools-config.json` to enable specific tools:

```json
{
  "enabledTools": [
    "sierra_manage_schema",
    "sierra_execute_query",
    "sierra_execute_mutation",
    "sierra_analyze_database"
  ]
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `sierra_manage_schema` | Schema management - tables, columns, ENUMs |
| `sierra_execute_query` | SELECT queries with count/exists |
| `sierra_execute_mutation` | INSERT/UPDATE/DELETE/UPSERT |
| `sierra_execute_sql` | Arbitrary SQL execution |
| `sierra_analyze_database` | Configuration/performance/security analysis |
| `sierra_monitor_database` | Real-time monitoring |
| `sierra_manage_indexes` | Index management |
| `sierra_manage_constraints` | Constraint management |
| `sierra_manage_functions` | Function management |
| `sierra_manage_users` | User and permission management |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
