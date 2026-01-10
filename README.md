# Sierra DB Query

[![smithery badge](https://smithery.ai/badge/@Yaswanth-ampolu/sierra-db-query)](https://smithery.ai/server/@Yaswanth-ampolu/sierra-db-query)

A Model Context Protocol (MCP) server that provides comprehensive PostgreSQL database management capabilities for AI assistants.

## Features

**10 powerful tools** for complete PostgreSQL database management:

### Core Tools
- **Schema Management** - Tables, columns, ENUMs, views
- **Query Execution** - SELECT operations with count/exists support
- **Data Mutations** - INSERT/UPDATE/DELETE/UPSERT operations
- **SQL Execution** - Arbitrary SQL with transaction support

### Analysis & Monitoring
- **Database Analysis** - Configuration, performance, and security analysis
- **Real-time Monitoring** - Active queries, locks, connection stats, replication

### Database Object Management
- **Index Management** - Create, drop, reindex, analyze usage
- **Constraint Management** - Foreign keys, unique, check, primary key constraints
- **Function Management** - Create, drop, and list PostgreSQL functions
- **User Management** - Create users, manage permissions, grant/revoke access

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- Access to a PostgreSQL server
- (Optional) An MCP client like Cursor or Claude for AI integration

### Option 1: Install via Smithery (Recommended)

```bash
npx -y @smithery/cli install @Yaswanth-ampolu/sierra-db-query --client claude
```

### Option 2: npm

```bash
# Install globally
npm install -g @sierra/db-query

# Or run directly with npx
npx @sierra/db-query --connection-string "postgresql://user:pass@localhost:5432/db"
```

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "sierra-db-query": {
      "command": "npx",
      "args": [
        "@sierra/db-query",
        "--connection-string", "postgresql://user:password@host:port/database"
      ]
    }
  }
}
```

### Option 3: Docker

```bash
# Build the Docker image
docker build -t sierra-db-query .

# Run with environment variable
docker run -i --rm \
  -e POSTGRES_CONNECTION_STRING="postgresql://user:password@host:port/database" \
  sierra-db-query
```

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "sierra-db-query": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "sierra-db-query"
      ],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:password@host:port/database"
      }
    }
  }
}
```

### Option 4: Manual Installation (Development)

```bash
git clone https://github.com/Yaswanth-ampolu/sierra-db-query.git
cd sierra-db-query
npm install
npm run build
```

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "sierra-db-query": {
      "command": "node",
      "args": [
        "/path/to/sierra-db-query/build/index.js",
        "--connection-string", "postgresql://user:password@host:port/database"
      ]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `sierra_manage_schema` | Schema management - tables, columns, ENUMs, views |
| `sierra_execute_query` | SELECT queries with count/exists operations |
| `sierra_execute_mutation` | INSERT/UPDATE/DELETE/UPSERT operations |
| `sierra_execute_sql` | Arbitrary SQL execution with transaction support |
| `sierra_analyze_database` | Configuration, performance, security analysis |
| `sierra_monitor_database` | Real-time monitoring - queries, locks, connections |
| `sierra_manage_indexes` | Index management - create, drop, reindex, analyze |
| `sierra_manage_constraints` | Constraint management - FK, unique, check, PK |
| `sierra_manage_functions` | Function management - create, drop, list |
| `sierra_manage_users` | User and permission management |

## Example Usage

```typescript
// Analyze database performance
{ "analysisType": "performance" }

// Create a table with constraints
{
  "operation": "create_table",
  "tableName": "users",
  "columns": [
    { "name": "id", "type": "SERIAL PRIMARY KEY" },
    { "name": "email", "type": "VARCHAR(255) UNIQUE NOT NULL" }
  ]
}

// Query data with parameters
{
  "operation": "select",
  "query": "SELECT * FROM users WHERE created_at > $1",
  "parameters": ["2024-01-01"],
  "limit": 100
}

// Insert new data
{
  "operation": "insert",
  "table": "users",
  "data": {"name": "John Doe", "email": "john@example.com"},
  "returning": "*"
}

// Monitor active queries
{
  "operation": "active_queries",
  "includeIdle": false
}
```

## CLI Options

```bash
# With connection string
sierra-db-query --connection-string "postgresql://user:password@host:5432/database"

# With tools configuration
sierra-db-query --tools-config ./tools-config.json

# HTTP mode (for Smithery deployment)
sierra-db-query --http --port 7409
```

## Tools Configuration

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

## Features Highlights

### Security Focused
- SQL injection prevention with parameterized queries
- Connection string validation
- Non-root Docker user for security

### Production Ready
- Flexible connection options (CLI args, env vars, per-tool config)
- Connection pooling for performance
- Comprehensive error handling
- Docker support for containerized deployment

### Developer Friendly
- TypeScript with full type safety
- Zod schema validation
- Clear error messages

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Clean build
npm run clean
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Create a Pull Request

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Author

**Yaswanth Ampolu** - [yaswanth@sierra.ai](mailto:yaswanth@sierra.ai)
