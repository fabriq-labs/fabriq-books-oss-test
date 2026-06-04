/**
 * PageContext payloads matching the frontend ChatUI / BankTransactions posting list.
 * @see frontend-1/src/contexts/ChatContext.tsx (PageContext)
 * @see frontend-1/src/pages/Master.tsx (Transactions posting list setPageContext)
 * @see frontend-1/src/pages/reports/BankTransactions.tsx (setPageContext)
 */

/** Mirrors ChatUI body.context for posting chat */
export interface PostingUiContext {
    modelName: 'posting';
    viewName: string;
    recordId?: string | null;
    stateId?: string | null;
    viewId?: string | null;
    modelDisplayName?: string | null;
    currentPath?: string;
    /** Passed through; AgentService defaults posting to ['analytics', 'default'] when unset */
    promptTypes?: string[];
    modelContext?: {
        selectedAccountId?: string | null;
        selectedAccountName?: string | null;
        legalEntityId?: string | null;
        legalEntityName?: string | null;
        [key: string]: unknown;
    };
}

export type PostingQuestionCategory = 'time' | 'account' | 'amount' | 'aggregation' | 'investigative';

/** Expectations tied to HARDCODED_POSTING_PROMPT sections */
export interface PostingPromptExpectation {
    /** Primary tool the prompt instructs for this question type */
    primaryTool: 'searchRecords' | 'analyticsQuery';
    /** Substrings expected in tool call args or names */
    toolPatterns: string[];
    minSteps?: number;
}

export interface PostingSampleTestCase {
    name: string;
    category: PostingQuestionCategory;
    question: string;
    /** Same object the UI sends as `body.context` on /api/agent/chat/stream */
    uiContext: PostingUiContext;
    promptExpectation: PostingPromptExpectation;
}

/** Bank transactions / posting list — matches BankTransactions.tsx setPageContext */
export function buildPostingListUiContext(
    overrides: Partial<PostingUiContext> = {}
): PostingUiContext {
    const { modelContext: modelContextOverride, ...restOverrides } = overrides;
    return {
        modelName: 'posting',
        viewName: 'posting_view',
        recordId: null,
        stateId: null,
        viewId: null,
        modelDisplayName: 'Posting',
        currentPath: '/reports/bank-transactions',
        promptTypes: ['analytics', 'default'],
        ...restOverrides,
        modelContext: {
            selectedAccountId: null,
            selectedAccountName: null,
            legalEntityId: process.env.TEST_LEGAL_ENTITY_ID ?? null,
            legalEntityName: process.env.TEST_LEGAL_ENTITY_NAME ?? null,
            ...modelContextOverride,
        },
    };
}

/** Posting detail form — matches PostingForm.tsx setPageContext */
export function buildPostingDetailUiContext(
    recordId: string,
    viewId?: string | null,
    overrides: Partial<PostingUiContext> = {}
): PostingUiContext {
    const { modelContext: modelContextOverride, ...restOverrides } = overrides;
    return {
        modelName: 'posting',
        viewName: 'posting_view',
        recordId,
        stateId: null,
        viewId: viewId ?? null,
        modelDisplayName: 'Posting',
        currentPath: `/posting/${recordId}`,
        promptTypes: ['analytics', 'default'],
        ...restOverrides,
        modelContext: {
            legalEntityId: process.env.TEST_LEGAL_ENTITY_ID ?? null,
            legalEntityName: process.env.TEST_LEGAL_ENTITY_NAME ?? null,
            ...modelContextOverride,
        },
    };
}

export const SAMPLE_ACCOUNTS = {
    debitAccount: process.env.TEST_DEBIT_ACCOUNT_NAME || 'Miscellaneous',
    creditAccount: process.env.TEST_CREDIT_ACCOUNT_NAME || 'ICICI Bank',
    amountHigh: process.env.TEST_AMOUNT_THRESHOLD || '5000',
    amountExact: process.env.TEST_EXACT_AMOUNT || '1000',
};

const listCtx = () => buildPostingListUiContext();

export function buildPostingSampleTestCases(): PostingSampleTestCase[] {
    const S = SAMPLE_ACCOUNTS;
    return [
        {
            name: 'Postings recorded today',
            category: 'time',
            question: 'Show me all postings recorded today.',
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'value_date'], minSteps: 1 },
        },
        {
            name: 'Postings date range',
            category: 'time',
            question: 'List the postings from last month.',
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'value_date'], minSteps: 1 },
        },
        {
            name: 'Postings on specific day',
            category: 'time',
            question: 'Were there any postings made yesterday?',
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'value_date'], minSteps: 1 },
        },
        {
            name: 'Ten most recent transactions',
            category: 'time',
            question: 'Show me the 10 most recent transactions.',
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords'], minSteps: 1 },
        },
        {
            name: 'Q3 journal entries',
            category: 'time',
            question: 'Pull all journal entries posted in Q3 of last year.',
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'analyticsQuery', toolPatterns: ['value_date'], minSteps: 1 },
        },
        {
            name: 'Debit account filter',
            category: 'account',
            question: `Show me every posting where ${S.debitAccount} was the Debit Account.`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'account_id'], minSteps: 1 },
        },
        {
            name: 'Credit account last week',
            category: 'account',
            question: `What transactions credited ${S.creditAccount} last week?`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'credit_account_id'], minSteps: 1 },
        },
        {
            name: 'Transfer between accounts',
            category: 'account',
            question: `Show me all postings that moved money from ${S.creditAccount} to ${S.debitAccount}.`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords'], minSteps: 1 },
        },
        {
            name: 'Amount greater than threshold',
            category: 'amount',
            question: `Show me all postings with an amount greater than ${S.amountHigh}.`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'amount'], minSteps: 1 },
        },
        {
            name: 'Exact amount',
            category: 'amount',
            question: `Find all transactions where the amount was exactly ${S.amountExact}.`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'amount'], minSteps: 1 },
        },
        {
            name: 'Top 5 largest this month',
            category: 'amount',
            question: 'What were the top 5 largest postings this month?',
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'analyticsQuery', toolPatterns: ['analyticsQuery'], minSteps: 1 },
        },
        {
            name: 'Postings under amount yesterday',
            category: 'amount',
            question: `List all postings under ${S.amountExact} from yesterday.`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords', 'amount', 'lt'], minSteps: 1 },
        },
        {
            name: 'Total debited to account this month',
            category: 'aggregation',
            question: `What is the total amount debited to ${S.debitAccount} this month?`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'analyticsQuery', toolPatterns: ['analyticsQuery', 'SUM'], minSteps: 1 },
        },
        {
            name: 'Sum credits to account',
            category: 'aggregation',
            question: `Sum up all the credits made to ${S.creditAccount} last month.`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'analyticsQuery', toolPatterns: ['analyticsQuery', 'SUM'], minSteps: 1 },
        },
        {
            name: 'Volume between accounts yesterday',
            category: 'aggregation',
            question: `How much total money was moved between ${S.creditAccount} and ${S.debitAccount} yesterday?`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'analyticsQuery', toolPatterns: ['analyticsQuery'], minSteps: 1 },
        },
        {
            name: 'Total volume last week',
            category: 'aggregation',
            question: 'What is the total volume of postings recorded last week?',
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'analyticsQuery', toolPatterns: ['analyticsQuery', 'SUM'], minSteps: 1 },
        },
        {
            name: 'Posting around amount on day',
            category: 'investigative',
            question: `Can you find a posting for around ${S.amountExact} from last Tuesday?`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords'], minSteps: 1 },
        },
        {
            name: 'Large postings over weekend',
            category: 'investigative',
            question: `Did we have any large postings over ${S.amountHigh} over the weekend?`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['amount'], minSteps: 1 },
        },
        {
            name: 'Credit on date — debit account',
            category: 'investigative',
            question: `I see a credit of ${S.amountExact} yesterday. What account was debited for that?`,
            uiContext: listCtx(),
            promptExpectation: { primaryTool: 'searchRecords', toolPatterns: ['searchRecords'], minSteps: 1 },
        },
    ];
}
