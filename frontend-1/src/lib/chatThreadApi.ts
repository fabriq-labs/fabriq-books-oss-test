import type { Message } from '@ai-sdk/react';
import { API_URL, getAuthToken } from '@/api/apiClient';
import { viewAPI } from '@/api/metadataApi';

const MODEL = 'chat_thread';
const VIEW = 'chat_thread_view';
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
  const response = (await viewAPI.search(
    MODEL,
    VIEW,
    1,
    200,
    undefined,
    {},
    { created_at: 'asc' }
  )) as { data?: ChatThreadRecord[] };

  const rows = Array.isArray(response.data) ? response.data : [];
  return rows
    .filter((row) => Array.isArray(row.messages) && row.messages.length > 0)
    .map(mapSummary);
}

/**
 * Create an empty thread row. Idempotent — returns chatId if the row already exists.
 */
export async function createChatThread(
  chatId: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  const response = await chatThreadRequest('POST', listPath(), {
    id: chatId,
    title: DEFAULT_TITLE,
    messages: [],
    metadata: metadata ?? {},
    total_tokens_used: 0,
  });

  if (response.ok || response.status === 409) {
    return chatId;
  }

  throw new Error(await readErrorMessage(response));
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

  return {
    chatId: row.id,
    title: row.title ?? DEFAULT_TITLE,
    messages: Array.isArray(row.messages) ? row.messages : [],
    metadata: row.metadata ?? {},
  };
}

/**
 * Persist messages — update-first upsert so we never POST twice for the same id.
 */
export async function saveChatThread(
  chatId: string,
  messages: Message[],
  metadata?: Record<string, unknown>
): Promise<void> {
  const title = messages.length > 0 ? deriveThreadTitle(messages) : DEFAULT_TITLE;

  const payload = {
    title,
    messages,
    metadata: metadata ?? {},
  };

  const updateResponse = await chatThreadRequest('PUT', threadPath(chatId), payload);
  if (updateResponse.ok) {
    return;
  }

  if (updateResponse.status === 404) {
    const createResponse = await chatThreadRequest('POST', listPath(), {
      id: chatId,
      ...payload,
      total_tokens_used: 0,
    });

    if (createResponse.ok || createResponse.status === 409) {
      if (createResponse.status === 409) {
        const retryUpdate = await chatThreadRequest('PUT', threadPath(chatId), payload);
        if (!retryUpdate.ok) {
          throw new Error(await readErrorMessage(retryUpdate));
        }
      }
      return;
    }

    throw new Error(await readErrorMessage(createResponse));
  }

  throw new Error(await readErrorMessage(updateResponse));
}

export async function deleteChatThread(chatId: string): Promise<void> {
  const response = await chatThreadRequest('DELETE', threadPath(chatId));
  if (response.ok || response.status === 404) {
    return;
  }
  throw new Error(await readErrorMessage(response));
}
