/**
 * Mark posted sales docs with no active posting as ledger_status=pending.
 * Script only — does not create postings (WP6/WP7).
 *
 *   cd backend && npm run ledger:mark-pending -- --org org_kernel
 *   cd backend && npm run ledger:mark-pending -- --org org_kernel --dry-run
 */
import prisma from '../src/lib/prisma';

function parseArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const orgId = parseArg('--org');
  const dryRun = hasFlag('--dry-run');
  if (!orgId) {
    throw new Error('Usage: ledger:mark-pending -- --org <org_id> [--dry-run]');
  }

  const [invoiceIds, receiptIds, creditIds] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT i.id
      FROM invoice i
      WHERE i.org_id = ${orgId}
        AND i.status = 'posted'
        AND (i.ledger_status IS NULL OR i.ledger_status = 'pending')
        AND NOT EXISTS (
          SELECT 1 FROM posting p
          WHERE p.invoice_id = i.id
            AND p.org_id = i.org_id
            AND p.status = 'active'
        )`,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT r.id
      FROM payment_receipt r
      WHERE r.org_id = ${orgId}
        AND r.status = 'posted'
        AND (r.ledger_status IS NULL OR r.ledger_status = 'pending')
        AND NOT EXISTS (
          SELECT 1 FROM posting p
          WHERE p.payment_receipt_id = r.id
            AND p.org_id = r.org_id
            AND p.status = 'active'
        )`,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id
      FROM credit_note c
      WHERE c.org_id = ${orgId}
        AND c.status = 'posted'
        AND (c.ledger_status IS NULL OR c.ledger_status = 'pending')
        AND NOT EXISTS (
          SELECT 1 FROM posting p
          WHERE p.credit_note_id = c.id
            AND p.org_id = c.org_id
            AND p.status = 'active'
        )`,
  ]);

  // Only bump null → pending (receipts/CNs already pending from dbt stay pending).
  const invoiceNull = await prisma.invoice.count({
    where: {
      org_id: orgId,
      status: 'posted',
      ledger_status: null,
      id: { in: invoiceIds.map((r) => r.id) },
    },
  });
  const receiptNull = await prisma.payment_receipt.count({
    where: {
      org_id: orgId,
      status: 'posted',
      ledger_status: null,
      id: { in: receiptIds.map((r) => r.id) },
    },
  });
  const creditNull = await prisma.credit_note.count({
    where: {
      org_id: orgId,
      status: 'posted',
      ledger_status: null,
      id: { in: creditIds.map((r) => r.id) },
    },
  });

  console.log(
    `Candidates without active posting: invoices=${invoiceIds.length}, receipts=${receiptIds.length}, credit_notes=${creditIds.length}`
  );
  console.log(
    `Would set ledger_status=pending where null: invoices=${invoiceNull}, receipts=${receiptNull}, credit_notes=${creditNull}`
  );

  if (dryRun) {
    console.log('Dry run — no writes.');
    return;
  }

  const [inv, pay, cn] = await Promise.all([
    prisma.invoice.updateMany({
      where: {
        org_id: orgId,
        status: 'posted',
        ledger_status: null,
        id: { in: invoiceIds.map((r) => r.id) },
      },
      data: { ledger_status: 'pending', modified_by: 'ledger:mark-pending' },
    }),
    prisma.payment_receipt.updateMany({
      where: {
        org_id: orgId,
        status: 'posted',
        ledger_status: null,
        id: { in: receiptIds.map((r) => r.id) },
      },
      data: { ledger_status: 'pending', modified_by: 'ledger:mark-pending' },
    }),
    prisma.credit_note.updateMany({
      where: {
        org_id: orgId,
        status: 'posted',
        ledger_status: null,
        id: { in: creditIds.map((r) => r.id) },
      },
      data: { ledger_status: 'pending', modified_by: 'ledger:mark-pending' },
    }),
  ]);

  console.log(`Updated: invoices=${inv.count}, receipts=${pay.count}, credit_notes=${cn.count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
