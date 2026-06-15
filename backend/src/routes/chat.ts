import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import {
  appendResponseMessages,
  convertToCoreMessages,
  createIdGenerator,
  streamText,
  type Message as UIMessage,
} from 'ai';
import { authMiddleware } from '../auth/middleware';
import { getModel, getModelId } from '../lib/ai/modelProvider';
import { createChatThread, listChats, loadChat, saveChat } from '../lib/chat-store';
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

export function createChatRouter(): Router {
  const router = Router();

  /** GET /api/chat — list persisted threads for the authenticated user */
  router.get('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.context?.auth?.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const threads = await listChats(userId);
      return res.json({ data: threads });
    } catch (error) {
      logger.error('Failed to list chat threads', { error });
      return res.status(500).json({ error: 'Failed to list chat threads' });
    }
  });

  /**
   * POST /api/chat/threads — create an empty chat thread when the user starts a chat.
   */
  router.post('/threads', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.context?.auth?.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { chatId: requestedChatId, metadata } = req.body as {
        chatId?: string;
        metadata?: Record<string, unknown>;
      };

      const chatId =
        typeof requestedChatId === 'string' && requestedChatId.trim().length > 0
          ? requestedChatId.trim()
          : `chat_${randomUUID()}`;

      const thread = await createChatThread({ chatId, userId, metadata });

      return res.status(201).json({
        data: {
          chatId: thread.id,
          title: thread.title,
          messages: thread.messages,
          metadata: thread.metadata,
          createdAt: thread.created_at,
          updatedAt: thread.updated_at,
        },
      });
    } catch (error) {
      logger.error('Failed to create chat thread', { error });
      return res.status(500).json({ error: 'Failed to create chat thread' });
    }
  });

  /**
   * PUT /api/chat/:chatId — persist UIMessage[] from agent useChat (non-streaming save).
   */
  router.put('/:chatId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.context?.auth?.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { messages, metadata, totalTokensUsed } = req.body as {
        messages?: UIMessage[];
        metadata?: Record<string, unknown>;
        totalTokensUsed?: number;
      };

      if (!Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages must be an array' });
      }

      const chatId = req.params.chatId;
      const existing = await loadChat(chatId, userId);
      if (existing && existing.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!existing) {
        await createChatThread({ chatId, userId, metadata });
      }

      await saveChat({
        chatId,
        userId,
        messages,
        modelUsed: getModelId('agent'),
        totalTokensUsed: typeof totalTokensUsed === 'number' ? totalTokensUsed : 0,
        metadata,
      });

      return res.json({ success: true, chatId });
    } catch (error) {
      logger.error('Failed to save chat thread', { error, chatId: req.params.chatId });
      return res.status(500).json({ error: 'Failed to save chat thread' });
    }
  });

  /** GET /api/chat/:chatId — load persisted UIMessage[] for the authenticated user */
  router.get('/:chatId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.context?.auth?.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const thread = await loadChat(req.params.chatId, userId);
      if (!thread) {
        return res.status(404).json({ error: 'Chat thread not found' });
      }

      return res.json({
        chatId: thread.id,
        title: thread.title,
        messages: thread.messages,
        metadata: thread.metadata,
        modelUsed: thread.model_used,
        totalTokensUsed: thread.total_tokens_used,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
      });
    } catch (error) {
      logger.error('Failed to load chat thread', { error, chatId: req.params.chatId });
      return res.status(500).json({ error: 'Failed to load chat thread' });
    }
  });

  /**
   * POST /api/chat — stream a financial chat turn and persist on finish.
   * Compatible with @ai-sdk/react useChat (data stream protocol).
   */
  router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.context?.auth?.user?.id;
      if (!userId) {
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

      const existing = await loadChat(chatId, userId);
      if (existing && existing.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const modelUsed = getModelId('agent');
      const originalMessages = messages as UIMessage[];

      const result = streamText({
        model: getModel('agent'),
        system: FINANCIAL_SYSTEM_PROMPT,
        // Balances client/server arrays — v4 equivalent of AI SDK 5 `originalMessages`
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
              userId,
              messages: updatedMessages,
              modelUsed,
              totalTokensUsed: resolveTokenUsage(usage),
              metadata,
            });
          } catch (persistError) {
            logger.error('Failed to persist chat thread after stream', {
              error: persistError,
              chatId,
              userId,
            });
          }
        },
        onError: ({ error }) => {
          logger.error('streamText error in /api/chat', {
            error,
            chatId,
            userId,
          });
        },
      });

      // AI SDK v4 Express helper (v5: pipeUIMessageStreamToResponse)
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
