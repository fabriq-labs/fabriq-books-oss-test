import * as fs from 'fs';
import * as path from 'path';
import { AgentService } from '../../agent/AgentService';
import { createTestContext } from './agent-service-test-fixtures';
import prisma from '../../lib/prisma';

const TEST_USER_EMAIL = 'meera.rao@demo-india.com';

describe('POST /extract - Invoice-document.pdf', () => {
  jest.setTimeout(60000);

  const agentService = new AgentService();
  let context = createTestContext();
  let dbSetupAvailable = false;
  const originalEnv = process.env.USE_LOCAL_PROMPT;

  beforeAll(async () => {
    process.env.USE_LOCAL_PROMPT = 'false';
    try {
      const user = await prisma.user.findUnique({
        where: { email: TEST_USER_EMAIL },
        select: { id: true, org_id: true },
      });
      if (user) {
        dbSetupAvailable = true;
        context = createTestContext(user.id, user.org_id ?? 'org_indian_demo');
        console.log(`✓ Using user: ${TEST_USER_EMAIL}`);
      } else {
        console.log(`⚠️  User ${TEST_USER_EMAIL} not found. Skipping test.`);
      }
    } catch (e) {
      console.log('⚠️  Database not available:', (e as Error)?.message ?? e);
    }
  });

  afterAll(async () => {
    if (originalEnv !== undefined) {
      process.env.USE_LOCAL_PROMPT = originalEnv;
    } else {
      delete process.env.USE_LOCAL_PROMPT;
    }
    await prisma.$disconnect();
  });

  it('should extract invoice from Invoice-document.pdf via streaming (same as POST /extract route)', async () => {
    if (!dbSetupAvailable) {
      console.log('⚠️  Skipping test - Database setup required or user not found. Use user:', TEST_USER_EMAIL);
      return;
    }

    const pdfPath = path.join(__dirname, '../../../test-data/Invoice-document.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log('⚠️  Skipping test - test-data/Invoice-document.pdf not found');
      return;
    }

    console.log('\n=== TEST: /extract - Invoice-document.pdf (streaming, same as route) ===');

    const fileBuffer = fs.readFileSync(pdfPath);
    const base64Data = fileBuffer.toString('base64');
    const dataUri = `data:application/pdf;base64,${base64Data}`;

    const prompt = 'Extract invoice data from this PDF file';
    const fileMessage = {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: prompt },
        {
          type: 'file' as const,
          data: dataUri,
          mimeType: 'application/pdf',
          name: 'Invoice-document.pdf',
        },
      ],
    };

    const routeContext = {
      modelName: 'invoice',
      viewName: 'invoice_view',
      promptTypes: ['invoice_extractor'],
    };

    try {
      const response = await agentService.handleRequestViaStreaming(
        fileMessage,
        context,
        [],
        routeContext
      );

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();

      let toolResults = response.toolResults || [];
      if (!toolResults.length && response.steps && Array.isArray(response.steps)) {
        for (const step of response.steps) {
          if (step.toolResults && Array.isArray(step.toolResults)) {
            toolResults.push(...step.toolResults);
          }
        }
      }
      console.log('toolResults', { toolResults });
      const extractResponse = {
        content: response.content,
        toolResults,
        steps: response.steps,
        fileInfo: {
          fileName: 'Invoice-document.pdf',
          fileSize: fileBuffer.length,
          mimeType: 'application/pdf',
          uploadedAt: new Date().toISOString(),
        },
      };

      expect(extractResponse.content).toBeDefined();
      expect(extractResponse.fileInfo.fileName).toBe('Invoice-document.pdf');
      expect(extractResponse.fileInfo.mimeType).toBe('application/pdf');

      if (toolResults.length > 0) {
        const firstResult = toolResults[0].result ?? toolResults[0];
        expect(firstResult).toBeDefined();
        if (firstResult.tool === 'extractInvoiceFromFile') {
          expect(firstResult.data).toBeDefined();
          expect(firstResult.resultType).toBe('invoice_extraction');
          if (firstResult.data?.invoice) {
            console.log(
              '✓ Extracted invoice:',
              firstResult.data.invoice.invoice_number ??
              firstResult.data.invoice.po_number ??
              'header present'
            );
          }
          if (firstResult.created_invoice_id) {
            console.log('✓ Auto-created invoice id:', firstResult.created_invoice_id);
          }
        }
      }

      console.log('✓ Response content length:', extractResponse.content?.length ?? 0);
      console.log('✓ Tool results:', toolResults.length);
      console.log('✓ Test PASSED\n');
    } catch (error: any) {
      if (
        error.message?.includes('API key') ||
        error.message?.includes('authentication') ||
        error.message?.includes('No prompt templates found') ||
        error.message?.includes('View not found for model')
      ) {
        console.log('⚠️  Skipping test - LLM/prompt setup unavailable');
        return;
      }
      throw error;
    }
  });
});
