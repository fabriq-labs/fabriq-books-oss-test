import Cookies from 'js-cookie';
import type { Message } from '@ai-sdk/react';

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || '';
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = Cookies.get('__session');
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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

export async function listChatThreads(): Promise<ChatThreadSummary[]> {
  const response = await fetch(`${apiBaseUrl()}/api/chat`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Failed to list threads (${response.status})`);
  }

  const payload = (await response.json()) as { data?: ChatThreadSummary[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function createChatThread(
  chatId: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  const response = await fetch(`${apiBaseUrl()}/api/chat/threads`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ chatId, metadata }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Failed to create thread (${response.status})`);
  }

  const payload = (await response.json()) as { data?: { chatId: string } };
  const createdChatId = payload.data?.chatId;
  if (!createdChatId) {
    throw new Error('Create thread response missing chatId');
  }

  return createdChatId;
}

export async function loadChatThread(chatId: string): Promise<ChatThreadDetail | null> {
  const response = await fetch(`${apiBaseUrl()}/api/chat/${encodeURIComponent(chatId)}`, {
    headers: authHeaders(),
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Failed to load thread (${response.status})`);
  }

  return (await response.json()) as ChatThreadDetail;
}

export async function saveChatThread(
  chatId: string,
  messages: Message[],
  metadata?: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${apiBaseUrl()}/api/chat/${encodeURIComponent(chatId)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ messages, metadata }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Failed to save thread (${response.status})`);
  }
}
