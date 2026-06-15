import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { registerChatReset } from '@/utils/chatSessionBridge';

export interface PageContext {
    modelName: string;
    viewName: string;
    recordId?: string | null;
    stateId?: string | null;
    viewId?: string | null;
    modelDisplayName?: string | null;
    currentPath?: string;
    promptTypes?: string[];
    /** Model-specific context (e.g., selectedAccountId for posting, supplierId for purchase_order) */
    modelContext?: Record<string, any>;
    /** Limit agent prompt/tools to these models (e.g. posting + account on global chat) */
    focusModels?: string[];
    /** Per-request: user asked for org-wide posting search (omit header legal_entity_id) */
    searchAllEntities?: boolean;
    /** Per-request: latest user question (for server-side entity scoping) */
    userQuestion?: string;
}

interface ChatContextType {
    isChatOpen: boolean;
    toggleChat: () => void;
    closeChat: () => void;
    resetChat: () => void;
    chatSessionId: number;
    pageContext: PageContext | null;
    setPageContext: (pageContext: PageContext | null) => void;
    messagesAi: any[];
    setMessagesAi: (messages: any[]) => void;
    clearMessages: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [pageContext, setPageContext] = useState<PageContext | null>(null);
    const [messagesAi, setMessagesAi] = useState<any[]>([]);
    const [chatSessionId, setChatSessionId] = useState(0);

    const toggleChat = () => {
        setIsChatOpen(prev => !prev);
    };

    const closeChat = () => {
        setIsChatOpen(false);
    };

    const clearMessages = () => {
        setMessagesAi([]);
    };

    const resetChat = useCallback(() => {
        setIsChatOpen(false);
        setMessagesAi([]);
        setPageContext(null);
        setChatSessionId((id) => id + 1);
    }, []);

    useEffect(() => registerChatReset(resetChat), [resetChat]);

    return (
        <ChatContext.Provider value={{
            isChatOpen,
            toggleChat,
            closeChat,
            resetChat,
            chatSessionId,
            pageContext,
            setPageContext,
            messagesAi,
            setMessagesAi,
            clearMessages
        }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}; 