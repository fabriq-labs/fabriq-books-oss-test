/**
 * Tests for v2 hybrid execution model:
 * - ActionBuilderRegistry + ReconciliationActionBuilder
 * - ReportFormatterRegistry + ReconciliationReportFormatter
 * - Registry lookup (match / no-match)
 */

// Trigger builder registrations
import '../builders';

import { ActionBuilderRegistry } from '../builders/ActionBuilderRegistry';
import { ReportFormatterRegistry } from '../builders/ReportFormatterRegistry';
import { ReconciliationActionBuilder } from '../builders/ReconciliationActionBuilder';
import { ReconciliationReportFormatter } from '../builders/ReconciliationReportFormatter';
import { PlanStep } from '../tools/sessionTools';

// ── Helpers ──────────────────────────────────────────────────────

const makeStep = (overrides: Partial<PlanStep> = {}): PlanStep => ({
  index: 0,
  type: 'action',
  title: 'Queue matches',
  description: 'Queue reconciliation matches for review',
  status: 'in_progress',
  requires_approval: true,
  ...overrides,
});

const mockAuth = {
  user: { id: 'user_1', email: 'test@test.com', name: 'Test', org_id: 'org_1' },
} as any;

const mockSession = {
  id: 'ses_test',
  goal: 'Reconcile postings',
  goal_model: 'posting',
  mode: 'supervised',
  template_id: 'atpl_reconcile',
};

const sampleMatchResults = [
  {
    posting_id: 'post_1',
    posting_description: 'NEFT CR ACME CORP',
    posting_amount: 4500,
    posting_date: '2026-03-01',
    suggestions: [
      {
        type: 'payment_receipt' as const,
        id: 'rec_1',
        reference: 'REC-001',
        amount: 4500,
        date: '2026-03-01',
        customer: 'Acme Corp',
        confidence: 'high' as const,
      },
      {
        type: 'invoice' as const,
        id: 'inv_1',
        reference: 'INV-001',
        amount: 4500,
        date: '2026-02-28',
        customer: 'Acme Corp',
        confidence: 'medium' as const,
      },
    ],
  },
  {
    posting_id: 'post_2',
    posting_description: 'NEFT CR GLOBEX',
    posting_amount: 12000,
    posting_date: '2026-03-05',
    suggestions: [
      {
        type: 'invoice' as const,
        id: 'inv_2',
        reference: 'INV-002',
        amount: 12000,
        date: '2026-03-03',
        customer: 'Globex Corp',
        confidence: 'medium' as const,
      },
    ],
  },
  {
    posting_id: 'post_3',
    posting_description: 'UNKNOWN TXN',
    posting_amount: 500,
    posting_date: '2026-03-10',
    suggestions: [], // No matches
  },
];

// ── ActionBuilderRegistry ────────────────────────────────────────

describe('ActionBuilderRegistry', () => {
  test('returns ReconciliationActionBuilder for posting + action step when match_results present', () => {
    const ctx = { match_results: [{ posting_id: 'p1', suggestions: [] }] };
    const builder = ActionBuilderRegistry.get('posting', makeStep({ type: 'action' }), ctx);
    expect(builder).not.toBeNull();
  });

  test('returns null for posting + action step without match_results (LLM fallback for non-reconciliation flows)', () => {
    const builder = ActionBuilderRegistry.get('posting', makeStep({ type: 'action' }), {});
    expect(builder).toBeNull();
  });

  test('returns null for posting + action step with no context (LLM fallback)', () => {
    const builder = ActionBuilderRegistry.get('posting', makeStep({ type: 'action' }));
    expect(builder).toBeNull();
  });

  test('returns null for posting + query step', () => {
    const builder = ActionBuilderRegistry.get('posting', makeStep({ type: 'query' }));
    expect(builder).toBeNull();
  });

  test('returns null for unknown goal_model + action step', () => {
    const builder = ActionBuilderRegistry.get('invoice', makeStep({ type: 'action' }));
    expect(builder).toBeNull();
  });

  test('returns null for null goal_model (analytical session)', () => {
    const builder = ActionBuilderRegistry.get(null, makeStep({ type: 'action' }));
    expect(builder).toBeNull();
  });
});

// ── ReconciliationActionBuilder ──────────────────────────────────

describe('ReconciliationActionBuilder', () => {
  test('builds pending actions from match_results', async () => {
    const ctx = { match_results: sampleMatchResults, unmatched_count: 3 };
    const result = await ReconciliationActionBuilder.build(ctx, mockSession, mockAuth);

    expect(result.actionType).toBe('reconcile_posting');
    // 2 postings with suggestions, 1 with empty suggestions (skipped)
    expect(result.pendingActions).toHaveLength(2);

    // First action uses best match (high confidence receipt)
    const first = result.pendingActions[0];
    expect(first.confidence).toBe('high');
    expect(first.payload.posting_id).toBe('post_1');
    expect(first.payload.match_type).toBe('payment_receipt');
    expect(first.payload.match_id).toBe('rec_1');
    expect(first.payload.match_reference).toBe('REC-001');
    // Other candidates (up to 3)
    expect(first.payload.other_candidates).toHaveLength(1);
    expect(first.payload.other_candidates[0].id).toBe('inv_1');

    // Second action uses medium confidence invoice
    const second = result.pendingActions[1];
    expect(second.confidence).toBe('medium');
    expect(second.payload.posting_id).toBe('post_2');
    expect(second.payload.match_type).toBe('invoice');

    // Context update
    expect(result.contextUpdate).toEqual({
      unmatched_count: 3,
      queued_matches: 2,
      confidence_breakdown: { high: 1, medium: 1, low: 0 },
    });

    // Summary
    expect(result.summary).toContain('2 reconciliation match');
    expect(result.summary).toContain('1 high');
    expect(result.summary).toContain('1 medium');
  });

  test('handles empty match_results gracefully', async () => {
    const ctx = { match_results: [] };
    const result = await ReconciliationActionBuilder.build(ctx, mockSession, mockAuth);

    expect(result.pendingActions).toHaveLength(0);
    expect(result.contextUpdate?.queued_matches).toBe(0);
  });

  test('handles missing match_results key', async () => {
    const ctx = {};
    const result = await ReconciliationActionBuilder.build(ctx, mockSession, mockAuth);

    expect(result.pendingActions).toHaveLength(0);
  });
});

// ── ReportFormatterRegistry ──────────────────────────────────────

describe('ReportFormatterRegistry', () => {
  const reconciliationSession = {
    ...mockSession,
    plan: [
      makeStep({ index: 0, type: 'query' }),
      makeStep({ index: 1, type: 'action' }),
      makeStep({ index: 2, type: 'report' }),
    ],
  };

  const analyticalSession = {
    ...mockSession,
    template_id: null,
    plan: [
      makeStep({ index: 0, type: 'query' }),
      makeStep({ index: 1, type: 'analysis' }),
      makeStep({ index: 2, type: 'report' }),
    ],
  };

  const categoriseSession = {
    ...mockSession,
    template_id: 'atpl_categorise',
    plan: [
      makeStep({ index: 0, type: 'query' }),
      makeStep({ index: 1, type: 'action' }),
      makeStep({ index: 2, type: 'report' }),
    ],
  };

  test('returns ReconciliationReportFormatter for reconcile template + report step', () => {
    const formatter = ReportFormatterRegistry.get('posting', makeStep({ type: 'report' }), reconciliationSession);
    expect(formatter).not.toBeNull();
  });

  test('returns null for categorise template + report step (even with action step in plan)', () => {
    const formatter = ReportFormatterRegistry.get('posting', makeStep({ type: 'report' }), categoriseSession);
    expect(formatter).toBeNull();
  });

  test('returns null for posting + report step without action in plan (analytical)', () => {
    const formatter = ReportFormatterRegistry.get('posting', makeStep({ type: 'report' }), analyticalSession);
    expect(formatter).toBeNull();
  });

  test('returns null for null goal_model (analytical session)', () => {
    const formatter = ReportFormatterRegistry.get(null, makeStep({ type: 'report' }));
    expect(formatter).toBeNull();
  });

  test('returns null for posting + action step', () => {
    const formatter = ReportFormatterRegistry.get('posting', makeStep({ type: 'action' }));
    expect(formatter).toBeNull();
  });
});

// ── ReconciliationReportFormatter ────────────────────────────────

describe('ReconciliationReportFormatter', () => {
  test('formats full report with all confidence levels', () => {
    const ctx = {
      unmatched_count: 23,
      queued_matches: 18,
      confidence_breakdown: { high: 10, medium: 5, low: 3 },
    };
    const report = ReconciliationReportFormatter.format(ctx, mockSession);

    expect(report).toContain('Reconciliation complete');
    expect(report).toContain('23 unmatched posting(s)');
    expect(report).toContain('18 match suggestion(s)');
    expect(report).toContain('10 high confidence');
    expect(report).toContain('5 medium confidence');
    expect(report).toContain('3 low confidence');
    expect(report).toContain('5 posting(s) had no match');
  });

  test('handles zero matches', () => {
    const ctx = {
      unmatched_count: 5,
      queued_matches: 0,
      confidence_breakdown: {},
    };
    const report = ReconciliationReportFormatter.format(ctx, mockSession);

    expect(report).toContain('0 match suggestion(s)');
    expect(report).toContain('5 posting(s) had no match');
  });

  test('handles missing context fields', () => {
    const report = ReconciliationReportFormatter.format({}, mockSession);

    expect(report).toContain('Reconciliation complete');
    expect(report).toContain('0 unmatched posting(s)');
  });
});
