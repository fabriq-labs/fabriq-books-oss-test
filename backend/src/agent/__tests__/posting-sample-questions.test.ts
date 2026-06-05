/**
 * Posting sample-questions prompt harness (same pattern as posting-prompt.test.ts)
 *
 * - HARDCODED posting prompt (injected via DynamicPromptManager patch)
 * - POSTING_SAMPLE_QUESTION_TEST_CASES with question + expectToolPatterns
 * - AgentService.handleRequest + posting list PageContext
 *
 * Run:
 *   npm run test:posting-sample-questions
 *   npm run test:posting-sample-questions -- -q "Show me all postings recorded today"
 */

import { AgentService } from '../AgentService';
import { AuthContext } from '../../auth/types';
import {
    buildTestAuthContext,
    DEFAULT_TEST_ORG_ID,
    DEFAULT_TEST_USER_ID,
} from './posting-harness-auth';
import {
    HARDCODED_POSTING_PROMPT,
    installHardcodedPostingPromptPatch,
    uninstallHardcodedPostingPromptPatch,
} from './posting-harness-prompt';
import { assertLlmConfigured, loadBackendEnv } from './posting-harness-llm';
import prisma from '../../lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

loadBackendEnv();

const REPORTS_DIR = path.join(__dirname, 'reports');

const TEST_CONFIG = {
    userId: process.env.TEST_USER_ID || DEFAULT_TEST_USER_ID,
    orgId: process.env.TEST_ORG_ID || DEFAULT_TEST_ORG_ID,
    selectedAccountId: process.env.TEST_ACCOUNT_ID || null,
    selectedAccountName: process.env.TEST_ACCOUNT_NAME || null,
};

console.log('Test config loaded:', TEST_CONFIG);

const SAMPLE = {
    debitAccount: process.env.TEST_DEBIT_ACCOUNT_NAME || 'Miscellaneous',
    /** Indian demo COA bank account name (chart-of-accounts.json) — not "ICICI Bank" */
    creditAccount: process.env.TEST_CREDIT_ACCOUNT_NAME || 'Checking Account',
    amountHigh: process.env.TEST_AMOUNT_THRESHOLD || '5000',
    amountExact: process.env.TEST_EXACT_AMOUNT || '1000',
};

interface TestCase {
    name: string;
    question: string;
    expectedBehavior?: string;
    expectResponseContains?: string[];
    expectToolPatterns?: string[];
    minSteps?: number;
    expectAnalytical?: boolean;
}

interface QueryDetail {
    toolName: string;
    description?: string;
    reasoning?: string;
    sql?: string;
    rowCount?: number;
}

interface TestResult {
    name: string;
    question: string;
    expectedBehavior?: string;
    passed: boolean;
    errors: string[];
    classification: { type: string; maxSteps: number; reasoning: string };
    stepsCount: number;
    queries: QueryDetail[];
    finalResponse: string;
    elapsedMs: number;
    timestamp: string;
}

export { HARDCODED_POSTING_PROMPT };

export const POSTING_SAMPLE_QUESTION_TEST_CASES: TestCase[] = [
    {
        name: 'Postings recorded today',
        question: 'Show me all postings recorded today.',
        expectedBehavior: 'searchRecords TODAY pattern: or on created_at and value_date with todayStart–todayEnd; summarize tool rows in reply.',
        expectToolPatterns: ['searchRecords', 'or'],
        minSteps: 1,
    },
    {
        name: 'Postings date range',
        question: 'List the postings from last month.',
        expectedBehavior: 'searchRecords with value_date gte {{lastMonthStart}} and lte {{lastMonthEnd}} (not monthStart–currentDate). Do not list June/current-month postings when user asked last month.',
        expectToolPatterns: ['searchRecords', 'value_date', 'lastMonth'],
        minSteps: 1,
    },
    {
        name: 'Postings on specific day',
        question: 'Were there any postings made yesterday?',
        expectedBehavior: 'searchRecords with value_date for yesterday only.',
        expectToolPatterns: ['searchRecords', 'value_date'],
        minSteps: 1,
    },
    {
        name: 'Ten most recent transactions',
        question: 'Show me the 10 most recent transactions.',
        expectedBehavior: 'searchRecords pageSize 10, recent value_date filter.',
        expectToolPatterns: ['searchRecords'],
        minSteps: 1,
    },
    {
        name: 'Q3 journal entries',
        question: 'Pull all journal entries posted in Q3 of last year.',
        expectedBehavior: 'searchRecords with value_date Q3 range (FY Oct–Dec or calendar Jul–Sep), neq DUPLICATE, legal_entity_id eq header when TEST_LEGAL_ENTITY_ID set.',
        expectToolPatterns: ['searchRecords', 'value_date', 'neq'],
        minSteps: 1,
    },
    {
        name: 'Debit account filter',
        question: `Show me every posting where ${SAMPLE.debitAccount} was the Debit Account.`,
        expectedBehavior: 'Resolve Miscellaneous org-wide (no legal_entity_id); posting searchRecords account_id eq/in acco_ id.',
        expectToolPatterns: ['searchRecords', 'account_id'],
        minSteps: 2,
    },
    {
        name: 'Credit account last week',
        question: `What transactions credited ${SAMPLE.creditAccount} last week?`,
        expectedBehavior: 'searchRecords credit_account_id + value_date last week.',
        expectToolPatterns: ['searchRecords', 'credit_account_id'],
        minSteps: 1,
    },
    {
        name: 'Transfer between accounts',
        question: `Show me all postings that moved money from ${SAMPLE.creditAccount} to ${SAMPLE.debitAccount}.`,
        expectedBehavior: 'searchRecords with credit_account_id and account_id for both accounts.',
        expectToolPatterns: ['searchRecords'],
        minSteps: 1,
    },
    {
        name: 'Amount greater than threshold',
        question: `Show me all postings with an amount greater than ${SAMPLE.amountHigh}.`,
        expectedBehavior: 'searchRecords amount gt (numeric), pageSize 25, base posting filters, legal_entity_id eq header when TEST_LEGAL_ENTITY_ID set; if truncated state totalCount.',
        expectToolPatterns: ['searchRecords', 'amount'],
        minSteps: 1,
    },
    {
        name: 'Exact amount',
        question: `Find all transactions where the amount was exactly ${SAMPLE.amountExact}.`,
        expectedBehavior: 'searchRecords amount eq, legal_entity_id eq header when TEST_LEGAL_ENTITY_ID set.',
        expectToolPatterns: ['searchRecords', 'amount'],
        minSteps: 1,
    },
    {
        name: 'Top 5 largest this month',
        question: 'What were the top 5 largest postings this month?',
        expectedBehavior: 'analyticsQuery ORDER BY amount DESC LIMIT 5 with month filter on value_date.',
        expectToolPatterns: ['analyticsQuery', 'ORDER BY'],
        minSteps: 2,
    },
    {
        name: 'Postings under amount yesterday',
        question: `List all postings under ${SAMPLE.amountExact} from yesterday.`,
        expectedBehavior: 'searchRecords amount lt + value_date yesterday, pageSize 25, legal_entity_id eq header (same as createRecord). If 0 rows, say none for that entity — do not widen to all entities.',
        expectToolPatterns: ['searchRecords', 'amount', 'value_date'],
        minSteps: 1,
    },
    {
        name: 'Postings under amount yesterday all entities',
        question: `List all postings under ${SAMPLE.amountExact} from yesterday from all entities.`,
        expectedBehavior: 'searchRecords amount lt + value_date yesterday, pageSize 25, NO legal_entity_id — org-wide search.',
        expectToolPatterns: ['searchRecords', 'amount', 'value_date'],
        minSteps: 1,
    },
    {
        name: 'Total debited to account this month',
        question: `What is the total amount debited to ${SAMPLE.debitAccount} this month?`,
        expectedBehavior: 'analyticsQuery SUM(p.amount) WHERE account_id = debit account; p.value_date >= {{monthStart}} AND < {{nextMonthStart}} (full calendar month, not currentDate/last7Days); legal_entity_id eq header legalEntityId when set.',
        expectToolPatterns: ['analyticsQuery', 'SUM', 'monthStart'],
        minSteps: 1,
    },
    {
        name: 'Sum credits to account',
        question: `Sum up all the credits made to ${SAMPLE.creditAccount} last month.`,
        expectedBehavior: 'analyticsQuery SUM on credit_account_id.',
        expectToolPatterns: ['analyticsQuery', 'SUM'],
        minSteps: 1,
    },
    {
        name: 'Volume between accounts yesterday',
        question:
            'How much total money was moved between Office Supplies and Miscellaneous yesterday?',
        expectedBehavior:
            'searchRecords both transfer directions with value_date yesterday (not created_at), legal_entity_id eq header; 0 rows for entity = $0 total — do not report null-entity org-wide rows.',
        expectToolPatterns: ['searchRecords', 'value_date'],
        minSteps: 1,
    },
    {
        name: 'Total volume last week',
        question: 'What is the total volume of postings recorded last week?',
        expectedBehavior:
            'analyticsQuery SUM(p.amount) with value_date >= {{lastWeekStart}} AND < {{weekStart}} (prior Mon–Sun, not this week Mon→today or last 7 days).',
        expectToolPatterns: ['analyticsQuery', 'SUM', 'lastWeekStart'],
        minSteps: 1,
    },
    {
        name: 'Posting around amount on day',
        question: `Can you find a posting for around ${SAMPLE.amountExact} from last Tuesday?`,
        expectedBehavior: 'searchRecords with amount band and value_date for last Tuesday.',
        expectToolPatterns: ['searchRecords'],
        minSteps: 1,
    },
    {
        name: 'Large postings over weekend',
        question: `Did we have any large postings over ${SAMPLE.amountHigh} over the weekend?`,
        expectedBehavior: 'searchRecords or analyticsQuery: amount gt + weekend value_date.',
        expectToolPatterns: ['amount'],
        minSteps: 1,
    },
    {
        name: 'Credit on date — debit account',
        question: `I see a credit of ${SAMPLE.amountExact} yesterday. What account was debited for that?`,
        expectedBehavior: 'searchRecords then explain debit account (account_id) from matching row.',
        expectToolPatterns: ['searchRecords'],
        minSteps: 1,
    },
];

async function buildAuthContext(): Promise<AuthContext> {
    const auth = await buildTestAuthContext();
    TEST_CONFIG.userId = auth.user.id;
    TEST_CONFIG.orgId = auth.user.org_id || TEST_CONFIG.orgId;
    return auth;
}

async function buildPageContext() {
    let accountName = TEST_CONFIG.selectedAccountName;
    if (TEST_CONFIG.selectedAccountId && !accountName) {
        const account = await prisma.account.findUnique({
            where: { id: TEST_CONFIG.selectedAccountId },
            select: { name: true },
        });
        accountName = account?.name || null;
    }

    const legalEntityId = process.env.TEST_LEGAL_ENTITY_ID || null;
    const legalEntityName = process.env.TEST_LEGAL_ENTITY_NAME || null;

    const modelContext: Record<string, unknown> = {};
    if (TEST_CONFIG.selectedAccountId) {
        modelContext.selectedAccountId = TEST_CONFIG.selectedAccountId;
        modelContext.selectedAccountName = accountName;
    }
    if (legalEntityId) {
        modelContext.legalEntityId = legalEntityId;
        modelContext.legalEntityName = legalEntityName;
    }

    return {
        modelName: 'posting',
        viewName: 'posting_view',
        recordId: null,
        stateId: null,
        viewId: null,
        promptTypes: ['analytics', 'default'],
        modelContext: Object.keys(modelContext).length > 0 ? modelContext : undefined,
    };
}

function extractToolCalls(result: any): string[] {
    const toolCalls: string[] = [];
    if (result.steps) {
        for (const step of result.steps) {
            if (step.toolCalls) {
                for (const call of step.toolCalls) {
                    toolCalls.push(call.toolName);
                    if (call.args) toolCalls.push(JSON.stringify(call.args));
                }
            }
            if (step.toolResults) {
                for (const toolResult of step.toolResults) {
                    if (toolResult.result) toolCalls.push(JSON.stringify(toolResult.result));
                }
            }
        }
    }
    return toolCalls;
}

function extractQueryDetails(result: any): QueryDetail[] {
    const queries: QueryDetail[] = [];
    if (result.steps) {
        for (const step of result.steps) {
            if (step.toolCalls) {
                for (let i = 0; i < step.toolCalls.length; i++) {
                    const call = step.toolCalls[i];
                    const toolResult = step.toolResults?.[i];
                    const detail: QueryDetail = { toolName: call.toolName };
                    if (call.args?.description) detail.description = call.args.description;
                    if (call.args?.reasoning) detail.reasoning = call.args.reasoning;
                    if (call.args?.query) detail.sql = call.args.query;
                    if (call.args?.sql) detail.sql = call.args.sql;
                    if (toolResult?.result?.rowCount !== undefined) {
                        detail.rowCount = toolResult.result.rowCount;
                    }
                    queries.push(detail);
                }
            }
        }
    }
    return queries;
}

async function runTestCase(
    testCase: TestCase,
    agentService: AgentService,
    auth: AuthContext,
    context: Record<string, unknown>,
    verbose = true
): Promise<TestResult> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log(`Question: "${testCase.question}"`);
    console.log('='.repeat(60));

    const testResult: TestResult = {
        name: testCase.name,
        question: testCase.question,
        expectedBehavior: testCase.expectedBehavior,
        passed: false,
        errors: [],
        classification: { type: 'unknown', maxSteps: 0, reasoning: '' },
        stepsCount: 0,
        queries: [],
        finalResponse: '',
        elapsedMs: 0,
        timestamp: new Date().toISOString(),
    };

    try {
        const startTime = Date.now();
        const result = await agentService.handleRequest(testCase.question, auth, [], context);
        testResult.elapsedMs = Date.now() - startTime;
        testResult.stepsCount = result.steps?.length || 0;
        testResult.finalResponse = result.content || '';
        testResult.classification = {
            type: result.classification?.type || 'unknown',
            maxSteps: result.classification?.maxSteps || 0,
            reasoning: result.classification?.reasoning || '',
        };
        testResult.queries = extractQueryDetails(result);

        if (verbose) {
            console.log(`\nCompleted in ${testResult.elapsedMs}ms`);
            console.log(`Classification: ${testResult.classification.type}`);
            console.log(`Steps: ${testResult.stepsCount}`);
            console.log('\nResponse preview:');
            console.log('-'.repeat(40));
            console.log(
                testResult.finalResponse.substring(0, 500) +
                    (testResult.finalResponse.length > 500 ? '...' : '')
            );
            console.log('-'.repeat(40));
        }

        if (testCase.expectAnalytical !== undefined) {
            const isAnalytical = testResult.classification.type === 'analytical';
            if (testCase.expectAnalytical !== isAnalytical) {
                testResult.errors.push(
                    `Expected ${testCase.expectAnalytical ? 'analytical' : 'transactional'} but got ${testResult.classification.type}`
                );
            }
        }

        if (testCase.minSteps !== undefined && testResult.stepsCount < testCase.minSteps) {
            testResult.errors.push(`Expected at least ${testCase.minSteps} steps but got ${testResult.stepsCount}`);
        }

        if (testCase.expectResponseContains) {
            const content = testResult.finalResponse.toLowerCase();
            for (const pattern of testCase.expectResponseContains) {
                if (!content.includes(pattern.toLowerCase())) {
                    testResult.errors.push(`Response missing expected content: "${pattern}"`);
                }
            }
        }

        if (testCase.expectToolPatterns) {
            const allToolData = extractToolCalls(result).join(' ').toLowerCase();
            for (const pattern of testCase.expectToolPatterns) {
                if (!allToolData.includes(pattern.toLowerCase())) {
                    testResult.errors.push(`Tool calls missing expected pattern: "${pattern}"`);
                }
            }
        }

        testResult.passed = testResult.errors.length === 0;
        console.log(testResult.passed ? '\n✅ PASSED' : `\n❌ FAILED: ${testResult.errors.join('; ')}`);
    } catch (error) {
        testResult.errors.push(`Error: ${error}`);
        console.log(`\n❌ ERROR: ${error}`);
    }

    return testResult;
}

function saveReports(results: TestResult[]): void {
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    const report = {
        generated: new Date().toISOString(),
        promptSource: 'hardcoded-in-posting-sample-questions.test.ts',
        config: TEST_CONFIG,
        sampleAccounts: SAMPLE,
        summary: {
            total: results.length,
            passed: results.filter((r) => r.passed).length,
            failed: results.filter((r) => !r.passed).length,
        },
        results,
    };

    const jsonPath = path.join(REPORTS_DIR, 'posting-sample-questions-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${jsonPath}`);
}

async function runAllTests(verbose = true): Promise<void> {
    console.log('\n█ POSTING SAMPLE QUESTIONS (hardcoded prompt) █\n');
    assertLlmConfigured();

    installHardcodedPostingPromptPatch();
    try {
        const auth = await buildAuthContext();
        const context = await buildPageContext();
        const agentService = new AgentService();
        const results: TestResult[] = [];

        for (const testCase of POSTING_SAMPLE_QUESTION_TEST_CASES) {
            results.push(await runTestCase(testCase, agentService, auth, context, verbose));
            await new Promise((r) => setTimeout(r, 1000));
        }

        const failed = results.filter((r) => !r.passed).length;
        console.log(`\nDone: ${results.length - failed}/${results.length} passed`);
        saveReports(results);
        await new Promise((r) => setTimeout(r, 1500));
        if (failed > 0) process.exit(1);
    } finally {
        uninstallHardcodedPostingPromptPatch();
        await prisma.$disconnect();
    }
}

function getCustomQuestion(): string | null {
    const args = process.argv.slice(2);
    const qIndex = args.findIndex((a) => a === '--question' || a === '-q');
    if (qIndex >= 0 && args[qIndex + 1] !== undefined) return args[qIndex + 1].trim();
    const first = args[0];
    if (first && !first.startsWith('-')) return first.trim();
    return null;
}

async function runSingleQuestion(question: string): Promise<void> {
    assertLlmConfigured();
    installHardcodedPostingPromptPatch();
    try {
        const auth = await buildAuthContext();
        const context = await buildPageContext();
        const agentService = new AgentService();
        const match =
            POSTING_SAMPLE_QUESTION_TEST_CASES.find((c) => c.question === question) ||
            ({ name: 'Custom', question } as TestCase);
        const result = await runTestCase(match, agentService, auth, context, true);
        await new Promise((r) => setTimeout(r, 1500));
        saveReports([result]);
        if (!result.passed) process.exit(1);
    } finally {
        uninstallHardcodedPostingPromptPatch();
        await prisma.$disconnect();
    }
}

const customQuestion = getCustomQuestion();
(customQuestion ? runSingleQuestion(customQuestion) : runAllTests(true)).catch(async (error) => {
    uninstallHardcodedPostingPromptPatch();
    console.error('Test harness error:', error);
    await prisma.$disconnect();
    process.exit(1);
});
