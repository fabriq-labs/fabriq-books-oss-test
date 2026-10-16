import React, { useCallback, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatThreads } from '@/hooks/useChatThreads';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { ChatThreadSidebar } from './ChatThreadSidebar';
import { ChatUI } from './ChatUI';
import { cn } from '@/lib/utils';

interface ChatShellProps {
  className?: string;
  /** Narrower thread list for fixed layout sidebars */
  compact?: boolean;
  sidebarMode?: boolean;
  /** Full-page dashboard chat: wide thread list + main composer */
  fullPage?: boolean;
}

const DEFAULT_DRAFT_TITLE = 'New Financial Inquiry';

/**
 * ChatGPT-style shell: thread sidebar + persisted ChatUI.
 * Empty drafts stay local until the user sends a message.
 */
export const ChatShell: React.FC<ChatShellProps> = ({
  className,
  compact = false,
  sidebarMode = true,
  fullPage = false,
}) => {
  const { threads, loading, error, refresh, deleteThread } = useChatThreads(fullPage);
  const { clearMessages } = useChatContext();
  const [isDraft, setIsDraft] = useState(true);
  const [draftChatId, setDraftChatId] = useState(() => `chat_${uuidv4()}`);
  const [activeChatId, setActiveChatId] = useState('');
  const chatSidebarMode = fullPage ? false : sidebarMode;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const visibleThreads = useMemo(
    () =>
      threads
        .filter((thread) => thread.message_count > 0)
        .sort((a, b) => {
          const aTime = new Date(a.created_at ?? a.updated_at).getTime();
          const bTime = new Date(b.created_at ?? b.updated_at).getTime();
          return aTime - bTime;
        }),
    [threads]
  );

  const startNewChat = useCallback(() => {
    clearMessages();
    setIsDraft(true);
    setActiveChatId('');
    setDraftChatId(`chat_${uuidv4()}`);
  }, [clearMessages]);

  const handleSelectThread = (chatId: string) => {
    setIsDraft(false);
    setActiveChatId(chatId);
  };

  const handleDeleteThread = useCallback(
    async (chatId: string) => {
      const isViewingDeletedThread = !isDraft && chatId === activeChatId;
      if (isViewingDeletedThread) {
        startNewChat();
      }
      await deleteThread(chatId);
    },
    [activeChatId, deleteThread, isDraft, startNewChat]
  );

  const activeThreadTitle = isDraft
    ? DEFAULT_DRAFT_TITLE
    : (visibleThreads.find((thread) => thread.id === activeChatId)?.title ?? DEFAULT_DRAFT_TITLE);

  const chatInstanceKey = isDraft ? draftChatId : activeChatId;
  const resolvedChatId = isDraft ? draftChatId : activeChatId;

  return (
    <div className={cn('flex h-full min-h-0 bg-white', className)}>
      {fullPage && (
        <ChatThreadSidebar
          threads={visibleThreads}
          loading={loading}
          error={error}
          activeChatId={isDraft ? '' : activeChatId}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          onSelect={handleSelectThread}
          onNewChat={startNewChat}
          onDelete={handleDeleteThread}
          showHistoryTitle
        />
      )}

      <div className="min-h-0 min-w-0 flex-1 flex flex-col">
        <ChatUI
          key={chatInstanceKey}
          chatId={resolvedChatId}
          threadTitle={fullPage ? activeThreadTitle : undefined}
          sidebarMode={chatSidebarMode}
          hideThreadControls
          loadPersistedHistory={!isDraft}
          onThreadSaved={fullPage ? () => void refresh() : undefined}
        />
      </div>
    </div>
  );
};

export default ChatShell;
