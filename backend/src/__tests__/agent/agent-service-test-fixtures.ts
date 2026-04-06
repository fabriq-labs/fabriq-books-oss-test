import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for agent service tests
export const createTestContext = (
    userId: string = 'user_test_123',
    orgId: string = 'org_test_company'
): AuthContext => ({
    user: {
        id: userId,
        org_id: orgId,
        email: `test${userId}@example.com`,
        name: 'Test User'
    },
    permissions: {
        purchase_requisition: { '*': 'write' },
        item_master: { '*': 'read' },
        supplier: { '*': 'read' },
        location: { '*': 'read' },
        organization: { '*': 'read' },
        invoice: { '*': 'write' },
    },
});

// Helper to create mock request with messages
export const createChatRequest = (
    messages: Array<{ role: string; content: string }>,
    context?: any
) => ({
    messages,
    context: context || {},
});

// Helper to create extract request with file
export const createExtractRequest = (prompt: string = 'Extract data from this file') => ({
    prompt,
    file: {
        buffer: Buffer.from('fake pdf content'),
        originalname: 'test-invoice.pdf',
        mimetype: 'application/pdf',
        size: 1024,
    },
    context: {
        modelName: 'invoice',
    },
});

// Helper to create streaming request
export const createStreamRequest = (
    messages: Array<{ role: string; content: string }>,
    context?: any
) => ({
    messages,
    context: context || {},
});

// Assertions
export const assertAgentResponse = (response: any) => {
    expect(response).toBeDefined();
    expect(response.choices || response.content).toBeDefined();
};

export const assertToolResults = (response: any) => {
    const toolResults = response.toolResults || [];
    const steps = response.steps || [];

    // Tool results might be in toolResults or in steps
    const hasToolResults = toolResults.length > 0 ||
        steps.some((step: any) => step.toolResults && step.toolResults.length > 0);

    return hasToolResults;
};

export const assertMessageProcessing = (processedMessages: any[]) => {
    expect(processedMessages).toBeDefined();
    expect(Array.isArray(processedMessages)).toBe(true);
    processedMessages.forEach(msg => {
        expect(msg.role).toBeDefined();
        expect(msg.content).toBeDefined();
    });
};

export const assertAccessibleModels = (models: any[]) => {
    expect(models).toBeDefined();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
};

export const assertSystemPrompt = (prompt: string) => {
    expect(prompt).toBeDefined();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
};

export const assertToolsAvailable = (tools: any) => {
    expect(tools).toBeDefined();
    expect(typeof tools).toBe('object');
    expect(Object.keys(tools).length).toBeGreaterThan(0);
};

// Clean up test data
export const cleanupTestData = async (orgId: string) => {
    // Note: We typically don't clean up agent-related test data
    // as it's mostly read operations. If needed, add cleanup logic here.
};

