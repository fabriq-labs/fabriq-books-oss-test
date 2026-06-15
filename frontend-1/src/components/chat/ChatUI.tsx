import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useChat, type Message } from '@ai-sdk/react';
import { Plus, MessageSquare, Square, RotateCw, Upload, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useTool } from '@/contexts/ToolContext';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { ToolInvocation } from '@/components/utils/helper';
import { ToolResponseRenderer } from './tool-responses';
import { FileAttachment } from './FileAttachment';
import { FileInputDisplay } from './FileInputDisplay';
import { LoadingIndicator } from './LoadingIndicator';
import { AssistantMessageRenderer } from './AssistantMessageRenderer';
import {
    ChatAssistantMessageLayout,
    ChatUserMessageLayout,
    getUserImageUrl,
} from './ChatMessageLayout';
import {
    extractAccountNamesFromPageContext,
    extractAccountNamesFromTools,
} from './financeMessageHighlights';
import {
    transformUserMessage,
    extractUserMessageText,
    userRequestedAllEntities,
    buildFileParts,
    getContextSuggestions,
    getInputPlaceholder,
    formatCurrencyInMessage,
    getChatCurrencyCode,
    formatAssistantMessageForTableTools,
    getMessageToolInvocations,
    getAssistantTurnToolInvocations,
    isLastAssistantMessageInTurn,
    shouldHideChatLoadingIndicator,
    type UserMessage,
    type MessagePart
} from './chatUtils';
import { useUserData } from '@/hooks/useUserData';
import { useEntity } from '@/contexts/EntityContext';
import {
    buildDefaultPostingChatContext,
    enrichFinanceChatContext,
} from '@/utils/postingChatContext';
import Cookies from 'js-cookie';
import { v4 as uuidv4 } from 'uuid';
import {
    createChatThread,
    loadChatThread,
    saveChatThread,
} from '@/lib/chatThreadApi';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
    toolInvocations?: ToolInvocation[];
    parts?: MessagePart[];
}

interface ChatUIProps {
    sidebarMode?: boolean;
    chatId?: string;
    threadTitle?: string;
    hideThreadControls?: boolean;
    onThreadSaved?: () => void;
}

export const ChatUI: React.FC<ChatUIProps> = ({
    sidebarMode,
    chatId,
    threadTitle,
    hideThreadControls = false,
    onThreadSaved,
}) => {
    const [fallbackChatId] = useState(() => `chat_${uuidv4()}`);
    const effectiveChatId = chatId ?? fallbackChatId;

    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const chatInputRef = useRef<HTMLInputElement | null>(null);
    const chatContainerRef = useRef<HTMLDivElement | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const { addToolData } = useTool();
    const { pageContext, messagesAi, setMessagesAi, clearMessages, chatSessionId } = useChatContext();
    const prevChatSessionId = useRef<number | null>(null);
    const { getBaseCurrencyCode, getUserInitials, user } = useUserData();
    const { currentEntityId, currentEntity, entities } = useEntity();

    const chatContext = useMemo(() => {
        const base = pageContext ?? buildDefaultPostingChatContext(currentEntity, entities);
        return enrichFinanceChatContext(base, currentEntity, entities);
    }, [pageContext, currentEntity, entities, currentEntityId, currentEntity?.legal_name]);
    const token = Cookies.get("__session");
    const messagesRef = useRef<Message[]>([]);
    const persistThreadRef = useRef<(threadMessages: Message[]) => Promise<void>>(async () => {});
    const [historyLoaded, setHistoryLoaded] = useState(!effectiveChatId);

    const chatCurrencyCode = useMemo(
        () => getChatCurrencyCode(pageContext, getBaseCurrencyCode()),
        [pageContext, getBaseCurrencyCode]
    );

    const {
        messages,
        setMessages,
        input,
        handleInputChange,
        append,
        stop,
        reload,
        error,
        isLoading,
        setInput,
        status
    } = useChat({
        id: effectiveChatId,
        api: `${import.meta.env.VITE_API_BASE_URL || ''}/api/agent/chat/stream`,
        sendExtraMessageFields: true,
        headers: {
            'Accept': 'text/event-stream',
            'Authorization': `Bearer ${token}`,
        },
        body: {
            stream: true,
            chatId: effectiveChatId,
            context: chatContext || undefined
        },
        experimental_prepareRequestBody: ({ id, messages, requestBody }) => {
            const transformedMessages = messages.map(message => {
                if (message.role === 'user') {
                    return transformUserMessage(message as UserMessage);
                }
                return message;
            });

            const preparedBody: {
                id: string;
                chatId?: string;
                stream: boolean;
                messages: typeof transformedMessages;
                context?: typeof chatContext;
            } = {
                id,
                chatId: effectiveChatId,
                stream: true,
                messages: transformedMessages
            };

            const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
            const userQuestion = lastUserMessage
                ? extractUserMessageText(lastUserMessage as UserMessage)
                : '';

            if (chatContext) {
                preparedBody.context = {
                    ...chatContext,
                    searchAllEntities: userRequestedAllEntities(userQuestion),
                    userQuestion,
                };
            }

            return preparedBody;
        },
        onResponse: async (response) => {
            if (!response.ok) {
                let detail = `Chat request failed (${response.status})`;
                try {
                    const body = await response.clone().json() as {
                        error?: string;
                        message?: string;
                        stack?: string;
                    };
                    if (body?.error) {
                        detail = body.stack ? `${body.error}\n\n${body.stack}` : body.error;
                    } else if (body?.message) detail = body.message;
                } catch {
                    try {
                        const text = await response.clone().text();
                        if (text) detail = text.slice(0, 500);
                    } catch { /* ignore */ }
                }
                throw new Error(detail);
            }
        },
        onFinish: (message) => {
            getMessageToolInvocations(message as ChatMessage).forEach((tool: ToolInvocation) => {
                if (tool.state === 'result') {
                    addToolData({
                        toolName: tool.toolName,
                        state: tool.state,
                        result: tool.result
                    });
                }
            });

            // Persist full session (user + assistant + tool invocations) after each turn
            queueMicrotask(() => {
                void persistThreadRef.current(messagesRef.current);
            });
        },
        onError: (error) => {
            // Stream errors arrive as useChat error state; message comes from backend getErrorMessage
            console.error('Chat error:', error);
            if (error instanceof Error && 'cause' in error && error.cause) {
                console.error('Chat error cause:', error.cause);
            }
        }
    });

    const buildThreadMetadata = useCallback(
        () => ({
            pageContext: chatContext ?? null,
            entityId: currentEntityId ?? null,
            entityName: currentEntity?.legal_name ?? null,
        }),
        [chatContext, currentEntity?.legal_name, currentEntityId]
    );

    const persistThread = useCallback(
        async (threadMessages: Message[]) => {
            if (!effectiveChatId || threadMessages.length === 0) return;
            try {
                await saveChatThread(effectiveChatId, threadMessages, buildThreadMetadata());
                onThreadSaved?.();
            } catch (persistError) {
                console.error('Failed to persist chat thread', persistError);
            }
        },
        [buildThreadMetadata, effectiveChatId, onThreadSaved]
    );

    const ensureThreadExists = useCallback(async () => {
        await createChatThread(effectiveChatId, buildThreadMetadata());
    }, [buildThreadMetadata, effectiveChatId]);

    useEffect(() => {
        persistThreadRef.current = persistThread;
    }, [persistThread]);

    // Keep ref in sync for onFinish persistence
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Load persisted session when switching threads (ChatGPT-style history restore)
    useEffect(() => {
        if (!effectiveChatId) {
            setHistoryLoaded(true);
            return;
        }

        let cancelled = false;
        setHistoryLoaded(false);
        setMessages([]);

        async function loadThreadHistory() {
            try {
                const thread = await loadChatThread(effectiveChatId);
                if (cancelled) return;
                setMessages(Array.isArray(thread?.messages) ? thread.messages : []);
            } catch (loadError) {
                console.error('Failed to load chat thread', loadError);
            } finally {
                if (!cancelled) setHistoryLoaded(true);
            }
        }

        void loadThreadHistory();

        return () => {
            cancelled = true;
        };
    }, [effectiveChatId, setMessages]);

    // Clear local messages only when auth session resets (logout/login), not on remount
    useEffect(() => {
        if (prevChatSessionId.current !== null && prevChatSessionId.current !== chatSessionId) {
            setMessages([]);
            setInput('');
            setSelectedFiles([]);
        }
        prevChatSessionId.current = chatSessionId;
    }, [chatSessionId, setMessages, setInput]);

    // Initialize messages from context if available (same browser session, route changes)
    useEffect(() => {
        if (chatId != null || !historyLoaded) return;
        if (messagesAi.length > 0 && messages.length === 0) {
            setMessages(messagesAi);
        }
    }, [chatId, historyLoaded, messagesAi, messages.length, setMessages, chatSessionId]);

    // Sync messages to context when they change (skip when using persisted thread IDs)
    useEffect(() => {
        if (chatId != null) return;
        setMessagesAi(messages);
    }, [messages, setMessagesAi, chatId]);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Focus chat input when response is complete
    useEffect(() => {
        // Only focus if we have messages (conversation started) and response is complete
        if (messages.length > 0 && !isLoading && chatInputRef.current) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                chatInputRef.current?.focus();
            }, 100);
        }
    }, [isLoading, messages.length]);

    // Check for pre-filled message from dashboard or other sources
    useEffect(() => {
        const checkPrefillMessage = () => {
            const prefillMessage = sessionStorage.getItem('prefillChatMessage');
            if (prefillMessage) {
                setInput(prefillMessage);
                sessionStorage.removeItem('prefillChatMessage');
                // Focus the input so user can see the pre-filled text
                setTimeout(() => {
                    chatInputRef.current?.focus();
                }, 100);
            }
        };

        // Check on mount
        checkPrefillMessage();

        // Listen for event when chat is already open
        window.addEventListener('prefillChatMessage', checkPrefillMessage);
        return () => {
            window.removeEventListener('prefillChatMessage', checkPrefillMessage);
        };
    }, [setInput]);

    const suggestions = useMemo(
        () => getContextSuggestions(pageContext),
        [pageContext]
    );

    const inputPlaceholder = useMemo(
        () => getInputPlaceholder(pageContext),
        [pageContext]
    );
    const formatAssistantText = (content: string) =>
        formatCurrencyInMessage(content, chatCurrencyCode);

    const knownAccountNames = useMemo(() => {
        const names = new Set<string>();
        extractAccountNamesFromPageContext(
            chatContext?.modelContext as Record<string, unknown> | undefined
        ).forEach((name) => names.add(name));
        for (const msg of messages) {
            extractAccountNamesFromTools(getMessageToolInvocations(msg as ChatMessage)).forEach(
                (name) => names.add(name)
            );
        }
        return [...names];
    }, [chatContext?.modelContext, messages]);

    const renderAssistantText = (content: string) => (
        <AssistantMessageRenderer
            content={formatAssistantText(content)}
            knownAccountNames={knownAccountNames}
        />
    );

    if (effectiveChatId && !historyLoaded) {
        return (
            <div className={cn(
                "flex h-full items-center justify-center bg-white",
                sidebarMode ? "" : "min-h-[calc(100vh-8rem)]"
            )}>
                <p className="text-sm text-muted-foreground">Loading conversation…</p>
            </div>
        );
    }

    // Render message content (text only, files are rendered separately)
    const renderMessageContent = (
        msg: ChatMessage,
        messageIndex: number,
        allMessages: ChatMessage[],
        isLastMessage: boolean = false
    ) => {
        if (
            msg.role === 'assistant' &&
            !isLastAssistantMessageInTurn(allMessages, messageIndex)
        ) {
            return null;
        }

        const messageTools =
            msg.role === 'assistant'
                ? getAssistantTurnToolInvocations(allMessages, messageIndex)
                : getMessageToolInvocations(msg);
        const hasToolInvocations = messageTools.length > 0;
        const hasTextContent = msg.content && msg.content.trim().length > 0;
        const textForDisplay =
            msg.role === 'assistant' && hasTextContent
                ? formatAssistantMessageForTableTools(msg.content, messageTools)
                : msg.content;
        const hasDisplayText = Boolean(textForDisplay?.trim());
        const assistantDisplayText =
            msg.role === 'assistant' && hasDisplayText ? textForDisplay : '';

        if (hasToolInvocations) {
            // Show tool tables only after the stream finishes (avoids duplicate loader + table)
            const willShowToolResponses = !isLoading || !isLastMessage;
            if (!hasDisplayText && !willShowToolResponses) {
                return null;
            }

            return (
                <div className="space-y-3">
                    {hasDisplayText && assistantDisplayText && (
                        <div className="mb-3">
                            {renderAssistantText(assistantDisplayText)}
                        </div>
                    )}
                    {/* Only show tool responses after loading completes */}
                    {willShowToolResponses && (
                        <ToolResponseRenderer
                            toolInvocations={messageTools}
                            sidebarMode={sidebarMode}
                            onSendMessage={async (text) => {
                                if (isLoading) return;
                                try {
                                    await ensureThreadExists();
                                    await append(
                                        { role: 'user', content: text },
                                        { allowEmptySubmit: true }
                                    );
                                } catch (err) {
                                    console.error('Failed to send follow-up message', err);
                                }
                            }}
                        />
                    )}
                </div>
            );
        }

        if (hasDisplayText && assistantDisplayText) {
            return renderAssistantText(assistantDisplayText);
        }
        if (hasDisplayText && msg.role === 'user') {
            return <div className="whitespace-pre-wrap">{msg.content}</div>;
        }
        return null;
    };

    // Handle new chat
    const handleNewChat = () => {
        clearMessages();
        setMessages([]);
        setSelectedFiles([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // File handling functions
    const handleFilePickerClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : [];
        setSelectedFiles(files);
    };

    const clearSelectedFiles = () => {
        setSelectedFiles([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Remove a single file from selection
    const removeFile = (indexToRemove: number) => {
        setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    // Drag and drop handlers
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only set dragging to false if we're actually leaving the container
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        // If mouse is outside the container bounds, we're leaving
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            setSelectedFiles(prev => {
                const newFiles = [...prev, ...files];
                return newFiles;
            });
        }
    };

    // Submit message with optional attachments
    const submitMessageWithAttachments = async (
        event?: React.KeyboardEvent<HTMLInputElement> | React.FormEvent<HTMLFormElement>
    ) => {
        event?.preventDefault?.();

        if (isLoading) {
            return;
        }

        const trimmedInput = input.trim();
        if (!trimmedInput && selectedFiles.length === 0) {
            return;
        }

        const filesToSend = [...selectedFiles];
        setInput('');
        clearSelectedFiles();

        try {
            await ensureThreadExists();

            const parts: MessagePart[] = [];

            if (trimmedInput) {
                parts.push({ type: 'text', text: trimmedInput });
            }

            if (filesToSend.length > 0) {
                const fileParts = await buildFileParts(filesToSend);
                parts.push(...fileParts);
            }

            await append(
                {
                    role: 'user',
                    content: trimmedInput,
                    parts: parts as Array<{ type: 'text'; text: string } | { type: 'file'; data: string; mimeType: string; mediaType?: string }>
                },
                {
                    allowEmptySubmit: true
                }
            );
        } catch (err) {
            console.error('Failed to submit message with attachments:', err);
        }
    };

    // Handle suggestion click and submit
    const handleSuggestionSubmit = async (suggestion: string) => {
        if (isLoading) {
            return;
        }

        const filesToSend = [...selectedFiles];
        setInput('');
        clearSelectedFiles();

        try {
            await ensureThreadExists();

            const parts: MessagePart[] = [];
            parts.push({ type: 'text', text: suggestion });

            if (filesToSend.length > 0) {
                const fileParts = await buildFileParts(filesToSend);
                parts.push(...fileParts);
            }

            await append(
                {
                    role: 'user',
                    content: suggestion,
                    parts: parts as Array<{ type: 'text'; text: string } | { type: 'file'; data: string; mimeType: string; mediaType?: string }>
                },
                {
                    allowEmptySubmit: true
                }
            );
        } catch (err) {
            console.error('Failed to submit suggestion:', err);
        }
    };

    // Render chat input component
    const renderChatInput = (containerClasses: string, paddingClasses: string) => (
        <>
            {/* Error display */}
            {error && (
                <div className={cn("mb-3", sidebarMode ? "px-2" : paddingClasses)}>
                    <Alert variant="destructive">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>
                            {error instanceof Error ? error.message : String(error)}
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            {/* File attachments outside input box (above it) */}
            {selectedFiles.length > 0 && (
                <div className={cn("mb-3", sidebarMode ? "px-2" : paddingClasses)}>
                    <FileInputDisplay files={selectedFiles} onRemoveFile={removeFile} />
                </div>
            )}

            <div className={cn(
                "shadow-md border border-border bg-card rounded-3xl",
                !sidebarMode && paddingClasses
            )}>
                <div className={cn(
                    "flex items-center",
                    sidebarMode ? "py-2 px-0" : "py-4 px-4"
                )}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="mr-2 text-primary bg-primary/0 rounded-full hover:bg-primary/20 hover:text-primary/80"
                        type="button"
                        onClick={handleFilePickerClick}
                    >
                        <Plus className="h-5 w-5" />
                    </Button>
                    <input
                        ref={chatInputRef}
                        type="text"
                        className="flex-1 min-w-0 border-none outline-none bg-transparent text-base placeholder:text-muted-foreground"
                        placeholder={inputPlaceholder}
                        value={input}
                        onChange={handleInputChange}
                        disabled={isLoading}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                void submitMessageWithAttachments(e);
                            }
                        }}
                    />
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                        {!isLoading && messages.length > 0 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => reload()}
                                className="text-primary hover:text-primary/80 hover:bg-primary/10"
                                title="Regenerate response"
                            >
                                <RotateCw className="h-5 w-5" />
                            </Button>
                        )}
                        {/* Stop button shows instead of send button when streaming */}
                        {isLoading ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={stop}
                                className="text-red-600 bg-red-50 rounded-full hover:bg-red-100 hover:text-red-700"
                                title="Stop generation"
                            >
                                <Square className="h-5 w-5" />
                            </Button>
                        ) : (
                            /* Send button - always visible, disabled when no content */
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => void submitMessageWithAttachments()}
                                disabled={(!input.trim() && selectedFiles.length === 0)}
                                className={`${(!input.trim() && selectedFiles.length === 0)
                                    ? 'text-muted-foreground cursor-not-allowed rounded-full hover:bg-transparent hover:text-muted-foreground'
                                    : 'text-primary bg-primary/10 rounded-full hover:bg-primary/20 hover:text-primary/80'
                                    }`}
                                title="Send message"
                            >
                                <ArrowUp className="h-5 w-5" />
                            </Button>
                        )}
                        {/* <Button variant="ghost" size="icon">
                            <Mic className="h-5 w-5" />
                        </Button> */}
                    </div>
                </div>
            </div>
        </>
    );

    const renderSuggestions = () => (
        <div className="flex flex-wrap justify-center gap-2 mt-3">
            {suggestions.map((suggestion) => (
                <button
                    key={suggestion}
                    className="px-4 py-2 rounded-full bg-muted hover:bg-accent text-foreground text-sm transition-colors border border-border"
                    onClick={() => void handleSuggestionSubmit(suggestion)}
                    type="button"
                >
                    {suggestion}
                </button>
            ))}
        </div>
    );

    const renderBottomComposer = () => (
        <div
            className={cn(
                'w-full flex-shrink-0 bg-white',
                sidebarMode ? 'px-2 py-2' : 'px-4 py-4 md:px-6 md:py-5'
            )}
        >
            <div className={cn('mx-auto w-full', sidebarMode ? '' : 'max-w-3xl')}>
                {renderChatInput('', sidebarMode ? '' : '')}
            </div>
        </div>
    );

    const renderEmptyComposer = () => (
        <div className={cn('w-full', sidebarMode ? 'px-2' : 'max-w-3xl')}>
            {renderChatInput('', sidebarMode ? '' : '')}
            {renderSuggestions()}
        </div>
    );

    const renderChatHeader = () => (
        <div className={cn(
            "flex items-center justify-between border-b bg-white flex-shrink-0",
            sidebarMode ? "px-2 py-2" : "px-6 py-4"
        )}>
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <h3 className="text-base font-medium text-foreground truncate max-w-[min(100%,20rem)]">
                    {threadTitle ?? 'Chat'}
                </h3>
            </div>
            <div className="flex items-center gap-2">
                {!isLoading && messages.length > 0 && (
                    <Button
                        variant="outline"
                        size={sidebarMode ? "icon" : "sm"}
                        onClick={() => reload()}
                        className={cn(
                            "text-primary border-primary/30 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors",
                            sidebarMode ? "h-8 w-8" : "text-xs"
                        )}
                        title="Regenerate last response"
                    >
                        <RotateCw className={cn("h-4 w-4", !sidebarMode && "mr-1")} />
                        {!sidebarMode && "Regenerate"}
                    </Button>
                )}
                {!hideThreadControls && (
                    <Button
                        variant="outline"
                        size={sidebarMode ? "icon" : "sm"}
                        onClick={handleNewChat}
                        className={cn(
                            "text-primary border-primary/30 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors",
                            sidebarMode ? "h-8 w-8" : "text-xs"
                        )}
                        title="New Chat"
                    >
                        <MessageSquare className={cn("h-4 w-4", !sidebarMode && "mr-1")} />
                        {!sidebarMode && "New Chat"}
                    </Button>
                )}
            </div>
        </div>
    );

    // Empty state — centered welcome, chat bar on top, suggestions below
    if (messages.length === 0) {
        return (
            <div
                className={cn(
                    "flex flex-col bg-white relative h-full overflow-hidden",
                    sidebarMode ? "" : "min-h-[calc(100vh-8rem)]"
                )}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="flex flex-1 items-center justify-center px-4 overflow-y-auto">
                    <div className="flex w-full flex-col items-center py-4">
                        <h1
                            className={cn(
                                "mb-6 font-medium text-foreground text-center",
                                sidebarMode ? "text-xl" : "text-2xl md:text-3xl"
                            )}
                        >
                            What can I help with?
                        </h1>
                        {renderEmptyComposer()}
                    </div>
                </div>

                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-accent/95 border-4 border-dashed border-primary/40 rounded-lg flex flex-col items-center justify-center backdrop-blur-sm">
                        <div className="text-center">
                            <Upload className="h-16 w-16 text-primary mx-auto mb-4" />
                            <p className="text-2xl font-semibold text-foreground mb-2">Drop any file here</p>
                            <p className="text-lg text-muted-foreground">Add files to your conversation</p>
                        </div>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={handleFileSelection}
                />
            </div>
        );
    }

    // Render chat messages
    const renderMessages = () => (
        <div
            ref={chatContainerRef}
            className={cn(
                "flex-1 overflow-y-auto relative",
                sidebarMode ? "px-2 py-2" : "px-0 md:px-6 py-8"
            )}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag and drop overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-accent/95 border-4 border-dashed border-primary/40 rounded-lg flex flex-col items-center justify-center backdrop-blur-sm">
                    <div className="text-center">
                        <Upload className="h-16 w-16 text-primary mx-auto mb-4" />
                        <p className="text-2xl font-semibold text-foreground mb-2">Drop any file here</p>
                        <p className="text-lg text-muted-foreground">Add files to your conversation</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
                {messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const hasFileParts = msg.parts && msg.parts.some(part => part.type === 'file');
                    const hasTextContent = msg.content && msg.content.trim().length > 0;
                    const isLastMessage = idx === messages.length - 1;

                    return (
                        <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                            {/* File attachments above the message bubble (ChatGPT style) */}
                            {hasFileParts && (
                                <div className={`mb-2 max-w-[95%] ${isUser ? 'flex justify-end' : 'flex justify-start'}`}>
                                    <FileAttachment parts={msg.parts!} />
                                </div>
                            )}
                            {/* Message bubble with text content */}
                            {/* Only show bubble when there's actual content to display */}
                            {(() => {
                                const content = renderMessageContent(
                                    msg,
                                    idx,
                                    messages as ChatMessage[],
                                    isLastMessage
                                );
                                if (!content) return null;

                                if (isUser) {
                                    return (
                                        <ChatUserMessageLayout
                                            userName="You"
                                            userInitials={getUserInitials()}
                                            userImage={getUserImageUrl(user)}
                                        >
                                            {content}
                                        </ChatUserMessageLayout>
                                    );
                                }

                                return (
                                    <ChatAssistantMessageLayout>
                                        {content}
                                    </ChatAssistantMessageLayout>
                                );
                            })()}
                        </div>
                    );
                })}
                {isLoading &&
                    !shouldHideChatLoadingIndicator(messages as ChatMessage[]) && (
                    <LoadingIndicator
                        messages={messages}
                        isLoading={isLoading}
                        status={status}
                    />
                )}
                <div ref={chatEndRef} />
            </div>
        </div>
    );

    // Chat layout after first message
    return (
        <div className={cn(
            "flex flex-col bg-white overflow-hidden",
            sidebarMode ? "h-full" : "h-[calc(100vh-8rem)] rounded-lg"
        )}>
            {renderChatHeader()}
            {renderMessages()}
            {renderBottomComposer()}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={handleFileSelection}
            />
        </div>
    );
}; 