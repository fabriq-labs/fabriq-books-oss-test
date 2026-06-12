import type { Message as UIMessage } from 'ai';
import prisma from './prisma';

export interface ChatThreadRow {
  id: string;
  user_id: string;
  title: string;
  messages: UIMessage[];
  metadata: Record<string, unknown>;
  model_used: string | null;
  total_tokens_used: number;
  created_at: Date;
  updated_at: Date;
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  message_count: number;
  model_used: string | null;
  total_tokens_used: number;
  created_at: Date;
  updated_at: Date;
}

export interface SaveChatParams {
  chatId: string;
  userId: string;
  messages: UIMessage[];
  modelUsed: string;
  totalTokensUsed: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_TITLE = 'New Financial Inquiry';
const TITLE_MAX_LENGTH = 60;

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: string; text?: string } => typeof part === 'object' && part !== null)
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join(' ')
      .trim();
  }
  return '';
}

export function deriveThreadTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) return DEFAULT_TITLE;

  const text = extractMessageText((firstUser as { content?: unknown }).content);
  if (!text) return DEFAULT_TITLE;
  if (text.length <= TITLE_MAX_LENGTH) return text;
  return `${text.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * List chat threads for the authenticated user, oldest created first (stable order;
 * replying to a thread does not move it in the list).
 */
export async function listChats(userId: string): Promise<ChatThreadSummary[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      message_count: number;
      model_used: string | null;
      total_tokens_used: number;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    SELECT
      id,
      title,
      COALESCE(jsonb_array_length(messages), 0)::int AS message_count,
      model_used,
      total_tokens_used,
      created_at,
      updated_at
    FROM chat_thread
    WHERE user_id = ${userId}
      AND COALESCE(jsonb_array_length(messages), 0) > 0
    ORDER BY created_at ASC
  `;

  return rows;
}

/**
 * Fetch a chat thread only when it belongs to the authenticated user.
 */
export async function loadChat(
  chatId: string,
  userId: string
): Promise<ChatThreadRow | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      user_id: string;
      title: string;
      messages: unknown;
      metadata: unknown;
      model_used: string | null;
      total_tokens_used: number;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    SELECT
      id,
      user_id,
      title,
      messages,
      metadata,
      model_used,
      total_tokens_used,
      created_at,
      updated_at
    FROM chat_thread
    WHERE id = ${chatId}
      AND user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    messages: parseJsonColumn<UIMessage[]>(row.messages, []),
    metadata: parseJsonColumn<Record<string, unknown>>(row.metadata, {}),
  };
}

export interface CreateChatThreadParams {
  chatId: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an empty chat thread when the user starts a new conversation.
 * Idempotent — returns the existing row if the thread already exists for this user.
 */
export async function createChatThread({
  chatId,
  userId,
  metadata,
}: CreateChatThreadParams): Promise<ChatThreadRow> {
  const existing = await loadChat(chatId, userId);
  if (existing) return existing;

  const metadataJson = JSON.stringify(metadata ?? {});

  await prisma.$executeRaw`
    INSERT INTO chat_thread (
      id,
      user_id,
      title,
      messages,
      metadata,
      model_used,
      total_tokens_used,
      created_by,
      modified_by,
      created_at,
      updated_at
    )
    VALUES (
      ${chatId},
      ${userId},
      ${DEFAULT_TITLE},
      '[]'::jsonb,
      ${metadataJson}::jsonb,
      NULL,
      0,
      ${userId},
      ${userId},
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `;

  const created = await loadChat(chatId, userId);
  if (!created) {
    throw new Error('Failed to create chat thread');
  }

  return created;
}

/**
 * Upsert the full UIMessage[] payload for a chat thread.
 * Token usage is accumulated across turns for cost and rate-limit tracking.
 */
export async function saveChat({
  chatId,
  userId,
  messages,
  modelUsed,
  totalTokensUsed,
  metadata,
}: SaveChatParams): Promise<void> {
  const existing = await loadChat(chatId, userId);
  if (!existing) {
    await createChatThread({ chatId, userId, metadata });
  }

  const messagesJson = JSON.stringify(messages);
  const metadataJson = JSON.stringify(metadata ?? {});
  const title =
    messages.length > 0
      ? deriveThreadTitle(messages)
      : (existing?.title ?? DEFAULT_TITLE);

  await prisma.$executeRaw`
    INSERT INTO chat_thread (
      id,
      user_id,
      title,
      messages,
      metadata,
      model_used,
      total_tokens_used,
      created_by,
      modified_by,
      created_at,
      updated_at
    )
    VALUES (
      ${chatId},
      ${userId},
      ${title},
      ${messagesJson}::jsonb,
      ${metadataJson}::jsonb,
      ${modelUsed},
      ${totalTokensUsed},
      ${userId},
      ${userId},
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      messages = EXCLUDED.messages,
      model_used = EXCLUDED.model_used,
      total_tokens_used = chat_thread.total_tokens_used + EXCLUDED.total_tokens_used,
      metadata = COALESCE(chat_thread.metadata, '{}'::jsonb) || EXCLUDED.metadata,
      modified_by = EXCLUDED.modified_by,
      updated_at = NOW()
    WHERE chat_thread.user_id = EXCLUDED.user_id
  `;
}
