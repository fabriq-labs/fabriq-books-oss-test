import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthContext } from '../auth/types';
import { listAccountsHandler } from './tools/listAccounts';

/**
 * Creates a new McpServer with all tools registered for the given auth context.
 *
 * A fresh server is created per request so that the auth context (org_id,
 * permissions) is safely captured in each tool's closure. No shared mutable
 * state between requests.
 */
export function createMcpServer(auth: AuthContext): McpServer {
  const server = new McpServer({
    name: 'fabriq',
    version: '1.0.0',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(
    'list_accounts',
    {
      description:
        'Search accounts in the chart of accounts. Use name for a partial name search (case-insensitive contains) and/or code for an exact code lookup. Returns up to 10 results.',
      inputSchema: {
        name: z.string().optional().describe('Partial account name — case-insensitive contains search.'),
        code: z.string().optional().describe('Exact account code — case-insensitive equals search.'),
      },
    },
    async (params: { name?: string; code?: string }) => {
      const result = await listAccountsHandler(auth)(params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  return server;
}
