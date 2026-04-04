/**
 * PendingActionExecutor — Phase 3 Tests
 *
 * Tests executor registry, ReconcilePostingExecutor, PlaceholderExecutor,
 * full approve flow, and report continuation trigger.
 *
 * Run with:
 *   npx jest src/agent/__tests__/pending-action-executor.test.ts --runInBand
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

import prisma from '../../lib/prisma';
import { PermissionService } from '../../services/permissions/PermissionService';
import { AuthContext } from '../../auth/types';
import { PendingActionExecutor } from '../executors/PendingActionExecutor';
import {
  createAgentSession,
  getAgentSession,
} from '../services/SessionService';
import {
  createPendingAction,
  resolvePendingAction,
  listPendingActions,
} from '../services/PendingActionService';

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_rajesh_kumar',
  orgId: process.env.TEST_ORG_ID || 'org_rajesh',
};

async function buildAuth(): Promise<AuthContext> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: TEST_CONFIG.userId } });
  const permissions = await PermissionService.getUserPermissions(TEST_CONFIG.userId);
  return {
    user: {
      id: user.id,
      email: user.email || '',
      name: user.name,
      org_id: user.org_id || TEST_CONFIG.orgId,
    },
    permissions,
  };
}

describe('PendingActionExecutor — Phase 3', () => {

  let auth: AuthContext;
  let testPostingId: string;

  beforeAll(async () => {
    auth = await buildAuth();

    // Find a posting with reconciliation_status = 'SUGGESTED' and a valid matched_reference
    // (these are set up by the demo seed data)
    const posting = await prisma.posting.findFirst({
      where: {
        org_id: TEST_CONFIG.orgId,
        reconciliation_status: 'SUGGESTED',
        matched_reference: { not: null },
      },
    });
    if (!posting) {
      // Fall back to any unreconciled posting
      const fallback = await prisma.posting.findFirst({
        where: {
          org_id: TEST_CONFIG.orgId,
          OR: [
            { reconciliation_status: null },
            { reconciliation_status: 'UNMATCHED' },
          ],
        },
      });
      if (!fallback) {
        console.warn(
          'No suitable posting found for executor test. ' +
          'ReconcilePostingExecutor test will be skipped.'
        );
      }
      testPostingId = fallback?.id || '';
    } else {
      testPostingId = posting.id;
    }
  }, 30000);

  // --- PlaceholderExecutor ---

  test('PlaceholderExecutor handles unknown action types without throwing', async () => {
    const action = await createPendingAction({
      org_id: TEST_CONFIG.orgId,
      action_type: 'send_email',
      title: 'Placeholder test',
      payload: { preview: {} },
      confidence: 'low',
      on_approve: 'execute_immediately',
      created_by: 'agent',
    });

    const result = await PendingActionExecutor.execute(
      { id: action.id, payload: action.payload, action_type: action.action_type },
      auth
    );

    expect(result.success).toBe(true);

    // Cleanup
    await prisma.pending_action.delete({ where: { id: action.id } });
  });

  test('PlaceholderExecutor handles completely unknown action types', async () => {
    const result = await PendingActionExecutor.execute(
      { id: 'fake_id', payload: {}, action_type: 'totally_unknown_type' },
      auth
    );
    expect(result.success).toBe(true);
  });

  // --- ReconcilePostingExecutor ---

  test('ReconcilePostingExecutor runs confirmReconciliation on SUGGESTED posting', async () => {
    if (!testPostingId) {
      console.warn('Skipping: no suitable posting found');
      return;
    }

    // Check if posting has a valid matched_reference
    const posting = await prisma.posting.findUnique({ where: { id: testPostingId } });
    if (!posting?.matched_reference) {
      console.warn('Skipping: posting has no matched_reference');
      return;
    }

    const result = await PendingActionExecutor.execute(
      {
        id: 'test_action',
        payload: { posting_id: testPostingId },
        action_type: 'reconcile_posting',
      },
      auth
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.reconciliation_status).toBe('MATCHED');
    }

    // Reset posting for other tests
    await prisma.posting.update({
      where: { id: testPostingId },
      data: {
        reconciliation_status: 'SUGGESTED',
        payment_receipt_id: null,
      },
    });
  });

  test('ReconcilePostingExecutor returns error for missing posting_id', async () => {
    const result = await PendingActionExecutor.execute(
      { id: 'test', payload: {}, action_type: 'reconcile_posting' },
      auth
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing posting_id');
  });

  // --- Full approve flow via service ---

  test('approving a pending action calls executor and sets executed_at', async () => {
    if (!testPostingId) {
      console.warn('Skipping: no suitable posting found');
      return;
    }

    const posting = await prisma.posting.findUnique({ where: { id: testPostingId } });
    if (!posting?.matched_reference) {
      console.warn('Skipping: posting has no matched_reference');
      return;
    }

    const action = await createPendingAction({
      org_id: TEST_CONFIG.orgId,
      action_type: 'reconcile_posting',
      title: 'Full approve flow test',
      payload: {
        posting_id: testPostingId,
        match_type: 'payment_receipt',
        match_id: 'rec_full_test',
        match_reference: 'REC-FULL-001',
        confidence_detail: 'Full flow test',
        preview: {
          posting: { description: 'TEST', amount: 100, date: '2026-01-01', account: 'HDFC' },
          match: { reference: 'REC-FULL-001', amount: 100, customer: 'Test', date: '2026-01-01' },
        },
      },
      confidence: 'high',
      on_approve: 'execute_immediately',
      created_by: 'agent',
    });

    // Resolve via the service layer (same path as PATCH /pending-actions/:id)
    const resolved = await resolvePendingAction(action.id, {
      status: 'approved',
      resolved_by: TEST_CONFIG.userId,
    }, auth);

    expect(resolved.status).toBe('executed');
    expect(resolved.executed_at).not.toBeNull();
    expect(resolved.execution_error).toBeNull();

    // Cleanup
    await prisma.posting.update({
      where: { id: testPostingId },
      data: {
        reconciliation_status: 'SUGGESTED',
        payment_receipt_id: null,
      },
    });
    await prisma.pending_action.delete({ where: { id: action.id } });
  });

  // --- Report continuation trigger ---

  test('resolving last pending action in session transitions status to executing', async () => {
    // Mock setImmediate to prevent the lazy AgentService import (Langfuse fails in Jest)
    // The status transition to 'executing' happens synchronously before setImmediate fires
    const originalSetImmediate = global.setImmediate;
    global.setImmediate = ((fn: any) => {/* no-op in test */}) as any;

    const session = await createAgentSession({
      org_id: TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal: 'Report continuation test',
      mode: 'supervised',
      status: 'awaiting_approval',
      plan: [
        { index: 0, type: 'query', title: 'Step 1', description: '', status: 'completed', requires_approval: false },
        { index: 1, type: 'action', title: 'Step 2', description: '', status: 'completed', requires_approval: true },
        { index: 2, type: 'report', title: 'Step 3', description: '', status: 'pending', requires_approval: false },
      ],
      current_step_index: 2,
      pending_actions_count: 1,
    });

    const action = await createPendingAction({
      org_id: TEST_CONFIG.orgId,
      session_id: session.id,
      action_type: 'send_email',
      title: 'Last action',
      payload: { preview: {} },
      confidence: 'low',
      on_approve: 'execute_immediately',
      created_by: 'agent',
    });

    // Resolve the last action (with auth so executor runs)
    await resolvePendingAction(action.id, {
      status: 'approved',
      resolved_by: TEST_CONFIG.userId,
    }, auth);

    const updatedSession = await getAgentSession(session.id);
    // Session should have been set to 'executing' when all pending actions resolved
    expect(['executing', 'completed']).toContain(updatedSession.status);

    // Cleanup
    global.setImmediate = originalSetImmediate;
    await prisma.pending_action.deleteMany({ where: { session_id: session.id } });
    await prisma.agent_message.deleteMany({ where: { session_id: session.id } });
    await prisma.agent_session.delete({ where: { id: session.id } });
  });

  // --- hasExecutor ---

  test('hasExecutor returns true for known types', () => {
    expect(PendingActionExecutor.hasExecutor('reconcile_posting')).toBe(true);
    expect(PendingActionExecutor.hasExecutor('send_email')).toBe(true);
    expect(PendingActionExecutor.hasExecutor('invoice_match')).toBe(true);
  });

  test('hasExecutor returns false for unknown types', () => {
    expect(PendingActionExecutor.hasExecutor('totally_unknown')).toBe(false);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
