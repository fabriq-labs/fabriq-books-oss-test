import type { Transaction } from 'plaid';

const CONFIDENCE_SCORE: Record<string, number> = {
  VERY_HIGH: 0.95,
  HIGH: 0.80,
  MEDIUM: 0.60,
  LOW: 0.30,
};

export function mapPlaidTransactionToPosting(
  tx: Transaction,
  bankAccountId: string,
  orgId: string,
  legalEntityId?: string | null,
): Record<string, unknown> {
  const isDebit = tx.amount > 0;
  const amount = Math.abs(tx.amount);
  const now = new Date();

  const category = tx.personal_finance_category;
  const categoryName = category?.detailed ?? category?.primary ?? null;
  const confidenceLevel = category?.confidence_level ?? null;
  const aiCatScore =
    confidenceLevel != null ? (CONFIDENCE_SCORE[confidenceLevel] ?? null) : null;

  return {
    org_id: orgId,
    value_date: new Date(tx.authorized_date ?? tx.date),
    posting_date: new Date(tx.date),
    description: tx.merchant_name ?? tx.name,
    amount,
    account_id: isDebit ? null : bankAccountId,
    credit_account_id: isDebit ? bankAccountId : null,
    status: tx.pending ? 'PENDING' : 'ACTIVE',
    posting_type: 'bank_feed',
    reconciliation_status: 'UNMATCHED',
    ...(categoryName ? { category_name: categoryName } : {}),
    ...(aiCatScore != null ? { ai_cat_score: aiCatScore, ai_categorized_at: now } : {}),
    ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
  };
}

export function mapPlaidAccountToCoa(
  type: string | null | undefined,
  subtype: string | null | undefined,
): { classification: 'Assets' | 'Liabilities'; types: string[] } {
  const normalizedType = type?.toLowerCase() ?? '';
  const normalizedSubtype = subtype?.toLowerCase() ?? '';

  if (normalizedType === 'credit') {
    return { classification: 'Liabilities', types: ['CREDIT_CARD', 'BANK'] };
  }
  if (normalizedSubtype === 'savings') {
    return { classification: 'Assets', types: ['BANK', 'SAVINGS'] };
  }
  if (normalizedSubtype === 'checking') {
    return { classification: 'Assets', types: ['BANK', 'CHECKING'] };
  }
  return { classification: 'Assets', types: ['BANK'] };
}

export function formatPlaidAccountName(name: string | null, mask: string | null): string {
  const label = name?.trim() || 'Bank account';
  return mask ? `${label} · ${mask}` : label;
}
