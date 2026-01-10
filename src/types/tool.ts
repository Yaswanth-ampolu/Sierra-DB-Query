import type { z } from 'zod';

export type GetConnectionStringFn = (connectionStringArg?: string) => string;

export interface ToolOutput {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface SierraTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (args: unknown, getConnectionString: GetConnectionStringFn) => Promise<ToolOutput>;
}
