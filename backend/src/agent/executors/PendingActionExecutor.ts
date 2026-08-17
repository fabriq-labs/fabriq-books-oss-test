/**
 * PendingActionExecutor — registry of action-type executors.
 *
 * When a pending_action is approved, the executor for its action_type
 * runs the actual side effect (e.g. confirmReconciliation).
 *
 * Follows the same registry pattern as src/agent/handlers/erp/registry.ts.
 */

import { AuthContext } from '../../auth/types';
import { confirmReconciliation } from '../../services/reconciliation/confirmReconciliation';
import {
  updatePostingWithCategorization,
  determineTransactionDirection,
  getFieldToUpdate,
} from '../handlers/erp/utils/categorizationUtils';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';

// ── Types ──────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface PendingActionHandler {
  actionType: string;
  execute(action: { id: string; payload: any; action_type: string }, auth: AuthContext): Promise<ExecutionResult>;
}

// ── ReconcilePostingExecutor ───────────────────────────────────

const ReconcilePostingExecutor: PendingActionHandler = {
  actionType: 'reconcile_posting',

  async execute(action, auth): Promise<ExecutionResult> {
    try {
      const payload = action.payload as any;
      const postingId = payload.posting_id;

      if (!postingId) {
        return { success: false, error: 'Missing posting_id in payload' };
      }

      // confirmReconciliation requires matched_reference on the posting.
      // The agent's queueActionBatch stores match info in the payload but
      // does NOT write it to the posting. We bridge that gap here.
      const matchType = payload.match_type;   // 'contra_account'
      const matchId = payload.match_id;
      const matchRef = payload.match_reference;

      if (matchType && matchId) {
        const matchedReference = `${matchType}:${matchId}:${matchRef || 'unknown'}`;
        await prisma.posting.update({
          where: { id: postingId },
          data: {
            matched_reference: matchedReference,
            reconciliation_status: 'SUGGESTED',
          },
        });
        logger.info('ReconcilePostingExecutor: wrote matched_reference to posting', {
          actionId: action.id,
          postingId,
          matchedReference,
        });
      }

      logger.info('ReconcilePostingExecutor: confirming reconciliation', {
        actionId: action.id,
        postingId,
      });

      const result = await confirmReconciliation(postingId, auth);

      return {
        success: true,
        data: {
          posting_id: result.posting.id,
          reconciliation_status: result.posting.reconciliation_status,
        },
      };
    } catch (error: any) {
      logger.error('ReconcilePostingExecutor failed', {
        actionId: action.id,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  },
};

// ── CreatePostingExecutor ──────────────────────────────────────

const CreatePostingExecutor: PendingActionHandler = {
  actionType: 'create_posting',

  async execute(action, auth): Promise<ExecutionResult> {
    try {
      const payload = action.payload as {
        description: string;
        amount: number;
        value_date?: string;
        account_id: string;
        account_name?: string;
        posting_type?: string;
        notes?: string;
        source_transaction_id?: string;
      };

      if (!payload.account_id) {
        return { success: false, error: 'Missing account_id in payload' };
      }
      if (!payload.amount) {
        return { success: false, error: 'Missing amount in payload' };
      }

      // Verify account belongs to the org
      const account = await prisma.account.findFirst({
        where: { id: payload.account_id, org_id: auth.user.org_id },
      });
      if (!account) {
        return { success: false, error: `Account ${payload.account_id} not found` };
      }

      const posting = await prisma.posting.create({
        data: {
          org_id: auth.user.org_id,
          description: payload.description,
          amount: payload.amount,
          value_date: payload.value_date ? new Date(payload.value_date) : new Date(),
          posting_date: new Date(),
          account_id: payload.account_id,
          status: 'booked',
          matched_reference: payload.source_transaction_id
            ? `source:${payload.source_transaction_id}`
            : undefined,
        },
      });

      logger.info('CreatePostingExecutor: posting created', {
        actionId: action.id,
        postingId: posting.id,
        accountId: payload.account_id,
        amount: payload.amount,
      });

      return {
        success: true,
        data: {
          created_posting_id: posting.id,
          account_id: payload.account_id,
          account_name: payload.account_name,
          amount: payload.amount,
        },
      };
    } catch (error: any) {
      logger.error('CreatePostingExecutor failed', { actionId: action.id, error: error.message });
      return { success: false, error: error.message };
    }
  },
};

// ── CategorizeTransactionExecutor ─────────────────────────────

const CategorizeTransactionExecutor: PendingActionHandler = {
  actionType: 'categorize_transaction',

  async execute(action, auth): Promise<ExecutionResult> {
    try {
      const payload = action.payload as {
        posting_id: string;
        predicted_account_id: string;
        predicted_account_name?: string;
        confidence_score: number;
        // The account_id and credit_account_id of the posting at queue time
        // are stored so we can determine direction without re-querying.
        posting_account_id?: string;
        posting_account_type?: string[];
        posting_credit_account_id?: string;
        posting_credit_account_type?: string[];
        posting_amount?: number;
      };

      if (!payload.posting_id) {
        return { success: false, error: 'Missing posting_id in payload' };
      }
      if (!payload.predicted_account_id) {
        return { success: false, error: 'Missing predicted_account_id in payload' };
      }

      // Fetch the posting to determine direction
      const posting = await prisma.posting.findFirst({
        where: { id: payload.posting_id, org_id: auth.user.org_id },
        include: {
          account: { select: { type: true } },
          credit_account: { select: { type: true } },
        },
      });

      if (!posting) {
        return { success: false, error: `Posting ${payload.posting_id} not found` };
      }

      const direction = determineTransactionDirection(
        Number(posting.amount),
        (posting.account as any)?.type ?? [],
        (posting.credit_account as any)?.type ?? [],
        { strict: true }
      );
      const fieldToUpdate = getFieldToUpdate(direction);

      await updatePostingWithCategorization(
        payload.posting_id,
        payload.predicted_account_id,
        payload.confidence_score ?? 0,
        fieldToUpdate,
        auth.user.id
      );

      logger.info('CategorizeTransactionExecutor: posting updated', {
        actionId: action.id,
        postingId: payload.posting_id,
        predictedAccountId: payload.predicted_account_id,
        fieldToUpdate,
      });

      return {
        success: true,
        data: {
          posting_id: payload.posting_id,
          predicted_account_id: payload.predicted_account_id,
          predicted_account_name: payload.predicted_account_name,
          field_updated: fieldToUpdate,
        },
      };
    } catch (error: any) {
      logger.error('CategorizeTransactionExecutor failed', {
        actionId: action.id,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  },
};

// ── PlaceholderExecutor ────────────────────────────────────────

const PlaceholderExecutor: PendingActionHandler = {
  actionType: 'placeholder',

  async execute(action, _auth): Promise<ExecutionResult> {
    logger.info('PlaceholderExecutor: logging intent (no-op)', {
      actionId: action.id,
      actionType: action.action_type,
    });
    return {
      success: true,
      data: { message: `Placeholder execution for ${action.action_type} — no side effect.` },
    };
  },
};

// ── Registry ───────────────────────────────────────────────────

const ApproveTaxPackageExecutor: PendingActionHandler = {
  actionType: 'approve_tax_package',
  async execute(action, _auth): Promise<ExecutionResult> {
    logger.info('ApproveTaxPackageExecutor: package approved', {
      actionId: action.id,
      taxYear: (action.payload as any)?.tax_year,
      recipient: (action.payload as any)?.recipient,
    });
    return {
      success: true,
      data: {
        approved: true,
        tax_year: (action.payload as any)?.tax_year,
        recipient: (action.payload as any)?.recipient,
        message: 'Package approved. Download the organizer from the completed session.',
      },
    };
  },
};

const EXECUTORS: Record<string, PendingActionHandler> = {
  reconcile_posting: ReconcilePostingExecutor,
  create_posting: CreatePostingExecutor,
  categorize_transaction: CategorizeTransactionExecutor,
  approve_tax_package: ApproveTaxPackageExecutor,
};

// ── Public API ─────────────────────────────────────────────────

export const PendingActionExecutor = {
  /**
   * Execute the side effect for a pending action.
   * Looks up the executor by action_type and runs it.
   */
  async execute(
    action: { id: string; payload: any; action_type: string },
    auth: AuthContext
  ): Promise<ExecutionResult> {
    const executor = EXECUTORS[action.action_type] || PlaceholderExecutor;
    return executor.execute(action, auth);
  },

  /**
   * Check if an executor exists for a given action type.
   */
  hasExecutor(actionType: string): boolean {
    return actionType in EXECUTORS;
  },
};
