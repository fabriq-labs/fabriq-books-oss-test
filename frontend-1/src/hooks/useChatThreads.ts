import { useCallback, useEffect, useState } from 'react';
import {
  createChatThread,
  deleteChatThread,
  listChatThreads,
  type ChatThreadSummary,
} from '@/lib/chatThreadApi';

export type { ChatThreadSummary };

export function useChatThreads(enabled = true) {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setError(null);

    try {
      const data = await listChatThreads();
      setThreads(data);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : 'Failed to load chat threads'
      );
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const createThread = useCallback(
    async (chatId: string, metadata?: Record<string, unknown>) => {
      const createdId = await createChatThread(chatId, metadata);
      await refresh();
      return createdId;
    },
    [refresh]
  );

  const deleteThread = useCallback(
    async (chatId: string) => {
      await deleteChatThread(chatId);
      setThreads((prev) => prev.filter((thread) => thread.id !== chatId));
    },
    []
  );

  return { threads, loading, error, refresh, createThread, deleteThread };
}
