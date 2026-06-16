import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import Cookies from 'js-cookie';
import { v4 as uuidv4 } from 'uuid';
import { MessageSquarePlus, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatHistoryResponse {
  chatId: string;
  title: string;
  messages: Message[];
}

interface ThreadSummary {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

interface ChatInterfaceProps {
  className?: string;
}

interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ChatErrorBoundary extends Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  state: ChatErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected chat error occurred',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive" className="m-4">
          <AlertTitle>Chat unavailable</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{this.state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                this.props.onReset?.();
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

interface PersistedChatPanelProps {
  chatId: string;
  apiBaseUrl: string;
  authToken?: string;
  onThreadSaved: () => void;
}

const PersistedChatPanel: React.FC<PersistedChatPanelProps> = ({
  chatId,
  apiBaseUrl,
  authToken,
  onThreadSaved,
}) => {
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      setInitialMessages(null);
      setHistoryError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/chat/${encodeURIComponent(chatId)}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        });

        if (response.status === 404) {
          if (!cancelled) setInitialMessages([]);
          return;
        }

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Failed to load chat history (${response.status})`);
        }

        const data = (await response.json()) as ChatHistoryResponse;
        if (!cancelled) {
          setInitialMessages(Array.isArray(data.messages) ? data.messages : []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setHistoryError(
            fetchError instanceof Error ? fetchError.message : 'Failed to load chat history'
          );
          setInitialMessages([]);
        }
      }
    }

    void fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, authToken, chatId]);

  if (initialMessages === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading conversation…</p>
      </div>
    );
  }

  return (
    <PersistedChatPanelInner
      chatId={chatId}
      initialMessages={initialMessages}
      historyError={historyError}
      apiBaseUrl={apiBaseUrl}
      authToken={authToken}
      onThreadSaved={onThreadSaved}
      chatEndRef={chatEndRef}
    />
  );
};

interface PersistedChatPanelInnerProps extends PersistedChatPanelProps {
  initialMessages: Message[];
  historyError: string | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

const PersistedChatPanelInner: React.FC<PersistedChatPanelInnerProps> = ({
  chatId,
  initialMessages,
  historyError,
  apiBaseUrl,
  authToken,
  onThreadSaved,
  chatEndRef,
}) => {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
  } = useChat({
    id: chatId,
    api: `${apiBaseUrl}/api/chat`,
    initialMessages,
    headers: authToken
      ? {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${authToken}`,
        }
      : { Accept: 'text/event-stream' },
    body: { chatId },
    onFinish: () => {
      onThreadSaved();
    },
    onError: (chatError) => {
      console.error('Financial chat stream error:', chatError);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, chatEndRef]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium text-gray-800">Financial Inquiry</h2>
        {isLoading && (
          <Button type="button" variant="outline" size="sm" onClick={() => stop()}>
            Stop
          </Button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {historyError && (
          <Alert variant="destructive">
            <AlertTitle>History warning</AlertTitle>
            <AlertDescription>{historyError}</AlertDescription>
          </Alert>
        )}

        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask about accounts, cash flow, compliance checks, or transaction context.
          </p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'max-w-[95%] rounded-xl px-4 py-3 text-sm',
              message.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-gray-100 text-gray-900'
            )}
          >
            {message.content}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {error && (
        <div className="px-3 pb-2">
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : String(error)}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="shrink-0 border-t px-3 py-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            disabled={isLoading}
            placeholder="Describe your financial question..."
            className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
};

function formatThreadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ className }) => {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState(() => `chat_${uuidv4()}`);
  const [retryKey, setRetryKey] = useState(0);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const authToken = Cookies.get('__session');

  const fetchThreads = useCallback(async () => {
    setThreadsError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Failed to load threads (${response.status})`);
      }

      const payload = (await response.json()) as { data?: ThreadSummary[] };
      const nextThreads = Array.isArray(payload.data) ? payload.data : [];
      setThreads(nextThreads);

      if (nextThreads.length > 0) {
        setActiveChatId((current) =>
          nextThreads.some((thread) => thread.id === current) ? current : nextThreads[0].id
        );
      }
    } catch (fetchError) {
      setThreadsError(
        fetchError instanceof Error ? fetchError.message : 'Failed to load chat threads'
      );
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }, [apiBaseUrl, authToken]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads, retryKey]);

  const handleNewChat = () => {
    setActiveChatId(`chat_${uuidv4()}`);
  };

  const isNewUnsavedThread =
    !threadsLoading && !threads.some((thread) => thread.id === activeChatId);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-white', className)}>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-32 shrink-0 flex-col border-r bg-gray-50 sm:w-36">
          <div className="flex items-center justify-between border-b px-2 py-2">
            <span className="text-xs font-medium text-gray-600">Threads</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Refresh threads"
              onClick={() => void fetchThreads()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="px-2 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start gap-1 px-2 text-xs"
              onClick={handleNewChat}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            {threadsLoading && (
              <p className="px-2 py-1 text-xs text-gray-500">Loading…</p>
            )}

            {threadsError && (
              <p className="px-2 py-1 text-xs text-red-600">{threadsError}</p>
            )}

            {!threadsLoading && isNewUnsavedThread && (
              <button
                type="button"
                className={cn(
                  'mb-1 w-full rounded-md px-2 py-2 text-left text-xs',
                  'bg-primary/10 text-primary'
                )}
              >
                <div className="truncate font-medium">New inquiry</div>
                <div className="text-[10px] opacity-80">Unsaved</div>
              </button>
            )}

            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveChatId(thread.id)}
                className={cn(
                  'mb-1 w-full rounded-md px-2 py-2 text-left text-xs transition-colors',
                  activeChatId === thread.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <div className="truncate font-medium">{thread.title}</div>
                <div className="text-[10px] text-gray-500">
                  {formatThreadDate(thread.updated_at)} · {thread.message_count} msgs
                </div>
              </button>
            ))}

            {!threadsLoading && threads.length === 0 && !isNewUnsavedThread && (
              <p className="px-2 py-1 text-xs text-gray-500">No saved threads yet.</p>
            )}
          </div>
        </aside>

        <ChatErrorBoundary onReset={() => setRetryKey((value) => value + 1)}>
          <PersistedChatPanel
            key={`${activeChatId}-${retryKey}`}
            chatId={activeChatId}
            apiBaseUrl={apiBaseUrl}
            authToken={authToken}
            onThreadSaved={() => void fetchThreads()}
          />
        </ChatErrorBoundary>
      </div>
    </div>
  );
};

export default ChatInterface;
