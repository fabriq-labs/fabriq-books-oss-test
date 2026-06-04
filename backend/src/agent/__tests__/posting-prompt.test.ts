/**
 * Posting Analytics Prompt Test Harness
 * 
 * Tests the FULL agent flow using AgentService directly:
 * - Real prompt loading via DynamicPromptManager
 * - Real tool selection via ToolManager
 * - Real tool execution (getAnalyticsContext, analyticsQuery)
 * - Real database queries
 * 
 * Run with:
 *   npm run test:posting-prompt
 *   npm run test:posting-prompt -- --question "How much did I spend on groceries?"
 *   npm run test:posting-prompt -- -q "Show my spending by category this month"
 *
 * Generates reports for iterative prompt refinement:
 * - JSON report: backend/src/agent/__tests__/reports/posting-prompt-report.json
 * - Markdown report: backend/src/agent/__tests__/reports/posting-prompt-report.md
 * 
 * Prerequisites:
 * - Database must be running with test data
 * - Environment variables must be set (see .env)
 */

import { AgentService } from '../AgentService';
import { AuthContext } from '../../auth/types';
import {
    buildTestAuthContext,
    DEFAULT_TEST_ORG_ID,
    DEFAULT_TEST_USER_ID,
} from './posting-harness-auth';
import prisma from '../../lib/prisma';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Prefer backend/.env (LLM keys, DATABASE_URL); .env.test fills gaps only
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const envTest = path.join(BACKEND_ROOT, '.env.test');
const envFile = path.join(BACKEND_ROOT, '.env');
if (fs.existsSync(envTest)) dotenv.config({ path: envTest });
if (fs.existsSync(envFile)) dotenv.config({ path: envFile, override: true });

function isLlmConfigured(): boolean {
    switch (process.env.LLM_PROVIDER) {
        case 'openrouter': return !!process.env.OPENROUTER_API_KEY;
        case 'openai': return !!process.env.OPENAI_API_KEY;
        case 'vertex':
            return !!(
                process.env.GOOGLE_CLOUD_PROJECT_ID &&
                (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64)
            );
        case 'custom': return !!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
        default:
            return !!(
                process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
                process.env.GOOGLE_API_KEY ||
                process.env.OPENROUTER_API_KEY ||
                process.env.OPENAI_API_KEY
            );
    }
}

// Report output directory
const REPORTS_DIR = path.join(__dirname, 'reports');

// Test configuration - adjust these to match your test data
const TEST_CONFIG = {
    userId: process.env.TEST_USER_ID || DEFAULT_TEST_USER_ID,
    orgId: process.env.TEST_ORG_ID || DEFAULT_TEST_ORG_ID,
    
    // Account to use as "selected" credit card/bank
    // Set to actual account ID from your database, or null to test without selection
    selectedAccountId: process.env.TEST_ACCOUNT_ID || null,
    selectedAccountName: process.env.TEST_ACCOUNT_NAME || null,
};

// Log loaded config for debugging
console.log('Test config loaded:', {
    userId: TEST_CONFIG.userId,
    orgId: TEST_CONFIG.orgId,
    selectedAccountId: TEST_CONFIG.selectedAccountId,
    selectedAccountName: TEST_CONFIG.selectedAccountName,
});

interface TestCase {
    name: string;
    question: string;
    /** Expected behavior description for review */
    expectedBehavior?: string;
    /** Check if response contains these strings (case-insensitive) */
    expectResponseContains?: string[];
    /** Check if any tool was called with these patterns */
    expectToolPatterns?: string[];
    /** Minimum number of steps expected (for multi-step queries) */
    minSteps?: number;
    /** Should be classified as analytical? */
    expectAnalytical?: boolean;
}

interface QueryDetail {
    toolName: string;
    description?: string;
    reasoning?: string;
    sql?: string;
    rowCount?: number;
    result?: any;
}

interface TestResult {
    name: string;
    question: string;
    expectedBehavior?: string;
    passed: boolean;
    errors: string[];
    classification: {
        type: string;
        maxSteps: number;
        reasoning: string;
    };
    stepsCount: number;
    queries: QueryDetail[];
    finalResponse: string;
    elapsedMs: number;
    timestamp: string;
}

const TEST_CASES: TestCase[] = [
    {
        name: 'Total spending query',
        question: 'How much did I spend in total?',
        expectedBehavior: 'Should SUM all posting amounts on the selected credit card (credit_account_id = selectedAccountId). Should use analyticsQuery with SUM(amount).',
        expectAnalytical: true,
        minSteps: 1,
        expectToolPatterns: ['analyticsQuery'],  // May skip getAnalyticsContext if context already sufficient
    },
    {
        name: 'Grocery spending with fuzzy match',
        question: 'How much did I spend on groceries?',
        expectedBehavior: 'Should use ILIKE to fuzzy match account names containing "grocer". May need to JOIN account table to get account names. Should NOT use posting.account_name (does not exist).',
        expectAnalytical: true,
        minSteps: 2,
        expectToolPatterns: ['ILIKE', 'grocer'],
    },
    {
        name: 'Monthly spending breakdown',
        question: 'Show my spending by category this month',
        expectedBehavior: 'Should GROUP BY account/category and SUM amounts. Expense = money going out = credit side for bank/cash accounts. Should filter by current month using value_date.',
        expectAnalytical: true,
        minSteps: 2,
        expectToolPatterns: ['GROUP BY'],
    },
    {
        name: 'Store-level breakdown (needs account context)',
        question: 'Can you split my grocery spending by store?',
        expectedBehavior: 'Without selectedAccountId: Should ask for clarification OR attempt broad query. Store names should come from posting.description field, grouped.',
        expectAnalytical: true,
        minSteps: 1,
    },
    {
        name: 'Income query',
        question: 'How much income did I receive last month?',
        expectedBehavior: 'Income = money coming in = debit side for bank/cash accounts. Should filter by last month dates and SUM amounts where account_id (debit) is an asset account.',
        expectAnalytical: true,
        minSteps: 2,
    },
];

// Additional test cases that require a selected account context
const TEST_CASES_WITH_ACCOUNT: TestCase[] = [
    {
        name: 'Store-level breakdown with account',
        question: 'Can you split my grocery spending by store?',
        expectedBehavior: 'With selectedAccountId: Should use description field to extract store names. Should GROUP BY description (or parsed store name) and SUM amounts. Should filter by selected account and grocery-related category.',
        expectAnalytical: true,
        minSteps: 2,
        expectToolPatterns: ['description', 'GROUP BY'],
    },
    {
        name: 'Category spending with selected card',
        question: 'How much did I spend on groceries using this card?',
        expectedBehavior: 'With credit card selected: Expense means credit_account_id = card. Should match debit account (category) using ILIKE for "grocer". Should use TWO joins to account table.',
        expectAnalytical: true,
        minSteps: 2,
        expectToolPatterns: ['ILIKE', 'grocer'],
    },
];

/**
 * Build auth context for testing
 */
async function buildAuthContext(): Promise<AuthContext> {
    const auth = await buildTestAuthContext();
    TEST_CONFIG.userId = auth.user.id;
    TEST_CONFIG.orgId = auth.user.org_id || TEST_CONFIG.orgId;
    return auth;
}

/**
 * Build page context simulating SimpleTransactionList
 */
/**
 * Build page context matching what the UI sends
 * This is the same structure as PageContext from frontend ChatContext.tsx
 */
async function buildPageContext() {
    // If we have an account ID but no name, fetch it from the database
    let accountName = TEST_CONFIG.selectedAccountName;
    if (TEST_CONFIG.selectedAccountId && !accountName) {
        const account = await prisma.account.findUnique({
            where: { id: TEST_CONFIG.selectedAccountId },
            select: { name: true }
        });
        accountName = account?.name || null;
        console.log(`Fetched account name: ${accountName} for ID: ${TEST_CONFIG.selectedAccountId}`);
    }

    return {
        modelName: 'posting',
        viewName: 'posting_view',
        recordId: null,
        stateId: null,
        viewId: null,
        modelContext: TEST_CONFIG.selectedAccountId ? {
            selectedAccountId: TEST_CONFIG.selectedAccountId,
            selectedAccountName: accountName,
        } : undefined,
    };
}

/**
 * Extract tool calls from agent response (for pattern matching)
 */
function extractToolCalls(result: any): string[] {
    const toolCalls: string[] = [];
    
    if (result.steps) {
        for (const step of result.steps) {
            if (step.toolCalls) {
                for (const call of step.toolCalls) {
                    toolCalls.push(call.toolName);
                    // Also capture the arguments for pattern matching
                    if (call.args) {
                        toolCalls.push(JSON.stringify(call.args));
                    }
                }
            }
            if (step.toolResults) {
                for (const toolResult of step.toolResults) {
                    if (toolResult.result) {
                        toolCalls.push(JSON.stringify(toolResult.result));
                    }
                }
            }
        }
    }
    
    if (result.toolResults) {
        for (const toolResult of result.toolResults) {
            toolCalls.push(JSON.stringify(toolResult));
        }
    }
    
    return toolCalls;
}

/**
 * Extract detailed query information from agent response
 */
function extractQueryDetails(result: any): QueryDetail[] {
    const queries: QueryDetail[] = [];
    
    if (result.steps) {
        for (const step of result.steps) {
            if (step.toolCalls) {
                for (let i = 0; i < step.toolCalls.length; i++) {
                    const call = step.toolCalls[i];
                    const toolResult = step.toolResults?.[i];
                    
                    const detail: QueryDetail = {
                        toolName: call.toolName,
                    };
                    
                    // Extract from tool arguments
                    if (call.args) {
                        if (call.args.description) detail.description = call.args.description;
                        if (call.args.reasoning) detail.reasoning = call.args.reasoning;
                        if (call.args.query) detail.sql = call.args.query;
                        if (call.args.sql) detail.sql = call.args.sql;
                    }
                    
                    // Extract from tool results
                    if (toolResult?.result) {
                        const res = toolResult.result;
                        if (typeof res === 'object') {
                            if (res.rowCount !== undefined) detail.rowCount = res.rowCount;
                            if (res.data) detail.result = res.data;
                            if (res.results) detail.result = res.results;
                            // For getAnalyticsContext, capture schema info
                            if (res.schemaInfo || res.tables) {
                                detail.result = { schemaPreview: 'Schema context loaded' };
                            }
                        }
                    }
                    
                    queries.push(detail);
                }
            }
        }
    }
    
    return queries;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(results: TestResult[], config: typeof TEST_CONFIG): string {
    const lines: string[] = [];
    
    lines.push('# Posting Analytics Prompt Test Report');
    lines.push('');
    lines.push(`**Generated**: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Configuration');
    lines.push('');
    lines.push(`- **User ID**: ${config.userId}`);
    lines.push(`- **Org ID**: ${config.orgId}`);
    lines.push(`- **Selected Account**: ${config.selectedAccountId || '(none)'}`);
    lines.push(`- **Selected Account Name**: ${config.selectedAccountName || '(none)'}`);
    lines.push('');
    
    // Summary
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Total | Passed | Failed |`);
    lines.push(`|-------|--------|--------|`);
    lines.push(`| ${results.length} | ${passed} | ${failed} |`);
    lines.push('');
    
    // Detailed results
    lines.push('## Test Results');
    lines.push('');
    
    for (const result of results) {
        const icon = result.passed ? '✅' : '❌';
        lines.push(`### ${icon} ${result.name}`);
        lines.push('');
        lines.push(`**Question**: "${result.question}"`);
        lines.push('');
        if (result.expectedBehavior) {
            lines.push(`**Expected Behavior**: ${result.expectedBehavior}`);
            lines.push('');
        }
        lines.push(`**Classification**: ${result.classification.type} (maxSteps: ${result.classification.maxSteps})`);
        lines.push('');
        lines.push(`**Steps Taken**: ${result.stepsCount} | **Time**: ${result.elapsedMs}ms`);
        lines.push('');
        
        if (result.errors.length > 0) {
            lines.push('**Errors**:');
            for (const error of result.errors) {
                lines.push(`- ${error}`);
            }
            lines.push('');
        }
        
        // Queries section
        if (result.queries.length > 0) {
            lines.push('#### Queries Generated');
            lines.push('');
            for (let i = 0; i < result.queries.length; i++) {
                const q = result.queries[i];
                lines.push(`**${i + 1}. ${q.toolName}**`);
                if (q.description) lines.push(`- Description: ${q.description}`);
                if (q.reasoning) lines.push(`- Reasoning: ${q.reasoning}`);
                if (q.sql) {
                    lines.push('- SQL:');
                    lines.push('```sql');
                    lines.push(q.sql);
                    lines.push('```');
                }
                if (q.rowCount !== undefined) lines.push(`- Row Count: ${q.rowCount}`);
                if (q.result && typeof q.result !== 'object') {
                    lines.push(`- Result: ${JSON.stringify(q.result)}`);
                } else if (q.result && Array.isArray(q.result) && q.result.length <= 5) {
                    lines.push(`- Result: \`${JSON.stringify(q.result)}\``);
                }
                lines.push('');
            }
        }
        
        lines.push('#### Final Response');
        lines.push('');
        lines.push('```');
        lines.push(result.finalResponse || '(no response)');
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
    }
    
    // Feedback section
    lines.push('## Feedback Template');
    lines.push('');
    lines.push('Use this section to provide feedback for prompt improvements:');
    lines.push('');
    lines.push('### Issues Found');
    lines.push('');
    lines.push('1. [ ] Issue description...');
    lines.push('');
    lines.push('### Suggested Prompt Changes');
    lines.push('');
    lines.push('1. Change X to Y because...');
    lines.push('');
    
    return lines.join('\n');
}

/**
 * Save reports to files
 */
function saveReports(results: TestResult[], config: typeof TEST_CONFIG): void {
    // Ensure reports directory exists
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Save JSON report
    const jsonPath = path.join(REPORTS_DIR, `posting-prompt-report.json`);
    const jsonReport = {
        generated: new Date().toISOString(),
        config,
        summary: {
            total: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length,
        },
        results,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
    console.log(`\nJSON report saved: ${jsonPath}`);
    
    // Save Markdown report
    const mdPath = path.join(REPORTS_DIR, `posting-prompt-report.md`);
    const mdReport = generateMarkdownReport(results, config);
    fs.writeFileSync(mdPath, mdReport);
    console.log(`Markdown report saved: ${mdPath}`);
    
    // Also save a timestamped version for history
    const historyJsonPath = path.join(REPORTS_DIR, `posting-prompt-report-${timestamp}.json`);
    fs.writeFileSync(historyJsonPath, JSON.stringify(jsonReport, null, 2));
    console.log(`History report saved: ${historyJsonPath}`);
}

/**
 * Run a single test case
 */
async function runTestCase(
    testCase: TestCase,
    agentService: AgentService,
    auth: AuthContext,
    context: any,
    verbose: boolean = true
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
        
        const result = await agentService.handleRequest(
            testCase.question,
            auth,
            [], // No previous messages
            context
        );
        
        testResult.elapsedMs = Date.now() - startTime;
        testResult.stepsCount = result.steps?.length || 0;
        testResult.finalResponse = result.content || '';
        testResult.classification = {
            type: result.classification?.type || 'unknown',
            maxSteps: result.classification?.maxSteps || 0,
            reasoning: result.classification?.reasoning || '',
        };
        
        // Extract query details for the report
        testResult.queries = extractQueryDetails(result);
        
        if (verbose) {
            console.log(`\nCompleted in ${testResult.elapsedMs}ms`);
            console.log(`Classification: ${testResult.classification.type} (maxSteps: ${testResult.classification.maxSteps})`);
            console.log(`Steps taken: ${testResult.stepsCount}`);
            
            // Show queries
            if (testResult.queries.length > 0) {
                console.log(`\nQueries generated:`);
                for (const q of testResult.queries) {
                    console.log(`  - ${q.toolName}${q.sql ? ': ' + q.sql.substring(0, 80) + '...' : ''}`);
                }
            }
            
            console.log(`\nResponse preview:`);
            console.log('-'.repeat(40));
            console.log(testResult.finalResponse.substring(0, 500) + (testResult.finalResponse.length > 500 ? '...' : ''));
            console.log('-'.repeat(40));
        }

        // Check classification
        if (testCase.expectAnalytical !== undefined) {
            const isAnalytical = testResult.classification.type === 'analytical';
            if (testCase.expectAnalytical !== isAnalytical) {
                testResult.errors.push(`Expected ${testCase.expectAnalytical ? 'analytical' : 'transactional'} but got ${testResult.classification.type}`);
            }
        }

        // Check minimum steps
        if (testCase.minSteps !== undefined) {
            if (testResult.stepsCount < testCase.minSteps) {
                testResult.errors.push(`Expected at least ${testCase.minSteps} steps but got ${testResult.stepsCount}`);
            }
        }

        // Check response content
        if (testCase.expectResponseContains) {
            const content = testResult.finalResponse.toLowerCase();
            for (const pattern of testCase.expectResponseContains) {
                if (!content.includes(pattern.toLowerCase())) {
                    testResult.errors.push(`Response missing expected content: "${pattern}"`);
                }
            }
        }

        // Check tool patterns
        if (testCase.expectToolPatterns) {
            const toolCalls = extractToolCalls(result);
            const allToolData = toolCalls.join(' ').toLowerCase();
            
            if (verbose) {
                console.log(`\nTool calls detected: ${toolCalls.filter(t => !t.startsWith('{')).join(', ')}`);
            }
            
            for (const pattern of testCase.expectToolPatterns) {
                if (!allToolData.includes(pattern.toLowerCase())) {
                    testResult.errors.push(`Tool calls missing expected pattern: "${pattern}"`);
                }
            }
        }

        testResult.passed = testResult.errors.length === 0;

        if (testResult.passed) {
            console.log('\n✅ PASSED');
        } else {
            console.log('\n❌ FAILED');
            for (const error of testResult.errors) {
                console.log(`   - ${error}`);
            }
        }

    } catch (error) {
        testResult.errors.push(`Error: ${error}`);
        console.log(`\n❌ ERROR: ${error}`);
    }

    return testResult;
}

/**
 * Main test runner
 */
async function runAllTests(verbose: boolean = true): Promise<void> {
    console.log('\n' + '█'.repeat(60));
    console.log('  POSTING ANALYTICS PROMPT TEST HARNESS');
    console.log('  Using AgentService with real database');
    console.log('█'.repeat(60));

    // Verify environment
    if (!isLlmConfigured()) {
        console.error('\n❌ ERROR: LLM not configured. Set LLM_PROVIDER and credentials in backend/.env');
        console.error('  e.g. LLM_PROVIDER=openrouter and OPENROUTER_API_KEY=...');
        process.exit(1);
    }
    console.log(`  LLM: ${process.env.LLM_PROVIDER} / ${process.env.LLM_MODEL || '(unset)'}`);

    console.log('\nConfiguration:');
    console.log(`  User ID: ${TEST_CONFIG.userId}`);
    console.log(`  Org ID: ${TEST_CONFIG.orgId}`);
    console.log(`  Selected Account: ${TEST_CONFIG.selectedAccountId || '(none)'}`);
    console.log(`  LLM Model: ${process.env.LLM_MODEL || 'gemini-2.0-flash-001'}`);

    // Build auth context
    console.log('\nLoading auth context...');
    let auth: AuthContext;
    try {
        auth = await buildAuthContext();
        console.log(`  User: ${auth.user.name || auth.user.email}`);
        console.log(`  Permissions loaded for ${Object.keys(auth.permissions || {}).length} models`);
    } catch (error) {
        console.error(`\n❌ ERROR: Failed to build auth context: ${error}`);
        console.error('Make sure the test user exists in the database');
        await prisma.$disconnect();
        process.exit(1);
    }

    // Build page context (matching what the UI sends)
    const context = await buildPageContext();
    console.log(`\nPage context: modelName=${context.modelName}, viewName=${context.viewName}`);
    if (context.modelContext?.selectedAccountId) {
        console.log(`  Selected account: ${context.modelContext.selectedAccountName} (${context.modelContext.selectedAccountId})`);
    }

    // Create agent service
    const agentService = new AgentService();

    // Run base tests
    const results: TestResult[] = [];

    for (const testCase of TEST_CASES) {
        const result = await runTestCase(testCase, agentService, auth, context, verbose);
        results.push(result);

        // Small delay between tests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Run account-specific tests only if selectedAccountId is provided
    if (context.modelContext?.selectedAccountId) {
        console.log('\n' + '-'.repeat(60));
        console.log('Running account-specific tests (selectedAccountId provided)');
        console.log('-'.repeat(60));

        for (const testCase of TEST_CASES_WITH_ACCOUNT) {
            const result = await runTestCase(testCase, agentService, auth, context, verbose);
            results.push(result);

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } else {
        console.log('\n' + '-'.repeat(60));
        console.log('Skipping account-specific tests (no selectedAccountId)');
        console.log('Set TEST_ACCOUNT_ID env var to run these tests');
        console.log('-'.repeat(60));
    }

    // Summary
    console.log('\n' + '█'.repeat(60));
    console.log('  TEST SUMMARY');
    console.log('█'.repeat(60));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

    for (const result of results) {
        const icon = result.passed ? '✅' : '❌';
        console.log(`${icon} ${result.name}`);
        if (!result.passed && result.errors.length > 0) {
            console.log(`   → ${result.errors.join('; ')}`);
        }
    }

    console.log('\n' + '█'.repeat(60));

    // Allow fire-and-forget LLM trace logger to finish before we disconnect
    await new Promise((r) => setTimeout(r, 1500));

    // Save reports for review
    saveReports(results, TEST_CONFIG);

    // Cleanup
    await prisma.$disconnect();

    if (failed > 0) {
        process.exit(1);
    }
}

/** Get custom question from CLI: --question "..." or -q "..." or first positional arg */
function getCustomQuestion(): string | null {
    const args = process.argv.slice(2);
    const qIndex = args.findIndex(a => a === '--question' || a === '-q');
    if (qIndex >= 0 && args[qIndex + 1] !== undefined) {
        return args[qIndex + 1].trim();
    }
    const first = args[0];
    if (first && !first.startsWith('-')) {
        return first.trim();
    }
    return null;
}

/**
 * Run a single custom question (same setup as full suite, no assertions).
 * Use: npm run test:posting-prompt -- --question "Your question here"
 */
async function runSingleQuestion(question: string): Promise<void> {
    console.log('\n' + '█'.repeat(60));
    console.log('  POSTING ANALYTICS — SINGLE QUESTION');
    console.log('█'.repeat(60));

    if (!isLlmConfigured()) {
        console.error('\n❌ ERROR: LLM not configured. Set LLM_PROVIDER and credentials in backend/.env');
        await prisma.$disconnect();
        process.exit(1);
    }

    console.log('\nLoading auth context...');
    let auth: AuthContext;
    try {
        auth = await buildAuthContext();
        console.log(`  User: ${auth.user.name || auth.user.email}`);
    } catch (error) {
        console.error(`\n❌ ERROR: Failed to build auth context: ${error}`);
        await prisma.$disconnect();
        process.exit(1);
    }

    const context = await buildPageContext();
    const agentService = new AgentService();
    const testCase: TestCase = { name: 'Custom', question };
    const result = await runTestCase(testCase, agentService, auth, context, true);
    // Allow fire-and-forget LLM trace logger to finish before we disconnect
    await new Promise((r) => setTimeout(r, 1500));
    saveReports([result], TEST_CONFIG);
    await prisma.$disconnect();
}

// Run: single question if --question/-q or first positional arg, otherwise full suite
const customQuestion = getCustomQuestion();
(customQuestion ? runSingleQuestion(customQuestion) : runAllTests(true)).catch(async (error) => {
    console.error('Test harness error:', error);
    await prisma.$disconnect();
    process.exit(1);
});

export { runAllTests, runSingleQuestion, getCustomQuestion, TEST_CASES, TEST_CONFIG };
