import React, { createContext, useContext, useState } from 'react';

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
}

interface ChatContextType {
    isChatOpen: boolean;
    toggleChat: () => void;
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

    const toggleChat = () => {
        setIsChatOpen(prev => !prev);
    };

    const clearMessages = () => {
        setMessagesAi([]);
    };

    return (
        <ChatContext.Provider value={{
            isChatOpen,
            toggleChat,
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