/**
 * Purchase receipt image fixtures + MIME → data URI path.
 * Optional live LLM when RUN_RECEIPT_LLM_EXTRACT=1 (configured provider / local DB).
 */
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';
import {
  buildBillUploadDataUri,
  resolveBillUploadMime,
} from '../../agent/utils/billUploadMime';
import { AgentService } from '../../agent/AgentService';
import { createTestContext } from './agent-service-test-fixtures';

const TEST_USER_EMAIL = 'sanjay.gupta@demo-india.com';
const RECEIPTS = path.join(__dirname, '../../../test-data/receipts');

const FIXTURES = [
  { name: 'sample-receipt.jpg', mime: 'image/jpeg' as const },
  { name: 'sample-receipt.png', mime: 'image/png' as const },
  { name: 'sample-receipt.webp', mime: 'image/webp' as const },
  { name: 'sample-receipt-phone.jpg', mime: 'image/jpeg' as const },
];

describe('receipt image fixtures + MIME data URI', () => {
  test.each(FIXTURES)('$name exists and builds non-empty data URI', ({ name, mime }) => {
    const filePath = path.join(RECEIPTS, name);
    expect(fs.existsSync(filePath)).toBe(true);
    const buf = fs.readFileSync(filePath);
    expect(buf.length).toBeGreaterThan(1000);

    const resolved = resolveBillUploadMime({
      originalName: name,
      mimetype: '', // simulate missing browser MIME
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.mime).toBe(mime);

    const uri = buildBillUploadDataUri(mime, buf);
    expect(uri.startsWith(`data:${mime};base64,`)).toBe(true);
    expect(uri.includes('data:;base64')).toBe(false);
  });

  test('HEIC empty mimetype still produces typed data URI (no binary fixture)', () => {
    const resolved = resolveBillUploadMime({
      originalName: 'IMG_PHONE.HEIC',
      mimetype: 'application/octet-stream',
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const uri = buildBillUploadDataUri(resolved.mime, Buffer.from([0x00, 0x00, 0x00]));
    expect(uri.startsWith('data:image/heic;base64,')).toBe(true);
  });

  test('optional live LLM extract from JPEG (RUN_RECEIPT_LLM_EXTRACT=1)', async () => {
    if (process.env.RUN_RECEIPT_LLM_EXTRACT !== '1') {
      console.log('⚠️  Skipping live receipt LLM (set RUN_RECEIPT_LLM_EXTRACT=1)');
      return;
    }
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      // Provider-specific keys (including gateway keys) are loaded via backend/.env for live runs.
      const hasGatewayKey = Object.keys(process.env).some(
        (k) => k.endsWith('_API_KEY') && Boolean(process.env[k]),
      );
      if (!hasGatewayKey) {
        console.log('⚠️  Skipping live receipt LLM — no API key');
        return;
      }
    }

    let auth = createTestContext();
    try {
      const user = await prisma.user.findFirst({
        where: { email: TEST_USER_EMAIL },
      });
      if (!user) {
        console.log('⚠️  Skipping live receipt LLM — demo user missing');
        return;
      }
      auth = createTestContext(user.id, user.org_id ?? 'org_indian_demo');
    } catch (e) {
      console.log('⚠️  Skipping live receipt LLM — local DB unavailable', e);
      return;
    }

    const name = 'sample-receipt.jpg';
    const buf = fs.readFileSync(path.join(RECEIPTS, name));
    const mime = 'image/jpeg' as const;
    const dataUri = buildBillUploadDataUri(mime, buf);
    const agentService = new AgentService();
    const originalEnv = process.env.USE_LOCAL_PROMPT;
    process.env.USE_LOCAL_PROMPT = 'false';

    try {
      const response = await agentService.handleRequestViaStreaming(
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract invoice data from this bill or receipt' },
            { type: 'file', data: dataUri, mimeType: mime, name },
          ],
        } as any,
        auth,
        [],
        {
          modelName: 'invoice',
          viewName: 'invoice_view',
          promptTypes: ['invoice_extractor'],
        },
      );

      let toolResults = response.toolResults || [];
      if (!toolResults.length && Array.isArray(response.steps)) {
        for (const step of response.steps) {
          if (step.toolResults) toolResults.push(...step.toolResults);
        }
      }
      expect(toolResults.length).toBeGreaterThan(0);
      const first = toolResults[0].result ?? toolResults[0];
      expect(first?.data || first).toBeDefined();
    } catch (error: any) {
      if (
        error.message?.includes('API key') ||
        error.message?.includes('authentication') ||
        error.message?.includes('No prompt templates')
      ) {
        console.log('⚠️  Skipping live receipt LLM — credentials/prompt unavailable');
        return;
      }
      throw error;
    } finally {
      if (originalEnv !== undefined) process.env.USE_LOCAL_PROMPT = originalEnv;
      else delete process.env.USE_LOCAL_PROMPT;
    }
  }, 120_000);
});
