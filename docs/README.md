# Sierra DB Query - Documentation

Complete documentation for the Sierra DB Query MCP Server.

## Quick Links

| Document | Description |
|----------|-------------|
| [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | File-by-file code architecture explanation |
| [02-MCP-CONFIG.md](./02-MCP-CONFIG.md) | MCP configuration for all clients |
| [03-INTEGRATION-TIPS.md](./03-INTEGRATION-TIPS.md) | Tips for integrating into applications |
| [04-TERMINAL-USAGE.md](./04-TERMINAL-USAGE.md) | Command-line usage with curl |
| [05-PYTHON-CLIENT.md](./05-PYTHON-CLIENT.md) | Python client examples |
| [06-TOOLS-REFERENCE.md](./06-TOOLS-REFERENCE.md) | Complete tool API reference |
| [07-API-ENDPOINTS.md](./07-API-ENDPOINTS.md) | HTTP endpoint documentation |

## Getting Started

### 1. Installation

```bash
# Via npm
npm install -g @sierra/db-query

# Or clone and build
git clone https://github.com/Yaswanth-ampolu/sierra-db-query.git
cd sierra-db-query
npm install
npm run build
```

### 2. Quick Start (stdio mode - for MCP clients)

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "sierra-db": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost:5432/db"
      }
    }
  }
}
```

### 3. Quick Start (HTTP mode - for remote access)

```bash
# Start server
node build/index.js --http --port 7409

# Test health
curl http://localhost:7409/health

# Initialize session
curl -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'
```

## Available Tools

| Tool | Purpose |
|------|---------|
| `sierra_manage_schema` | Tables, columns, ENUMs |
| `sierra_execute_query` | SELECT queries |
| `sierra_execute_mutation` | INSERT/UPDATE/DELETE |
| `sierra_execute_sql` | Arbitrary SQL |
| `sierra_analyze_database` | Configuration/performance analysis |
| `sierra_monitor_database` | Real-time monitoring |
| `sierra_manage_indexes` | Index management |
| `sierra_manage_constraints` | Constraint management |
| `sierra_manage_functions` | Function management |
| `sierra_manage_users` | User/permission management |

## Docker

See [docker/README.md](../docker/README.md) for Docker-specific documentation.

```bash
# Quick start with Docker
docker build -t sierra-mcp -f docker/Dockerfile .
docker run -p 7409:7409 -e MCP_TRANSPORT=http sierra-mcp
```

## Support

- **GitHub Issues:** [github.com/Yaswanth-ampolu/sierra-db-query/issues](https://github.com/Yaswanth-ampolu/sierra-db-query/issues)
- **Smithery:** [smithery.ai/server/@Yaswanth-ampolu/sierra-db-query](https://smithery.ai/server/@Yaswanth-ampolu/sierra-db-query)

## License

MIT License - see [LICENSE](../LICENSE) for details.
