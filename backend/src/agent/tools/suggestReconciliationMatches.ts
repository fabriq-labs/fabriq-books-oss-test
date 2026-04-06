/**
 * Suggest Reconciliation Matches Tool
 *
 * Matches bank postings to payment_receipts and invoices using:
 * - Amount: match to receipt amount, invoice total, or invoice balance (outstanding).
 * - Reference: parse bank description for invoice/receipt numbers (e.g. INV-001, REC-DEMO-001).
 * - Date: used as soft signal for confidence, not a hard filter (receipts can be booked days later).
 *
 * Aligns with common practice: Acumatica/Oracle use reference + date + amount; partial
 * payments match to balance_amount; one bank line can match multiple documents.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';

/** Max days to look back for receipts/invoices when no date filter is applied (avoid huge result sets). */
const DEFAULT_LOOKBACK_DAYS = 365;

/** Date proximity (days) used only for confidence scoring, not for filtering. */
const DATE_PROXIMITY_DAYS_SOFT = 30;

/**
 * Extract invoice and receipt reference hints from bank description.
 * Used to boost confidence when the bank line explicitly mentions INV-001, REC-DEMO-001, etc.
 */
function extractReferenceHints(description: string | null): {
  invoiceNumbers: string[];
  receiptNumbers: string[];
} {
  const invoiceNumbers: string[] = [];
  const receiptNumbers: string[] = [];
  if (!description || typeof description !== 'string') return { invoiceNumbers, receiptNumbers };
  const text = description.toUpperCase();

  // Invoice: INV-001, INV 001, INV001
  const invRegex = /\bINV[\s-]*(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = invRegex.exec(description)) !== null) {
    const num = m[1];
    const canon = `INV-${num}`;
    if (!invoiceNumbers.includes(canon)) invoiceNumbers.push(canon);
  }

  // Receipt: REC-DEMO-001, REC-001, REC 001
  const recRegex = /\bREC(?:[- ]?(?:DEMO[- ]?)?)?[\s-]*(\d+)\b/gi;
  while ((m = recRegex.exec(description)) !== null) {
    const num = m[1];
    const canon = `REC-${num}`;
    if (!receiptNumbers.includes(canon)) receiptNumbers.push(canon);
  }
  // Also match full form REC-DEMO-001
  const recDemoRegex = /\bREC-DEMO-(\d+)\b/gi;
  while ((m = recDemoRegex.exec(description)) !== null) {
    const canon = `REC-DEMO-${m[1]}`;
    if (!receiptNumbers.includes(canon)) receiptNumbers.push(canon);
  }

  return { invoiceNumbers, receiptNumbers };
}

/** Resolve accountId: try by ID first, fall back to name lookup. */
async function resolveAccountId(
  accountId: string,
  orgId: string
): Promise<{ id: string } | null> {
  // Try direct ID lookup first
  const byId = await prisma.account.findFirst({
    where: { id: accountId, org_id: orgId },
    select: { id: true },
  });
  if (byId) return byId;

  // Fall back to name lookup (e.g. "Checking Account")
  const byName = await prisma.account.findFirst({
    where: { name: accountId, org_id: orgId },
    select: { id: true },
  });
  return byName;
}

export const suggestReconciliationMatchesSchema = z.object({
  accountId: z
    .string()
    .optional()
    .describe('Bank account ID to find unmatched transactions for. Required when postingId is not provided.'),
  postingId: z
    .string()
    .optional()
    .describe(
      'When the user asks for matches for a specific posting (e.g. "this posting"), pass context.recordId here. Do NOT pass posting id as accountId.'
    ),
  tolerance: z.number().optional().describe('Amount tolerance for fuzzy matching (default 0)'),
  limit: z.number().optional().describe('Max suggestions to return (default 10)'),
  maxDateRangeDays: z
    .number()
    .optional()
    .describe(
      'Optional cap on how many days back to consider receipts/invoices (default 365). Omit or 0 for no date cap.'
    ),
});

export type SuggestReconciliationMatchesParams = z.infer<typeof suggestReconciliationMatchesSchema>;

export interface MatchSuggestion {
  type: 'payment_receipt' | 'invoice';
  id: string;
  reference: string;
  amount: number;
  date: string;
  customer: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface PostingWithSuggestions {
  posting_id: string;
  posting_description: string | null;
  posting_amount: number;
  posting_date: string | null;
  suggestions: MatchSuggestion[];
}

function daysDiff(d1: Date, d2: Date): number {
  return Math.round((d1.getTime() - d2.getTime()) / (24 * 60 * 60 * 1000));
}

/** Check if a record reference (invoice_number, receipt_number, payment_reference) matches extracted hints. */
function referenceMatches(
  recordRef: string | null,
  recordRefAlt: string | null,
  hints: string[],
  _description: string | null
): boolean {
  if (!recordRef && !recordRefAlt) return false;
  if (hints.length === 0) return false;
  const refs = [recordRef, recordRefAlt].filter(Boolean) as string[];
  for (const ref of refs) {
    const refNorm = ref.toUpperCase().replace(/\s+/g, '');
    const refNum = ref.replace(/\D/g, ''); // e.g. REC-DEMO-001 -> 001
    for (const hint of hints) {
      const hintNorm = hint.toUpperCase().replace(/\s+/g, '');
      const hintNum = hint.replace(/\D/g, '');
      if (refNorm === hintNorm || refNorm.includes(hintNorm) || hintNorm.includes(refNorm)) return true;
      if (refNum && hintNum && refNum === hintNum) return true; // REC-DEMO-001 matches REC-001
    }
  }
  return false;
}

/**
 * Compute confidence: high = amount match + reference in description; medium = amount + date within soft window; low = amount only.
 */
function confidenceScore(
  amountMatch: boolean,
  referenceMatch: boolean,
  dateProximityDays: number | null
): 'high' | 'medium' | 'low' {
  if (referenceMatch && amountMatch) return 'high';
  if (amountMatch && dateProximityDays !== null && Math.abs(dateProximityDays) <= DATE_PROXIMITY_DAYS_SOFT)
    return 'medium';
  return amountMatch ? 'low' : 'low';
}

/** Build date filter for optional lookback (avoid unbounded queries). Pass 0 or null for no date cap. */
function dateFilter(
  valueDate: Date,
  maxDays: number | null | undefined
): { gte: Date; lte: Date } | undefined {
  if (maxDays == null || maxDays <= 0) return undefined;
  const start = new Date(valueDate);
  start.setDate(start.getDate() - maxDays);
  const end = new Date(valueDate);
  end.setDate(end.getDate() + 30); // small forward window for late-booked receipts
  return { gte: start, lte: end };
}

/** Build suggestions for a single posting (used when postingId is provided). */
export async function findSuggestionsForPosting(
  posting: {
    id: string;
    amount: unknown;
    value_date: Date | null;
    posting_date: Date | null;
    description: string | null;
    name: string | null;
  },
  orgId: string,
  tolerance: number,
  maxDateRangeDays: number | null
): Promise<PostingWithSuggestions | null> {
  const amount = posting.amount != null ? Number(posting.amount) : 0;
  const valueDate = posting.value_date || posting.posting_date;
  if (amount <= 0 || !valueDate) {
    return {
      posting_id: posting.id,
      posting_description: posting.description || posting.name || null,
      posting_amount: amount,
      posting_date: valueDate ? new Date(valueDate).toISOString().slice(0, 10) : null,
      suggestions: [],
    };
  }
  const valueDateObj = new Date(valueDate);
  const description = posting.description || posting.name || null;
  const { invoiceNumbers, receiptNumbers } = extractReferenceHints(description);
  const dateRange = dateFilter(valueDateObj, maxDateRangeDays ?? DEFAULT_LOOKBACK_DAYS);
  const suggestions: MatchSuggestion[] = [];

  // Payment receipts: match by amount only (no date filter in predicate); receipt can be booked much later
  const receiptWhere: any = {
    org_id: orgId,
    amount: { gte: amount - tolerance, lte: amount + tolerance },
  };
  if (dateRange) receiptWhere.receipt_date = dateRange;

  const receipts = await prisma.payment_receipt.findMany({
    where: receiptWhere,
    include: { customers: true },
    take: 15,
  });
  for (const r of receipts) {
    const recAmount = r.amount ?? 0;
    const recDate = r.receipt_date ? new Date(r.receipt_date) : null;
    const exactAmount = Math.abs(recAmount - amount) < 0.01;
    const refMatch = referenceMatches(r.receipt_number, r.payment_reference, receiptNumbers, description);
    const days = recDate ? daysDiff(valueDateObj, recDate) : null;
    const confidence = confidenceScore(exactAmount, refMatch, days);
    suggestions.push({
      type: 'payment_receipt',
      id: r.id,
      reference: r.receipt_number || r.id,
      amount: recAmount,
      date: recDate ? recDate.toISOString().slice(0, 10) : '',
      customer: r.customers?.customer_name ?? null,
      confidence,
    });
  }

  // Invoices: match by invoice_total OR balance_amount (outstanding); partial payments match balance
  const invWhere: any = {
    org_id: orgId,
    invoice_type: 'SALES',
    OR: [
      { invoice_total: { gte: amount - tolerance, lte: amount + tolerance } },
      { balance_amount: { gte: amount - tolerance, lte: amount + tolerance } },
    ],
  };
  if (dateRange) invWhere.invoice_date = dateRange;

  const invoices = await prisma.invoice.findMany({
    where: invWhere,
    include: { customers: true },
    take: 15,
  });
  for (const inv of invoices) {
    const invTotal = inv.invoice_total ?? 0;
    const invBalance = inv.balance_amount ?? invTotal;
    const matchTotal = Math.abs(invTotal - amount) < 0.01;
    const matchBalance = Math.abs(invBalance - amount) < 0.01;
    const exactAmount = matchTotal || matchBalance;
    const refMatch = referenceMatches(inv.invoice_number ?? null, null, invoiceNumbers, description);
    const invDate = inv.invoice_date ? new Date(inv.invoice_date) : null;
    const days = invDate ? daysDiff(valueDateObj, invDate) : null;
    const confidence = confidenceScore(exactAmount, refMatch, days);
    const displayAmount = matchBalance ? invBalance : invTotal;
    suggestions.push({
      type: 'invoice',
      id: inv.id,
      reference: inv.invoice_number || inv.id,
      amount: displayAmount,
      date: invDate ? invDate.toISOString().slice(0, 10) : '',
      customer: inv.customers?.customer_name ?? null,
      confidence,
    });
  }

  suggestions.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    const c = confOrder[a.confidence] - confOrder[b.confidence];
    if (c !== 0) return c;
    return 0;
  });

  return {
    posting_id: posting.id,
    posting_description: description,
    posting_amount: amount,
    posting_date: valueDateObj.toISOString().slice(0, 10),
    suggestions: suggestions.slice(0, 5),
  };
}

export function suggestReconciliationMatchesTool(auth: AuthContext) {
  return tool({
    parameters: suggestReconciliationMatchesSchema,
    description:
      'Find matches for a posting or unmatched bank transactions. When the user asks for matches for "this posting", pass postingId (context.recordId). When the user asks for all unreconciled matches, pass accountId (bank account id). Do NOT pass a posting id as accountId.',
    execute: async (
      {
        accountId,
        postingId,
        tolerance = 0,
        limit = 10,
        maxDateRangeDays,
      }: SuggestReconciliationMatchesParams,
      _options
    ): Promise<{
      tool: string;
      uiHint: string;
      data: PostingWithSuggestions[];
      columns: Array<{ field: string; label: string }>;
      unmatched_count: number;
      matches_with_suggestions: number;
      description: string;
    }> => {
      const orgId = auth.user?.org_id;
      if (!orgId) {
        throw new Error('Organization context is required for reconciliation suggestions.');
      }
      if (!accountId && !postingId) {
        throw new Error('Either accountId (bank account) or postingId (specific posting) is required.');
      }

      logger.debug('suggestReconciliationMatches', { accountId, postingId, tolerance, limit, orgId });

      // When user asks for "this posting": fetch by postingId first
      if (postingId) {
        const posting = await prisma.posting.findFirst({
          where: { id: postingId, org_id: orgId },
        });
        if (!posting) {
          return {
            tool: 'suggestReconciliationMatches',
            uiHint: 'reconciliation_suggestions',
            data: [],
            columns: [],
            unmatched_count: 0,
            matches_with_suggestions: 0,
            description: `Posting ${postingId} not found or not in your organization.`,
          };
        }
        const status = posting.reconciliation_status?.toUpperCase();
        if (status === 'MATCHED' || status === 'CONFIRMED' || status === 'SUGGESTED') {
          const ref = posting.matched_reference || 'unknown';
          return {
            tool: 'suggestReconciliationMatches',
            uiHint: 'reconciliation_suggestions',
            data: [],
            columns: [],
            unmatched_count: 0,
            matches_with_suggestions: 0,
            description: `This transaction is already matched to ${ref}.`,
          };
        }
        // Single unmatched posting: run suggestion logic for it only
        const lookback = maxDateRangeDays ?? DEFAULT_LOOKBACK_DAYS;
        const singleResult = await findSuggestionsForPosting(
          posting,
          orgId,
          tolerance,
          lookback
        );
        const hasSuggestions = singleResult && singleResult.suggestions.length > 0 ? 1 : 0;
        return {
          tool: 'suggestReconciliationMatches',
          uiHint: 'reconciliation_suggestions',
          data: singleResult ? [singleResult] : [],
          columns: [
            { field: 'posting_id', label: 'Posting ID' },
            { field: 'posting_description', label: 'Description' },
            { field: 'posting_amount', label: 'Amount' },
            { field: 'posting_date', label: 'Date' },
            { field: 'suggestions', label: 'Suggestions' },
          ],
          unmatched_count: 1,
          matches_with_suggestions: hasSuggestions,
          description:
            singleResult && singleResult.suggestions.length > 0
              ? `Found ${singleResult.suggestions.length} suggested match(es) for this transaction.`
              : 'No suggested matches found for this transaction (try increasing tolerance or check date/amount).',
        };
      }

      // Resolve accountId: if LLM passed account name (e.g. "Checking Account"), look up by name
      const resolved = await resolveAccountId(accountId!, orgId);
      if (!resolved) {
        return {
          tool: 'suggestReconciliationMatches',
          uiHint: 'reconciliation_suggestions',
          data: [],
          columns: [],
          unmatched_count: 0,
          matches_with_suggestions: 0,
          description: `Bank account "${accountId}" not found. Use the account ID (UUID) from context.modelContext.selectedAccountId, not the account name.`,
        };
      }
      const resolvedAccountId = resolved.id;
      logger.debug('suggestReconciliationMatches resolved accountId', {
        original: accountId,
        resolved: resolvedAccountId,
      });

      // 1. Fetch unmatched postings for this bank account
      const postings = await prisma.posting.findMany({
        where: {
          AND: [
            { org_id: orgId },
            { OR: [{ account_id: resolvedAccountId }, { credit_account_id: resolvedAccountId }] },
            {
              OR: [
                { reconciliation_status: null },
                { reconciliation_status: 'UNMATCHED' },
              ],
            },
          ],
        },
        orderBy: { value_date: 'desc' },
        take: limit,
      });

      const result: PostingWithSuggestions[] = [];

      const lookback = maxDateRangeDays ?? DEFAULT_LOOKBACK_DAYS;

      for (const p of postings) {
        const amount = p.amount != null ? Number(p.amount) : 0;
        const valueDate = p.value_date || p.posting_date;

        const suggestions: MatchSuggestion[] = [];

        if (amount <= 0 || !valueDate) {
          result.push({
            posting_id: p.id,
            posting_description: p.description || p.name || null,
            posting_amount: amount,
            posting_date: valueDate ? new Date(valueDate).toISOString().slice(0, 10) : null,
            suggestions: [],
          });
          continue;
        }

        const valueDateObj = new Date(valueDate);
        const tol = tolerance;
        const description = p.description || p.name || null;
        const { invoiceNumbers, receiptNumbers } = extractReferenceHints(description);
        const dateRange = dateFilter(valueDateObj, lookback);

        // Payment receipts: match by amount only; date used only for confidence
        const receiptWhere: any = {
          org_id: orgId,
          amount: { gte: amount - tol, lte: amount + tol },
        };
        if (dateRange) receiptWhere.receipt_date = dateRange;

        const receipts = await prisma.payment_receipt.findMany({
          where: receiptWhere,
          include: { customers: true },
          take: 15,
        });
        for (const r of receipts) {
          const recAmount = r.amount ?? 0;
          const recDate = r.receipt_date ? new Date(r.receipt_date) : null;
          const exactAmount = Math.abs(recAmount - amount) < 0.01;
          const refMatch = referenceMatches(
            r.receipt_number,
            r.payment_reference,
            receiptNumbers,
            description
          );
          const days = recDate ? daysDiff(valueDateObj, recDate) : null;
          const confidence = confidenceScore(exactAmount, refMatch, days);
          suggestions.push({
            type: 'payment_receipt',
            id: r.id,
            reference: r.receipt_number || r.id,
            amount: recAmount,
            date: recDate ? recDate.toISOString().slice(0, 10) : '',
            customer: r.customers?.customer_name ?? null,
            confidence,
          });
        }

        // Invoices: match by invoice_total OR balance_amount (outstanding)
        const invWhere: any = {
          org_id: orgId,
          invoice_type: 'SALES',
          OR: [
            { invoice_total: { gte: amount - tol, lte: amount + tol } },
            { balance_amount: { gte: amount - tol, lte: amount + tol } },
          ],
        };
        if (dateRange) invWhere.invoice_date = dateRange;

        const invoices = await prisma.invoice.findMany({
          where: invWhere,
          include: { customers: true },
          take: 15,
        });
        for (const inv of invoices) {
          const invTotal = inv.invoice_total ?? 0;
          const invBalance = inv.balance_amount ?? invTotal;
          const matchTotal = Math.abs(invTotal - amount) < 0.01;
          const matchBalance = Math.abs(invBalance - amount) < 0.01;
          const exactAmount = matchTotal || matchBalance;
          const refMatch = referenceMatches(inv.invoice_number ?? null, null, invoiceNumbers, description);
          const invDate = inv.invoice_date ? new Date(inv.invoice_date) : null;
          const days = invDate ? daysDiff(valueDateObj, invDate) : null;
          const confidence = confidenceScore(exactAmount, refMatch, days);
          const displayAmount = matchBalance ? invBalance : invTotal;
          suggestions.push({
            type: 'invoice',
            id: inv.id,
            reference: inv.invoice_number || inv.id,
            amount: displayAmount,
            date: invDate ? invDate.toISOString().slice(0, 10) : '',
            customer: inv.customers?.customer_name ?? null,
            confidence,
          });
        }

        suggestions.sort((a, b) => {
          const confOrder = { high: 0, medium: 1, low: 2 };
          return confOrder[a.confidence] - confOrder[b.confidence];
        });

        result.push({
          posting_id: p.id,
          posting_description: description,
          posting_amount: amount,
          posting_date: valueDateObj.toISOString().slice(0, 10),
          suggestions: suggestions.slice(0, 5),
        });
      }

      const columns = [
        { field: 'posting_id', label: 'Posting ID' },
        { field: 'posting_description', label: 'Description' },
        { field: 'posting_amount', label: 'Amount' },
        { field: 'posting_date', label: 'Date' },
        { field: 'suggestions', label: 'Suggestions' },
      ];

      const count = result.length;
      const withSuggestions = result.filter((r) => r.suggestions.length > 0).length;

      return {
        tool: 'suggestReconciliationMatches',
        uiHint: 'reconciliation_suggestions',
        data: result,
        columns,
        unmatched_count: count,
        matches_with_suggestions: withSuggestions,
        description:
          count === 0
            ? 'No unmatched transactions found for this bank account.'
            : `Found ${count} unmatched bank transaction(s); ${withSuggestions} have suggested matches.`,
      };
    },
  });
}
