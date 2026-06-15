import { Router, Request, Response } from 'express';
import {
  appendResponseMessages,
  convertToCoreMessages,
  createIdGenerator,
  streamText,
  type Message as UIMessage,
} from 'ai';
import { authMiddleware } from '../auth/middleware';
import type { AuthContext } from '../auth/types';
import { getModel, getModelId } from '../lib/ai/modelProvider';
import { loadChat, saveChat } from '../lib/chat-store';
import logger from '../utils/logger';

const FINANCIAL_SYSTEM_PROMPT = `You are a financial advisory assistant for a business accounting platform.
Provide accurate, compliance-aware guidance. When uncertain, state assumptions clearly.
Never invent account balances or transaction data — ask the user to verify against their records.`;

function resolveChatId(body: Record<string, unknown>): string | undefined {
  const chatId = body.chatId ?? body.id;
  return typeof chatId === 'string' && chatId.trim().length > 0 ? chatId.trim() : undefined;
}

function resolveTokenUsage(usage: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): number {
  if (typeof usage.totalTokens === 'number') return usage.totalTokens;
  return (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
}

function getAuthContext(req: Request): AuthContext | null {
  const auth = req.context?.auth;
  if (!auth?.user?.id || !auth.permissions) {
    return null;
  }
  return auth;
}

export function createChatRouter(): Router {
  const router = Router();

  /**
   * POST /api/chat — stream a financial chat turn and persist on finish.
   * Compatible with @ai-sdk/react useChat (data stream protocol).
   *
   * Thread CRUD uses the standard metadata API:
   *   /api/chat_thread/view/chat_thread_view/...
   */
  router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const context = getAuthContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { messages, metadata } = req.body as {
        messages?: UIMessage[];
        metadata?: Record<string, unknown>;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages must be a non-empty array' });
      }

      const chatId = resolveChatId(req.body);
      if (!chatId) {
        return res.status(400).json({ error: 'chatId is required' });
      }

      const existing = await loadChat(chatId, context);
      if (existing && existing.user_id !== context.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const modelUsed = getModelId('agent');
      const originalMessages = messages as UIMessage[];

      const result = streamText({
        model: getModel('agent'),
        system: FINANCIAL_SYSTEM_PROMPT,
        messages: convertToCoreMessages(originalMessages),
        experimental_generateMessageId: createIdGenerator({
          prefix: 'msg_fin',
          size: 16,
        }),
        onFinish: async ({ response, usage }) => {
          try {
            const updatedMessages = appendResponseMessages({
              messages: originalMessages,
              responseMessages: response.messages,
            });

            await saveChat({
              chatId,
              context,
              messages: updatedMessages,
              modelUsed,
              totalTokensUsed: resolveTokenUsage(usage),
              metadata,
            });
          } catch (persistError) {
            logger.error('Failed to persist chat thread after stream', {
              error: persistError,
              chatId,
              userId: context.user.id,
            });
          }
        },
        onError: ({ error }) => {
          logger.error('streamText error in /api/chat', {
            error,
            chatId,
            userId: context.user.id,
          });
        },
      });

      result.pipeDataStreamToResponse(res);
    } catch (error) {
      logger.error('Error in POST /api/chat', { error });

      if (!res.headersSent) {
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to process chat request',
        });
      }

      res.end();
    }
  });

  return router;
}
