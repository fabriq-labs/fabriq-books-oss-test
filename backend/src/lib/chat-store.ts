import type { Message as UIMessage } from 'ai';
import type { AuthContext } from '../auth/types';
import { ModelService } from '../services/core/ModelService';

const MODEL_NAME = 'chat_thread';
const VIEW_NAME = 'chat_thread_view';
const modelService = ModelService.getInstance();

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
  context: AuthContext;
  messages: UIMessage[];
  modelUsed: string;
  totalTokensUsed: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_TITLE = 'New Financial Inquiry';
const TITLE_MAX_LENGTH = 60;

function userIdFilter(context: AuthContext) {
  return { search: { filters: { user_id: context.user!.id } } };
}

function isOwnedByUser(row: Record<string, unknown>, context: AuthContext): boolean {
  return String(row.user_id) === context.user!.id;
}

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

function mapRow(row: Record<string, unknown>): ChatThreadRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title ?? DEFAULT_TITLE),
    messages: parseJsonColumn<UIMessage[]>(row.messages, []),
    metadata: parseJsonColumn<Record<string, unknown>>(row.metadata, {}),
    model_used: (row.model_used as string | null) ?? null,
    total_tokens_used: Number(row.total_tokens_used ?? 0),
    created_at: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
  };
}

/**
 * List chat threads for the authenticated user, oldest created first (stable order;
 * replying to a thread does not move it in the list).
 */
export async function listChats(context: AuthContext): Promise<ChatThreadSummary[]> {
  const result = await modelService.search(
    MODEL_NAME,
    context,
    {
      page: 1,
      pageSize: 200,
      sortOption: { created_at: 'asc' },
      ...userIdFilter(context),
    },
    { viewName: VIEW_NAME }
  );

  if (!result.success || !Array.isArray(result.data)) {
    return [];
  }

  return result.data
    .filter((row) => Array.isArray(row.messages) && row.messages.length > 0)
    .map((row) => ({
      id: row.id,
      title: row.title,
      message_count: row.messages.length,
      model_used: row.model_used ?? null,
      total_tokens_used: row.total_tokens_used ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
}

/**
 * Fetch a chat thread only when it belongs to the authenticated user.
 */
export async function loadChat(
  chatId: string,
  context: AuthContext
): Promise<ChatThreadRow | null> {
  const result = await modelService.getById(MODEL_NAME, context, chatId, {
    viewName: VIEW_NAME,
  });

  if (!result.success || !result.data) {
    return null;
  }

  const row = result.data as Record<string, unknown>;
  if (!isOwnedByUser(row, context)) {
    return null;
  }

  return mapRow(row);
}

export interface CreateChatThreadParams {
  chatId: string;
  context: AuthContext;
  metadata?: Record<string, unknown>;
}

/**
 * Create an empty chat thread when the user starts a new conversation.
 * Idempotent — returns the existing row if the thread already exists for this user.
 */
export async function createChatThread({
  chatId,
  context,
  metadata,
}: CreateChatThreadParams): Promise<ChatThreadRow> {
  const existing = await loadChat(chatId, context);
  if (existing) return existing;

  const result = await modelService.create(
    MODEL_NAME,
    context,
    {
      id: chatId,
      user_id: context.user!.id,
      title: DEFAULT_TITLE,
      messages: [],
      metadata: metadata ?? {},
      total_tokens_used: 0,
    },
    { viewName: VIEW_NAME }
  );

  if (!result.success) {
    const raced = await loadChat(chatId, context);
    if (raced) return raced;
    throw new Error(result.error || 'Failed to create chat thread');
  }

  const created = await loadChat(chatId, context);
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
  context,
  messages,
  modelUsed,
  totalTokensUsed,
  metadata,
}: SaveChatParams): Promise<void> {
  const existing = await loadChat(chatId, context);
  if (!existing) {
    await createChatThread({ chatId, context, metadata });
  }

  const title =
    messages.length > 0
      ? deriveThreadTitle(messages)
      : (existing?.title ?? DEFAULT_TITLE);
  const mergedMetadata = {
    ...(existing?.metadata ?? {}),
    ...(metadata ?? {}),
  };
  const accumulatedTokens = (existing?.total_tokens_used ?? 0) + totalTokensUsed;

  const result = await modelService.update(
    MODEL_NAME,
    context,
    chatId,
    {
      title,
      messages,
      metadata: mergedMetadata,
      model_used: modelUsed,
      total_tokens_used: accumulatedTokens,
    },
    { viewName: VIEW_NAME }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to save chat thread');
  }
}

/**
 * Delete a chat thread owned by the authenticated user.
 * @returns true if a row was deleted
 */
export async function deleteChat(chatId: string, context: AuthContext): Promise<boolean> {
  const existing = await loadChat(chatId, context);
  if (!existing) {
    return false;
  }

  const result = await modelService.delete(MODEL_NAME, context, chatId);
  return result.success;
}
