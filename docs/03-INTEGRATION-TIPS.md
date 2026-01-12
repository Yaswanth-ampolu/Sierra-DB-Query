# Sierra DB Query - Integration Tips

This guide provides tips and patterns for integrating Sierra DB Query MCP server into various applications and workflows.

---

## Table of Contents

1. [Integration Patterns](#integration-patterns)
2. [Web Applications](#web-applications)
3. [Backend Services](#backend-services)
4. [CI/CD Pipelines](#cicd-pipelines)
5. [Chatbots & AI Assistants](#chatbots--ai-assistants)
6. [Multi-Tenant Applications](#multi-tenant-applications)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Best Practices](#best-practices)

---

## Integration Patterns

### Pattern 1: Direct MCP Client

Use when: Building an AI application that directly speaks MCP protocol.

```
┌─────────────┐     MCP Protocol     ┌──────────────┐
│  Your App   │ ◄──────────────────► │  Sierra MCP  │
│ (MCP Client)│     (stdio/HTTP)     │    Server    │
└─────────────┘                      └──────────────┘
```

**Pros:**
- Full tool access
- Session management
- Native MCP features

**Cons:**
- Requires MCP SDK
- More complex integration

---

### Pattern 2: HTTP API Wrapper

Use when: You want a simple REST-like interface.

```
┌─────────────┐     REST API     ┌─────────────┐     MCP      ┌─────────────┐
│  Your App   │ ◄──────────────► │  API Layer  │ ◄──────────► │ Sierra MCP  │
└─────────────┘                  │  (Express)  │              └─────────────┘
                                 └─────────────┘
```

**Example wrapper:**

```javascript
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client');

const app = express();
const mcpClient = new Client(/* ... */);

// Simple REST endpoint wrapping MCP tool
app.post('/api/query', async (req, res) => {
  const result = await mcpClient.callTool('sierra_execute_query', {
    operation: 'select',
    query: req.body.query,
    connectionString: req.body.connectionString
  });
  res.json(result);
});
```

---

### Pattern 3: LLM Orchestrator

Use when: Building AI agents with Claude API or other LLMs.

```
┌─────────────┐                  ┌─────────────┐                  ┌─────────────┐
│    User     │ ◄──────────────► │  Your App   │ ◄──────────────► │ Claude API  │
└─────────────┘                  │ (Orchestrator)                 └──────┬──────┘
                                 └───────┬─────┘                         │
                                         │                               │
                                         ▼                               │
                                 ┌─────────────┐                         │
                                 │ Sierra MCP  │ ◄───────────────────────┘
                                 │   Server    │    (Tool calls)
                                 └─────────────┘
```

---

## Web Applications

### React Integration

```jsx
// hooks/useSierraMCP.js
import { useState, useCallback } from 'react';

const MCP_URL = process.env.REACT_APP_MCP_URL || 'http://localhost:7409/mcp';

export function useSierraMCP() {
  const [sessionId, setSessionId] = useState(null);

  const initSession = useCallback(async () => {
    const response = await fetch(MCP_URL, {
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
          clientInfo: { name: 'react-app', version: '1.0.0' }
        }
      })
    });

    const sid = response.headers.get('mcp-session-id');
    setSessionId(sid);
    return sid;
  }, []);

  const callTool = useCallback(async (toolName, args) => {
    let sid = sessionId;
    if (!sid) {
      sid = await initSession();
    }

    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sid
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      })
    });

    const reader = response.body.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    const data = text.replace('event: message\ndata: ', '');
    return JSON.parse(data);
  }, [sessionId, initSession]);

  return { callTool, initSession, sessionId };
}
```

### Vue.js Integration

```javascript
// composables/useSierraMCP.js
import { ref } from 'vue';

export function useSierraMCP(mcpUrl = 'http://localhost:7409/mcp') {
  const sessionId = ref(null);
  const loading = ref(false);
  const error = ref(null);

  async function query(sql, connectionString) {
    loading.value = true;
    error.value = null;

    try {
      const result = await callTool('sierra_execute_query', {
        operation: 'select',
        query: sql,
        connectionString
      });
      return result;
    } catch (e) {
      error.value = e.message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // ... callTool implementation similar to React

  return { query, loading, error, sessionId };
}
```

---

## Backend Services

### Node.js Service

```javascript
// services/database-service.js
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

class DatabaseService {
  constructor() {
    this.client = null;
  }

  async connect() {
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['path/to/sierra-db-query/build/index.js'],
      env: {
        POSTGRES_CONNECTION_STRING: process.env.DATABASE_URL
      }
    });

    this.client = new Client({ name: 'my-service', version: '1.0.0' }, {});
    await this.client.connect(transport);
  }

  async getTables() {
    return await this.client.callTool('sierra_manage_schema', {
      operation: 'get_info'
    });
  }

  async query(sql, params = []) {
    return await this.client.callTool('sierra_execute_query', {
      operation: 'select',
      query: sql,
      parameters: params
    });
  }

  async insert(table, data) {
    return await this.client.callTool('sierra_execute_mutation', {
      operation: 'insert',
      table,
      data,
      returning: '*'
    });
  }
}

module.exports = new DatabaseService();
```

### Go Service

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

type MCPClient struct {
    BaseURL   string
    SessionID string
}

type MCPRequest struct {
    JSONRPC string      `json:"jsonrpc"`
    ID      int         `json:"id"`
    Method  string      `json:"method"`
    Params  interface{} `json:"params"`
}

func (c *MCPClient) CallTool(toolName string, args map[string]interface{}) ([]byte, error) {
    request := MCPRequest{
        JSONRPC: "2.0",
        ID:      1,
        Method:  "tools/call",
        Params: map[string]interface{}{
            "name":      toolName,
            "arguments": args,
        },
    }

    body, _ := json.Marshal(request)

    req, _ := http.NewRequest("POST", c.BaseURL+"/mcp", bytes.NewBuffer(body))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Accept", "application/json, text/event-stream")
    req.Header.Set("mcp-session-id", c.SessionID)

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    // Parse SSE response...
    return ioutil.ReadAll(resp.Body)
}
```

---

## CI/CD Pipelines

### GitHub Actions

```yaml
name: Database Migration Check

on:
  pull_request:
    paths:
      - 'migrations/**'

jobs:
  check-schema:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: testpass
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Sierra DB Query
        run: npm install -g @sierra/db-query

      - name: Run Migrations
        run: |
          # Run your migrations
          npm run migrate

      - name: Validate Schema with Sierra
        run: |
          sierra-db-query --connection-string "postgresql://postgres:testpass@localhost:5432/postgres" \
            --validate-schema expected-schema.json
```

### GitLab CI

```yaml
database-analysis:
  stage: test
  image: node:20
  services:
    - postgres:16
  variables:
    POSTGRES_PASSWORD: testpass
  script:
    - npm install -g @sierra/db-query
    - |
      node -e "
        const { execSync } = require('child_process');
        const result = execSync('npx @sierra/db-query --http --port 7409 &');
        // Run analysis...
      "
```

---

## Chatbots & AI Assistants

### Slack Bot Integration

```javascript
const { App } = require('@slack/bolt');
const { MCPClient } = require('./mcp-client');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const mcpClient = new MCPClient('http://localhost:7409/mcp');

app.command('/db-query', async ({ command, ack, respond }) => {
  await ack();

  try {
    const result = await mcpClient.callTool('sierra_execute_query', {
      operation: 'select',
      query: command.text,
      connectionString: process.env.DATABASE_URL,
      limit: 10
    });

    await respond({
      response_type: 'ephemeral',
      text: '```' + JSON.stringify(result, null, 2) + '```'
    });
  } catch (error) {
    await respond({
      response_type: 'ephemeral',
      text: `Error: ${error.message}`
    });
  }
});
```

### Discord Bot

```javascript
const { Client, GatewayIntentBits } = require('discord.js');
const { MCPClient } = require('./mcp-client');

const discord = new Client({ intents: [GatewayIntentBits.Guilds] });
const mcp = new MCPClient('http://localhost:7409/mcp');

discord.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'tables') {
    const result = await mcp.callTool('sierra_manage_schema', {
      operation: 'get_info',
      connectionString: process.env.DATABASE_URL
    });

    await interaction.reply(`Tables: ${result.tables.join(', ')}`);
  }
});
```

---

## Multi-Tenant Applications

### Per-Request Connection Strings

```javascript
// Middleware to inject tenant database connection
function tenantMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  const tenantConfig = getTenantConfig(tenantId);

  req.dbConnection = tenantConfig.connectionString;
  next();
}

// Use in route handler
app.post('/api/query', tenantMiddleware, async (req, res) => {
  const result = await mcpClient.callTool('sierra_execute_query', {
    operation: 'select',
    query: req.body.query,
    connectionString: req.dbConnection  // Per-tenant connection
  });
  res.json(result);
});
```

### Connection Pool per Tenant

```javascript
const tenantPools = new Map();

function getTenantPool(tenantId) {
  if (!tenantPools.has(tenantId)) {
    const config = getTenantConfig(tenantId);
    tenantPools.set(tenantId, {
      connectionString: config.connectionString,
      mcpClient: new MCPClient(/* ... */)
    });
  }
  return tenantPools.get(tenantId);
}
```

---

## Monitoring & Alerting

### Prometheus Metrics

```javascript
const promClient = require('prom-client');

const queryDuration = new promClient.Histogram({
  name: 'sierra_query_duration_seconds',
  help: 'Duration of Sierra MCP queries',
  labelNames: ['tool', 'operation', 'status']
});

async function callToolWithMetrics(tool, args) {
  const end = queryDuration.startTimer();
  try {
    const result = await mcpClient.callTool(tool, args);
    end({ tool, operation: args.operation, status: 'success' });
    return result;
  } catch (error) {
    end({ tool, operation: args.operation, status: 'error' });
    throw error;
  }
}
```

### Health Check Dashboard

```javascript
// Regular health monitoring
setInterval(async () => {
  try {
    const result = await mcpClient.callTool('sierra_monitor_database', {
      connectionString: process.env.DATABASE_URL,
      includeQueries: true,
      includeLocks: true,
      alertThresholds: {
        connectionPercentage: 80,
        longRunningQuerySeconds: 30
      }
    });

    // Send to monitoring system
    sendToDatadog(result);
  } catch (error) {
    alertOps('Sierra MCP health check failed', error);
  }
}, 60000);
```

---

## Best Practices

### 1. Connection String Security

```javascript
// DON'T: Hardcode connection strings
const conn = "postgresql://user:password@localhost:5432/db";

// DO: Use environment variables
const conn = process.env.DATABASE_URL;

// DO: Use secrets management
const conn = await secretsManager.getSecret('DATABASE_URL');
```

### 2. Error Handling

```javascript
async function safeQuery(query) {
  try {
    const result = await mcpClient.callTool('sierra_execute_query', {
      operation: 'select',
      query,
      timeout: 30000  // Always set timeouts
    });

    if (result.isError) {
      throw new Error(result.content[0].text);
    }

    return result;
  } catch (error) {
    logger.error('Query failed', { query, error: error.message });
    throw new DatabaseError('Query execution failed');
  }
}
```

### 3. Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const dbLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,  // 100 requests per minute
  message: 'Too many database requests'
});

app.use('/api/db', dbLimiter);
```

### 4. Query Validation

```javascript
// Validate queries before execution
function validateQuery(query) {
  const forbidden = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER'];
  const upperQuery = query.toUpperCase();

  for (const keyword of forbidden) {
    if (upperQuery.includes(keyword)) {
      throw new Error(`Forbidden operation: ${keyword}`);
    }
  }
}
```

### 5. Logging & Auditing

```javascript
async function auditedQuery(userId, query, args) {
  const startTime = Date.now();

  try {
    const result = await mcpClient.callTool('sierra_execute_query', args);

    await auditLog.insert({
      userId,
      query,
      duration: Date.now() - startTime,
      rowCount: result.rowCount,
      timestamp: new Date()
    });

    return result;
  } catch (error) {
    await auditLog.insert({
      userId,
      query,
      error: error.message,
      timestamp: new Date()
    });
    throw error;
  }
}
```
