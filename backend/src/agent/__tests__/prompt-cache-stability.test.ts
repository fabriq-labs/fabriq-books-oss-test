import { computeDatePlaceholders } from '../prompt/datePlaceholders';
import { buildSessionStateBlock, SESSION_DIRECTIVE } from '../prompt/constants';

/**
 * Phase 1 of prompt caching: prove the system-prompt prefix is byte-stable across
 * turns (so providers can serve it from cache) while all content is preserved.
 */

const SESSION_DIRECTIVE_MARKER = 'SESSION AGENT DIRECTIVE';

function makeSession(accumulated: Record<string, unknown>) {
  return {
    goal: 'Reconcile HDFC transactions for March',
    mode: 'supervised',
    status: 'executing',
    plan: [
      { title: 'Find unmatched postings', type: 'query', status: 'completed' },
      { title: 'Suggest matches', type: 'analysis', status: 'in_progress' },
    ],
    current_step_index: 1,
    pending_actions_count: 0,
    accumulated_context: accumulated,
  };
}

describe('Phase 1 — prompt-cache prefix stability', () => {
  describe('currentDate de-volatilization (datePlaceholders)', () => {
    it('is identical for two timestamps within the same UTC hour', () => {
      const a = computeDatePlaceholders(new Date('2026-08-05T02:00:00.123Z'));
      const b = computeDatePlaceholders(new Date('2026-08-05T02:59:59.999Z'));
      expect(a.currentDate).toBe(b.currentDate);
      expect(a.currentDate).toBe('2026-08-05T02:00:00.000Z');
    });

    it('remains a full ISO timestamp (not a bare date — prompts require full ISO)', () => {
      const { currentDate } = computeDatePlaceholders(new Date('2026-08-05T02:20:00.000Z'));
      expect(currentDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('keeps the same UTC calendar day as `now` (SearchDateBounds sameUtcDate invariant)', () => {
      for (const iso of ['2026-08-05T00:30:00.000Z', '2026-08-05T02:20:00.000Z', '2026-08-05T23:45:00.000Z']) {
        const now = new Date(iso);
        const { currentDate } = computeDatePlaceholders(now);
        expect(currentDate.slice(0, 10)).toBe(iso.slice(0, 10));
        expect(new Date(currentDate).getTime()).toBeLessThanOrEqual(now.getTime());
      }
    });

    it('changes across different hours (still tracks time forward)', () => {
      const a = computeDatePlaceholders(new Date('2026-08-05T02:20:00.000Z'));
      const b = computeDatePlaceholders(new Date('2026-08-05T03:20:00.000Z'));
      expect(a.currentDate).not.toBe(b.currentDate);
    });
  });

  describe('SESSION_DIRECTIVE is separated from the dynamic state block', () => {
    it('state block contains dynamic context but NOT the static directive', () => {
      const block = buildSessionStateBlock(makeSession({ unmatched_count: 23 }), false, false);
      expect(block).toContain('Goal: Reconcile HDFC transactions for March');
      expect(block).toContain('Status: executing');
      expect(block).toContain('Accumulated: {"unmatched_count":23}');
      expect(block).not.toContain(SESSION_DIRECTIVE_MARKER);
    });

    it('includes the full plan only on the first turn / just after createPlan', () => {
      expect(buildSessionStateBlock(makeSession({}), true, false)).toContain('## Full Plan');
      expect(buildSessionStateBlock(makeSession({}), false, true)).toContain('## Full Plan');
      expect(buildSessionStateBlock(makeSession({}), false, false)).not.toContain('## Full Plan');
    });
  });

  describe('assembled prefix stays byte-identical while dynamic state changes', () => {
    // Mirrors AgentService assembly: [static base + SESSION_DIRECTIVE] + [dynamic state].
    const STATIC_BASE = 'TEMPLATE\n---\nBASE PROMPT + TOOL GUIDELINES';
    const assemble = (session: ReturnType<typeof makeSession>) =>
      STATIC_BASE + '\n' + SESSION_DIRECTIVE + '\n' + buildSessionStateBlock(session, false, false);

    it('directive precedes the volatile accumulated context', () => {
      const out = assemble(makeSession({ unmatched_count: 23 }));
      expect(out.indexOf(SESSION_DIRECTIVE_MARKER)).toBeGreaterThan(-1);
      expect(out.indexOf(SESSION_DIRECTIVE_MARKER)).toBeLessThan(out.indexOf('Accumulated:'));
    });

    it('shares an identical cacheable prefix across two turns with different accumulated_context', () => {
      const turn1 = assemble(makeSession({ unmatched_count: 23 }));
      const turn2 = assemble(makeSession({ unmatched_count: 23, matched_count: 5, ids: ['a', 'b'] }));

      // The static prefix up to and including SESSION_DIRECTIVE must be identical.
      const cutoff = STATIC_BASE.length + 1 + SESSION_DIRECTIVE.length;
      expect(turn1.slice(0, cutoff)).toBe(turn2.slice(0, cutoff));
      // ...and the divergence must be entirely inside the trailing state block.
      expect(turn1).not.toBe(turn2);
      expect(turn1.slice(cutoff)).not.toBe(turn2.slice(cutoff));
    });
  });
});
