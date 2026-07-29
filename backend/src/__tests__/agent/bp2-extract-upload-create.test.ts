/**
 * BP-2 end-to-end: sample PDF fixtures → extract tool (resolve) → bill create.
 *
 * Two PDFs under backend/test-data/:
 *  - bp2-bill-seeded-supplier-hp.pdf  → HP India (seed GSTIN 29AABCH2222B1Z2)
 *  - bp2-bill-new-supplier-nova.pdf   → unknown supplier Nova Widgets
 *
 * Deterministic path: tool.execute with the payload the LLM is expected to
 * extract from each PDF (no LLM flakiness). Optional live LLM upload when
 * RUN_BP2_LLM_EXTRACT=1 and API keys are configured.
 */
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../../lib/prisma';
import { ModelService } from '../../services/core/ModelService';
import { extractInvoiceFromFileTool } from '../../agent/AgentTools';
import {
  buildBillCreatePayloads,
  resolveExtractedInvoice,
} from '../../agent/invoiceExtractResolve';
import { createTestContext } from './agent-service-test-fixtures';
import { AgentService } from '../../agent/AgentService';

const TEST_USER_EMAIL = 'sanjay.gupta@demo-india.com';
const TEST_DATA = path.join(__dirname, '../../../test-data');

const SEEDED_PDF = 'bp2-bill-seeded-supplier-hp.pdf';
const NEW_SUPPLIER_PDF = 'bp2-bill-new-supplier-nova.pdf';

/** Expected LLM extract for the seeded HP PDF. */
function seededHpExtractPayload() {
  return {
    invoice: {
      invoice_number: 'BP2-SEED-HP-001',
      invoice_date: '2026-07-15',
      supplier_name: 'HP India Sales Pvt Ltd',
      supplier_tax_id: '29AABCH2222B1Z2',
      supplier_gstin: '29AABCH2222B1Z2',
      place_of_supply: 'Karnataka',
      invoice_net_total: 230000,
      invoice_total: 271400,
      additional_tax: 0,
      shipping_cost: 0,
    },
    line_items: [
      {
        item_name: 'HP EliteBook 840 G8 Laptop',
        classification_code: '8471',
        hsn_sac: '8471',
        rate: 115000,
        invoice_qty: 2,
        ordered_quantity: 2,
        ordered_amount: 230000,
        line_total: 271400,
        tax_rate: 18,
        line_tax_amount: 41400,
        tax_components: [
          { name: 'CGST', rate: 9, amount: 20700 },
          { name: 'SGST', rate: 9, amount: 20700 },
        ],
      },
    ],
    context: { currency: 'INR', documentType: 'tax_invoice' },
  };
}

/** Expected LLM extract for the unknown Nova supplier PDF. */
function newSupplierNovaExtractPayload() {
  return {
    invoice: {
      invoice_number: 'BP2-NEW-NOVA-001',
      invoice_date: '2026-07-16',
      supplier_name: 'Nova Widgets Manufacturing LLC',
      supplier_tax_id: '27AAACN9999Z1Z9',
      supplier_gstin: '27AAACN9999Z1Z9',
      place_of_supply: 'Maharashtra',
      invoice_net_total: 50000,
      invoice_total: 59000,
      additional_tax: 0,
      shipping_cost: 0,
    },
    line_items: [
      {
        item_name: 'Industrial Widget Assembly',
        classification_code: '8482',
        hsn_sac: '8482',
        rate: 5000,
        invoice_qty: 10,
        ordered_quantity: 10,
        ordered_amount: 50000,
        line_total: 59000,
        tax_rate: 18,
        line_tax_amount: 9000,
        tax_components: [
          { name: 'CGST', rate: 9, amount: 4500 },
          { name: 'SGST', rate: 9, amount: 4500 },
        ],
      },
    ],
    context: { currency: 'INR', documentType: 'tax_invoice' },
  };
}

describe('BP-2 extract upload → resolve → create (sample PDFs)', () => {
  jest.setTimeout(90000);

  const modelService = ModelService.getInstance();
  let auth = createTestContext();
  let dbOk = false;
  const createdInvoiceIds: string[] = [];

  beforeAll(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { email: TEST_USER_EMAIL },
        select: { id: true, org_id: true },
      });
      if (!user) {
        console.log(`⚠️  Skipping — user ${TEST_USER_EMAIL} not found`);
        return;
      }
      auth = createTestContext(user.id, user.org_id ?? 'org_indian_demo');
      // Broad write perms for invoice create in tests
      auth.permissions = {
        ...auth.permissions,
        invoice: { '*': 'write' },
        invoice_line_item: { '*': 'write' },
        supplier: { '*': 'read' },
        currency: { '*': 'read' },
        tax_group: { '*': 'read' },
        tax_region: { '*': 'read' },
        entity: { '*': 'read' },
        party_tax_registration: { '*': 'read' },
      };
      dbOk = true;
    } catch (e) {
      console.log('⚠️  DB unavailable:', (e as Error).message);
    }
  });

  afterAll(async () => {
    for (const id of createdInvoiceIds) {
      try {
        await prisma.invoice_line_tax.deleteMany({
          where: { invoice_line_item: { instance_id: id } },
        });
        await prisma.invoice_line_item.deleteMany({ where: { instance_id: id } });
        await prisma.invoice.delete({ where: { id } }).catch(() => undefined);
      } catch {
        /* best-effort cleanup */
      }
    }
    await prisma.$disconnect();
  });

  test('sample PDF fixtures exist on disk', () => {
    expect(fs.existsSync(path.join(TEST_DATA, SEEDED_PDF))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DATA, NEW_SUPPLIER_PDF))).toBe(true);
  });

  test('seeded supplier PDF path: resolve + extract tool + create bill', async () => {
    if (!dbOk) return;

    const pdfPath = path.join(TEST_DATA, SEEDED_PDF);
    expect(fs.existsSync(pdfPath)).toBe(true);
    const pdfBytes = fs.readFileSync(pdfPath);
    expect(pdfBytes.length).toBeGreaterThan(500);

    const params = seededHpExtractPayload();

    // 1) Resolve (shared helper used by upload create)
    const resolved = await resolveExtractedInvoice(auth, params);
    expect(resolved.supplier_id).toBe('supp_hp_india');
    expect(resolved.supplier_tax_id).toBe('29AABCH2222B1Z2');
    expect(resolved.currency_id).toBe('curr_inr');
    expect(resolved.legal_entity_id).toBe('org_indian_demo');
    expect(resolved.tax_region_id).toBe('txreg_in_ka');
    expect(resolved.lines[0].match).toBe('tax_group');
    expect(resolved.lines[0].tax_group_id).toBe('txgrp_demo_gst18');
    expect(resolved.lines[0].classification_code).toBe('8471');

    // 2) Extract tool execute (same as after LLM fills schema) — attaches resolved
    const tool = extractInvoiceFromFileTool(auth) as any;
    const toolResult = await tool.execute(params, {});
    expect(toolResult.resultType).toBe('invoice_extraction');
    expect(toolResult.data?.resolved?.supplier_id).toBe('supp_hp_india');
    expect(toolResult.data?.resolved?.lines?.[0]?.tax_group_id).toBe('txgrp_demo_gst18');
    // No PO on this PDF → no auto-create
    expect(toolResult.created_invoice_id).toBeUndefined();

    // 3) Manual create path (InvoiceUpload equivalent)
    const { invoicePayload, linePayloads } = buildBillCreatePayloads({
      extracted: params,
      resolved,
      withPO: false,
      orgId: auth.user?.org_id,
      userId: auth.user?.id,
    });
    expect(invoicePayload.invoice_type).toBe('PURCHASE');
    expect(invoicePayload.po_mode).toBe('Without PO');
    expect(invoicePayload.supplier_id).toBe('supp_hp_india');
    expect(invoicePayload.currency_id).toBe('curr_inr');
    expect(linePayloads[0].tax_group_id).toBe('txgrp_demo_gst18');
    expect(linePayloads[0].line_tax_amount).toBe(41400);
    expect(linePayloads[0].classification_code).toBe('8471');

    const created = await modelService.create('invoice', auth, invoicePayload, {
      viewName: 'invoice_view',
    });
    expect(created.success).toBe(true);
    const invoiceId = created.data?.id as string;
    expect(invoiceId).toBeTruthy();
    createdInvoiceIds.push(invoiceId);

    const add = await modelService.addChildrenToParent(
      'invoice',
      invoiceId,
      'invoice_line_item',
      auth,
      linePayloads,
      {},
    );
    expect(add.success).toBe(true);

    const dbInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoice_number: true,
        invoice_type: true,
        po_mode: true,
        supplier_id: true,
        supplier_name: true,
        currency_id: true,
        legal_entity_id: true,
        tax_region_id: true,
        exchange_rate: true,
      },
    });
    expect(dbInvoice?.invoice_number).toBe('BP2-SEED-HP-001');
    expect(dbInvoice?.invoice_type).toBe('PURCHASE');
    expect(dbInvoice?.po_mode).toBe('Without PO');
    expect(dbInvoice?.supplier_id).toBe('supp_hp_india');
    expect(dbInvoice?.currency_id).toBe('curr_inr');
    expect(dbInvoice?.legal_entity_id).toBe('org_indian_demo');
    expect(dbInvoice?.tax_region_id).toBe('txreg_in_ka');

    const dbLines = await prisma.invoice_line_item.findMany({
      where: { instance_id: invoiceId },
      select: {
        item_name: true,
        tax_group_id: true,
        tax_rate: true,
        line_tax_amount: true,
        classification_code: true,
        invoice_qty: true,
        rate: true,
      },
    });
    expect(dbLines).toHaveLength(1);
    expect(dbLines[0].tax_group_id).toBe('txgrp_demo_gst18');
    expect(dbLines[0].line_tax_amount).toBe(41400);
    expect(dbLines[0].classification_code).toBe('8471');
    expect(dbLines[0].invoice_qty).toBe(2);
  });

  test('new supplier PDF path: no supplier_id match, still create with tax group', async () => {
    if (!dbOk) return;

    const pdfPath = path.join(TEST_DATA, NEW_SUPPLIER_PDF);
    expect(fs.existsSync(pdfPath)).toBe(true);

    // Ensure Nova GSTIN is not already registered
    const existingReg = await prisma.party_tax_registration.findFirst({
      where: {
        org_id: auth.user!.org_id!,
        party_type: 'supplier',
        registration_number: { equals: '27AAACN9999Z1Z9', mode: 'insensitive' },
      },
    });
    expect(existingReg).toBeNull();

    const params = newSupplierNovaExtractPayload();
    const resolved = await resolveExtractedInvoice(auth, params);

    expect(resolved.supplier_id).toBeNull();
    expect(resolved.supplier_name).toBe('Nova Widgets Manufacturing LLC');
    expect(resolved.supplier_tax_id).toBe('27AAACN9999Z1Z9');
    // Place of supply text still resolves to MH region
    expect(resolved.tax_region_id).toBe('txreg_in_mh');
    expect(resolved.legal_entity_id).toBe('org_indian_demo');
    expect(resolved.currency_id).toBe('curr_inr');
    // Components still match GST18 even for unknown supplier
    expect(resolved.lines[0].tax_group_id).toBe('txgrp_demo_gst18');
    expect(resolved.lines[0].match).toBe('tax_group');

    const tool = extractInvoiceFromFileTool(auth) as any;
    const toolResult = await tool.execute(params, {});
    expect(toolResult.data?.resolved?.supplier_id == null).toBe(true);
    expect(toolResult.data?.resolved?.supplier_name).toBe(
      'Nova Widgets Manufacturing LLC',
    );
    expect(toolResult.data?.resolved?.lines?.[0]?.tax_group_id).toBe(
      'txgrp_demo_gst18',
    );

    const { invoicePayload, linePayloads } = buildBillCreatePayloads({
      extracted: params,
      resolved,
      withPO: false,
      orgId: auth.user?.org_id,
      userId: auth.user?.id,
    });
    expect(invoicePayload.supplier_id).toBeUndefined();
    expect(invoicePayload.supplier_name).toBe('Nova Widgets Manufacturing LLC');
    expect(invoicePayload.tax_region_id).toBe('txreg_in_mh');
    expect(linePayloads[0].tax_group_id).toBe('txgrp_demo_gst18');
    expect(linePayloads[0].line_tax_amount).toBe(9000);

    const created = await modelService.create('invoice', auth, invoicePayload, {
      viewName: 'invoice_view',
    });
    expect(created.success).toBe(true);
    const invoiceId = created.data?.id as string;
    createdInvoiceIds.push(invoiceId);

    const add = await modelService.addChildrenToParent(
      'invoice',
      invoiceId,
      'invoice_line_item',
      auth,
      linePayloads,
      {},
    );
    expect(add.success).toBe(true);

    const dbInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        invoice_number: true,
        supplier_id: true,
        supplier_name: true,
        tax_region_id: true,
        currency_id: true,
        legal_entity_id: true,
      },
    });
    expect(dbInvoice?.invoice_number).toBe('BP2-NEW-NOVA-001');
    expect(dbInvoice?.supplier_id).toBeNull();
    expect(dbInvoice?.supplier_name).toBe('Nova Widgets Manufacturing LLC');
    expect(dbInvoice?.tax_region_id).toBe('txreg_in_mh');
    expect(dbInvoice?.currency_id).toBe('curr_inr');
    expect(dbInvoice?.legal_entity_id).toBe('org_indian_demo');

    const dbLines = await prisma.invoice_line_item.findMany({
      where: { instance_id: invoiceId },
    });
    expect(dbLines).toHaveLength(1);
    expect(dbLines[0].tax_group_id).toBe('txgrp_demo_gst18');
    expect(dbLines[0].classification_code).toBe('8482');
  });

  test('optional live LLM extract from seeded PDF (RUN_BP2_LLM_EXTRACT=1)', async () => {
    if (!dbOk || process.env.RUN_BP2_LLM_EXTRACT !== '1') {
      console.log('⚠️  Skipping live LLM extract (set RUN_BP2_LLM_EXTRACT=1 to enable)');
      return;
    }

    const pdfPath = path.join(TEST_DATA, SEEDED_PDF);
    const fileBuffer = fs.readFileSync(pdfPath);
    const dataUri = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
    const agentService = new AgentService();
    const originalEnv = process.env.USE_LOCAL_PROMPT;
    process.env.USE_LOCAL_PROMPT = 'false';

    try {
      const response = await agentService.handleRequestViaStreaming(
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract invoice data from this PDF file' },
            {
              type: 'file',
              data: dataUri,
              mimeType: 'application/pdf',
              name: SEEDED_PDF,
            },
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
      expect(first.data?.resolved).toBeDefined();
      // Soft asserts — LLM may vary wording but GSTIN should resolve HP when extracted
      if (first.data?.resolved?.supplier_tax_id?.includes('29AABCH2222B1Z2')) {
        expect(first.data.resolved.supplier_id).toBe('supp_hp_india');
      }
    } catch (error: any) {
      if (
        error.message?.includes('API key') ||
        error.message?.includes('authentication') ||
        error.message?.includes('No prompt templates')
      ) {
        console.log('⚠️  Skipping live LLM — credentials/prompt unavailable');
        return;
      }
      throw error;
    } finally {
      if (originalEnv !== undefined) process.env.USE_LOCAL_PROMPT = originalEnv;
      else delete process.env.USE_LOCAL_PROMPT;
    }
  });
});
