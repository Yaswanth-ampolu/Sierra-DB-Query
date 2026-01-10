#!/usr/bin/env node
import { program } from 'commander';
import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
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

  async run() {
    if (this.availableToolsList.length === 0 && !options.toolsConfig) {
        console.warn("[Sierra MCP Warning] No tools loaded and no tools config provided. Server will start with no active tools.");
    }

    this.loadAndFilterTools();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sierra DB Query MCP server running on stdio');
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

serverInstance.run().catch(error => {
  console.error('Failed to run the server:', error);
  process.exit(1);
});
