# Sierra DB Query - Terminal Usage Guide

This guide covers how to use Sierra DB Query MCP server directly from the terminal using curl and other command-line tools.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Starting the Server](#starting-the-server)
3. [MCP Protocol Basics](#mcp-protocol-basics)
4. [Complete Examples](#complete-examples)
5. [Shell Scripts](#shell-scripts)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Start the server in HTTP mode
node build/index.js --http --port 7409 &

# 2. Check if it's running
curl http://localhost:7409/health

# 3. Initialize a session and get session ID
SESSION_ID=$(curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"terminal","version":"1.0.0"}}}' \
  -D - 2>&1 | grep -i 'mcp-session-id' | cut -d' ' -f2 | tr -d '\r')

echo "Session ID: $SESSION_ID"

# 4. Call a tool
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "sierra_execute_query",
      "arguments": {
        "operation": "select",
        "query": "SELECT version()",
        "connectionString": "postgresql://user:pass@localhost:5432/db"
      }
    }
  }'
```

---

## Starting the Server

### HTTP Mode (for terminal access)

```bash
# Basic HTTP mode
node build/index.js --http --port 7409

# With default connection string
node build/index.js --http --port 7409 \
  --connection-string "postgresql://user:pass@localhost:5432/db"

# Using environment variable
export POSTGRES_CONNECTION_STRING="postgresql://user:pass@localhost:5432/db"
node build/index.js --http --port 7409

# Background process
node build/index.js --http --port 7409 &
echo $!  # Save PID for later

# With nohup (survives terminal close)
nohup node build/index.js --http --port 7409 > sierra.log 2>&1 &
```

### Stdio Mode (for piping)

```bash
# Direct stdio communication (advanced)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"stdio","version":"1.0.0"}}}' | \
node build/index.js --connection-string "postgresql://user:pass@localhost:5432/db"
```

---

## MCP Protocol Basics

### Required Headers

```bash
-H "Content-Type: application/json"
-H "Accept: application/json, text/event-stream"
-H "mcp-session-id: <session-id>"  # Required after initialization
```

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "<method-name>",
  "params": { ... }
}
```

### Methods

| Method | Description |
|--------|-------------|
| `initialize` | Start new session |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |

---

## Complete Examples

### 1. Initialize Session

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -D /dev/stderr \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "terminal-client",
        "version": "1.0.0"
      }
    }
  }' 2>&1 | grep -i mcp-session-id
```

### 2. List Available Tools

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' | grep -o '"name":"[^"]*"' | sort -u
```

### 3. List Tables

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "sierra_manage_schema",
      "arguments": {
        "operation": "get_info",
        "connectionString": "'"$DATABASE_URL"'"
      }
    }
  }'
```

### 4. Run SELECT Query

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "sierra_execute_query",
      "arguments": {
        "operation": "select",
        "query": "SELECT * FROM users LIMIT 10",
        "connectionString": "'"$DATABASE_URL"'"
      }
    }
  }'
```

### 5. Insert Data

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "sierra_execute_mutation",
      "arguments": {
        "operation": "insert",
        "table": "users",
        "data": {
          "name": "John Doe",
          "email": "john@example.com"
        },
        "returning": "*",
        "connectionString": "'"$DATABASE_URL"'"
      }
    }
  }'
```

### 6. Create Table

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "sierra_manage_schema",
      "arguments": {
        "operation": "create_table",
        "tableName": "products",
        "columns": [
          {"name": "id", "type": "SERIAL PRIMARY KEY"},
          {"name": "name", "type": "VARCHAR(255)", "nullable": false},
          {"name": "price", "type": "DECIMAL(10,2)"},
          {"name": "created_at", "type": "TIMESTAMP", "default": "NOW()"}
        ],
        "connectionString": "'"$DATABASE_URL"'"
      }
    }
  }'
```

### 7. Analyze Database

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 7,
    "method": "tools/call",
    "params": {
      "name": "sierra_analyze_database",
      "arguments": {
        "analysisType": "performance",
        "connectionString": "'"$DATABASE_URL"'"
      }
    }
  }'
```

### 8. Monitor Active Queries

```bash
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 8,
    "method": "tools/call",
    "params": {
      "name": "sierra_monitor_database",
      "arguments": {
        "includeQueries": true,
        "includeLocks": true,
        "connectionString": "'"$DATABASE_URL"'"
      }
    }
  }'
```

---

## Shell Scripts

### sierra-query.sh

```bash
#!/bin/bash
# sierra-query.sh - Simple query execution script

MCP_URL="${MCP_URL:-http://localhost:7409/mcp}"
DATABASE_URL="${DATABASE_URL:-postgresql://user:pass@localhost:5432/db}"
SESSION_FILE="/tmp/sierra-session-id"

# Get or create session
get_session() {
  if [ -f "$SESSION_FILE" ]; then
    cat "$SESSION_FILE"
  else
    local session=$(curl -s -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"sierra-cli","version":"1.0.0"}}}' \
      -D - 2>&1 | grep -i 'mcp-session-id' | cut -d' ' -f2 | tr -d '\r')
    echo "$session" > "$SESSION_FILE"
    echo "$session"
  fi
}

# Execute query
query() {
  local sql="$1"
  local session=$(get_session)

  curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $session" \
    -d '{
      "jsonrpc": "2.0",
      "id": '"$(date +%s)"',
      "method": "tools/call",
      "params": {
        "name": "sierra_execute_query",
        "arguments": {
          "operation": "select",
          "query": "'"$sql"'",
          "connectionString": "'"$DATABASE_URL"'"
        }
      }
    }' | grep -o 'data:.*' | sed 's/data: //' | jq -r '.result.content[0].text'
}

# Main
if [ -z "$1" ]; then
  echo "Usage: $0 <SQL query>"
  echo "Example: $0 'SELECT * FROM users LIMIT 5'"
  exit 1
fi

query "$1"
```

### sierra-tables.sh

```bash
#!/bin/bash
# sierra-tables.sh - List all tables

source sierra-query.sh 2>/dev/null || {
  echo "Error: sierra-query.sh not found"
  exit 1
}

SESSION=$(get_session)

curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "sierra_manage_schema",
      "arguments": {
        "operation": "get_info",
        "connectionString": "'"$DATABASE_URL"'"
      }
    }
  }' | grep -o 'data:.*' | sed 's/data: //' | jq -r '.result.content[0].text'
```

### sierra-backup.sh

```bash
#!/bin/bash
# sierra-backup.sh - Backup table data to JSON

TABLE="${1:-users}"
OUTPUT="${2:-backup_${TABLE}_$(date +%Y%m%d).json}"

source sierra-query.sh

echo "Backing up table: $TABLE to $OUTPUT"

result=$(query "SELECT * FROM $TABLE")

echo "$result" > "$OUTPUT"

echo "Backup complete: $OUTPUT"
```

---

## Using with jq

### Pretty Print Results

```bash
curl -s ... | grep -o 'data:.*' | sed 's/data: //' | jq .
```

### Extract Just the Data

```bash
curl -s ... | grep -o 'data:.*' | sed 's/data: //' | jq -r '.result.content[0].text'
```

### Parse JSON Results

```bash
curl -s ... | grep -o 'data:.*' | sed 's/data: //' | \
  jq -r '.result.content[0].text' | \
  jq -r '.Results[] | "\(.name): \(.email)"'
```

---

## Troubleshooting

### Server Not Responding

```bash
# Check if server is running
curl http://localhost:7409/health

# Check process
ps aux | grep "node build/index.js"

# Check port
lsof -i :7409
netstat -tlnp | grep 7409
```

### Session Expired

```bash
# Remove old session and create new one
rm /tmp/sierra-session-id
# Run your script again
```

### Parse SSE Response

The server returns Server-Sent Events format. Parse it:

```bash
# Full response parsing
curl -s ... 2>&1 | while read line; do
  if [[ $line == data:* ]]; then
    echo "${line#data: }" | jq .
  fi
done
```

### Debug Mode

```bash
# See full request/response
curl -v -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '...'
```

### Connection Timeout

```bash
# Increase timeout
curl --connect-timeout 30 --max-time 60 ...
```
