import React, { useState } from 'react';
import { MessageSquarePlus, PanelLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  onDelete?: (chatId: string) => Promise<void>;
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
  onDelete,
  compact = false,
  showHistoryTitle = false,
}) => {
  const [threadToDelete, setThreadToDelete] = useState<ChatThreadSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!threadToDelete || !onDelete) return;

    setDeleting(true);
    try {
      await onDelete(threadToDelete.id);
      setThreadToDelete(null);
    } catch (deleteError) {
      console.error('Failed to delete chat thread', deleteError);
    } finally {
      setDeleting(false);
    }
  };

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
    <>
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
              <div
                key={thread.id}
                className={cn(
                  'group mb-1 flex items-stretch gap-0.5 rounded-lg transition-colors',
                  isActive ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'hover:bg-gray-100'
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left"
                >
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {thread.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatThreadDate(thread.updated_at)}
                  </span>
                </button>

                {onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'my-1.5 h-7 w-7 shrink-0 text-gray-400 hover:text-destructive hover:bg-destructive/10',
                      'opacity-0 group-hover:opacity-100 focus:opacity-100',
                      isActive && 'opacity-100'
                    )}
                    title="Delete conversation"
                    onClick={(event) => {
                      event.stopPropagation();
                      setThreadToDelete(thread);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}

          {!loading && !error && threads.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-gray-500">
              No conversations yet. Start a new chat.
            </p>
          )}
        </div>
      </aside>

      <AlertDialog
        open={threadToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setThreadToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {threadToDelete
                ? `“${threadToDelete.title}” will be permanently removed. This cannot be undone.`
                : 'This conversation will be permanently removed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
