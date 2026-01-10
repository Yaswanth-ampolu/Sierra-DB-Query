#!/usr/bin/env node
import { program } from 'commander';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  isInitializeRequest
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { SierraTool, ToolOutput } from './types/tool.js';
import { DatabaseConnection } from './utils/connection.js';

import { manageSchemaTools } from './tools/schema.js';
import { executeQueryTool, executeMutationTool, executeSqlTool } from './tools/data.js';
import { analyzeDatabaseTool } from './tools/analyze.js';
import { monitorDatabaseTool } from './tools/monitor.js';
import { manageIndexesTool } from './tools/indexes.js';
import { manageConstraintsTool } from './tools/constraints.js';
import { manageFunctionsTool } from './tools/functions.js';
import { manageUsersTool } from './tools/users.js';

program
  .version('1.0.0')
  .option('-cs, --connection-string <string>', 'PostgreSQL connection string')
  .option('-tc, --tools-config <path>', 'Path to tools configuration JSON file')
  .option('--http', 'Use HTTP transport instead of stdio (for Smithery deployment)')
  .option('--port <number>', 'Port for HTTP server (default: 7409)', '7409')
  .parse(process.argv);

const options = program.opts();

function getConnectionString(connectionStringArg?: string): string {
  if (connectionStringArg) {
    return connectionStringArg;
  }
  const cliConnectionString = options.connectionString;
  if (cliConnectionString) {
    return cliConnectionString;
  }
  const envConnectionString = process.env.POSTGRES_CONNECTION_STRING;
  if (envConnectionString) {
    return envConnectionString;
  }
  throw new McpError(
    ErrorCode.InvalidParams,
    'No connection string provided. Provide one in the tool arguments, via the --connection-string CLI option, or set the POSTGRES_CONNECTION_STRING environment variable.'
  );
}

class SierraDBServer {
  private server: Server;
  public availableToolsList: SierraTool[];
  private enabledTools: SierraTool[];
  private enabledToolsMap: Record<string, SierraTool>;

  constructor(initialTools: SierraTool[] = []) {
    this.availableToolsList = [...initialTools];
    this.enabledTools = [];
    this.enabledToolsMap = {};
    this.loadAndFilterTools();

    this.server = new Server(
      {
        name: 'sierra-db-query',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: this.enabledTools.reduce((acc, tool) => {
            acc[tool.name] = {
              name: tool.name,
              description: tool.description,
              inputSchema: zodToJsonSchema(tool.inputSchema),
            };
            return acc;
          }, {} as Record<string, { name: string; description: string; inputSchema: object }>),
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error) => console.error('[Sierra MCP Error]', error);

    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private loadAndFilterTools(): void {
    let toolsToEnable = [...this.availableToolsList];
    const toolsConfigPath = options.toolsConfig;

    if (toolsConfigPath) {
      try {
        const configContent = fs.readFileSync(toolsConfigPath, 'utf-8');
        const config = JSON.parse(configContent);
        if (config && Array.isArray(config.enabledTools) && config.enabledTools.every((t: unknown) => typeof t === 'string')) {
          const enabledToolNames = new Set(config.enabledTools as string[]);
          toolsToEnable = this.availableToolsList.filter(tool => enabledToolNames.has(tool.name));
          console.error(`[Sierra MCP] Loaded tools configuration from ${toolsConfigPath}. Enabled tools: ${toolsToEnable.map(t => t.name).join(', ')}`);

          for (const requestedName of enabledToolNames) {
            if (!this.availableToolsList.some(tool => tool.name === requestedName)) {
              console.warn(`[Sierra MCP Warning] Tool "${requestedName}" specified in config but not found.`);
            }
          }
        } else {
          console.error(`[Sierra MCP Warning] Invalid tools configuration file format at ${toolsConfigPath}.`);
        }
      } catch (error) {
        console.error(`[Sierra MCP Warning] Could not read tools configuration file at ${toolsConfigPath}. Error: ${error instanceof Error ? error.message : String(error)}.`);
      }
    } else {
      if (this.availableToolsList.length > 0) {
        console.error('[Sierra MCP] No tools configuration file provided. All available tools will be enabled.');
      }
    }

    this.enabledTools = toolsToEnable;
    this.enabledToolsMap = toolsToEnable.reduce((acc, tool) => {
      acc[tool.name] = tool;
      return acc;
    }, {} as Record<string, SierraTool>);
  }

  private async cleanup(): Promise<void> {
    console.error('Shutting down Sierra DB Query MCP server...');
    await DatabaseConnection.cleanupPools();
    if (this.server) {
      await this.server.close();
    }
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.enabledTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.server.setRequestHandler(CallToolRequestSchema, (async (request: any): Promise<ToolOutput> => {
      try {
        const toolName = request.params.name;
        const tool = this.enabledToolsMap[toolName];

        if (!tool) {
          const wasAvailable = this.availableToolsList.some(t => t.name === toolName);
          const message = wasAvailable
            ? `Tool "${toolName}" is available but not enabled by current configuration.`
            : `Tool '${toolName}' is not enabled or does not exist.`;
          throw new McpError(ErrorCode.MethodNotFound, message);
        }

        const result: ToolOutput = await tool.execute(request.params.arguments, getConnectionString);
        return result;
      } catch (error) {
        console.error(`Error handling request for tool ${request.params.name}:`, error);
        let errorMessage = error instanceof Error ? error.message : String(error);
        if (error instanceof McpError) {
            errorMessage = error.message;
        }
        return {
          content: [{ type: 'text', text: `Error: ${errorMessage}` }],
          isError: true,
        } as ToolOutput;
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
  }

  getServer(): Server {
    return this.server;
  }

  async runStdio() {
    if (this.availableToolsList.length === 0 && !options.toolsConfig) {
        console.warn("[Sierra MCP Warning] No tools loaded and no tools config provided. Server will start with no active tools.");
    }

    this.loadAndFilterTools();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sierra DB Query MCP server running on stdio');
  }

  async runHttp(port: number) {
    if (this.availableToolsList.length === 0 && !options.toolsConfig) {
        console.warn("[Sierra MCP Warning] No tools loaded and no tools config provided. Server will start with no active tools.");
    }

    this.loadAndFilterTools();

    const app = express();

    // Enable CORS for browser-based clients
    app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept', 'mcp-session-id'],
      exposedHeaders: ['mcp-session-id']
    }));

    app.use(express.json());

    // Map to store transports by session ID
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    // MCP POST endpoint
    app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId: string) => {
              console.error(`Session initialized with ID: ${newSessionId}`);
              transports[newSessionId] = transport;
            }
          });

          // Set up onclose handler to clean up transport when closed
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              console.error(`Transport closed for session ${sid}, removing from transports map`);
              delete transports[sid];
            }
          };

          // Connect the transport to the MCP server
          await this.server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        } else {
          // Invalid request - no session ID or not initialization request
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided'
            },
            id: null
          });
          return;
        }

        // Handle the request with existing transport
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error'
            },
            id: null
          });
        }
      }
    });

    // Handle GET requests for SSE streams
    app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    });

    // Handle DELETE requests for session termination
    app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('Error handling session termination:', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
      }
    });

    // Root endpoint
    app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'sierra-db-query',
        version: '1.0.0',
        status: 'ok',
        endpoints: {
          mcp: '/mcp',
          health: '/health'
        }
      });
    });

    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', server: 'sierra-db-query', version: '1.0.0' });
    });

    // Bind to 0.0.0.0 for Docker/container deployment
    app.listen(port, '0.0.0.0', () => {
      console.error(`Sierra DB Query MCP server running on HTTP port ${port}`);
    });

    // Handle server shutdown
    process.on('SIGINT', async () => {
      console.error('Shutting down server...');
      for (const sessionId in transports) {
        try {
          console.error(`Closing transport for session ${sessionId}`);
          await transports[sessionId].close();
          delete transports[sessionId];
        } catch (error) {
          console.error(`Error closing transport for session ${sessionId}:`, error);
        }
      }
      await this.cleanup();
      console.error('Server shutdown complete');
      process.exit(0);
    });
  }
}

const allTools: SierraTool[] = [
  // Schema Management
  manageSchemaTools,

  // Data Operations
  executeQueryTool,
  executeMutationTool,
  executeSqlTool,

  // Analysis & Monitoring
  analyzeDatabaseTool,
  monitorDatabaseTool,

  // Database Object Management
  manageIndexesTool,
  manageConstraintsTool,
  manageFunctionsTool,
  manageUsersTool,
];

const serverInstance = new SierraDBServer(allTools);

// Determine which transport to use
const useHttp = options.http || process.env.MCP_TRANSPORT === 'http';
const port = parseInt(options.port || process.env.PORT || '7409', 10);

if (useHttp) {
  serverInstance.runHttp(port).catch(error => {
    console.error('Failed to run the HTTP server:', error);
    process.exit(1);
  });
} else {
  serverInstance.runStdio().catch(error => {
    console.error('Failed to run the server:', error);
    process.exit(1);
  });
}
