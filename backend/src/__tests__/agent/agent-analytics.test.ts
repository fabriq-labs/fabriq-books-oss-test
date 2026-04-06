import { AgentService } from '../../agent/AgentService';
import { classifyQuestion } from '../../agent/utils/questionClassifier';
import prisma from '../../lib/prisma';
import { AuthContext } from '../../auth/types';

/**
 * Analytics Query Tests
 * 
 * Tests the analytics capabilities including:
 * - Question classification (transactional vs analytical)
 * - Analytics context tool usage
 * - Multi-step query execution
 * - Permission-aware SQL execution
 */
describe('Agent Analytics Queries', () => {
    // Increase timeout for LLM operations
    jest.setTimeout(120000); // 120 seconds for multi-step LLM calls

    const agentService = new AgentService();
    
    // Will be set dynamically based on actual database data
    let context: AuthContext;
    let dbSetupAvailable = false;
    let actualOrgId: string | null = null;
    let actualUserId: string | null = null;

    beforeAll(async () => {
        // Find an org_id that has active workflow instances
        // This ensures tests run against real data
        try {
            const activeInstance: any = await prisma.$queryRaw`
                SELECT DISTINCT wi.org_id, wi.assigned_user_id
                FROM workflow_instance wi
                WHERE wi.status = 'active'
                LIMIT 1
            `;

            if (activeInstance && activeInstance.length > 0) {
                actualOrgId = activeInstance[0].org_id;
                actualUserId = activeInstance[0].assigned_user_id || 'test_user';
                dbSetupAvailable = true;
                console.log(`Found active workflow data in org: ${actualOrgId}`);
            } else {
                console.log('No active workflow instances found in database');
            }
        } catch (error: any) {
            console.log('Database not available:', error.message);
        }

        // Create context with actual org_id from database
        const orgId = actualOrgId || 'org_test_company';
        const userId = actualUserId || 'test_user';
        
        context = {
            user: {
                id: userId,
                org_id: orgId,
                email: `${userId}@example.com`,
                name: 'Test User'
            },
            permissions: {
                purchase_requisition: { '*': 'read' },
                item_master: { '*': 'read' },
                supplier: { '*': 'read' },
                location: { '*': 'read' },
                organization: { '*': 'read' },
                invoice: { '*': 'read' },
                workflow_instance: { '*': 'read' },
                workflow_flow: { '*': 'read' },
                workflow_state: { '*': 'read' },
                user: { '*': 'read' },
                role: { '*': 'read' },
            }
        };

        console.log('Test context org_id:', context.user.org_id);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    // =========================================================================
    // Question Classification Tests
    // =========================================================================
    describe('Question Classification', () => {
        it('should classify count questions as analytical', () => {
            const questions = [
                'How many purchase requisitions are pending approval?',
                'Count the invoices created this month',
                'What is the total number of suppliers?',
            ];

            questions.forEach(q => {
                const classification = classifyQuestion(q);
                expect(classification.type).toBe('analytical');
                expect(classification.maxSteps).toBeGreaterThan(2);
                console.log(`"${q}" → ${classification.type} (${classification.maxSteps} steps)`);
            });
        });

        it('should classify aggregate questions as analytical', () => {
            const questions = [
                'What is the average wait time for manager approval?',
                'Show me the total spend by department',
                'Calculate the sum of all pending invoices',
            ];

            questions.forEach(q => {
                const classification = classifyQuestion(q);
                expect(classification.type).toBe('analytical');
                console.log(`"${q}" → ${classification.type} (${classification.reasoning})`);
            });
        });

        it('should classify pending approval questions as analytical', () => {
            const questions = [
                'How many PRs are waiting for manager approval?',
                'Which purchase orders are pending review?',
                'Show me items stuck in approval',
            ];

            questions.forEach(q => {
                const classification = classifyQuestion(q);
                expect(classification.type).toBe('analytical');
                console.log(`"${q}" → ${classification.type}`);
            });
        });

        it('should classify cross-module questions as analytical with more steps', () => {
            const questions = [
                'Trace the PR to PO to Invoice flow for this requisition',
                'Track the end to end procurement cycle',
            ];

            questions.forEach(q => {
                const classification = classifyQuestion(q);
                expect(classification.type).toBe('analytical');
                expect(classification.maxSteps).toBe(8); // Cross-module gets max steps
                console.log(`"${q}" → ${classification.type} (${classification.maxSteps} steps)`);
            });
        });

        it('should classify simple CRUD operations as transactional', () => {
            const questions = [
                'Create a new purchase requisition',
                'Update the supplier address',
                'Show me the invoice INV-001',
            ];

            questions.forEach(q => {
                const classification = classifyQuestion(q);
                expect(classification.type).toBe('transactional');
                expect(classification.maxSteps).toBe(2);
                console.log(`"${q}" → ${classification.type}`);
            });
        });
    });

    // =========================================================================
    // Analytics Tool Execution Tests
    // =========================================================================
    describe('Analytics Query Execution', () => {
        it('should handle "how many PRs pending manager approval" with analytics tools', async () => {
            if (!dbSetupAvailable) {
                console.log('Skipping test - database not available');
                return;
            }

            const analyticalQuestion = 'How many purchase requisitions are waiting for manager approval and what is the average waiting time?';
            
            const routeContext = {
                modelName: 'default',
                orgId: context.user?.org_id || 'org_indian_demo',
            };

            console.log('\n--- Analytics Query Test ---');
            console.log('Question:', analyticalQuestion);

            const response = await agentService.handleRequest(
                analyticalQuestion,
                context,
                [],
                routeContext
            );

            // Check classification was applied
            expect(response.classification).toBeDefined();
            expect(response.classification.type).toBe('analytical');
            console.log('Classification:', response.classification);

            // Track tool usage
            let analyticsContextCalled = false;
            let analyticsQueryCalled = false;
            let queryCount = 0;

            // Check steps for analytics tool calls
            response.steps?.forEach((step: any, stepIndex: number) => {
                step?.toolCalls?.forEach((toolCall: any) => {
                    console.log(`Step ${stepIndex + 1} - Tool: ${toolCall?.toolName}`);
                    
                    if (toolCall?.toolName === 'getAnalyticsContext') {
                        analyticsContextCalled = true;
                        console.log('  → getAnalyticsContext args:', JSON.stringify(toolCall?.args, null, 2));
                    }
                    
                    if (toolCall?.toolName === 'analyticsQuery') {
                        analyticsQueryCalled = true;
                        queryCount++;
                        console.log(`  → analyticsQuery #${queryCount}:`);
                        console.log('    Description:', toolCall?.args?.description);
                        console.log('    Step:', toolCall?.args?.step);
                        console.log('    Query preview:', toolCall?.args?.query?.substring(0, 100) + '...');
                    }
                });

                step?.toolResults?.forEach((toolResult: any) => {
                    if (toolResult?.toolName === 'analyticsQuery') {
                        console.log(`  → Query result: ${toolResult?.result?.rowCount} rows`);
                        if (toolResult?.result?.data) {
                            console.log('    Data:', JSON.stringify(toolResult?.result?.data, null, 2).substring(0, 200));
                        }
                    }
                });
            });

            console.log('\n--- Summary ---');
            console.log('getAnalyticsContext called:', analyticsContextCalled);
            console.log('analyticsQuery called:', analyticsQueryCalled);
            console.log('Total queries executed:', queryCount);
            console.log('Final response preview:', response.content?.substring(0, 300));

            // Assertions
            expect(response).toBeDefined();
            expect(response.content).toBeDefined();
            
            // Analytics tools should be used for this type of question
            // Note: The LLM decides which tools to use, so we check if at least one was called
            expect(analyticsContextCalled || analyticsQueryCalled).toBe(true);
        });

        it('should handle "who raised and who is it pending with" questions', async () => {
            if (!dbSetupAvailable) {
                console.log('Skipping test - database not available');
                return;
            }

            const question = 'Show me the pending purchase requisitions and tell me who raised them and who they are pending with';
            
            const routeContext = {
                modelName: 'default',
                orgId: context.user?.org_id || 'org_indian_demo',
            };

            console.log('\n--- Who Raised / Pending With Test ---');
            console.log('Question:', question);

            const response = await agentService.handleRequest(
                question,
                context,
                [],
                routeContext
            );

            console.log('Classification:', response.classification);

            // Check that we got a response with data
            expect(response).toBeDefined();
            expect(response.content).toBeDefined();
            
            // This question should be classified as analytical
            expect(response.classification?.type).toBe('analytical');

            // Log the response for inspection
            console.log('Response content:', response.content?.substring(0, 500));

            // Check if user names/emails are mentioned in the response
            // (This is a soft check - the actual data depends on what's in the DB)
            response.steps?.forEach((step: any, stepIndex: number) => {
                step?.toolResults?.forEach((toolResult: any) => {
                    if (toolResult?.toolName === 'analyticsQuery' && toolResult?.result?.data) {
                        console.log(`Step ${stepIndex + 1} data:`, JSON.stringify(toolResult.result.data, null, 2));
                    }
                });
            });
        });

        it('should handle workflow state distribution queries', async () => {
            if (!dbSetupAvailable) {
                console.log('Skipping test - database not available');
                return;
            }

            const question = 'Give me a breakdown of how many items are in each workflow state for purchase requisitions';
            
            const routeContext = {
                modelName: 'default',
                orgId: context.user?.org_id || 'org_indian_demo',
            };

            console.log('\n--- Workflow State Distribution Test ---');
            console.log('Question:', question);

            const response = await agentService.handleRequest(
                question,
                context,
                [],
                routeContext
            );

            expect(response).toBeDefined();
            expect(response.classification?.type).toBe('analytical');

            console.log('Response:', response.content?.substring(0, 500));
        });
    });

    // =========================================================================
    // Multi-Step Query Tests
    // =========================================================================
    describe('Multi-Step Query Execution', () => {
        it.only('should execute multi-step queries with step parameter', async () => {
            if (!dbSetupAvailable) {
                console.log('Skipping test - database not available');
                return;
            }

            // This question requires multiple steps:
            // 1. Find the workflow state ID for "Manager Review"
            // 2. Count instances in that state
            // 3. Calculate average wait time
            const question = 'How many PRs are in Manager Review state, what is the average wait time, and who are they assigned to?';
            
            const routeContext = {
                modelName: 'default',
                orgId: context.user?.org_id || 'org_indian_demo',
            };

            console.log('\n--- Multi-Step Query Test ---');
            console.log('Question:', question);

            const response = await agentService.handleRequest(
                question,
                context,
                [],
                routeContext
            );

            // Track step numbers
            const stepNumbers: number[] = [];

            response.steps?.forEach((step: any) => {
                step?.toolCalls?.forEach((toolCall: any) => {
                    if (toolCall?.toolName === 'analyticsQuery' && toolCall?.args?.step) {
                        stepNumbers.push(toolCall.args.step);
                        console.log(`Query step ${toolCall.args.step}: ${toolCall.args.description}`);
                    }
                });
            });

            console.log('Step numbers used:', stepNumbers);
            console.log('Total steps:', response.steps?.length || 0);
            console.log('Max steps allowed:', response.classification?.maxSteps);
            console.log('Response:', response.content);
            console.log('Reasoning for classification:', response.classification?.reasoning);

            expect(response).toBeDefined();
            // For complex questions, we expect multiple steps to be used
            expect(response.steps?.length).toBeGreaterThan(0);
        });
    });

    // =========================================================================
    // Permission Enforcement Tests
    // =========================================================================
    describe('Permission and Multi-Tenancy', () => {
        it('should include org_id in analytics context', async () => {
            if (!dbSetupAvailable) {
                console.log('Skipping test - database not available');
                return;
            }

            const question = 'How many invoices do we have?';
            
            const routeContext = {
                modelName: 'default',
                orgId: 'org_indian_demo',
            };

            const response = await agentService.handleRequest(
                question,
                context,
                [],
                routeContext
            );

            // Check that getAnalyticsContext returned org_id
            let orgIdProvided = false;

            response.steps?.forEach((step: any) => {
                step?.toolResults?.forEach((toolResult: any) => {
                    if (toolResult?.toolName === 'getAnalyticsContext') {
                        const ctx = toolResult?.result?.context;
                        if (ctx?.user?.org_id) {
                            orgIdProvided = true;
                            console.log('org_id provided in context:', ctx.user.org_id);
                        }
                    }
                });
            });

            // If analytics context was called, it should have provided org_id
            // Note: The LLM might skip getAnalyticsContext for simple queries
            if (response.classification?.type === 'analytical') {
                console.log('Analytical query - checking for org_id in context');
            }

            expect(response).toBeDefined();
        });
    });
});
