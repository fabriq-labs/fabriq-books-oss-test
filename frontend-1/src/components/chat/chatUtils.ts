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
import type { ToolInvocation } from '@/components/utils/helper';

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

export const POSTING_CHAT_SUGGESTIONS = [
    'List postings from yesterday',
    'How much did I spend on office supplies last month?',
    'Create a posting to record a transaction',
] as const;

export const ACCOUNT_CHAT_SUGGESTIONS = [
    'Find account Office Supplies',
    'What is the closing balance for Miscellaneous?',
    'Show trial balance for this month',
] as const;

export const FINANCE_CHAT_SUGGESTIONS = [
    ...POSTING_CHAT_SUGGESTIONS,
    ...ACCOUNT_CHAT_SUGGESTIONS,
] as const;

export const DEFAULT_SUGGESTIONS = [...FINANCE_CHAT_SUGGESTIONS];

const ACCOUNT_DETAIL_SUGGESTIONS = [
    'What is the current balance for this account?',
    'Show opening balance and debits/credits this month',
    'List recent postings on this account',
] as const;

function hasFinanceFocus(context: PageContext | null): boolean {
    const focus = context?.focusModels as string[] | undefined;
    return Boolean(focus?.includes('posting') && focus?.includes('account'));
}

function getFinanceSuggestions(): string[] {
    return [...FINANCE_CHAT_SUGGESTIONS];
}

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

/** True when the user explicitly asks for an org-wide search (omit header legal_entity_id). */
export const userRequestedAllEntities = (text?: string): boolean => {
    if (!text) return false;
    return /\b(all entities|any entity|every entity|across all entities|from all entities|all legal entities)\b/i.test(
        text
    );
};

/** Plain text from a user message (string content or text parts). */
export const extractUserMessageText = (message: UserMessage): string => {
    if (typeof message.content === 'string') {
        return message.content;
    }
    if (Array.isArray(message.content)) {
        return message.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join(' ');
    }
    if (message.parts?.length) {
        return message.parts
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join(' ');
    }
    return '';
};

/**
 * Gets context-aware suggestions based on page context
 */
export const getContextSuggestions = (context: PageContext | null): string[] => {
    if (context?.modelName === 'posting' && context.modelContext?.selectedAccountId) {
        return [
            'Which transactions are unreconciled?',
            'Suggest matches for unreconciled items',
            'Show reconciliation summary',
        ];
    }
    if (hasFinanceFocus(context) || !context || context.currentPath === '/') {
        return getFinanceSuggestions();
    }
    if (context && context.modelName === 'posting') {
        return [...POSTING_CHAT_SUGGESTIONS];
    }
    if (context && context.modelName === 'account' && context.recordId) {
        return [...ACCOUNT_DETAIL_SUGGESTIONS];
    }
    if (context && context.modelName === 'account') {
        return [...ACCOUNT_CHAT_SUGGESTIONS];
    }
    if (context && context.modelDisplayName) {
        const lowerModelName = context.modelDisplayName.toLowerCase();
        return [
            `Show details for this ${lowerModelName}`,
            `What actions can I take on this ${lowerModelName}?`,
            `Explain the current status`,
        ];
    }
    return [...DEFAULT_SUGGESTIONS];
};

/**
 * Gets the input placeholder text based on page context
 */
export const getInputPlaceholder = (context: PageContext | null): string => {
    if (context?.modelName === 'account') {
        return context.recordId
            ? 'Ask about this account (balance, activity, updates)'
            : 'Ask about chart of accounts and balances';
    }
    if (context?.modelName === 'posting') {
        return 'Ask about transactions and postings';
    }
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
// Assistant text when table tool results are present
// ============================================================================

/** Infer posting chat table type from enriched row shape (journal vs ledger). */
export function resolvePostingSearchDisplayHint(
    uiHint: string | undefined,
    model: string | undefined,
    data: unknown[]
): 'account_ledger' | 'posting_journal' | 'posting_dual' | null {
    if (model !== 'posting' || !Array.isArray(data) || data.length === 0) {
        return null;
    }
    if (uiHint === 'posting_dual') {
        return 'posting_dual';
    }

    const sample = data[0] as Record<string, unknown>;
    const looksLikeJournal =
        typeof sample.debit_account_name === 'string' &&
        typeof sample.credit_account_name === 'string';
    const looksLikeLedger =
        !looksLikeJournal &&
        (typeof sample.category_name === 'string' ||
            sample.signed_amount != null ||
            sample.running_balance != null);

    // Journal rows always use PostingJournalDisplay (debit/credit account filters, general lists).
    if (looksLikeJournal) {
        return 'posting_journal';
    }
    if (uiHint === 'account_ledger' || looksLikeLedger) {
        return 'account_ledger';
    }
    if (uiHint === 'posting_journal') {
        return 'posting_journal';
    }
    return null;
}

/** True when completed tool results will render a data table in the chat UI. */
export function hasTableToolResults(toolInvocations?: ToolInvocation[]): boolean {
    if (!toolInvocations?.length) return false;

    return toolInvocations.some((tool) => {
        if (tool.state !== 'result' || !tool.result) return false;

        const result = tool.result as {
            uiHint?: string;
            resultType?: string;
            data?: unknown;
        };
        const data = result.data;
        const hasRows = Array.isArray(data) && data.length > 0;
        if (!hasRows) return false;

        if (
            result.uiHint === 'account_ledger' ||
            result.uiHint === 'posting_journal' ||
            result.uiHint === 'posting_dual' ||
            result.uiHint === 'financial_report'
        ) {
            return true;
        }
        if (tool.toolName === 'searchRecords' || /search/i.test(tool.toolName)) {
            return true;
        }
        if (result.uiHint === 'table' || result.resultType === 'sql_result') {
            return true;
        }

        return false;
    });
}

/** Remove inline/bulleted row lists and markdown tables when a UI table will also render. */
export function stripDuplicateTableListFromText(text: string): string {
    if (!text?.trim()) return text;

    // Inline markdown table on same line: "Here is the account: |Code|Name|..."
    const inlineTableMatch = text.match(/^(.+?:)\s*\|[^|\n]+\|/);
    if (inlineTableMatch) {
        return inlineTableMatch[1].trim();
    }

    // Intro sentence then inline table (no colon before pipes)
    const looseInlineTable = text.match(/^(.{1,160}?[.!?])\s*\|[^|\n]+\|/);
    if (looseInlineTable) {
        return looseInlineTable[1].trim();
    }

    // Multi-line markdown table — keep lines before the first pipe row
    const lines = text.split('\n');
    const tableLineIndex = lines.findIndex((line) => /^\s*\|.*\|/.test(line.trim()));
    if (tableLineIndex >= 0) {
        if (tableLineIndex > 0) {
            return lines.slice(0, tableLineIndex).join('\n').trim();
        }
        return '';
    }

    // Inline list after intro: "...this week: * Description:"
    const inlineMatch = text.match(/:\s*[*\-•]\s*Description\s*:/i);
    if (inlineMatch && inlineMatch.index !== undefined) {
        return text.slice(0, inlineMatch.index + 1).trim();
    }

    // Space-separated asterisk items (common LLM pattern without newlines)
    const spaceListMatch = text.match(/\s+\*\s+Description\s*:/i);
    if (spaceListMatch && spaceListMatch.index !== undefined) {
        const intro = text.slice(0, spaceListMatch.index).trim();
        return intro.endsWith(':') ? intro : `${intro}:`;
    }

    // Newline-separated list items
    const listStart = text.search(/\n\s*[*\-•]\s*(?:Description|Amount|Value Date|PO Number)/i);
    if (listStart >= 0) {
        const intro = text.slice(0, listStart).trim();
        return intro.endsWith(':') ? intro : `${intro}:`;
    }

    return text;
}

/** Keep intro-only assistant text when tool results include a table. */
export function formatAssistantMessageForTableTools(
    content: string,
    toolInvocations?: ToolInvocation[]
): string {
    const trimmed = content?.trim() ?? '';
    if (!trimmed || !hasTableToolResults(toolInvocations)) {
        return content;
    }
    return stripDuplicateTableListFromText(trimmed);
}

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

