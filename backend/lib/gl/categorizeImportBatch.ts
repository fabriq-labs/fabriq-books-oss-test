/**
 * Categorize mapped statement rows before they are saved.
 * The import screen sends the selected rows and expects predictions only.
 */
import { z } from 'zod';
import { LLMService } from '../../src/lib/llm';
import {
  fetchAccountsForCategorization,
  formatAllAccountsForPrompt,
  buildCategorizationInstructions,
  type AccountForCategorization,
} from './categorize';

const predictionSchema = z.object({
  categorizations: z.array(
    z.object({
      transaction_index: z.number(),
      predicted_account_id: z.string(),
      predicted_account_name: z.string(),
      confidence_score: z.number(),
      reasoning: z.string(),
    })
  ),
});

export type ImportRowForCategorization = {
  id?: string;
  description?: string;
  name?: string;
  amount?: number | string;
  debit_amount?: number | string;
  credit_amount?: number | string;
  value_date?: string;
  account_id?: string;
  debit_account_id?: string;
  credit_account_id?: string;
  entity_id?: string;
};

export type ImportCategorizationResult = {
  posting_id: string;
  predicted_account_id: string | null;
  predicted_account_name: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  confidence_score: number | null;
  reasoning: string | null;
  applied: boolean;
};

export type ImportCategorizationSummary = {
  total_processed: number;
  categorized_count: number;
  historical_match_count: number;
  llm_categorized_count: number;
  applied_count: number;
  skipped_count: number;
  skipped_by_reason: Record<string, number>;
  error_count: number;
};

function asNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function confidenceOf(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function bankAccountId(row: ImportRowForCategorization): string | undefined {
  return row.debit_account_id || row.account_id || row.credit_account_id || undefined;
}

function knownAccounts(groups: Awaited<ReturnType<typeof fetchAccountsForCategorization>>) {
  const byId = new Map<string, AccountForCategorization>();
  for (const list of [groups.expense, groups.income, groups.asset, groups.liability, groups.equity]) {
    for (const account of list) byId.set(account.id, account);
  }
  return byId;
}

export async function categorizeImportBatch(
  orgId: string,
  userId: string | undefined,
  rows: ImportRowForCategorization[]
): Promise<{ results: ImportCategorizationResult[]; summary: ImportCategorizationSummary }> {
  const bankIds = new Set(rows.map(bankAccountId).filter((id): id is string => Boolean(id)));
  const excludeAccountId = bankIds.size === 1 ? [...bankIds][0] : undefined;
  const entityId = rows.find((row) => row.entity_id)?.entity_id;
  const accounts = await fetchAccountsForCategorization(orgId, excludeAccountId, entityId);
  const catalog = knownAccounts(accounts);
  if (catalog.size === 0) {
    throw new Error('No accounts available for categorization');
  }

  const lines = rows.map((row, index) => {
    const description = String(row.description || row.name || '').trim() || '(no description)';
    return [
      `Index ${index}`,
      `description: ${description}`,
      `debit_amount: ${asNumber(row.debit_amount)}`,
      `credit_amount: ${asNumber(row.credit_amount)}`,
      row.value_date ? `value_date: ${row.value_date}` : '',
    ].filter(Boolean).join(' | ');
  });

  const llm = LLMService.getInstance();
  const traced = await llm.generateStructuredObjectTraced({
    task: 'categorization',
    schema: predictionSchema,
    system: `${buildCategorizationInstructions()}\n\nUse only account ids from the chart. Leave predicted_account_id empty when you are not sure.`,
    prompt: `${formatAllAccountsForPrompt(accounts)}\n\n=== TRANSACTIONS ===\n${lines.join('\n')}`,
    orgId,
    userId,
    queryType: 'import_categorize_batch',
    question: `Categorize ${rows.length} statement rows`,
    modelName: 'posting',
    applied: false,
  });

  const byIndex = new Map(
    traced.object.categorizations.map((item) => [item.transaction_index, item])
  );

  const results: ImportCategorizationResult[] = rows.map((row, index) => {
    const prediction = byIndex.get(index);
    const account = prediction ? catalog.get(prediction.predicted_account_id) : undefined;
    const score = prediction ? Math.min(1, Math.max(0, prediction.confidence_score)) : null;
    if (!account || score == null) {
      return {
        posting_id: row.id || `temp_${index}`,
        predicted_account_id: null,
        predicted_account_name: null,
        confidence: null,
        confidence_score: score,
        reasoning: prediction?.reasoning || null,
        applied: false,
      };
    }
    return {
      posting_id: row.id || `temp_${index}`,
      predicted_account_id: account.id,
      predicted_account_name: account.name,
      confidence: confidenceOf(score),
      confidence_score: score,
      reasoning: prediction?.reasoning || null,
      applied: false,
    };
  });

  const categorizedCount = results.filter((row) => row.predicted_account_id).length;
  return {
    results,
    summary: {
      total_processed: rows.length,
      categorized_count: categorizedCount,
      historical_match_count: 0,
      llm_categorized_count: categorizedCount,
      applied_count: 0,
      skipped_count: rows.length - categorizedCount,
      skipped_by_reason: {},
      error_count: 0,
    },
  };
}
