// Layer 1 (Period Snapshot) · Layer 2 (Workload Radar) · Layer 4 (Activity & Trust)
// Converted from dashboard-widgets.jsx (handoff).
// TODO: Replace MOCK with real API data (financial KPIs, workload counts, sessions).

import React, { useState } from 'react';
import { C, card, hoverCard, Icon, Skeleton, Badge, Btn, Sparkline, MiniBar } from '../design-system';

// ── Mock data ─────────────────────────────────────────────────────────────────
// TODO: replace with real API data

export const MOCK = {
  cashSparkline: [412000,398000,425000,441000,430000,418000,436000,452000,448000,461000,455000,468000,471000,480000,476000,490000,485000,502000,498000,511000,505000,518000,524000,531000,528000,540000,535000,548000,542000,556000],
  cashTotal: 556000,
  revenue: 1284000,
  expense: 912000,
  netIncome: 372000,
  revDelta: 8.4,
  expDelta: -3.1,
  arTotal: 348500,
  arCount: 14,
  apTotal: 187200,
  apCount: 9,
  uncategorized: 42,
  uncatAging: [12, 18, 12],
  unreconciled: 28,
  oldestUnrec: 'Mar 14',
  arAgingTotal: 194000,
  arAgingBuckets: [
    { label: 'Current', value: 48000, color: '#16a34a' },
    { label: '1–30d',   value: 62000, color: '#ca8a04' },
    { label: '31–60d',  value: 44000, color: '#d97706' },
    { label: '61–90d',  value: 28000, color: '#ea580c' },
    { label: '90+d',    value: 12000, color: '#dc2626' },
  ],
  apDueTotal: 112400,
  apDueCount: 5,
  exceptions: 11,
  excBreakdown: [
    { label: 'Missing att.', value: 5, color: '#d97706' },
    { label: 'Imbalanced',   value: 3, color: '#dc2626' },
    { label: 'Failed imports',value: 2, color: '#9333ea' },
    { label: 'Other',        value: 1, color: '#6b7280' },
  ],
  activity24h: { approved: 38, rejected: 4, autoExecuted: 12, rejectionRate: 9.5 },
  activeSessions: [
    { id: 's1', name: 'Categorise expenses — Apr', status: 'awaiting_approval', steps: [3,5], pending: 8,  ago: '2m'  },
    { id: 's2', name: 'Reconcile bank — Mar',      status: 'executing',         steps: [2,7], pending: 0,  ago: '14m' },
    { id: 's3', name: 'AR follow-ups draft',        status: 'planning',          steps: [1,4], pending: 0,  ago: '1h'  },
  ],
};

export const fmt = (n: number): string =>
  n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n.toLocaleString()}`;

// ── Layer 1 — Snapshot ────────────────────────────────────────────────────────

interface SnapshotTileProps {
  label: string;
  headline: string;
  sub?: string;
  sub2?: string;
  extra?: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
  loading?: boolean;
}

export const SnapshotTile: React.FC<SnapshotTileProps> = ({ label, headline, sub, sub2, extra, action, actionLabel, loading }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={action} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...card, padding: '16px 20px', flex: 1, cursor: 'pointer', transition: 'all .15s', boxShadow: hov ? hoverCard.boxShadow : card.boxShadow, borderColor: hov ? hoverCard.borderColor : C.border }}>
      {loading ? (
        <>
          <Skeleton w={80} h={11} style={{ marginBottom: 10 }} />
          <Skeleton w={130} h={24} style={{ marginBottom: 6 }} />
          <Skeleton w={70} h={10} />
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{label}</div>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 22, color: C.gray900, letterSpacing: '-0.02em' }}>{headline}</div>
          {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
          {sub2 && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub2}</div>}
          {extra && <div style={{ marginTop: 8 }}>{extra}</div>}
          {actionLabel && <div style={{ marginTop: 10, fontSize: 11, color: C.primary, fontWeight: 600 }}>{actionLabel} →</div>}
        </>
      )}
    </div>
  );
};

const PnLTile: React.FC<{ loading?: boolean }> = ({ loading }) => {
  const net = MOCK.netIncome;
  const netPos = net >= 0;
  return (
    <div style={{ ...card, padding: '16px 20px', flex: 1.4, cursor: 'pointer', transition: 'all .15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = hoverCard.boxShadow!; (e.currentTarget as HTMLDivElement).style.borderColor = hoverCard.borderColor!; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = card.boxShadow as string; (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}>
      {loading ? (
        <>
          <Skeleton w={70} h={11} style={{ marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 16 }}>
            {[1,2,3].map(i => <div key={i} style={{ flex: 1 }}><Skeleton w="80%" h={18} style={{ marginBottom: 5 }} /><Skeleton w="60%" h={10} /></div>)}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>P&L Snapshot</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Revenue',    val: MOCK.revenue,    delta: MOCK.revDelta, pos: true },
              { label: 'Expense',    val: MOCK.expense,    delta: MOCK.expDelta, pos: false },
              { label: 'Net income', val: MOCK.netIncome,  delta: null,          pos: netPos },
            ].map(r => (
              <div key={r.label} style={{ flex: 1, borderLeft: r.label !== 'Revenue' ? `1px solid ${C.border}` : 'none', paddingLeft: r.label !== 'Revenue' ? 12 : 0 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 16, color: r.label === 'Net income' ? (netPos ? '#15803d' : '#dc2626') : C.gray900 }}>{fmt(r.val)}</div>
                {r.delta !== null && (
                  <div style={{ fontSize: 10, color: r.delta > 0 ? '#16a34a' : '#dc2626', marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Icon name={r.delta > 0 ? 'trending' : 'trendingDown'} size={10} color={r.delta > 0 ? '#16a34a' : '#dc2626'} />
                    {Math.abs(r.delta)}% vs last mo
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: C.primary, fontWeight: 600 }}>Explain variance →</div>
        </>
      )}
    </div>
  );
};

export const Layer1: React.FC<{ loading?: boolean }> = ({ loading }) => (
  <div style={{ display: 'flex', gap: 12 }}>
    <SnapshotTile loading={loading} label="Cash position"
      headline={fmt(MOCK.cashTotal)} sub="Across 3 bank accounts"
      extra={<Sparkline data={MOCK.cashSparkline} color={C.primary} width={90} height={24} />}
      actionLabel="View bank transactions" />
    <PnLTile loading={loading} />
    <SnapshotTile loading={loading} label="AR Outstanding"
      headline={fmt(MOCK.arTotal)} sub={`${MOCK.arCount} open invoices`}
      actionLabel="View open invoices" />
    <SnapshotTile loading={loading} label="AP Outstanding"
      headline={fmt(MOCK.apTotal)} sub={`${MOCK.apCount} open bills`}
      actionLabel="View open bills" />
  </div>
);

// ── Layer 2 — Workload Radar ──────────────────────────────────────────────────

interface RadarCardProps {
  title: string;
  headline: string;
  sub?: React.ReactNode;
  breakdown?: React.ReactNode;
  agentLabel: string;
  agentAction: () => void;
  listLabel: string;
  loading?: boolean;
  accent?: string;
}

export const RadarCard: React.FC<RadarCardProps> = ({ title, headline, sub, breakdown, agentLabel, agentAction, listLabel, loading }) => (
  <div style={{ ...card, padding: '14px 16px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
    {loading ? (
      <>
        <Skeleton w={80} h={10} style={{ marginBottom: 8 }} />
        <Skeleton w={50} h={28} style={{ marginBottom: 6 }} />
        <Skeleton w="100%" h={6} r={3} style={{ marginBottom: 10 }} />
        <div style={{ marginTop: 'auto' }}><Skeleton w="100%" h={26} r={6} /></div>
      </>
    ) : (
      <>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{title}</div>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 26, color: C.gray900, lineHeight: 1 }}>{headline}</div>
          {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
          {breakdown && <div style={{ marginTop: 10 }}>{breakdown}</div>}
        </div>
        <div style={{ marginTop: 14 }}>
          <Btn variant="primary" size="sm" onClick={agentAction} style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}>
            <Icon name="sparkles" size={12} />
            {agentLabel}
          </Btn>
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <Btn variant="link" size="sm">{listLabel}</Btn>
          </div>
        </div>
      </>
    )}
  </div>
);

export const Layer2: React.FC<{ loading?: boolean; onLaunchAgent: (goal: string) => void }> = ({ loading, onLaunchAgent }) => (
  <div style={{ display: 'flex', gap: 12 }}>
    <RadarCard loading={loading} title="Uncategorized"
      headline={String(MOCK.uncategorized)}
      sub={
        <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
          {['0–7d','8–30d','30+d'].map((l, i) => (
            <span key={l} style={{ color: C.muted }}><span style={{ fontWeight: 700, color: C.gray700 }}>{MOCK.uncatAging[i]}</span> {l}</span>
          ))}
        </div>
      }
      breakdown={<MiniBar segments={[{value:MOCK.uncatAging[0],color:'#16a34a',label:'0–7d'},{value:MOCK.uncatAging[1],color:'#ca8a04',label:'8–30d'},{value:MOCK.uncatAging[2],color:'#dc2626',label:'30+d'}]} />}
      agentLabel="Categorise with agent" agentAction={() => onLaunchAgent('Categorise Expenses')} listLabel="View list" />

    <RadarCard loading={loading} title="Unreconciled"
      headline={String(MOCK.unreconciled)} sub={`Oldest: ${MOCK.oldestUnrec}`}
      agentLabel="Reconcile with agent" agentAction={() => onLaunchAgent('Reconcile Transactions')} listLabel="View list" />

    <RadarCard loading={loading} title="AR Aging"
      headline={fmt(MOCK.arAgingTotal)} sub="Overdue receivables"
      breakdown={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <MiniBar segments={MOCK.arAgingBuckets} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MOCK.arAgingBuckets.filter(b => b.value > 0).map(b => (
              <span key={b.label} style={{ fontSize: 9, color: C.muted }}><span style={{ color: b.color, fontWeight: 700 }}>■</span> {b.label}</span>
            ))}
          </div>
        </div>
      }
      agentLabel="Draft follow-ups" agentAction={() => onLaunchAgent('AR Follow-ups')} listLabel="Open aging report" />

    <RadarCard loading={loading} title="AP Due (7d)"
      headline={fmt(MOCK.apDueTotal)} sub={`${MOCK.apDueCount} bills due this week`}
      agentLabel="Plan payments" agentAction={() => onLaunchAgent('Plan Payments')} listLabel="View list" />

    <RadarCard loading={loading} title="Exceptions"
      headline={String(MOCK.exceptions)}
      breakdown={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <MiniBar segments={MOCK.excBreakdown} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MOCK.excBreakdown.map(b => (
              <span key={b.label} style={{ fontSize: 9, color: C.muted }}><span style={{ color: b.color, fontWeight: 700 }}>■</span> {b.label} ({b.value})</span>
            ))}
          </div>
        </div>
      }
      agentLabel="Sweep exceptions" agentAction={() => onLaunchAgent('Sweep Exceptions')} listLabel="View list" />
  </div>
);

// ── Layer 4 — Activity & Trust ────────────────────────────────────────────────

const sessionStatusVariant: Record<string, string> = { planning: 'gray', executing: 'blue', awaiting_approval: 'yellow', completed: 'green' };
const sessionStatusLabel: Record<string, string>   = { planning: 'Planning', executing: 'Executing', awaiting_approval: 'Awaiting approval', completed: 'Completed' };

export const Layer4: React.FC<{ loading?: boolean }> = ({ loading }) => {
  const act = MOCK.activity24h;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* Active sessions */}
      <div style={{ ...card, padding: '16px 20px' }}>
        <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 13, color: C.gray900, marginBottom: 12 }}>Active sessions</div>
        {loading ? (
          [1,2,3].map(i => <div key={i} style={{ marginBottom: 10 }}><Skeleton h={14} /><Skeleton h={10} w="60%" style={{ marginTop: 4 }} /></div>)
        ) : MOCK.activeSessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13 }}>No active sessions.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK.activeSessions.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: C.gray50, border: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.gray900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                    <Badge label={sessionStatusLabel[s.status]} variant={sessionStatusVariant[s.status] as any} size="xs" />
                    <span style={{ fontSize: 10, color: C.muted }}>Step {s.steps[0]}/{s.steps[1]}</span>
                    {s.pending > 0 && <span style={{ fontSize: 10, color: '#854d0e' }}>{s.pending} pending</span>}
                    <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>{s.ago} ago</span>
                  </div>
                </div>
                <Btn variant="outline" size="sm" style={{ fontSize: 11, padding: '0 8px', height: 26, flexShrink: 0 }}>Open</Btn>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Activity 24h */}
      <div style={{ ...card, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 13, color: C.gray900 }}>Agent activity — 24h</div>
          <Btn variant="link" size="sm">Open audit</Btn>
        </div>
        {loading ? (
          <div style={{ display: 'flex', gap: 16 }}>
            {[1,2,3].map(i => <div key={i} style={{ flex: 1 }}><Skeleton h={22} style={{ marginBottom: 4 }} /><Skeleton h={10} w="60%" /></div>)}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              {[
                { label: 'Approved',      val: act.approved,      color: '#166534', bg: '#dcfce7' },
                { label: 'Rejected',      val: act.rejected,      color: '#991b1b', bg: '#fee2e2' },
                { label: 'Auto-executed', val: act.autoExecuted,  color: '#1e40af', bg: '#dbeafe' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 22, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: s.color, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 12, color: C.muted }}>Rejection rate </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: act.rejectionRate > 15 ? '#dc2626' : act.rejectionRate > 10 ? '#d97706' : '#374151' }}>{act.rejectionRate}%</span>
              </div>
              {act.rejectionRate > 10 && (
                <div style={{ fontSize: 11, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9999, padding: '2px 8px' }}>
                  ⚠ Review agent quality
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
