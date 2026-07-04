import type { Message } from '@ai-sdk/react';
import { API_URL, getAuthToken } from '@/api/apiClient';
import { viewAPI, userAPI } from '@/api/metadataApi';
import { userStorage } from '@/utils/userStorage';

const MODEL = 'chat_thread';
const VIEW = 'chat_thread_view';
const DEFAULT_TITLE = 'New Financial Inquiry';
const TITLE_MAX_LENGTH = 60;

async function resolveCurrentUserId(): Promise<string> {
  const cached = userStorage.getUserData()?.id;
  if (cached) {
    return cached;
  }

  const response = (await userAPI.getCurrentUser()) as {
    success?: boolean;
    data?: { id?: string };
  };

  const userId = response?.data?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }

  userStorage.setUserData(response.data as Parameters<typeof userStorage.setUserData>[0]);
  return userId;
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

function deriveThreadTitle(messages: Message[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) return DEFAULT_TITLE;

  const text = extractMessageText((firstUser as { content?: unknown }).content);
  if (!text) return DEFAULT_TITLE;
  if (text.length <= TITLE_MAX_LENGTH) return text;
  return `${text.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}

function threadPath(chatId: string): string {
  return `/api/${MODEL}/${encodeURIComponent(chatId)}/view/${VIEW}`;
}

function listPath(): string {
  return `/api/${MODEL}/view/${VIEW}`;
}

const saveThreadInFlight = new Map<string, Promise<void>>();

/** Thread ids known to exist in DB — subsequent saves use PUT instead of POST. */
const persistedThreadIds = new Set<string>();

export function markChatThreadPersisted(chatId: string): void {
  persistedThreadIds.add(chatId);
}

export function clearPersistedChatThread(chatId: string): void {
  persistedThreadIds.delete(chatId);
}

function isPersistedThread(row: ChatThreadRecord): boolean {
  if (!Array.isArray(row.messages) || row.messages.length === 0) {
    return false;
  }
  if (row.id.startsWith('chat_test_')) {
    return false;
  }
  const title = (row.title ?? '').trim().toLowerCase();
  if (title === 'test thread' || title === 'test') {
    return false;
  }
  return true;
}

async function chatThreadRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<Response> {
  const token = getAuthToken();
  return fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.message || body.error || `Request failed (${response.status})`;
}

async function upsertThreadPayload(
  chatId: string,
  payload: {
    title: string;
    messages: Message[];
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  const userId = await resolveCurrentUserId();

  if (persistedThreadIds.has(chatId)) {
    const updateResponse = await chatThreadRequest('PUT', threadPath(chatId), payload);
    if (updateResponse.ok) {
      return;
    }
    if (updateResponse.status === 404) {
      persistedThreadIds.delete(chatId);
    } else {
      throw new Error(await readErrorMessage(updateResponse));
    }
  }

  const createResponse = await chatThreadRequest('POST', listPath(), {
    id: chatId,
    user_id: userId,
    ...payload,
    total_tokens_used: 0,
  });

  if (createResponse.ok) {
    persistedThreadIds.add(chatId);
    return;
  }

  if (createResponse.status === 409) {
    const updateResponse = await chatThreadRequest('PUT', threadPath(chatId), payload);
    if (updateResponse.ok) {
      persistedThreadIds.add(chatId);
      return;
    }
    throw new Error(await readErrorMessage(updateResponse));
  }

  throw new Error(await readErrorMessage(createResponse));
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatThreadDetail {
  chatId: string;
  title: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
}

interface ChatThreadRecord {
  id: string;
  title?: string;
  messages?: Message[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

function mapSummary(row: ChatThreadRecord): ChatThreadSummary {
  const messages = Array.isArray(row.messages) ? row.messages : [];
  return {
    id: row.id,
    title: row.title ?? DEFAULT_TITLE,
    message_count: messages.length,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

export async function listChatThreads(): Promise<ChatThreadSummary[]> {
  const userId = await resolveCurrentUserId();
  const response = (await viewAPI.search(
    MODEL,
    VIEW,
    1,
    200,
    undefined,
    { user_id: userId },
    { created_at: 'asc' }
  )) as { data?: ChatThreadRecord[] };

  const rows = Array.isArray(response.data) ? response.data : [];
  const persisted = rows.filter(isPersistedThread);
  for (const row of persisted) {
    markChatThreadPersisted(row.id);
  }
  return persisted.map(mapSummary);
}

/**
 * Load a persisted thread. Returns null when the id is a local draft (not yet in DB).
 */
export async function loadChatThread(chatId: string): Promise<ChatThreadDetail | null> {
  const response = await chatThreadRequest('GET', threadPath(chatId));

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { data?: ChatThreadRecord };
  const row = payload.data;
  if (!row?.id) return null;

  markChatThreadPersisted(row.id);

  return {
    chatId: row.id,
    title: row.title ?? DEFAULT_TITLE,
    messages: Array.isArray(row.messages) ? row.messages : [],
    metadata: row.metadata ?? {},
  };
}

/**
 * Persist messages — POST on first save, PUT on subsequent saves in the same thread.
 */
export async function saveChatThread(
  chatId: string,
  messages: Message[],
  metadata?: Record<string, unknown>
): Promise<void> {
  const prev = saveThreadInFlight.get(chatId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => saveChatThreadOnce(chatId, messages, metadata));

  saveThreadInFlight.set(chatId, next);

  try {
    await next;
  } finally {
    if (saveThreadInFlight.get(chatId) === next) {
      saveThreadInFlight.delete(chatId);
    }
  }
}

async function saveChatThreadOnce(
  chatId: string,
  messages: Message[],
  metadata?: Record<string, unknown>
): Promise<void> {
  const title = messages.length > 0 ? deriveThreadTitle(messages) : DEFAULT_TITLE;

  await upsertThreadPayload(chatId, {
    title,
    messages,
    metadata: metadata ?? {},
  });
}

export async function deleteChatThread(chatId: string): Promise<void> {
  const response = await chatThreadRequest('DELETE', threadPath(chatId));
  if (response.ok || response.status === 404) {
    clearPersistedChatThread(chatId);
    return;
  }
  throw new Error(await readErrorMessage(response));
}
