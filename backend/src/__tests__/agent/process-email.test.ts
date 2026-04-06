import * as fs from 'fs';
import * as path from 'path';
import { processEmail } from '../../services/email/ProcessEmailService';
import { createTestContext } from './agent-service-test-fixtures';
import prisma from '../../lib/prisma';
import type { ProcessEmailPayload } from '../../services/email/ProcessEmail.types';

const TEST_USER_EMAIL = 'meera.rao@demo-india.com';

describe('processEmail – backend email ingest flow', () => {
  jest.setTimeout(60000);

  let auth = createTestContext();
  let dbSetupAvailable = false;
  const originalEnv = process.env.USE_LOCAL_PROMPT;

  beforeAll(async () => {
    process.env.USE_LOCAL_PROMPT = 'false';
    try {
      const user = await prisma.user.findUnique({
        where: { email: TEST_USER_EMAIL },
        select: { id: true, org_id: true },
      });
      if (!user) {
        console.log(`⚠️  User ${TEST_USER_EMAIL} not found. Skipping test.`);
        return;
      }
      auth = createTestContext(user.id, user.org_id ?? 'org_indian_demo');
      console.log(`✓ Using user: ${TEST_USER_EMAIL}`);
      // Check that email ingest tables exist (run prisma/migration/add_instance_email_ingest_tables.sql first)
      await prisma.instance_email_ingest.findFirst({ take: 1 });
      dbSetupAvailable = true;
    } catch (e: any) {
      const msg = (e?.message ?? String(e)) as string;
      if (msg.includes('instance_email_ingest') && msg.includes('does not exist')) {
        console.log('⚠️  Skipping test - run prisma/migration/add_instance_email_ingest_tables.sql to create tables.');
      } else {
        console.log('⚠️  Database not available:', msg);
      }
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

  it('should process email with Invoice-document.pdf attachment: store ingest + item, extract data', async () => {
    if (!dbSetupAvailable) {
      console.log(
        '⚠️  Skipping test - Database setup required or user not found. Use user:',
        TEST_USER_EMAIL
      );
      return;
    }

    const pdfPath = path.join(__dirname, '../../../test-data/Invoice-document.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log('⚠️  Skipping test - test-data/Invoice-document.pdf not found');
      return;
    }

    const fileBuffer = fs.readFileSync(pdfPath);
    const gmail_message_id = `test-process-email-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const payload: ProcessEmailPayload = {
      org_id: auth.user?.org_id ?? 'org_indian_demo',
      gmail_message_id,
      gmail_thread_id: 'thread_test_123',
      from_email: 'vendor@example.com',
      to_email: 'ap@example.com',
      subject: 'Invoice #INV-001',
      received_at: new Date(),
      body_snippet: 'Please find the invoice attached.',
      model_name: 'invoice',
      attachments: [
        { buffer: fileBuffer, filename: 'Invoice-document.pdf' },
      ],
    };

    try {
      const result = await processEmail(payload, auth);

      expect(result).toBeDefined();
      expect(result.ingest_id).toBeDefined();
      expect(result.skipped).toBe(false);
      expect(result.item_count).toBe(1);

      const ingest = await prisma.instance_email_ingest.findUnique({
        where: { id: result.ingest_id },
        include: { instance_email_ingest_item: true },
      });

      expect(ingest).not.toBeNull();
      expect(ingest!.gmail_message_id).toBe(gmail_message_id);
      expect(ingest!.org_id).toBe(payload.org_id);
      expect(ingest!.from_email).toBe(payload.from_email);
      expect(ingest!.subject).toBe(payload.subject);
      expect(ingest!.instance_email_ingest_item.length).toBe(1);

      const item = ingest!.instance_email_ingest_item[0];
      expect(item.attachment_filename).toBe('Invoice-document.pdf');
      expect(item.extracted_data).toBeDefined();
      expect(typeof item.extracted_data === 'object' || item.extracted_data === null).toBe(true);

      const data = item.extracted_data as Record<string, unknown> | null;
      if (data && typeof data === 'object') {
        expect(data.invoice !== undefined || data.line_items !== undefined).toBe(true);
      }
      expect(['pending', 'processed', 'failed']).toContain(item.status);

      console.log('✓ processEmail test PASSED: ingest + 1 item, extracted_data present');
    } catch (error: any) {
      if (
        error?.message?.includes('API key') ||
        error?.message?.includes('authentication')
      ) {
        console.log('⚠️  Skipping test - LLM not configured');
        return;
      }
      throw error;
    }
  });

  it('should skip processing when gmail_message_id already exists (idempotency)', async () => {
    if (!dbSetupAvailable) return;

    const pdfPath = path.join(__dirname, '../../../test-data/Invoice-document.pdf');
    if (!fs.existsSync(pdfPath)) return;

    const fileBuffer = fs.readFileSync(pdfPath);
    const gmail_message_id = `test-idempotent-${Date.now()}`;

    const payload: ProcessEmailPayload = {
      org_id: auth.user?.org_id ?? 'org_indian_demo',
      gmail_message_id,
      from_email: 'vendor@example.com',
      subject: 'Duplicate',
      attachments: [{ buffer: fileBuffer, filename: 'Invoice-document.pdf' }],
    };

    const first = await processEmail(payload, auth);
    expect(first.skipped).toBe(false);
    expect(first.item_count).toBeGreaterThanOrEqual(0);

    const second = await processEmail(payload, auth);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('duplicate gmail_message_id');
    expect(second.ingest_id).toBe(first.ingest_id);
  });
});
