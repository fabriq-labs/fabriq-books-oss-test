import React, { useState, useEffect, useMemo } from 'react';
import { Brain, Sparkles, Search, LucideIcon } from 'lucide-react';
import { ToolInvocation } from '@/components/utils/helper';
import { ChatAssistantAvatar } from './ChatMessageLayout';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'data';
    content: string;
    toolInvocations?: ToolInvocation[];
    parts?: Array<{
        type: string;
        toolInvocation?: ToolInvocation;
        [key: string]: unknown;
    }>;
}

interface LoadingIndicatorProps {
    messages: ChatMessage[];
    isLoading: boolean;
    status?: 'streaming' | 'idle' | 'ready' | 'submitted' | 'error';
}

interface LoadingState {
    type: 'thinking' | 'querying';
    messages: string[];
    icon: LucideIcon;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
    messages,
    isLoading,
    status
}) => {
    // Track if we've seen a tool call during this streaming session
    const [hasSeenToolCall, setHasSeenToolCall] = useState(false);
    const [lastToolName, setLastToolName] = useState<string>('');

    // Reset tool call tracking when status becomes ready or idle
    useEffect(() => {
        if (!isLoading && (status === 'ready' || status === 'idle' || status === 'error')) {
            setHasSeenToolCall(false);
            setLastToolName('');
        }
    }, [isLoading, status]);

    // Determine loading state and get messages
    const loadingState = useMemo<LoadingState>(() => {
        // Only check for active tool calls when we're actually loading/streaming
        if (!isLoading && status !== 'streaming') {
            return {
                type: 'thinking',
                messages: ['Thinking...', 'Analyzing your request...', 'Processing...', 'Almost there...'],
                icon: Brain
            };
        }

        // Check if the last message has tool invocations that are actively being called (state === 'call')
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) {
            return {
                type: 'thinking',
                messages: ['Thinking...', 'Analyzing your request...', 'Processing...', 'Almost there...'],
                icon: Brain
            };
        }

        // Check if the message has any content yet
        const hasContent = lastMessage.content && lastMessage.content.trim().length > 0;

        // Get tool invocations from both toolInvocations array and parts array
        // During streaming, tool invocations come in parts with type: "tool-invocation"
        const toolInvocationsFromArray: ToolInvocation[] = lastMessage.toolInvocations || [];

        // Extract tool invocations from parts array (streaming format)
        const toolInvocationsFromParts: ToolInvocation[] = [];
        if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
            lastMessage.parts.forEach(part => {
                if (part.type === 'tool-invocation' && part.toolInvocation) {
                    toolInvocationsFromParts.push(part.toolInvocation);
                }
            });
        }

        // Combine both sources
        const allToolInvocations: ToolInvocation[] = [
            ...toolInvocationsFromArray,
            ...toolInvocationsFromParts
        ];

        // Only check for tools that are ACTIVELY being called (state === 'call')
        // NOT tools that have completed (state === 'result') or failed (state === 'error')
        const activeToolCalls = allToolInvocations.filter(
            (tool: ToolInvocation) => tool.state === 'call' || tool.state === 'partial-call'
        );

        const activeToolNames = activeToolCalls
            .map((tool: ToolInvocation) => tool.toolName)
            .filter(Boolean)
            .filter((name, index, arr) => arr.indexOf(name) === index);

        // If we've seen a tool call and status is still streaming, keep showing "querying"
        if (
            (hasSeenToolCall || activeToolNames.length > 0) &&
            (status === 'streaming' || isLoading)
        ) {
            const toolLabel = activeToolNames[0] ?? lastToolName;
            return {
                type: 'querying',
                messages: toolLabel
                    ? [`Querying ${toolLabel}...`, 'Fetching data...', 'Processing results...']
                    : ['Querying database...', 'Searching records...', 'Gathering information...'],
                icon: Search
            };
        }

        // Check if tools are currently executing (for immediate detection)
        const toolsAreExecuting =
            activeToolCalls.length > 0 &&
            (hasContent ||
                activeToolCalls.some((tool) => tool.args && Object.keys(tool.args).length > 0));

        if (toolsAreExecuting) {
            return {
                type: 'querying',
                messages: activeToolNames.length > 0
                    ? [`Querying ${activeToolNames[0]}...`, 'Fetching data...', 'Processing results...']
                    : ['Querying database...', 'Searching records...', 'Gathering information...'],
                icon: Search
            };
        }

        // If we're loading but no active tool calls, or AI hasn't started responding yet, show thinking
        return {
            type: 'thinking',
            messages: ['Thinking...', 'Analyzing your request...', 'Processing...', 'Almost there...'],
            icon: Brain
        };
    }, [messages, isLoading, status, hasSeenToolCall, lastToolName]);

    // Track active tool names outside useMemo (no setState during render)
    useEffect(() => {
        if (!isLoading && status !== 'streaming') {
            setHasSeenToolCall(false);
            setLastToolName('');
            return;
        }

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) return;

        const fromParts: ToolInvocation[] = [];
        if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
            lastMessage.parts.forEach((part) => {
                if (part.type === 'tool-invocation' && part.toolInvocation) {
                    fromParts.push(part.toolInvocation);
                }
            });
        }
        const allTools = [...(lastMessage.toolInvocations ?? []), ...fromParts];
        const active = allTools.find(
            (tool) => tool.state === 'call' || tool.state === 'partial-call'
        );
        if (active?.toolName) {
            setHasSeenToolCall(true);
            setLastToolName(active.toolName);
        }
    }, [messages, isLoading, status]);

    // Animated typing effect state
    const [displayedText, setDisplayedText] = useState('');
    const [messageIndex, setMessageIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);

    // Get messages key for dependency tracking
    const messagesKey = useMemo(() => loadingState.messages.join(','), [loadingState.messages]);

    // Typing animation effect
    useEffect(() => {
        if (!isLoading) {
            setDisplayedText('');
            setMessageIndex(0);
            setCharIndex(0);
            return;
        }

        if (loadingState.messages.length === 0) return;

        const currentMessage = loadingState.messages[messageIndex];

        if (charIndex < currentMessage.length) {
            const timer = setTimeout(() => {
                setDisplayedText(currentMessage.slice(0, charIndex + 1));
                setCharIndex(charIndex + 1);
            }, 60);
            return () => clearTimeout(timer);
        } else {
            // Wait before switching to next message
            const waitTimer = setTimeout(() => {
                if (messageIndex < loadingState.messages.length - 1) {
                    setMessageIndex(messageIndex + 1);
                    setCharIndex(0);
                    setDisplayedText('');
                } else {
                    // Loop back to first message
                    setMessageIndex(0);
                    setCharIndex(0);
                    setDisplayedText('');
                }
            }, 2000);
            return () => clearTimeout(waitTimer);
        }
    }, [charIndex, messageIndex, loadingState.messages, isLoading]);

    // Reset when loading state changes
    useEffect(() => {
        setMessageIndex(0);
        setCharIndex(0);
        setDisplayedText('');
    }, [loadingState.type, messagesKey]);

    const IconComponent = loadingState.icon;

    return (
        <div className="flex items-start gap-3 w-full max-w-[95%] animate-in fade-in duration-300">
            <ChatAssistantAvatar className="mt-1" />
            <div className="break-words rounded-2xl px-4 py-3 bg-muted border border-border shadow-sm">
                <div className="flex items-center gap-3">
                    {/* Animated icon */}
                    <div className="relative">
                        <IconComponent
                            className={`h-4 w-4 ${loadingState.type === 'querying'
                                ? 'text-primary animate-spin'
                                : 'text-primary/70 animate-pulse'
                                } transition-colors duration-300`}
                        />
                        {loadingState.type === 'querying' && (
                            <Sparkles className="h-3 w-3 text-primary/50 absolute -top-1 -right-1 animate-ping" />
                        )}
                    </div>

                    {/* Animated text with typing effect */}
                    <span className="text-sm font-medium text-foreground">
                        {displayedText}
                    </span>
                </div>
            </div>
        </div>
    );
};

