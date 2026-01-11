# Sierra DB Query - MCP Configuration Guide

This guide covers all the ways to configure Sierra DB Query MCP server for different MCP clients.

---

## Table of Contents

1. [Claude Desktop](#claude-desktop)
2. [Claude Code (CLI)](#claude-code-cli)
3. [Cursor IDE](#cursor-ide)
4. [Cline (VS Code)](#cline-vs-code)
5. [Smithery Hosted](#smithery-hosted)
6. [Custom MCP Clients](#custom-mcp-clients)
7. [Tools Configuration](#tools-configuration)
8. [Environment Variables](#environment-variables)

---

## Claude Desktop

### Location
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

### Configuration

#### Option 1: Local Installation (npm)
```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "npx",
      "args": [
        "@sierra/db-query",
        "--connection-string",
        "postgresql://user:password@localhost:5432/database"
      ]
    }
  }
}
```

#### Option 2: Local Build
```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "node",
      "args": [
        "/path/to/sierra-db-query/build/index.js",
        "--connection-string",
        "postgresql://user:password@localhost:5432/database"
      ]
    }
  }
}
```

#### Option 3: Docker
```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "sierra-mcp"
      ],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:password@host.docker.internal:5432/database"
      }
    }
  }
}
```

#### Option 4: Environment Variable for Connection String
```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "node",
      "args": [
        "/path/to/sierra-db-query/build/index.js"
      ],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:password@localhost:5432/database"
      }
    }
  }
}
```

---

## Claude Code (CLI)

### Location
- `~/.claude.json`

### Configuration

```json
{
  "mcpServers": {
    "sierra-db": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/home/user/sierra-db-query/build/index.js"
      ],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:password@localhost:5432/database"
      }
    }
  }
}
```

### HTTP Mode (Remote Access)

```json
{
  "mcpServers": {
    "sierra-db-remote": {
      "type": "http",
      "url": "http://your-server.com:7409/mcp"
    }
  }
}
```

---

## Cursor IDE

### Location
- **Project level:** `.cursor/mcp.json` in your project root
- **Global:** `~/.cursor/mcp.json`

### Configuration

```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "npx",
      "args": [
        "@sierra/db-query",
        "--connection-string",
        "postgresql://user:password@localhost:5432/database"
      ]
    }
  }
}
```

### With Tools Configuration

```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "node",
      "args": [
        "/path/to/build/index.js",
        "--connection-string",
        "postgresql://user:password@localhost:5432/database",
        "--tools-config",
        "/path/to/tools-config.json"
      ]
    }
  }
}
```

---

## Cline (VS Code)

### Location
- VS Code settings or `.vscode/settings.json`

### Configuration

```json
{
  "cline.mcpServers": {
    "sierra-db": {
      "command": "node",
      "args": [
        "/path/to/sierra-db-query/build/index.js",
        "--connection-string",
        "postgresql://user:password@localhost:5432/database"
      ]
    }
  }
}
```

---

## Smithery Hosted

Sierra DB Query is available on [Smithery](https://smithery.ai/server/@Yaswanth-ampolu/sierra-db-query).

### Install via Smithery CLI

```bash
npx -y @smithery/cli install @Yaswanth-ampolu/sierra-db-query --client claude
```

### Manual Configuration for Smithery

```json
{
  "mcpServers": {
    "sierra-db": {
      "type": "http",
      "url": "https://server.smithery.ai/@Yaswanth-ampolu/sierra-db-query/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SMITHERY_API_KEY"
      }
    }
  }
}
```

---

## Custom MCP Clients

### HTTP Transport Configuration

For any client supporting HTTP transport:

```javascript
const mcpConfig = {
  endpoint: "http://your-server:7409/mcp",
  transport: "http",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
  }
};
```

### Session Management

1. Initialize session (first request without session ID)
2. Store `mcp-session-id` from response header
3. Include session ID in subsequent requests

---

## Tools Configuration

Create a `tools-config.json` to limit available tools:

### Enable Specific Tools Only

```json
{
  "enabledTools": [
    "sierra_manage_schema",
    "sierra_execute_query",
    "sierra_execute_mutation"
  ]
}
```

### Enable All Tools (default behavior)

Simply don't provide a tools config file, or:

```json
{
  "enabledTools": [
    "sierra_manage_schema",
    "sierra_execute_query",
    "sierra_execute_mutation",
    "sierra_execute_sql",
    "sierra_analyze_database",
    "sierra_monitor_database",
    "sierra_manage_indexes",
    "sierra_manage_constraints",
    "sierra_manage_functions",
    "sierra_manage_users"
  ]
}
```

### Usage

```bash
node build/index.js --tools-config /path/to/tools-config.json
```

Or in MCP config:

```json
{
  "args": [
    "/path/to/build/index.js",
    "--tools-config",
    "/path/to/tools-config.json"
  ]
}
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_CONNECTION_STRING` | Default database connection | `postgresql://user:pass@localhost:5432/db` |
| `MCP_TRANSPORT` | Transport mode (`http` or `stdio`) | `http` |
| `PORT` | HTTP server port | `7409` |
| `SIERRA_TOOLS_CONFIG` | Path to tools config file | `/app/config/tools.json` |
| `HTTP_MODE_ENABLED` | Alternative way to enable HTTP mode | `true` |

### Priority Order for Connection String

1. **Tool argument** - `connectionString` in tool call
2. **CLI argument** - `--connection-string` flag
3. **Environment variable** - `POSTGRES_CONNECTION_STRING`

This allows:
- Default connection for convenience
- Per-request override for multi-tenant scenarios

---

## Security Best Practices

### 1. Use Environment Variables for Secrets

```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "${DB_CONNECTION_STRING}"
      }
    }
  }
}
```

### 2. Limit Tools in Production

Only enable tools that are needed:

```json
{
  "enabledTools": [
    "sierra_execute_query",
    "sierra_manage_schema"
  ]
}
```

### 3. Use Read-Only Database User

Create a read-only user for query-only operations:

```sql
CREATE USER readonly_user WITH PASSWORD 'password';
GRANT CONNECT ON DATABASE mydb TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
```

### 4. Network Isolation

When using Docker, use internal networks:

```yaml
services:
  sierra-mcp:
    networks:
      - internal
    # Don't expose port publicly unless needed
```

---

## Troubleshooting

### Server Not Starting

1. Check Node.js version: `node --version` (requires >= 18.0.0)
2. Verify build exists: `ls build/index.js`
3. Check connection string format

### Connection Refused

1. Verify database is running
2. Check firewall rules
3. For Docker, use `host.docker.internal` instead of `localhost`

### Tools Not Available

1. Check tools-config.json syntax
2. Verify tool names are correct
3. Check server logs for errors

### Session Expired (HTTP mode)

Sessions may timeout. Initialize a new session if you receive session errors.
