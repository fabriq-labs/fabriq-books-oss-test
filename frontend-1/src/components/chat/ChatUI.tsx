import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
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
import {
    transformUserMessage,
    buildFileParts,
    getContextSuggestions,
    getInputPlaceholder,
    getInputPaddingClasses,
    formatCurrencyInMessage,
    getChatCurrencyCode,
    type UserMessage,
    type MessagePart
} from './chatUtils';
import { useUserData } from '@/hooks/useUserData';
import Cookies from 'js-cookie';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
    toolInvocations?: ToolInvocation[];
    parts?: MessagePart[];
}

interface ChatUIProps {
    sidebarMode?: boolean;
}

export const ChatUI: React.FC<ChatUIProps> = ({ sidebarMode }) => {
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const chatInputRef = useRef<HTMLInputElement | null>(null);
    const chatContainerRef = useRef<HTMLDivElement | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const { addToolData } = useTool();
    const { pageContext, messagesAi, setMessagesAi, clearMessages } = useChatContext();
    const { getBaseCurrencyCode } = useUserData();
    const token = Cookies.get("__session");

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
        api: `${import.meta.env.VITE_API_BASE_URL || ''}/api/agent/chat/stream`,
        headers: {
            'Accept': 'text/event-stream',
            'Authorization': `Bearer ${token}`,
        },
        body: {
            stream: true,
            context: pageContext || undefined
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
                stream: boolean;
                messages: typeof transformedMessages;
                context?: typeof pageContext;
            } = {
                id,
                stream: true,
                messages: transformedMessages
            };

            // Explicitly include context if pageContext exists
            if (pageContext) {
                preparedBody.context = pageContext;
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

            if (!message.toolInvocations || !Array.isArray(message.toolInvocations)) {
                return;
            }

            // Process tool invocations with results
            message.toolInvocations.forEach((tool: ToolInvocation) => {
                if (tool.state === 'result') {
                    addToolData({
                        toolName: tool.toolName,
                        state: tool.state,
                        result: tool.result
                    });
                }
            });
        },
        onError: (error) => {
            // Stream errors arrive as useChat error state; message comes from backend getErrorMessage
            console.error('Chat error:', error);
            if (error instanceof Error && error.cause) {
                console.error('Chat error cause:', error.cause);
            }
        }
    });

    // Initialize messages from context if available
    useEffect(() => {
        if (messagesAi.length > 0 && messages.length === 0) {
            setMessages(messagesAi);
        }
    }, [messagesAi, messages.length, setMessages]);

    // Sync messages to context when they change
    useEffect(() => {
        setMessagesAi(messages);
    }, [messages, setMessagesAi]);

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

    const formatAssistantText = (content: string) =>
        formatCurrencyInMessage(content, chatCurrencyCode);

    // Render message content (text only, files are rendered separately)
    const renderMessageContent = (msg: ChatMessage, isLastMessage: boolean = false) => {
        const hasToolInvocations = msg.toolInvocations && Array.isArray(msg.toolInvocations);
        const hasTextContent = msg.content && msg.content.trim().length > 0;
        const displayContent =
            msg.role === 'assistant' && hasTextContent
                ? formatAssistantText(msg.content)
                : msg.content;

        if (hasToolInvocations) {
            const willShowToolResponses = (!isLoading || !isLastMessage);

            // If no text content and tool responses won't show, return null
            if (!hasTextContent && !willShowToolResponses) {
                return null;
            }

            return (
                <div className="space-y-3">
                    {hasTextContent && (
                        <div className="mb-3">
                            {displayContent}
                        </div>
                    )}
                    {/* Only show tool responses after loading completes */}
                    {willShowToolResponses && (
                        <ToolResponseRenderer
                            toolInvocations={msg.toolInvocations}
                            sidebarMode={sidebarMode}
                            onSendMessage={async (text) => {
                                if (isLoading) return;
                                try {
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

        return hasTextContent ? <div>{displayContent}</div> : null;
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

        try {
            const parts: MessagePart[] = [];

            if (trimmedInput) {
                parts.push({ type: 'text', text: trimmedInput });
            }

            if (selectedFiles.length > 0) {
                const fileParts = await buildFileParts(selectedFiles);
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

            setInput('');
            clearSelectedFiles();
        } catch (err) {
            console.error('Failed to submit message with attachments:', err);
        }
    };

    // Handle suggestion click and submit
    const handleSuggestionSubmit = async (suggestion: string) => {
        if (isLoading) {
            return;
        }

        setInput(suggestion);

        try {
            const parts: MessagePart[] = [];
            parts.push({ type: 'text', text: suggestion });

            if (selectedFiles.length > 0) {
                const fileParts = await buildFileParts(selectedFiles);
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

            setInput('');
            clearSelectedFiles();
        } catch (err) {
            console.error('Failed to submit suggestion:', err);
        }
    };

    // Get suggestions based on pageContext
    const suggestions = useMemo(
        () => getContextSuggestions(pageContext),
        [pageContext]
    );


    // Get input placeholder and padding
    const inputPlaceholder = useMemo(
        () => getInputPlaceholder(pageContext),
        [pageContext]
    );
    const inputPadding = useMemo(() => getInputPaddingClasses(sidebarMode), [sidebarMode]);

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
                "shadow-md border bg-white",
                sidebarMode ? "rounded-none border-x-0 border-t" : "rounded-2xl",
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
                        className="flex-1 min-w-0 border-none outline-none bg-transparent text-base placeholder-gray-400"
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
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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
                                    ? 'text-gray-400 cursor-not-allowed rounded-full hover:bg-transparent hover:text-gray-400'
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

    // Render suggestion chips
    const renderSuggestions = () => (
        <div className="flex flex-wrap justify-center gap-2 mt-8">
            {suggestions.map((suggestion, i) => (
                <button
                    key={i}
                    className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors border border-gray-200"
                    onClick={() => void handleSuggestionSubmit(suggestion)}
                    type="button"
                >
                    {suggestion}
                </button>
            ))}
        </div>
    );

    // Initial centered UI (when no messages)
    if (messages.length === 0) {
        return (
            <div
                className={cn(
                    "flex flex-col bg-white relative h-full",
                    sidebarMode ? "" : "items-center justify-center min-h-[calc(100vh-8rem)]"
                )}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag and drop overlay for initial state */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-blue-50/95 border-4 border-dashed border-blue-400 rounded-lg flex flex-col items-center justify-center backdrop-blur-sm">
                        <div className="text-center">
                            <Upload className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                            <p className="text-2xl font-semibold text-blue-700 mb-2">Drop any file here</p>
                            <p className="text-lg text-blue-600">Add files to your conversation</p>
                        </div>
                    </div>
                )}

                {sidebarMode ? (
                    <div className={cn(
                        "flex-1 overflow-y-auto",
                        sidebarMode ? "px-2 py-2" : ""
                    )}>
                        <div className="flex flex-col items-center justify-center min-h-full py-4">
                            <div className="mb-6 text-xl font-medium text-gray-800 text-center">
                                What can I help with?
                            </div>
                            {renderSuggestions()}
                            <div className="w-full mt-6">
                                {renderChatInput('', '')}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mb-10 text-3xl font-medium text-gray-800 text-center">
                            What can I help with?
                        </div>
                        <div className="w-full max-w-2xl">
                            {renderChatInput('', inputPadding)}
                            {renderSuggestions()}
                        </div>
                    </>
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

    // Render chat header
    const renderChatHeader = () => (
        <div className={cn(
            "flex items-center justify-between border-b bg-white flex-shrink-0",
            sidebarMode ? "px-2 py-2" : "px-6 py-4"
        )}>
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <h3 className="text-base font-medium text-gray-700">Chat</h3>
            </div>
            <div className="flex items-center gap-2">
                {!isLoading && messages.length > 0 && (
                    <Button
                        variant="outline"
                        size={sidebarMode ? "icon" : "sm"}
                        onClick={() => reload()}
                        className={cn(
                            "text-blue-600 border-blue-200 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors",
                            sidebarMode ? "h-8 w-8" : "text-xs"
                        )}
                        title="Regenerate last response"
                    >
                        <RotateCw className={cn("h-4 w-4", !sidebarMode && "mr-1")} />
                        {!sidebarMode && "Regenerate"}
                    </Button>
                )}
                <Button
                    variant="outline"
                    size={sidebarMode ? "icon" : "sm"}
                    onClick={handleNewChat}
                    className={cn(
                        "text-blue-600 border-blue-200 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors",
                        sidebarMode ? "h-8 w-8" : "text-xs"
                    )}
                    title="New Chat"
                >
                    <MessageSquare className={cn("h-4 w-4", !sidebarMode && "mr-1")} />
                    {!sidebarMode && "New Chat"}
                </Button>
            </div>
        </div>
    );



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
                <div className="absolute inset-0 z-50 bg-blue-50/95 border-4 border-dashed border-blue-400 rounded-lg flex flex-col items-center justify-center backdrop-blur-sm">
                    <div className="text-center">
                        <Upload className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                        <p className="text-2xl font-semibold text-blue-700 mb-2">Drop any file here</p>
                        <p className="text-lg text-blue-600">Add files to your conversation</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4">
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
                                const content = renderMessageContent(msg, isLastMessage);
                                // Only render bubble if there's actual content to show
                                return content ? (
                                    <div
                                        className={`max-w-[95%] rounded-xl px-5 py-3 text-base ${isUser
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-gray-100 text-gray-900'
                                            }`}
                                    >
                                        {content}
                                    </div>
                                ) : null;
                            })()}
                        </div>
                    );
                })}
                {isLoading && (
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
            <div className={cn(
                "w-full border-t bg-white flex-shrink-0",
                sidebarMode ? "py-2 px-2" : "py-6 px-6"
            )}>
                {renderChatInput('', sidebarMode ? '' : 'px-6')}
            </div>
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