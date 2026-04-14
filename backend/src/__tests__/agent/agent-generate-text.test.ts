import { AgentService } from '../../agent/AgentService';
import { createTestContext } from './agent-service-test-fixtures';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';

describe('Agent Generate Text Request - Create Record', () => {
    // Increase timeout for LLM operations
    jest.setTimeout(60000); // 60 seconds for LLM calls

    const agentService = new AgentService();
    const context = createTestContext('user_sanjay_gupta', 'org_indian_demo');

    let dbSetupAvailable = false;

    // Use dynamic prompts for tests (don't set USE_LOCAL_PROMPT)
    const originalEnv = process.env.USE_LOCAL_PROMPT;

    beforeAll(async () => {
        // Use dynamic prompts (remove USE_LOCAL_PROMPT if it exists)
        if (process.env.USE_LOCAL_PROMPT) {
            delete process.env.USE_LOCAL_PROMPT;
        }

        // Check database setup
        try {
            const org = await prisma.entity.findUnique({ where: { id: 'org_indian_demo' } });
            if (org) {
                dbSetupAvailable = true;
            }
        } catch (error: any) {
            // Silent check
        }
    });

    afterAll(async () => {
        // Restore original USE_LOCAL_PROMPT value
        if (originalEnv !== undefined) {
            process.env.USE_LOCAL_PROMPT = originalEnv;
        } else {
            delete process.env.USE_LOCAL_PROMPT;
        }
        await prisma.$disconnect();
    });

    it('should handle generate text request with messages and return create record response', async () => {
        if (!dbSetupAvailable) {
            console.log('Skipping test - database setup unavailable');
            return;
        }
        // Simulate messages format as /chat endpoint receives
        const messages = [
            {
                role: 'user',
                content: 'Create a new purchase requisition for office supplies'
            }
        ];

        const previousMessages = messages.slice(0, -1).map((msg: { role: string; content: string }) => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));

        const latestMessage = messages[messages.length - 1];
        const routeContext = {
            modelName: 'purchase_requisition',
            orgId: context.user?.org_id || 'org_indian_demo', // Add orgId from context
            viewName: 'view_1', // Use the actual view name that exists in the database
        };

        try {

            // This simulates what /chat endpoint does
            const response = await agentService.handleRequest(
                latestMessage.content,
                context,
                previousMessages,
                routeContext
            );

            const chatResponse: any = {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: response.content || ''
                    }
                }],
                steps: response.steps
            };

            let createRecordCalled = false;
            let createdRecordId: string | null = null;

            // Check steps for createRecord tool calls and extract the created ID
            chatResponse.steps?.forEach((step: any) => {
                // Check toolCalls in this step
                step?.toolCalls?.forEach((toolCall: any) => {
                    if (toolCall?.toolName === "createRecord") {
                        createRecordCalled = true;
                        console.log(`\ncreateRecord - Args:`, JSON.stringify(toolCall?.args, null, 2));
                    }
                });

                // Check toolResults in this step
                step?.toolResults?.forEach((toolResult: any) => {
                    if (toolResult?.toolName === "createRecord") {
                        createRecordCalled = true;
                        if (toolResult?.result?.data?.id) {
                            createdRecordId = toolResult.result.data.id;
                        }
                        console.log(`createRecord - Result:`, JSON.stringify(toolResult?.result?.data, null, 2));
                    }
                });
            });

            // Also check response.toolResults directly (if available)
            if (response.toolResults) {
                response.toolResults.forEach((toolResult: any) => {
                    if (toolResult?.toolName === "createRecord") {
                        createRecordCalled = true;
                        if (toolResult?.result?.data?.id) {
                            createdRecordId = toolResult.result.data.id;
                        }
                        console.log(`createRecord - Result:`, JSON.stringify(toolResult?.result?.data, null, 2));
                    }
                });
            }

            expect(createRecordCalled).toBe(true);
            expect(createdRecordId).not.toBeNull();
            expect(createdRecordId).toBeDefined();

            expect(response).toBeDefined();

        } catch (error: any) {
            console.log('Error details:', error?.message);
            if (
                error.message?.includes('No prompt templates found') ||
                error.message?.includes('View not found for model') ||
                error.message?.includes('API key') ||
                error.message?.includes('authentication')
            ) {
                console.log('Skipping test - prompt/LLM setup unavailable');
                return;
            }
            throw error;
        }
    });

    it('should handle update request and update purchase requisition purchase reason', async () => {
        if (!dbSetupAvailable) {
            console.log('Skipping test - database setup unavailable');
            return;
        }
        // Use a record ID from the create test or provide your own
        // You can pass the record ID here or get it from a previous test
        const recordId = 'preq_6ed45c38-5dca-4561-8339-7c733ee6122a'; // Replace with actual record ID
        const routeContext = {
            modelName: 'purchase_requisition',
            orgId: context.user?.org_id || 'org_indian_demo',
            viewName: 'view_1',
            recordId: recordId,
        };

        try {
            const updateMessage = `Update the purchase requisition purchase reason to office supplies-updated`;

            const updateResponse = await agentService.handleRequest(
                updateMessage,
                context,
                [],
                routeContext
            );

            let updateRecordCalled = false;
            let updatedRecordId: string | null = null;

            // Check if updateRecord was called
            if (updateResponse.steps) {
                updateResponse.steps.forEach((step: any) => {
                    // Check toolCalls in this step
                    step?.toolCalls?.forEach((toolCall: any) => {
                        if (toolCall?.toolName === "updateRecord") {
                            updateRecordCalled = true;
                            console.log(`\nupdateRecord - Args:`, JSON.stringify(toolCall?.args, null, 2));
                            if (toolCall?.args?.id) {
                                updatedRecordId = toolCall.args.id;
                            }
                        }
                    });

                    // Check toolResults in this step
                    step?.toolResults?.forEach((toolResult: any) => {
                        if (toolResult?.toolName === "updateRecord") {
                            updateRecordCalled = true;
                            if (toolResult?.result?.data?.id) {
                                updatedRecordId = toolResult.result.data.id;
                            }
                            console.log(`updateRecord - Result:`, JSON.stringify(toolResult?.result?.data, null, 2));
                        }
                    });
                });
            }
            expect(updateRecordCalled).toBe(true);
            expect(updatedRecordId).toBe(recordId);
            expect(updateResponse).toBeDefined();

        } catch (error: any) {
            console.log('Error details:', error?.message);
            if (
                error.message?.includes('No prompt templates found') ||
                error.message?.includes('View not found for model') ||
                error.message?.includes('API key') ||
                error.message?.includes('authentication')
            ) {
                console.log('Skipping test - prompt/LLM setup unavailable');
                return;
            }
            throw error;
        }
    });

    it('should handle add line item request and add item to purchase requisition', async () => {
        if (!dbSetupAvailable) {
            console.log('Skipping test - database setup unavailable');
            return;
        }
        // Use a record ID from a created purchase requisition
        const recordId = 'preq_bcb35ac9-9c79-4dd7-b466-42e0339ef442'; // Replace with actual record ID
        const routeContext = {
            modelName: 'purchase_requisition',
            orgId: context.user?.org_id || 'org_indian_demo',
            viewName: 'view_1',
            recordId: recordId,
            promptTypes: ['default', 'line_item'],
        };

        try {
            const addItemMessage = `add a line item with this Dell Latitude 5420 Laptop and quantity 1 and need-by date 2026-01-01`;

            const addItemResponse = await agentService.handleRequest(
                addItemMessage,
                context,
                [],
                routeContext
            );
            console.log(addItemResponse);
            console.log(addItemResponse.steps);
            let createChildItemCalled = false;
            let parentRecordId: string | null = null;
            let childModelName: string | null = null;

            // Check if createChildItem was called
            if (addItemResponse.steps) {
                addItemResponse.steps.forEach((step: any) => {
                    // Check toolCalls in this step
                    step?.toolCalls?.forEach((toolCall: any) => {
                        if (toolCall?.toolName === "createChildItem") {
                            createChildItemCalled = true;
                            console.log(`\ncreateChildItem - Args:`, JSON.stringify(toolCall?.args, null, 2));
                            if (toolCall?.args?.parentId) {
                                parentRecordId = toolCall.args.parentId;
                            }
                            if (toolCall?.args?.childModelName) {
                                childModelName = toolCall.args.childModelName;
                            }
                        }
                    });

                    // Check toolResults in this step
                    step?.toolResults?.forEach((toolResult: any) => {
                        if (toolResult?.toolName === "createChildItem") {
                            createChildItemCalled = true;
                            if (toolResult?.result?.data?.id) {
                                parentRecordId = toolResult.result.data.id;
                            }
                            console.log(`createChildItem - Result:`, JSON.stringify(toolResult?.result?.data, null, 2));
                        }
                    });
                });
            }

            expect(createChildItemCalled).toBe(true);
            expect(parentRecordId).toBe(recordId);
            expect(childModelName).toBe('item');
            expect(addItemResponse).toBeDefined();

        } catch (error: any) {
            console.log('Error details:', error?.message);
            if (
                error.message?.includes('No prompt templates found') ||
                error.message?.includes('View not found for model') ||
                error.message?.includes('API key') ||
                error.message?.includes('authentication')
            ) {
                console.log('Skipping test - prompt/LLM setup unavailable');
                return;
            }
            throw error;
        }
    });
});

