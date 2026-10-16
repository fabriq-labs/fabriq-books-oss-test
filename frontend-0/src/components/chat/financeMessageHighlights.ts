/**
 * Auto-highlight finance terms (amounts, dates, account names) for chat assistant text.
 * Skips segments already wrapped in **markdown bold**.
 */

import type { ToolInvocation } from '@/components/utils/helper';

type TextSegment = { type: 'plain' | 'bold'; text: string };

export type FinanceHighlightOptions = {
    listItem?: boolean;
    /** Account / party names from page context or tool results — matched literally in text. */
    knownAccountNames?: string[];
};

function splitExistingBold(text: string): TextSegment[] {
    const segments: TextSegment[] = [];
    const re = /(\*\*[^*]+\*\*)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        if (match.index > last) {
            segments.push({ type: 'plain', text: text.slice(last, match.index) });
        }
        segments.push({ type: 'bold', text: match[1].slice(2, -2) });
        last = match.index + match[1].length;
    }
    if (last < text.length) {
        segments.push({ type: 'plain', text: text.slice(last) });
    }
    return segments.length ? segments : [{ type: 'plain', text }];
}

type HighlightRange = { start: number; end: number };

function collectRanges(text: string, pattern: RegExp): HighlightRange[] {
    const ranges: HighlightRange[] = [];
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const value = match[1] ?? match[0];
        const start = match.index + match[0].indexOf(value);
        ranges.push({ start, end: start + value.length });
    }
    return ranges;
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
    if (!ranges.length) return [];
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: HighlightRange[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = merged[merged.length - 1];
        const cur = sorted[i];
        if (cur.start <= prev.end) {
            prev.end = Math.max(prev.end, cur.end);
        } else {
            merged.push({ ...cur });
        }
    }
    return merged;
}

const AMOUNT_PATTERN =
    /(?:[$₹€£]-?[\d,]+(?:\.\d{2})?)|(?:\b(?:USD|INR|EUR|GBP)\s*-?[\d,]+(?:\.\d{2})?)|(?:-?[\d,]+(?:\.\d{2})?\s+(?:USD|INR|EUR|GBP)\b)/gi;

const DATE_RANGE_PATTERN = /\d{4}-\d{2}-\d{2}\s*[—–-]\s*\d{4}-\d{2}-\d{2}/g;

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;

const MONTH_DATE_PATTERN =
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/gi;

const RELATIVE_PERIOD_PATTERN =
    /\b(?:last|this|next)\s+(?:week|month|quarter|year|financial year|FY)\b/gi;

const FY_QUARTER_PATTERN = /\b(?:FY|Q[1-4])\s*\d{4}\b/gi;

const ACCOUNT_NAME_VALUE =
    '([A-Za-z][A-Za-z0-9][A-Za-z0-9\\s&.\'-]*?)';

const ACCOUNT_STOP_LOOKAHEAD =
    '(?=\\s+is\\b|\\s+(?:this|last|for|in|on|from|to|and|with|account|was|were|has|have|had|shows?|showing|expense|asset|bank|income|liability|revenue|checking|savings)\\b|\\s+(?:expense|asset|bank|income|liability|revenue|checking|savings)\\s+account\\b|[,.:;]|$)';

/** Account name after finance keywords — e.g. "for Miscellaneous", "for the Miscellaneous". */
const ACCOUNT_AFTER_KEYWORD_PATTERN = new RegExp(
    `\\b(?:account|debited to|credited to|paid to|paid from|from|to|on|for)\\s+(?:the\\s+)?${ACCOUNT_NAME_VALUE}${ACCOUNT_STOP_LOOKAHEAD}`,
    'gi'
);

/** Direct "account Miscellaneous" / "account Office Supplies". */
const ACCOUNT_DIRECT_PATTERN = new RegExp(
    `\\baccount\\s+${ACCOUNT_NAME_VALUE}(?=\\s*\\(|\\s+for|\\s+in|\\s+on|\\s+with|\\s+account|\\s+is|\\s+was|\\s+code|[,.:;]|$)`,
    'gi'
);

/** "the Miscellaneous account" or "the Miscellaneous expense account". */
const ACCOUNT_THE_SUFFIX_PATTERN =
    /\bthe\s+([A-Z][A-Za-z0-9]+)\s+(?:(?:expense|asset|bank|income|liability|revenue|checking|savings)\s+)?account\b/gi;

const ACCOUNT_NAME_BLOCKLIST = new Set([
    'balance',
    'activity',
    'code',
    'name',
    'total',
    'spend',
    'found',
    'show',
    'shows',
    'showing',
    'row',
    'trial',
    'the',
    'no',
    'none',
    'any',
    'all',
    'with',
    'your',
    'here',
    'there',
]);

function isValidAccountName(name: string): boolean {
    const trimmed = name.trim();
    if (trimmed.length < 2) return false;
    const lower = trimmed.toLowerCase();
    if (ACCOUNT_NAME_BLOCKLIST.has(lower)) return false;
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.every((word) => ACCOUNT_NAME_BLOCKLIST.has(word))) {
        return false;
    }
    return true;
}

/** "account: Miscellaneous" / "Account name: Office Supplies". */
const ACCOUNT_AFTER_COLON_PATTERN = new RegExp(
    `\\b(?:account(?:\\s+name)?|name)\\s*:\\s*${ACCOUNT_NAME_VALUE}(?=[,.:;]|$)`,
    'gi'
);

/** Quoted account or party names — "Miscellaneous". */
const QUOTED_NAME_PATTERN = /"([^"]{2,80})"/g;

/** Leading name in numbered-list items — e.g. "Gusto (HR):" or "Miscellaneous:" */
const LIST_LEADING_NAME_PATTERN = /^([A-Za-z][A-Za-z0-9\s&.'-]{0,48}?)(?=\s*[\(:])/;

function collectKnownAccountNameRanges(text: string, names: string[]): HighlightRange[] {
    const ranges: HighlightRange[] = [];
    const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))].sort(
        (a, b) => b.length - a.length
    );

    for (const name of unique) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'gi');
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            ranges.push({ start: match.index, end: match.index + match[0].length });
        }
    }
    return ranges;
}

function addName(target: Set<string>, value: unknown) {
    if (typeof value === 'string' && value.trim().length >= 2) {
        target.add(value.trim());
    }
}

function addNamesFromRow(target: Set<string>, row: Record<string, unknown>) {
    addName(target, row.name);
    addName(target, row.account_name);
    addName(target, row.debit_account_name);
    addName(target, row.credit_account_name);
    addName(target, row.category_name);
    addName(target, row.partyName);
    addName(target, row.focusAccountName);

    const account = row.account;
    if (account && typeof account === 'object' && 'name' in account) {
        addName(target, (account as { name?: string }).name);
    }
    const creditAccount = row.credit_account;
    if (creditAccount && typeof creditAccount === 'object' && 'name' in creditAccount) {
        addName(target, (creditAccount as { name?: string }).name);
    }
}

/** Collect account / party names from tool results on the same assistant turn. */
export function extractAccountNamesFromTools(
    toolInvocations?: ToolInvocation[]
): string[] {
    const names = new Set<string>();
    if (!toolInvocations?.length) return [];

    for (const tool of toolInvocations) {
        if (tool.state !== 'result' || !tool.result) continue;
        const result = tool.result as Record<string, unknown>;

        addName(names, result.focusAccountName);
        addName(names, result.focusAccountId);

        const data = result.data;
        if (Array.isArray(data)) {
            for (const row of data) {
                if (row && typeof row === 'object') {
                    addNamesFromRow(names, row as Record<string, unknown>);
                }
            }
        }

        const tables = result.tables;
        if (Array.isArray(tables)) {
            for (const table of tables) {
                if (!table || typeof table !== 'object') continue;
                const t = table as { accountName?: string; rows?: unknown[] };
                addName(names, t.accountName);
                if (Array.isArray(t.rows)) {
                    for (const row of t.rows) {
                        if (row && typeof row === 'object') {
                            addNamesFromRow(names, row as Record<string, unknown>);
                        }
                    }
                }
            }
        }
    }

    return [...names].filter((n) => !n.startsWith('acco_'));
}

/** Names from page context (selected account on account/posting views). */
export function extractAccountNamesFromPageContext(
    modelContext?: Record<string, unknown> | null
): string[] {
    if (!modelContext) return [];
    const names: string[] = [];
    for (const key of [
        'accountName',
        'selectedAccountName',
        'focusAccountName',
        'legalEntityName',
    ]) {
        const value = modelContext[key];
        if (typeof value === 'string' && value.trim()) {
            names.push(value.trim());
        }
    }
    return names;
}

function highlightPlainSegment(text: string, options?: FinanceHighlightOptions): string {
    if (!text.trim()) return text;

    const patterns: RegExp[] = [
        AMOUNT_PATTERN,
        DATE_RANGE_PATTERN,
        ISO_DATE_PATTERN,
        MONTH_DATE_PATTERN,
        RELATIVE_PERIOD_PATTERN,
        FY_QUARTER_PATTERN,
        ACCOUNT_AFTER_KEYWORD_PATTERN,
        ACCOUNT_DIRECT_PATTERN,
        ACCOUNT_THE_SUFFIX_PATTERN,
        ACCOUNT_AFTER_COLON_PATTERN,
        QUOTED_NAME_PATTERN,
    ];
    if (options?.listItem) {
        patterns.push(LIST_LEADING_NAME_PATTERN);
    }

    const nonAccountPatterns = [
        AMOUNT_PATTERN,
        DATE_RANGE_PATTERN,
        ISO_DATE_PATTERN,
        MONTH_DATE_PATTERN,
        RELATIVE_PERIOD_PATTERN,
        FY_QUARTER_PATTERN,
    ] as const;

    const accountPatterns = patterns.filter((p) => !nonAccountPatterns.includes(p as typeof nonAccountPatterns[number]));

    const ranges = mergeRanges([
        ...nonAccountPatterns.flatMap((p) => collectRanges(text, p)),
        ...accountPatterns
            .flatMap((p) => collectRanges(text, p))
            .filter((range) => isValidAccountName(text.slice(range.start, range.end))),
        ...collectKnownAccountNameRanges(text, options?.knownAccountNames ?? []),
    ]);

    if (!ranges.length) return text;

    let result = '';
    let cursor = 0;
    for (const { start, end } of ranges) {
        if (start < cursor) continue;
        result += text.slice(cursor, start);
        result += `**${text.slice(start, end)}**`;
        cursor = end;
    }
    result += text.slice(cursor);
    return result;
}

/** Wrap amounts, dates, and account names in ** for the markdown renderer. */
export function applyFinanceHighlights(
    text: string,
    options?: FinanceHighlightOptions
): string {
    return splitExistingBold(text)
        .map((seg) =>
            seg.type === 'bold'
                ? `**${seg.text}**`
                : highlightPlainSegment(seg.text, options)
        )
        .join('');
}
