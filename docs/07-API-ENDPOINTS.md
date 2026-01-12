# Sierra DB Query - HTTP API Endpoints

Complete documentation for the Sierra DB Query MCP server HTTP endpoints.

---

## Table of Contents

1. [Overview](#overview)
2. [Base Endpoints](#base-endpoints)
3. [MCP Protocol Endpoints](#mcp-protocol-endpoints)
4. [MCP Methods](#mcp-methods)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Handling](#error-handling)
7. [Session Management](#session-management)
8. [Server-Sent Events (SSE)](#server-sent-events-sse)

---

## Overview

When running in HTTP mode (`--http` flag), the Sierra DB Query MCP server exposes a RESTful API with Server-Sent Events (SSE) for streaming responses.

### Starting HTTP Mode

```bash
# Basic
node build/index.js --http --port 7409

# With environment variables
MCP_TRANSPORT=http PORT=7409 node build/index.js
```

### Base URL

```
http://localhost:7409
```

---

## Base Endpoints

### GET /

Server information and status.

**Request:**
```http
GET / HTTP/1.1
Host: localhost:7409
```

**Response:**
```json
{
  "name": "sierra-db-query",
  "version": "1.0.0",
  "status": "ok",
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health"
  }
}
```

**Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Server is running |

---

### GET /health

Health check endpoint for monitoring and load balancers.

**Request:**
```http
GET /health HTTP/1.1
Host: localhost:7409
```

**Response:**
```json
{
  "status": "ok",
  "server": "sierra-db-query",
  "version": "1.0.0"
}
```

**Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Server is healthy |

**Use Cases:**
- Docker health checks
- Kubernetes liveness/readiness probes
- Load balancer health checks
- Monitoring systems

---

## MCP Protocol Endpoints

### POST /mcp

Main MCP protocol endpoint for all MCP operations.

**Required Headers:**
```http
Content-Type: application/json
Accept: application/json, text/event-stream
```

**Optional Headers:**
```http
mcp-session-id: <session-id>  # Required after initialization
```

**Request Body:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "<method-name>",
  "params": { ... }
}
```

**Response Format:** Server-Sent Events (SSE)
```
event: message
data: {"jsonrpc":"2.0","id":1,"result":{...}}
```

**Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Success (SSE stream) |
| 400 | Bad request (invalid session or not init request) |
| 406 | Not Acceptable (wrong Accept header) |
| 500 | Internal server error |

---

### GET /mcp

SSE stream endpoint for server notifications (used by some MCP clients).

**Required Headers:**
```http
Accept: text/event-stream
mcp-session-id: <session-id>
```

**Response:** SSE stream of server notifications

**Status Codes:**
| Code | Description |
|------|-------------|
| 200 | SSE stream opened |
| 400 | Invalid or missing session ID |

---

### DELETE /mcp

Close an MCP session.

**Required Headers:**
```http
mcp-session-id: <session-id>
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": null,
  "id": null
}
```

**Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Session closed |
| 400 | Invalid or missing session ID |
| 500 | Error closing session |

---

## MCP Methods

### initialize

Start a new MCP session. Required as the first request.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {
        "sierra_manage_schema": { ... },
        "sierra_execute_query": { ... }
      }
    },
    "serverInfo": {
      "name": "sierra-db-query",
      "version": "1.0.0"
    }
  }
}
```

**Response Headers:**
```http
mcp-session-id: <uuid>
```

**Important:** Save the `mcp-session-id` header for subsequent requests.

---

### tools/list

List all available tools and their schemas.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "sierra_manage_schema",
        "description": "Manage PostgreSQL schema...",
        "inputSchema": {
          "type": "object",
          "properties": {
            "operation": { "type": "string", "enum": ["get_info", ...] },
            ...
          },
          "required": ["operation"]
        }
      },
      {
        "name": "sierra_execute_query",
        "description": "Execute SELECT queries...",
        "inputSchema": { ... }
      }
    ]
  }
}
```

---

### tools/call

Execute a specific tool.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "sierra_execute_query",
    "arguments": {
      "operation": "select",
      "query": "SELECT * FROM users LIMIT 5",
      "connectionString": "postgresql://..."
    }
  }
}
```

**Response (Success):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Query executed successfully. Retrieved 5 rows.\n\nResults:\n[{\"id\":1,...}]"
      }
    ]
  }
}
```

**Response (Error):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: relation \"users\" does not exist"
      }
    ],
    "isError": true
  }
}
```

---

## Request/Response Examples

### Complete Workflow Example

```bash
# 1. Initialize session
SESSION_ID=$(curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "curl", "version": "1.0"}
    }
  }' -D - 2>&1 | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\r')

echo "Session ID: $SESSION_ID"

# 2. List tools
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'

# 3. Execute a query
curl -s -X POST http://localhost:7409/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
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

# 4. Close session
curl -s -X DELETE http://localhost:7409/mcp \
  -H "mcp-session-id: $SESSION_ID"
```

---

### JavaScript Fetch Example

```javascript
async function initMCP() {
  const response = await fetch('http://localhost:7409/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'js-client', version: '1.0.0' }
      }
    })
  });

  const sessionId = response.headers.get('mcp-session-id');
  const text = await response.text();

  // Parse SSE response
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  const data = JSON.parse(dataLine.slice(6));

  return { sessionId, data };
}

async function callTool(sessionId, toolName, args) {
  const response = await fetch('http://localhost:7409/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  const text = await response.text();
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  return JSON.parse(dataLine.slice(6));
}

// Usage
const { sessionId } = await initMCP();
const result = await callTool(sessionId, 'sierra_execute_query', {
  operation: 'select',
  query: 'SELECT 1 + 1 AS result',
  connectionString: 'postgresql://...'
});
console.log(result);
```

---

## Error Handling

### JSON-RPC Errors

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  },
  "id": null
}
```

**Standard Error Codes:**
| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Not a valid Request object |
| -32601 | Method not found | Method doesn't exist |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal JSON-RPC error |

**Sierra-Specific Error Codes:**
| Code | Description |
|------|-------------|
| -32000 | Bad Request (e.g., missing session ID) |
| -32001 | Tool execution error |
| -32002 | Database connection error |

### HTTP Error Responses

**400 Bad Request:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Bad Request: No valid session ID provided"
  },
  "id": null
}
```

**406 Not Acceptable:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Not Acceptable: Client must accept both application/json and text/event-stream"
  },
  "id": null
}
```

**500 Internal Server Error:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Internal server error"
  },
  "id": null
}
```

---

## Session Management

### Session Lifecycle

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /mcp (initialize)
       ▼
┌─────────────┐
│   Server    │ ─── Creates session, returns mcp-session-id
└──────┬──────┘
       │
       │ Store session ID
       ▼
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /mcp with mcp-session-id header
       │ (tools/list, tools/call, etc.)
       ▼
┌─────────────┐
│   Server    │ ─── Looks up session, processes request
└──────┬──────┘
       │
       │ Continue making requests...
       ▼
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ DELETE /mcp with mcp-session-id header
       ▼
┌─────────────┐
│   Server    │ ─── Closes session, cleans up resources
└─────────────┘
```

### Session Tips

1. **Store the session ID** after initialization
2. **Reuse sessions** - don't create new ones for each request
3. **Handle session expiry** - if you get session errors, re-initialize
4. **Clean up** - DELETE the session when done

---

## Server-Sent Events (SSE)

The server uses SSE for streaming responses.

### SSE Format

```
event: message
data: {"jsonrpc":"2.0","id":1,"result":{...}}

```

Note the empty line at the end.

### Parsing SSE in Various Languages

**JavaScript:**
```javascript
const text = await response.text();
const lines = text.split('\n');
for (const line of lines) {
  if (line.startsWith('data: ')) {
    const json = JSON.parse(line.slice(6));
    console.log(json);
  }
}
```

**Python:**
```python
text = response.text
for line in text.split('\n'):
    if line.startswith('data: '):
        data = json.loads(line[6:])
        print(data)
```

**Bash:**
```bash
curl ... | grep 'data:' | sed 's/data: //' | jq .
```

### Using EventSource (Browser)

For SSE streaming in browsers:

```javascript
// Note: EventSource is typically for GET requests
// For MCP, you'll usually use fetch with SSE parsing
const response = await fetch('/mcp', { ... });
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  // Parse SSE format
  const lines = chunk.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      handleMessage(data);
    }
  }
}
```

---

## CORS Configuration

The server includes CORS headers for browser-based clients:

```javascript
{
  origin: true,              // Allow any origin
  credentials: true,         // Allow credentials
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'mcp-session-id'],
  exposedHeaders: ['mcp-session-id']
}
```

This enables:
- Cross-origin requests from any domain
- Reading the `mcp-session-id` response header
- Sending the `mcp-session-id` request header

---

## API Summary

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/` | GET | Server info | No |
| `/health` | GET | Health check | No |
| `/mcp` | POST | MCP protocol | Session ID* |
| `/mcp` | GET | SSE stream | Session ID |
| `/mcp` | DELETE | Close session | Session ID |

*Initialize request doesn't require session ID; subsequent requests do.
