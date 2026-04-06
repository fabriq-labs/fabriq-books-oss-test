import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PaginationState {
    page: number;
    pageSize: number;
}

interface PaginationContextType {
    getPaginationState: (type: string, view: string) => PaginationState;
    setPaginationState: (type: string, view: string, state: PaginationState) => void;
    clearPaginationState: (type: string, view: string) => void;
    clearAllPaginationStates: () => void;
    setCurrentType: (type: string, view: string) => void;
    getCurrentType: () => { type: string; view: string } | null;
}

const PaginationContext = createContext<PaginationContextType | undefined>(undefined);

export const usePagination = () => {
    const context = useContext(PaginationContext);
    if (!context) {
        throw new Error('usePagination must be used within a PaginationProvider');
    }
    return context;
};

interface PaginationProviderProps {
    children: ReactNode;
}

export const PaginationProvider: React.FC<PaginationProviderProps> = ({ children }) => {
    const [paginationStates, setPaginationStates] = useState<Record<string, PaginationState>>({});
    const [currentType, setCurrentTypeState] = useState<{ type: string; view: string } | null>(null);

    // Load pagination states and current type from localStorage on mount
    useEffect(() => {
        const storedStates = localStorage.getItem('paginationStates');
        const storedCurrentType = localStorage.getItem('currentPaginationType');

        if (storedStates) {
            try {
                const parsedStates = JSON.parse(storedStates);
                setPaginationStates(parsedStates);
            } catch (error) {
                console.error('Error parsing stored pagination states:', error);
                localStorage.removeItem('paginationStates');
            }
        }

        if (storedCurrentType) {
            try {
                const parsedCurrentType = JSON.parse(storedCurrentType);
                setCurrentTypeState(parsedCurrentType);
            } catch (error) {
                console.error('Error parsing stored current type:', error);
                localStorage.removeItem('currentPaginationType');
            }
        }
    }, []);

    // Save pagination states and current type to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('paginationStates', JSON.stringify(paginationStates));
    }, [paginationStates]);

    useEffect(() => {
        if (currentType) {
            localStorage.setItem('currentPaginationType', JSON.stringify(currentType));
        } else {
            localStorage.removeItem('currentPaginationType');
        }
    }, [currentType]);

    const getStorageKey = (type: string, view: string) => `${type}_${view}`;

    const getPaginationState = (type: string, view: string): PaginationState => {
        const key = getStorageKey(type, view);
        return paginationStates[key] || { page: 1, pageSize: 10 };
    };

    const setPaginationState = (type: string, view: string, state: PaginationState) => {
        const key = getStorageKey(type, view);
        setPaginationStates(prev => ({
            ...prev,
            [key]: state
        }));
    };

    const clearPaginationState = (type: string, view: string) => {
        const key = getStorageKey(type, view);
        setPaginationStates(prev => {
            const newStates = { ...prev };
            delete newStates[key];
            return newStates;
        });
    };

    const clearAllPaginationStates = () => {
        setPaginationStates({});
    };

    const setCurrentType = (type: string, view: string) => {
        // If switching to a different type, clear the previous type's pagination
        if (currentType && (currentType.type !== type || currentType.view !== view)) {
            // Clear the previous type's pagination state
            const previousKey = getStorageKey(currentType.type, currentType.view);
            setPaginationStates(prev => {
                const newStates = { ...prev };
                delete newStates[previousKey];
                return newStates;
            });
        }

        // Set the new current type
        setCurrentTypeState({ type, view });
    };

    const getCurrentType = () => {
        return currentType;
    };

    const value: PaginationContextType = {
        getPaginationState,
        setPaginationState,
        clearPaginationState,
        clearAllPaginationStates,
        setCurrentType,
        getCurrentType,
    };

    return (
        <PaginationContext.Provider value={value}>
            {children}
        </PaginationContext.Provider>
    );
}; 