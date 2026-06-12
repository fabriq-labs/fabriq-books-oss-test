import React from 'react';
import { MessageSquarePlus, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChatThreadSummary } from '@/hooks/useChatThreads';

interface ChatThreadSidebarProps {
  threads: ChatThreadSummary[];
  loading: boolean;
  error: string | null;
  activeChatId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (chatId: string) => void;
  onNewChat: () => void;
  compact?: boolean;
  showHistoryTitle?: boolean;
}

function formatThreadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const ChatThreadSidebar: React.FC<ChatThreadSidebarProps> = ({
  threads,
  loading,
  error,
  activeChatId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onNewChat,
  compact = false,
  showHistoryTitle = false,
}) => {
  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center border-r bg-[#f7f7f8] py-3 gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title="Expand sidebar"
          onClick={onToggleCollapsed}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title="New chat"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r bg-[#f7f7f8]',
        compact ? 'w-40' : showHistoryTitle ? 'w-72' : 'w-64'
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Button
          type="button"
          className="h-9 flex-1 justify-start gap-2 bg-white shadow-sm hover:bg-white/90"
          variant="outline"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="h-4 w-4" />
          {showHistoryTitle ? 'New prompt' : 'New chat'}
        </Button>
      </div>

      {showHistoryTitle && (
        <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Chat history
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <p className="px-2 py-2 text-sm text-gray-500">Loading conversations…</p>
        )}

        {error && (
          <p className="px-2 py-2 text-sm text-red-600">{error}</p>
        )}

        {threads.map((thread) => {
          const isActive = thread.id === activeChatId;
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelect(thread.id)}
              className={cn(
                'mb-1 flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors',
                isActive
                  ? 'bg-white shadow-sm ring-1 ring-gray-200'
                  : 'hover:bg-gray-100'
              )}
            >
              <span className="truncate text-sm font-medium text-gray-900">{thread.title}</span>
              <span className="text-xs text-gray-500">
                {formatThreadDate(thread.updated_at)}
              </span>
            </button>
          );
        })}

        {!loading && !error && threads.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-gray-500">
            No conversations yet. Start a new chat.
          </p>
        )}
      </div>
    </aside>
  );
};
