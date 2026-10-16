import React, { createContext, useContext, useState, useEffect } from 'react';

interface ToolData {
    toolName: string;
    state: string;
    result?: any;
}

interface ToolContextType {
    toolData: ToolData[];
    latestFormToolResponse: ToolData | null;
    addToolData: (data: ToolData) => void;
    getToolData: (toolName: string) => ToolData | undefined;
    clearToolData: () => void;
    clearLatestFormToolResponse: () => void;
}

const ToolContext = createContext<ToolContextType | undefined>(undefined);

export const ToolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toolData, setToolData] = useState<ToolData[]>([]);
    const [latestFormToolResponse, setLatestFormToolResponse] = useState<ToolData | null>(null);

    const addToolData = (data: ToolData) => {
        setToolData(prev => {
            // Check if tool already exists
            const existingIndex = prev.findIndex(tool => tool.toolName === data.toolName);
            if (existingIndex >= 0) {
                // Update existing tool data
                const updated = [...prev];
                updated[existingIndex] = data;
                return updated;
            }
            // Add new tool data
            return [...prev, data];
        });

        // Update latestFormToolResponse for specific tools
        if (data.toolName === 'createRecord' || data.toolName === 'updateRecord' || data.toolName === 'createChildItem' || data.toolName === 'updateChildItem') {
            console.log(`Setting latest form tool response: ${data.toolName}`);
            setLatestFormToolResponse(data);
        }
    };

    const getToolData = (toolName: string) => {
        return toolData.find(tool => tool.toolName === toolName);
    };

    const clearToolData = () => {
        setToolData([]);
        setLatestFormToolResponse(null);
    };

    const clearLatestFormToolResponse = () => {
        setLatestFormToolResponse(null);
    };

    return (
        <ToolContext.Provider value={{
            toolData,
            latestFormToolResponse,
            addToolData,
            getToolData,
            clearToolData,
            clearLatestFormToolResponse
        }}>
            {children}
        </ToolContext.Provider>
    );
};

export const useTool = () => {
    const context = useContext(ToolContext);
    if (context === undefined) {
        throw new Error('useTool must be used within a ToolProvider');
    }
    return context;
}; 