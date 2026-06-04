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
import { formatCurrency } from '@/lib/formatters';

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
    'Create a posting to record a transaction',
    'List recent postings',
    'List the postings from last month',
    'What is the current balance for my checking account?',
    'Show me every posting where Miscellaneous was the Debit Account',
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
    if (context && context.modelName === 'posting') {
        return [
            'Create a posting to record a transaction',
            'How much did I spend on office supplies last month?',
            'List recent postings'
        ];
    }
    if (context && context.modelName === 'account' && context.recordId) {
        return [
            'What is the current balance for this account?',
            'Show opening balance and debits/credits this month',
            'Monthly balance trend for this financial year',
            'List recent postings on this account'
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
    return 'Ask about postings and accounts';
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
// Currency formatting in chat messages
// ============================================================================

const CURRENCY_CODES = 'USD|INR|EUR|GBP|JPY|CAD|AUD|CHF|CNY|SGD';

/** Comma-grouped (1,234) or plain integers/decimals (12400, 0.00) */
const NUMERIC_PATTERN = /-?(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/g;

/** e.g. "12400 USD", "0 INR" — format and drop redundant suffix */
const AMOUNT_WITH_CURRENCY_SUFFIX = new RegExp(
    `(-?(?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?))\\s+(${CURRENCY_CODES})\\b`,
    'gi'
);

const FINANCIAL_REPORT_PATTERN =
    /\b(?:financial report|opening balance|total debits?|total credits?|total balance|closing balance)\b/i;

function isYearLikeNumber(cleaned: string, num: number): boolean {
    return /^-?\d{4}$/.test(cleaned) && Math.abs(num) >= 1900 && Math.abs(num) <= 2100;
}

function shouldFormatAsCurrency(match: string, text: string, index: number): boolean {
    const cleaned = match.replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) return false;

    const charBefore = text[index - 1] ?? '';
    const charAfter = text[index + match.length] ?? '';
    if (charBefore === '(' || charAfter === ')') return false;
    // Skip dates (2026-01-01) and already-formatted amounts ($0.00)
    if (charAfter === '-' || charBefore === '-' || charBefore === '$' || charBefore === '₹') {
        return false;
    }
    // Skip year in "May 2025:" (colon immediately after year)
    if (charAfter === ':' && isYearLikeNumber(cleaned, num)) return false;

    const contextBefore = text.slice(Math.max(0, index - 40), index);
    const contextAfter = text.slice(index + match.length, index + match.length + 12);

    if (/\bFY\s*$/i.test(contextBefore)) return false;
    if (/\bto\s*$/i.test(contextBefore) && isYearLikeNumber(cleaned, num)) return false;
    if (isYearLikeNumber(cleaned, num)) return false;

    // Financial report lines: "Opening Balance: 0", "Total Debits: 230000"
    if (FINANCIAL_REPORT_PATTERN.test(text)) {
        if (/:\s*$/.test(contextBefore)) return true;
        if (/\b(?:balance|debits?|credits?|opening|closing|total|amount)\s*:\s*$/i.test(contextBefore)) {
            return true;
        }
    }

    if (new RegExp(`^\\s+(${CURRENCY_CODES})\\b`, 'i').test(contextAfter)) return true;
    if (match.includes(',')) return true;
    if (/\b(?:is|was|of)\s+$/i.test(contextBefore)) return true;
    // Colon-separated label values: "Total Debits: 230000"
    if (/:\s*$/.test(contextBefore) &&
        /\b(?:balance|debits?|credits?|opening|closing|total|amount)\b/i.test(contextBefore)) {
        return true;
    }
    if (/\b(?:balance|debits?|credits?|opening|closing|total|amount)\s+$/i.test(contextBefore)) {
        return true;
    }

    return false;
}

/**
 * Formats monetary amounts in assistant message text using locale-aware currency formatting.
 * Skips account codes, FY years, and other non-amount numbers.
 */
export function formatCurrencyInMessage(text: string, currencyCode: string): string {
    if (!text?.trim()) return text;

    // Pass 1: "12400 USD" → "$12,400.00" (symbol + grouping, no trailing " USD")
    let result = text.replace(
        AMOUNT_WITH_CURRENCY_SUFFIX,
        (full, numStr: string, code: string, offset: number) => {
            const charBefore = text[offset - 1] ?? '';
            if (charBefore === '$' || charBefore === '₹') return full;
            const num = parseFloat(numStr.replace(/,/g, ''));
            if (isNaN(num)) return full;
            return formatCurrency(num, code.toUpperCase());
        }
    );

    // Pass 2: remaining amounts (e.g. comma-grouped balances without explicit suffix)
    result = result.replace(NUMERIC_PATTERN, (match, offset) => {
        if (!shouldFormatAsCurrency(match, result, offset)) {
            return match;
        }
        const num = parseFloat(match.replace(/,/g, ''));
        if (isNaN(num)) return match;
        return formatCurrency(num, currencyCode);
    });

    // Pass 3: drop redundant suffix when LLM already included symbol (e.g. "$0.00 USD")
    result = result.replace(
        new RegExp(`(-?[$₹€£][\\d,.]+)\\s+(${CURRENCY_CODES})\\b`, 'gi'),
        '$1'
    );

    return result;
}

/**
 * Resolves the currency code for chat formatting from page context or org default.
 */
export function getChatCurrencyCode(
    pageContext: PageContext | null,
    orgCurrencyCode: string
): string {
    const contextCurrency = pageContext?.modelContext?.currencyCode;
    if (typeof contextCurrency === 'string' && contextCurrency.trim()) {
        return contextCurrency.trim().toUpperCase();
    }
    return orgCurrencyCode;
}

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

