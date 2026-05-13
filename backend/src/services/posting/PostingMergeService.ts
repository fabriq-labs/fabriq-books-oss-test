import prismaClient from '../../lib/prisma';
import logger from '../../utils/logger';

export interface MergePostingsInput {
  primaryId: string;
  duplicateId: string;
  mergeNotes?: boolean;
  orgId: string;
  userId: string;
}

export interface MergePostingsResult {
  primary: any;
  duplicate: any;
}

export class MergeValidationError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'MergeValidationError';
  }
}

const AMOUNT_EPSILON = 0.005;
const VALUE_DATE_WINDOW_DAYS = 5;

/**
 * Manually merge two postings by marking one as a duplicate of the other.
 *
 * The "duplicate" row is soft-deleted via:
 *   posting_type            = 'DUPLICATE'
 *   status                  = 'DUPLICATE'
 *   reversal_of_posting_id  = primary.id
 *   reversed_at             = now()
 *
 * The primary posting is preserved. When `mergeNotes` is true the duplicate's
 * description/notes are appended onto the primary's `notes` field with a tag.
 *
 * Both writes happen inside a single Prisma transaction. Validation enforces:
 *   - Same legal entity
 *   - Neither side already marked DUPLICATE / REVERSED
 *   - Duplicate is not already reconciled (CONFIRMED or payment_receipt_id set)
 *   - Absolute amounts equal within {@link AMOUNT_EPSILON}
 *   - Value dates within {@link VALUE_DATE_WINDOW_DAYS}
 *   - At least one account leg is shared between the two postings (the contra
 *     account seen in both source statements, e.g. the credit card account)
 */
export async function mergePostings(
  input: MergePostingsInput
): Promise<MergePostingsResult> {
  const { primaryId, duplicateId, mergeNotes, orgId, userId } = input;

  if (primaryId === duplicateId) {
    throw new MergeValidationError('SAME_ID', 'primary_id and duplicate_id must differ');
  }

  return prismaClient.$transaction(async (tx) => {
    const [primary, duplicate] = await Promise.all([
      tx.posting.findFirst({ where: { id: primaryId, org_id: orgId } }),
      tx.posting.findFirst({ where: { id: duplicateId, org_id: orgId } }),
    ]);

    if (!primary) {
      throw new MergeValidationError('NOT_FOUND', `Primary posting ${primaryId} not found`);
    }
    if (!duplicate) {
      throw new MergeValidationError('NOT_FOUND', `Duplicate posting ${duplicateId} not found`);
    }

    if ((primary.legal_entity_id ?? null) !== (duplicate.legal_entity_id ?? null)) {
      throw new MergeValidationError(
        'LE_MISMATCH',
        'Postings belong to different legal entities'
      );
    }

    const isBlocked = (p: typeof primary) =>
      p.posting_type === 'DUPLICATE' ||
      p.status === 'REVERSED' ||
      p.status === 'DUPLICATE';

    if (isBlocked(primary) || isBlocked(duplicate)) {
      throw new MergeValidationError(
        'ALREADY_MERGED',
        'One of the postings is already marked as duplicate or reversed'
      );
    }

    if (duplicate.reconciliation_status === 'CONFIRMED' || duplicate.payment_receipt_id) {
      throw new MergeValidationError(
        'RECONCILED_DUPLICATE',
        'The posting to be marked as duplicate is already reconciled. Swap selection.'
      );
    }

    const primaryAmt = Math.abs(Number(primary.amount ?? 0));
    const duplicateAmt = Math.abs(Number(duplicate.amount ?? 0));
    if (Math.abs(primaryAmt - duplicateAmt) > AMOUNT_EPSILON) {
      throw new MergeValidationError(
        'AMOUNT_MISMATCH',
        `Amounts differ: ${primaryAmt} vs ${duplicateAmt}`
      );
    }

    const t1 = primary.value_date ? new Date(primary.value_date).getTime() : null;
    const t2 = duplicate.value_date ? new Date(duplicate.value_date).getTime() : null;
    if (t1 != null && t2 != null) {
      const daysApart = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
      if (daysApart > VALUE_DATE_WINDOW_DAYS) {
        throw new MergeValidationError(
          'DATE_OUT_OF_WINDOW',
          `Value dates are ${daysApart.toFixed(1)} days apart (max ${VALUE_DATE_WINDOW_DAYS})`
        );
      }
    }

    const primaryLegs = [primary.account_id, primary.credit_account_id].filter(
      Boolean
    ) as string[];
    const duplicateLegs = [duplicate.account_id, duplicate.credit_account_id].filter(
      Boolean
    ) as string[];
    if (!primaryLegs.some((a) => duplicateLegs.includes(a))) {
      throw new MergeValidationError(
        'NO_SHARED_LEG',
        'Postings do not share a common account — they cannot be duplicates of the same transaction.'
      );
    }

    const updatedDuplicate = await tx.posting.update({
      where: { id: duplicate.id },
      data: {
        posting_type: 'DUPLICATE',
        status: 'DUPLICATE',
        reversal_of_posting_id: primary.id,
        reversed_at: new Date(),
        modified_by: userId,
      },
    });

    let updatedPrimary: typeof primary = primary;
    if (mergeNotes && (duplicate.notes || duplicate.description)) {
      const tag = `[merged from ${duplicate.id}]`;
      const extra = [duplicate.description, duplicate.notes].filter(Boolean).join(' / ');
      const nextNotes = [primary.notes ?? '', `${tag} ${extra}`]
        .filter((s) => s && s.length > 0)
        .join('\n');
      updatedPrimary = await tx.posting.update({
        where: { id: primary.id },
        data: { notes: nextNotes, modified_by: userId },
      });
    }

    logger.info('PostingMergeService: merged', {
      primaryId: primary.id,
      duplicateId: duplicate.id,
      orgId,
      userId,
      mergeNotes: !!mergeNotes,
    });

    return { primary: updatedPrimary, duplicate: updatedDuplicate };
  });
}
