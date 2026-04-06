import {
    FileText,
    FileImage,
    FileSpreadsheet,
    File,
    FileCode,
    Video,
    Music,
    Presentation
} from 'lucide-react';
import { PageContext } from '@/contexts/ChatContext';

// ============================================================================
// Types
// ============================================================================

export type MessagePart =
    | { type: 'text'; text: string }
    | { type: 'file'; data: string; mimeType: string; mediaType?: string }
    | Record<string, unknown>;

export interface UserMessage {
    role: 'user';
    content?: string | MessagePart[];
    parts?: MessagePart[];
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SUGGESTIONS = [
    'Show recent purchase orders',
    'Show spend by department',
    'Create a new purchase requisition',
    'Track the status of my latest order',
    'What are the top spending categories?'
] as const;

// ============================================================================
// Message Transformation Utilities
// ============================================================================

/**
 * Transforms a message part to ensure proper format
 */
export const transformMessagePart = (part: MessagePart): MessagePart => {
    if (part.type === 'file') {
        const mediaType = ('mediaType' in part ? part.mediaType : undefined) ?? part.mimeType;
        return {
            type: 'file',
            data: part.data,
            mediaType
        };
    }

    if (part.type === 'text') {
        return {
            type: 'text',
            text: part.text
        };
    }

    return part;
};

/**
 * Transforms a user message to ensure it has the correct format for the API
 */
export const transformUserMessage = (message: UserMessage): UserMessage => {
    if (message.parts && message.parts.length > 0) {
        const contentArray = message.parts.map(transformMessagePart);
        return {
            ...message,
            content: contentArray
        };
    }

    const textContent = typeof message.content === 'string' ? message.content : '';
    return {
        ...message,
        content: textContent,
        parts: textContent ? [{ type: 'text', text: textContent }] : []
    };
};

// ============================================================================
// Context Utilities
// ============================================================================

/**
 * Gets context-aware suggestions based on page context
 */
export const getContextSuggestions = (context: PageContext | null): string[] => {
    if (context && context.modelName === 'posting' && context.modelContext?.selectedAccountId) {
        return [
            'Which transactions are unreconciled?',
            'Suggest matches for unreconciled items',
            'Show reconciliation summary',
            'Explain the latest transaction'
        ];
    }
    if (context && context.modelDisplayName) {
        const lowerModelName = context.modelDisplayName.toLowerCase();
        return [
            `Show details for this ${lowerModelName}`,
            `What actions can I take on this ${lowerModelName}?`,
            `Explain the current status`,
            `Show related records`
        ];
    }
    return [...DEFAULT_SUGGESTIONS];
};

/**
 * Gets the input placeholder text based on page context
 */
export const getInputPlaceholder = (context: PageContext | null): string => {
    if (context && context.modelDisplayName) {
        return `Ask about this ${context.modelDisplayName.toLowerCase()}`;
    }
    return 'Ask anything';
};

// ============================================================================
// File Handling Utilities
// ============================================================================

/**
 * Reads a file and returns it as a data URL
 */
export const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
};

/**
 * Builds file parts array for message attachments
 */
export const buildFileParts = async (files: File[]): Promise<MessagePart[]> => {
    return Promise.all(
        files.map(async (file) => {
            const dataUrl = await readFileAsDataURL(file);
            const mimeType = file.type || 'application/octet-stream';
            return {
                type: 'file' as const,
                data: dataUrl,
                mimeType,
                mediaType: mimeType,
                name: file.name
            };
        })
    );
};

// ============================================================================
// UI Utilities
// ============================================================================

/**
 * Gets the input padding classes based on sidebar mode
 */
export const getInputPaddingClasses = (sidebarMode: boolean): string => {
    return sidebarMode ? 'px-4 md:px-6' : 'px-6';
};

// ============================================================================
// File Input Utilities
// ============================================================================

/**
 * Gets the appropriate icon component for a file based on MIME type
 */
export const getFileIconForInput = (file: File) => {
    const mimeType = file.type || '';
    if (mimeType.startsWith('image/')) {
        return FileImage;
    }
    if (mimeType === 'application/pdf') {
        return FileText;
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        return FileText;
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
    ) {
        return FileSpreadsheet;
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType === 'application/vnd.ms-powerpoint'
    ) {
        return Presentation;
    }
    if (mimeType.startsWith('video/')) {
        return Video;
    }
    if (mimeType.startsWith('audio/')) {
        return Music;
    }
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        return FileCode;
    }
    return File;
};

/**
 * Gets a human-readable file type label for input display
 */
export const getFileTypeLabelForInput = (file: File): string => {
    const mimeType = file.type || '';
    if (mimeType === 'application/pdf') {
        return 'PDF';
    }
    if (mimeType.startsWith('image/')) {
        return 'Image';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        return 'Word';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
    ) {
        return 'Excel';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType === 'application/vnd.ms-powerpoint'
    ) {
        return 'PowerPoint';
    }
    return 'File';
};

/**
 * Gets the icon background color class for a file type (ChatGPT style)
 */
export const getIconBgColorForInput = (file: File): string => {
    const mimeType = file.type || '';
    if (mimeType === 'application/pdf') {
        return 'bg-red-500';
    }
    if (mimeType.startsWith('image/')) {
        return 'bg-blue-500';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        return 'bg-blue-600';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
    ) {
        return 'bg-green-600';
    }
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType === 'application/vnd.ms-powerpoint'
    ) {
        return 'bg-orange-500';
    }
    return 'bg-gray-500';
};

