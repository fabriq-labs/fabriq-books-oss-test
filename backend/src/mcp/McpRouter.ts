import { Router, Request, Response } from 'express';
import { IncomingMessage } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import { PermissionService } from '../services/permissions/PermissionService';
import { AuthContext } from '../auth/types';
import { createMcpServer } from './createMcpServer';
import logger from '../utils/logger';

const router = Router();

/**
 * Resolves an X-API-Key header to an AuthContext.
 * Returns null if the key is missing, invalid, or the user has no org.
 */
async function resolveApiKey(apiKey: string): Promise<AuthContext | null> {
  const usersWithApiKey = await prisma.user.findMany({
    where: { api_key: { not: null } },
    select: { id: true, email: true, org_id: true, name: true, api_key: true },
  });

  let matched: (typeof usersWithApiKey)[0] | null = null;
  for (const u of usersWithApiKey) {
    if (u.api_key && (await bcrypt.compare(apiKey, u.api_key))) {
      matched = u;
      break;
    }
  }

  if (!matched || !matched.org_id) return null;

  const permissions = await PermissionService.getUserPermissions(matched.id);
  return {
    user: {
      id: matched.id,
      email: matched.email,
      org_id: matched.org_id,
      name: matched.name,
    },
    permissions,
  };
}

/**
 * GET /api/mcp
 *
 * Cursor (and some other MCP clients) probe this endpoint to open a persistent
 * SSE stream for server-initiated messages. We run stateless — no persistent
 * streams — so we return 405 to tell the client to use POST only.
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(405).set('Allow', 'POST').json({
    error: 'SSE streaming not supported. Use POST for all MCP requests.',
  });
});

/**
 * POST /api/mcp
 *
 * Stateless MCP endpoint. Authenticates via X-API-Key, then creates a
 * per-request McpServer + StreamableHTTPServerTransport and handles the
 * MCP JSON-RPC message.
 */
router.post('/', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    res.status(401).json({ error: 'X-API-Key header required' });
    return;
  }

  let auth: AuthContext | null;
  try {
    auth = await resolveApiKey(apiKey);
  } catch (err) {
    logger.error('MCP: API key resolution failed', { error: err });
    res.status(401).json({ error: 'API key authentication failed' });
    return;
  }

  if (!auth) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const server = createMcpServer(auth);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session ID issued
  });

  res.on('finish', async () => {
    await transport.close();
    await server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req as unknown as IncomingMessage, res, req.body);
  } catch (err) {
    logger.error('MCP: request handling failed', { error: err });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export { router as mcpRouter };
