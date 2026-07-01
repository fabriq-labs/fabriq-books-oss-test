/**
 * Session API — Phase 1 Tests
 *
 * Tests agent_session, agent_message, and pending_action CRUD
 * via direct service calls against the real database.
 *
 * Run with:
 *   npx jest src/agent/__tests__/session-api.test.ts --runInBand
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env.test') });
dotenv.config();

import prisma from '../../lib/prisma';
import {
  createAgentSession,
  getAgentSession,
  listAgentSessions,
  updateAgentSession,
  createAgentMessage,
  listAgentMessages,
} from '../services/SessionService';
import {
  createPendingAction,
  getPendingAction,
  listPendingActions,
  resolvePendingAction,
  createPendingActionBatch,
  bulkApproveByConfidence,
} from '../services/PendingActionService';
import { buildTestAuthContext } from './posting-harness-auth';

describe('Session API — Phase 1', () => {

  let sessionId: string;
  let pendingActionId: string;
  let testUserId: string;
  let testOrgId: string;

  beforeAll(async () => {
    const auth = await buildTestAuthContext();
    testUserId = auth.user!.id;
    testOrgId = auth.user!.org_id!;
  });

  // --- agent_session ---

  test('creates a session with correct defaults', async () => {
    const session = await createAgentSession({
      org_id: testOrgId,
      user_id: testUserId,
      goal: 'Reconcile HDFC current account transactions',
      mode: 'supervised',
    });
    sessionId = session.id;
    expect(session.id).toMatch(/^ses_/);
    expect(session.status).toBe('planning');
    expect(session.pending_actions_count).toBe(0);
    expect(session.plan).toBeNull();
  });

  test('retrieves a session by id', async () => {
    const session = await getAgentSession(sessionId);
    expect(session.id).toBe(sessionId);
    expect(session.goal).toBe('Reconcile HDFC current account transactions');
  });

  test('lists sessions for user', async () => {
    const sessions = await listAgentSessions(testUserId, testOrgId);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.some(s => s.id === sessionId)).toBe(true);
  });

  test('updates session status', async () => {
    const updated = await updateAgentSession(sessionId, { status: 'executing' });
    expect(updated.status).toBe('executing');
  });

  // --- agent_message ---

  test('creates and lists messages for a session', async () => {
    await createAgentMessage({
      session_id: sessionId,
      role: 'user',
      content: 'Reconcile unmatched transactions for HDFC current account',
    });
    await createAgentMessage({
      session_id: sessionId,
      role: 'assistant',
      content: 'I will create a plan to reconcile your HDFC transactions.',
      tool_calls: [{ name: 'createPlan', args: {} }],
    });

    const messages = await listAgentMessages(sessionId);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].tool_calls).toBeDefined();
  });

  // --- pending_action ---

  test('creates a pending action', async () => {
    const action = await createPendingAction({
      org_id: testOrgId,
      session_id: sessionId,
      action_type: 'reconcile_posting',
      title: 'Match NEFT CR ACME to REC-DEMO-001',
      payload: {
        posting_id: 'post_test_001',
        match_type: 'payment_receipt',
        match_id: 'rec_test_001',
        match_reference: 'REC-DEMO-001',
        confidence_detail: 'Exact amount and customer match',
        preview: {
          posting: { description: 'NEFT CR ACME', amount: 4500, date: '2026-03-10', account: 'HDFC' },
          match: { reference: 'REC-DEMO-001', amount: 4500, customer: 'Acme Corp', date: '2026-03-10' },
        },
      },
      confidence: 'high',
      on_approve: 'execute_immediately',
      created_by: 'agent',
    });
    pendingActionId = action.id;
    expect(action.id).toMatch(/^pa_/);
    expect(action.status).toBe('pending');
  });

  test('session pending_actions_count incremented', async () => {
    const session = await getAgentSession(sessionId);
    expect(session.pending_actions_count).toBe(1);
  });

  test('retrieves pending action by id', async () => {
    const action = await getPendingAction(pendingActionId);
    expect(action.id).toBe(pendingActionId);
    expect(action.action_type).toBe('reconcile_posting');
  });

  test('lists pending actions for session', async () => {
    const actions = await listPendingActions({ session_id: sessionId });
    expect(actions.length).toBe(1);
    expect(actions[0].id).toBe(pendingActionId);
  });

  test('approves a pending action', async () => {
    const resolved = await resolvePendingAction(pendingActionId, {
      status: 'approved',
      resolved_by: testUserId,
    });
    expect(resolved.status).toBe('approved');
    expect(resolved.resolved_at).not.toBeNull();
  });

  test('rejects a pending action with reason', async () => {
    const action2 = await createPendingAction({
      org_id: testOrgId,
      session_id: sessionId,
      action_type: 'reconcile_posting',
      title: 'Match NEFT CR GLOBEX to REC-DEMO-002',
      payload: {
        posting_id: 'post_test_002',
        match_type: 'payment_receipt',
        match_id: 'rec_test_002',
        match_reference: 'REC-DEMO-002',
        confidence_detail: 'Amount match only',
        preview: {
          posting: { description: 'NEFT CR GLOBEX', amount: 12000, date: '2026-03-08', account: 'HDFC' },
          match: { reference: 'REC-DEMO-002', amount: 12000, customer: 'Globex Corp', date: '2026-03-08' },
        },
      },
      confidence: 'medium',
      on_approve: 'execute_immediately',
      created_by: 'agent',
    });
    const rejected = await resolvePendingAction(action2.id, {
      status: 'rejected',
      resolved_by: testUserId,
      resolution_note: 'Wrong customer',
    });
    expect(rejected.status).toBe('rejected');
    expect(rejected.resolution_note).toBe('Wrong customer');
  });

  test('creates a batch of pending actions with shared batch_id', async () => {
    const batchId = `${sessionId}-step-2`;
    const actions = await createPendingActionBatch(
      [
        {
          title: 'Match 1',
          payload: {
            posting_id: 'p1', match_id: 'm1', match_type: 'payment_receipt',
            match_reference: 'REC-001', confidence_detail: 'test',
            preview: {
              posting: { description: 'x', amount: 100, date: '2026-01-01', account: 'HDFC' },
              match: { reference: 'REC-001', amount: 100, customer: 'A', date: '2026-01-01' },
            },
          },
          confidence: 'high' as const,
        },
        {
          title: 'Match 2',
          payload: {
            posting_id: 'p2', match_id: 'm2', match_type: 'payment_receipt',
            match_reference: 'REC-002', confidence_detail: 'test',
            preview: {
              posting: { description: 'y', amount: 200, date: '2026-01-01', account: 'HDFC' },
              match: { reference: 'REC-002', amount: 200, customer: 'B', date: '2026-01-01' },
            },
          },
          confidence: 'medium' as const,
        },
      ],
      {
        org_id: testOrgId,
        session_id: sessionId,
        action_type: 'reconcile_posting',
        batch_id: batchId,
        on_approve: 'execute_immediately',
        created_by: 'agent',
      }
    );
    expect(actions).toHaveLength(2);
    expect(actions.every(a => a.batch_id === batchId)).toBe(true);
    expect(actions.every(a => a.batch_total === 2)).toBe(true);

    const batchActions = await listPendingActions({ batch_id: batchId });
    expect(batchActions).toHaveLength(2);
  });

  test('bulk approves high confidence actions in a batch', async () => {
    const batchId = `${sessionId}-step-2`;
    await bulkApproveByConfidence(batchId, 'high', testUserId);
    const actions = await listPendingActions({ batch_id: batchId });
    const approved = actions.filter(a => a.status === 'approved');
    const pending = actions.filter(a => a.status === 'pending');
    expect(approved).toHaveLength(1); // only the 'high' one
    expect(pending).toHaveLength(1);  // the 'medium' one remains
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.pending_action.deleteMany({ where: { session_id: sessionId } });
    await prisma.agent_message.deleteMany({ where: { session_id: sessionId } });
    await prisma.agent_session.delete({ where: { id: sessionId } });
    await prisma.$disconnect();
  });
});
