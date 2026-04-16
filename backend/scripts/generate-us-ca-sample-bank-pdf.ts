#!/usr/bin/env ts-node
/**
 * Generates a minimal synthetic bank-statement PDF for testing
 * POST /api/parse-document/posting_with_categorization (LLM extraction + categorization).
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/generate-us-ca-sample-bank-pdf.ts
 *
 * Output:
 *   test-data/us-ca-bank-import/pdf-categorization-only/sample-bank-statement-categorization.pdf
 */

import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const OUT_DIR = path.join(
  __dirname,
  '../test-data/us-ca-bank-import/pdf-categorization-only'
);
const OUT_FILE = path.join(OUT_DIR, 'sample-bank-statement-categorization.pdf');

async function main(): Promise<void> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const rows: { text: string; size: number; f: typeof font }[] = [
    { text: 'Sample Bank Statement (synthetic — for Fabriq import tests)', size: 14, f: bold },
    { text: 'TechFlow Demo Bank — Business Checking', size: 12, f: bold },
    { text: 'Account: ****1102    Statement: Jan 1, 2026 — Jan 31, 2026    Currency: USD', size: 10, f: font },
    {
      text: 'Opening Balance: 10000.00    Closing Balance: 13324.51',
      size: 10,
      f: font,
    },
    { text: '', size: 6, f: font },
    { text: 'Transactions', size: 11, f: bold },
    { text: '', size: 4, f: font },
    {
      text:
        'Value Date   Posting Date  Description                                      Withdrawal (Debit)  Deposit (Credit)  Reference',
      size: 9,
      f: bold,
    },
    {
      text:
        '----------------------------------------------------------------------------------------------------------------------',
      size: 9,
      f: font,
    },
    {
      text:
        '2026-01-15   2026-01-15    PDF CATEGORIZATION TEST - Office supplies vendor          125.50              0            REF-PDF-001',
      size: 9,
      f: font,
    },
    {
      text:
        '2026-01-16   2026-01-16    PDF CATEGORIZATION TEST - Client payment received             0            2500.00       REF-PDF-002',
      size: 9,
      f: font,
    },
    {
      text:
        '2026-01-17   2026-01-17    PDF CATEGORIZATION TEST - Monthly subscription               49.99              0            REF-PDF-003',
      size: 9,
      f: font,
    },
  ];

  let y = 720;
  const x = 48;
  for (const row of rows) {
    if (!row.text) {
      y -= row.size + 2;
      continue;
    }
    page.drawText(row.text, { x, y, size: row.size, font: row.f });
    y -= row.size + 5;
    if (y < 60) break;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bytes = await doc.save();
  fs.writeFileSync(OUT_FILE, bytes);
  console.log(`Wrote ${OUT_FILE} (${bytes.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
