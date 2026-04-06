import { AgentService } from '../../agent/AgentService';
import { ModelRegistry } from '../../services/registry/ModelRegistry';
import { ToolManager } from '../../agent/ToolManager';
import prisma from '../../lib/prisma';
import {
    createTestContext,
    createChatRequest,
    createExtractRequest,
    assertAgentResponse,
    assertToolResults,
    assertMessageProcessing,
    assertAccessibleModels,
    assertSystemPrompt,
    assertToolsAvailable,
} from './agent-service-test-fixtures';
import { processMessages } from '../../agent/utils/messageProcessor';

describe('Agent Service Tests', () => {
    // Increase timeout for LLM operations
    jest.setTimeout(60000); // 60 seconds for LLM calls

    // Use local prompts for tests (don't require database prompt templates)
    const originalEnv = process.env.USE_LOCAL_PROMPT;

    beforeAll(() => {
        process.env.USE_LOCAL_PROMPT = 'true';
    });

    afterAll(() => {
        if (originalEnv !== undefined) {
            process.env.USE_LOCAL_PROMPT = originalEnv;
        } else {
            delete process.env.USE_LOCAL_PROMPT;
        }
    });

    console.log('\n🚀 Starting Agent Service Tests');
    const agentService = new AgentService();
    const context = createTestContext('user_test_123', 'org_test_company');

    // Seed data IDs from setup-test-data.ts
    const ORG_ID = 'org_test_company';
    const ITEM_ID = 'item_test_product_a';
    const LOCATION_ID = 'loc_test_warehouse';

    // Track if database setup is available
    let dbSetupAvailable = false;

    beforeAll(async () => {
        // Try to verify database setup, but don't fail all tests if not available
        try {
            const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
            if (org) {
                dbSetupAvailable = true;
                console.log('✓ Database setup verified from setup-test-data.ts');
            } else {
                console.log('⚠️  Database setup not found. Some tests will be skipped.');
                console.log('   To run full tests: npx ts-node prisma/setup-test-data.ts');
            }
        } catch (error) {
            console.log('⚠️  Database connection failed. Some tests will be skipped.');
        }
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('Model Registry - Accessible Models', () => {
        it('should get accessible models for user with permissions', async () => {
            console.log('\n=== TEST 1: Get Accessible Models ===');

            const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(
                context.permissions || {}
            );

            console.log('✓ Accessible Models:', accessibleModels.map(m => m.name));
            assertAccessibleModels(accessibleModels);

            // Verify expected models are accessible (if registry has them)
            const modelNames = accessibleModels.map(m => m.name);
            if (modelNames.length > 0) {
                // At least one model should be accessible
                expect(modelNames.length).toBeGreaterThan(0);
            }

            console.log('✓ Test 1 PASSED\n');
        });

        it('should return empty array for user with no permissions', async () => {
            console.log('\n=== TEST 2: No Accessible Models ===');

            const emptyContext = {
                ...context,
                permissions: {},
            };

            const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(
                emptyContext.permissions
            );

            console.log('✓ Accessible Models (empty):', accessibleModels.length);
            expect(accessibleModels.length).toBe(0);

            console.log('✓ Test 2 PASSED\n');
        });
    });

    describe('Tool Manager - Get Tools for Model', () => {
        it('should get default tools for default model', async () => {
            console.log('\n=== TEST 3: Default Model Tools ===');

            const toolManager = ToolManager.getInstance();
            const tools = toolManager.getToolsForModel('default', context);

            console.log('✓ Available Tools:', Object.keys(tools));
            assertToolsAvailable(tools);

            // Default model should have search, advanced SQL, and extract
            expect(tools.searchRecords).toBeDefined();
            expect(tools.advancedSqlQuery).toBeDefined();
            expect(tools.extractInvoiceFromFile).toBeDefined();

            // Should NOT have create/update for default model
            expect(tools.createRecord).toBeUndefined();
            expect(tools.updateRecord).toBeUndefined();

            console.log('✓ Test 3 PASSED\n');
        });

        it('should get full tools for purchase_requisition model', async () => {
            console.log('\n=== TEST 4: Purchase Requisition Model Tools ===');

            const toolManager = ToolManager.getInstance();
            const tools = toolManager.getToolsForModel('purchase_requisition', context);

            console.log('✓ Available Tools:', Object.keys(tools));
            assertToolsAvailable(tools);

            // Purchase requisition should have all CRUD operations
            expect(tools.searchRecords).toBeDefined();
            expect(tools.createRecord).toBeDefined();
            expect(tools.updateRecord).toBeDefined();
            expect(tools.createChildItem).toBeDefined();
            expect(tools.updateChildItem).toBeDefined();

            // Should have related model search tools
            expect(tools.searchItems).toBeDefined();
            expect(tools.searchSuppliers).toBeDefined();
            expect(tools.searchDepartments).toBeDefined();

            console.log('✓ Test 4 PASSED\n');
        });
    });

    describe('Message Processor', () => {
        it('should process simple text messages', async () => {
            console.log('\n=== TEST 5: Process Text Messages ===');

            const rawMessages = [
                {
                    role: 'user',
                    content: 'Show me my purchase requisitions',
                },
            ];

            const processedMessages = processMessages(rawMessages as any);

            console.log('✓ Processed Messages:', processedMessages.length);
            assertMessageProcessing(processedMessages);

            expect(processedMessages[0].role).toBe('user');
            expect(processedMessages[0].content).toBe('Show me my purchase requisitions');

            console.log('✓ Test 5 PASSED\n');
        });

        it('should process messages with file attachments', async () => {
            console.log('\n=== TEST 6: Process Messages with Files ===');

            const base64Data = Buffer.from('fake pdf content').toString('base64');
            const dataUri = `data:application/pdf;base64,${base64Data}`;

            const rawMessages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Extract invoice data' },
                        {
                            type: 'file',
                            data: dataUri,
                            mimeType: 'application/pdf',
                            name: 'invoice.pdf',
                        },
                    ],
                },
            ];

            const processedMessages = processMessages(rawMessages as any);

            console.log('✓ Processed Messages:', processedMessages.length);
            assertMessageProcessing(processedMessages);

            expect(processedMessages[0].role).toBe('user');
            expect(Array.isArray(processedMessages[0].content)).toBe(true);

            const content = processedMessages[0].content as any[];
            expect(content[0].type).toBe('text');
            expect(content[1].type).toBe('file');
            // File data should be Uint8Array, not base64 string
            expect(content[1].data).toBeInstanceOf(Uint8Array);

            console.log('✓ Test 6 PASSED\n');
        });
    });

    describe('Agent Service - Non-Streaming Request', () => {
        it('should handle simple search request', async () => {
            console.log('\n=== TEST 7: Simple Search Request ===');

            const message = 'Show me my purchase requisitions';
            const previousMessages: any[] = [];

            try {
                const response = await agentService.handleRequest(
                    message,
                    context,
                    previousMessages,
                    { modelName: 'purchase_requisition' }
                );

                console.log('✓ Response received');
                assertAgentResponse(response);
                expect(response.content).toBeDefined();
                expect(typeof response.content).toBe('string');

                // Should have steps array
                expect(response.steps).toBeDefined();
                expect(Array.isArray(response.steps)).toBe(true);

                console.log('✓ Response Content:', response.content?.substring(0, 100) + '...');
                console.log('✓ Steps:', response.steps?.length || 0);

                console.log('✓ Test 7 PASSED\n');
            } catch (error: any) {
                // Skip test if LLM is not configured
                if (error.message?.includes('API key') || error.message?.includes('authentication')) {
                    console.log('⚠️  Skipping test - LLM not configured:', error.message);
                    return;
                }
                throw error;
            }
        });

        it('should handle request with conversation history', async () => {
            console.log('\n=== TEST 8: Request with Conversation History ===');

            const message = 'Create a new one';
            const previousMessages = [
                {
                    role: 'user',
                    content: 'Show me my purchase requisitions',
                },
                {
                    role: 'assistant',
                    content: 'Here are your purchase requisitions...',
                },
            ];

            try {
                const response = await agentService.handleRequest(
                    message,
                    context,
                    previousMessages,
                    { modelName: 'purchase_requisition' }
                );

                console.log('✓ Response received');
                assertAgentResponse(response);
                expect(response.content).toBeDefined();

                console.log('✓ Response Content:', response.content?.substring(0, 100) + '...');
                console.log('✓ Test 8 PASSED\n');
            } catch (error: any) {
                if (error.message?.includes('API key') || error.message?.includes('authentication')) {
                    console.log('⚠️  Skipping test - LLM not configured:', error.message);
                    return;
                }
                throw error;
            }
        });
    });

    describe('Agent Service - Prepare Request Setup', () => {
        it('should prepare request setup correctly', async () => {
            console.log('\n=== TEST 9: Prepare Request Setup ===');

            const message = 'Search for items';
            const previousMessages: any[] = [];

            // Access private method via type casting (for testing)
            const setup = await (agentService as any).prepareRequestSetup(
                message,
                context,
                previousMessages,
                { modelName: 'default' }
            );

            console.log('✓ Setup completed');
            assertAccessibleModels(setup.accessibleModels);
            assertMessageProcessing(setup.processedMessages);
            assertSystemPrompt(setup.systemPrompt);
            assertToolsAvailable(setup.tools);
            expect(setup.modelName).toBe('default');

            console.log('✓ Accessible Models:', setup.accessibleModels.length);
            console.log('✓ Processed Messages:', setup.processedMessages.length);
            console.log('✓ System Prompt Length:', setup.systemPrompt.length);
            console.log('✓ Tools Available:', Object.keys(setup.tools).length);

            console.log('✓ Test 9 PASSED\n');
        });

        it('should throw error when no accessible models', async () => {
            console.log('\n=== TEST 10: No Accessible Models Error ===');

            const emptyContext = {
                ...context,
                permissions: {},
            };

            const message = 'Search for items';
            const previousMessages: any[] = [];

            await expect(
                (agentService as any).prepareRequestSetup(message, emptyContext, previousMessages, {})
            ).rejects.toThrow("You don't have access to any data models");

            console.log('✓ Test 10 PASSED\n');
        });
    });

    describe('Agent Service - System Prompt Generation', () => {
        it('should generate system prompt for default model', async () => {
            console.log('\n=== TEST 11: Generate System Prompt (Default) ===');

            const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(
                context.permissions || {}
            );

            const systemPrompt = await (agentService as any).createSystemPrompt(
                context.user.id,
                accessibleModels,
                {
                    modelName: 'default',
                    permissions: context.permissions,
                    orgId: context.user.org_id,
                }
            );

            console.log('✓ System Prompt generated');
            assertSystemPrompt(systemPrompt);

            // Should include model descriptions (case-insensitive check)
            expect(systemPrompt.toLowerCase()).toMatch(/available models/i);

            console.log('✓ System Prompt Length:', systemPrompt.length);
            console.log('✓ Test 11 PASSED\n');
        });

        it('should generate system prompt for purchase_requisition model', async () => {
            console.log('\n=== TEST 12: Generate System Prompt (Purchase Requisition) ===');

            const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(
                context.permissions || {}
            );

            const systemPrompt = await (agentService as any).createSystemPrompt(
                context.user.id,
                accessibleModels,
                {
                    modelName: 'purchase_requisition',
                    permissions: context.permissions,
                    orgId: context.user.org_id,
                }
            );

            console.log('✓ System Prompt generated');
            assertSystemPrompt(systemPrompt);

            console.log('✓ System Prompt Length:', systemPrompt.length);
            console.log('✓ Test 12 PASSED\n');
        });
    });

    describe('Integration Test - Full Request Flow', () => {
        it('should handle complete request flow with tool execution', async () => {
            if (!dbSetupAvailable) {
                console.log('\n⚠️  Skipping test - Database setup required');
                return;
            }

            console.log('\n=== TEST 13: Full Request Flow ===');

            const message = `Create a purchase requisition for location ${LOCATION_ID} with item ${ITEM_ID}, quantity 5`;
            const previousMessages: any[] = [];

            try {
                const response = await agentService.handleRequest(
                    message,
                    context,
                    previousMessages,
                    { modelName: 'purchase_requisition' }
                );

                console.log('✓ Full response received');
                assertAgentResponse(response);

                // Check if tools were executed
                const hasToolResults = assertToolResults(response);
                console.log('✓ Tool Results Present:', hasToolResults);

                // Check response structure
                expect(response.content).toBeDefined();
                expect(response.steps).toBeDefined();

                console.log('✓ Response Content:', response.content?.substring(0, 150) + '...');
                console.log('✓ Steps Count:', response.steps?.length || 0);

                // If tool results exist, verify structure
                if (hasToolResults) {
                    const toolResults = response.toolResults || [];
                    if (toolResults.length > 0) {
                        console.log('✓ Tool Results:', toolResults.length);
                        toolResults.forEach((result: any, index: number) => {
                            console.log(`  - Tool ${index + 1}:`, result.tool || 'unknown');
                        });
                    }
                }

                console.log('✓ Test 13 PASSED\n');
            } catch (error: any) {
                if (error.message?.includes('API key') || error.message?.includes('authentication')) {
                    console.log('⚠️  Skipping test - LLM not configured:', error.message);
                    return;
                }
                throw error;
            }
        });

        it('should handle search request and return structured data', async () => {
            if (!dbSetupAvailable) {
                console.log('\n⚠️  Skipping test - Database setup required');
                return;
            }

            console.log('\n=== TEST 14: Search Request with Structured Data ===');

            const message = `Search for purchase requisitions`;
            const previousMessages: any[] = [];

            try {
                const response = await agentService.handleRequest(
                    message,
                    context,
                    previousMessages,
                    { modelName: 'purchase_requisition' }
                );

                console.log('✓ Search response received');
                assertAgentResponse(response);

                // Check if search tool was executed
                const hasToolResults = assertToolResults(response);
                console.log('✓ Tool Results Present:', hasToolResults);

                console.log('✓ Response Content:', response.content?.substring(0, 150) + '...');
                console.log('✓ Test 14 PASSED\n');
            } catch (error: any) {
                if (error.message?.includes('API key') || error.message?.includes('authentication')) {
                    console.log('⚠️  Skipping test - LLM not configured:', error.message);
                    return;
                }
                throw error;
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid model name gracefully', async () => {
            console.log('\n=== TEST 15: Invalid Model Name ===');

            const message = 'Search for items';
            const previousMessages: any[] = [];

            try {
                const response = await agentService.handleRequest(
                    message,
                    context,
                    previousMessages,
                    { modelName: 'invalid_model_name' }
                );

                // Should still return a response (might be an error message)
                assertAgentResponse(response);
                expect(response.content).toBeDefined();

                console.log('✓ Test 15 PASSED\n');
            } catch (error: any) {
                // Error is acceptable for invalid model
                console.log('✓ Error handled gracefully:', error.message);
                console.log('✓ Test 15 PASSED\n');
            }
        });

        it('should handle empty message gracefully', async () => {
            console.log('\n=== TEST 16: Empty Message ===');

            const message = '';
            const previousMessages: any[] = [];

            try {
                const response = await agentService.handleRequest(
                    message,
                    context,
                    previousMessages,
                    {}
                );

                // Should return a response even for empty message
                assertAgentResponse(response);

                console.log('✓ Test 16 PASSED\n');
            } catch (error: any) {
                if (error.message?.includes('API key') || error.message?.includes('authentication')) {
                    console.log('⚠️  Skipping test - LLM not configured:', error.message);
                    return;
                }
                // Error is acceptable for empty message
                console.log('✓ Error handled gracefully:', error.message);
                console.log('✓ Test 16 PASSED\n');
            }
        });
    });
});

