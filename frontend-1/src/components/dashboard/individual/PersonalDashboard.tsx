// Personal Finance Dashboard — v2
// Position band: as-of today. Loaded once; not invalidated by period changes.
// Activity band: period-driven. Reloads (with skeleton) when FY/month changes.

import React, { useState, useEffect, useMemo } from 'react';
import {
  C, card, hoverCard, Icon, Skeleton, Btn, Badge, Chip, confidenceVariant, confidenceLabel,
} from '../design-system';
import { reportAPI } from '@/api/api';
import { pendingActionAPI } from '@/api/agentApi';
import type { PendingAction } from '@/contexts/AgentSessionContext';
import { useEntity } from '@/contexts/EntityContext';
import { formatCurrency } from '@/lib/formatters';
import {
  FinancialYearSelector,
  getPreviousFYOption,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
  type FinancialYearType,
} from '@/components/Reports/FinancialYearSelector';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Inject drawer animation keyframes once at module load
if (typeof document !== 'undefined' && !document.getElementById('__v2DrawerAnim')) {
  const s = document.createElement('style');
  s.id = '__v2DrawerAnim';
  s.textContent = `
    @keyframes v2DrawerFade  { from { opacity:0 }              to { opacity:1 } }
    @keyframes v2DrawerSlide { from { transform:translateX(100%); opacity:.6 } to { transform:translateX(0); opacity:1 } }
  `;
  document.head.appendChild(s);
}

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = ['#7028a0', '#8c2abc', '#a354c9', '#ba7fd6', '#d1a9e4', '#e5e7eb'];
const TODAY = new Date().toISOString().split('T')[0];
const EPOCH = '2000-01-01';

// ── Data types ─────────────────────────────────────────────────────────────────
interface AccountRow {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | string;
  balance: number;
  limit?: number;
}

interface CategoryRow {
  name: string;
  amount: number;
  color: string;
}

interface InboxAction {
  id: string;
  desc: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  amount: number;
  from: string;
}

interface PositionData {
  netCash: number;
  cardDebt: number;
  netWorth: number;
  assets: number;
  liabilities: number;
  accounts: AccountRow[];
  pendingActions: InboxAction[];
  uncategorized: number;
  unreconciled: number;
}

interface ActivityData {
  net: number;
  savingsRate: number;
  categories: CategoryRow[];
}

const POSITION_EMPTY: PositionData = {
  netCash: 0, cardDebt: 0, netWorth: 0, assets: 0, liabilities: 0,
  accounts: [], pendingActions: [], uncategorized: 0, unreconciled: 0,
};

const ACTIVITY_EMPTY: ActivityData = { net: 0, savingsRate: 0, categories: [] };

// ── Helpers ────────────────────────────────────────────────────────────────────
function isBankType(t: string): boolean {
  return t.includes('BANK') || t.includes('CHECKING') || t.includes('SAVINGS') || t.toLowerCase().includes('bank');
}
function isCreditType(t: string): boolean {
  return t.includes('CREDIT_CARD') || t.toLowerCase().includes('credit card');
}
function accountDisplayType(t: string): 'credit' | 'savings' | 'checking' {
  if (isCreditType(t)) return 'credit';
  if (t.includes('SAVINGS') || t.toLowerCase().includes('savings')) return 'savings';
  return 'checking';
}

// ── Position hook — reloads on entity change only, not on period changes ───────
function usePositionData(entityId: string | null, fyType?: string) {
  const [data, setData] = useState<PositionData>(POSITION_EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const legalEntityIds = entityId ? [entityId] : [];
        const latestFY = getPreviousFYOption((fyType as FinancialYearType) ?? 'JAN_DEC');

        const [ratioResult, trialBalResult, categResult, reconcResult] = await Promise.all([
          reportAPI.getReport('financial_ratios', {
            from_date: latestFY.from_date,
            to_date: latestFY.to_date,
            legal_entity_ids: legalEntityIds,
          }),
          reportAPI.getReport('trial_balance', {
            from_date: EPOCH,
            to_date: TODAY,
            legal_entity_ids: legalEntityIds,
          }),
          pendingActionAPI.listPaginated({ action_type: 'categorize_transaction', status: 'pending', pageSize: 25 }),
          pendingActionAPI.listPaginated({ action_type: 'reconcile_posting', status: 'pending', pageSize: 1 }),
        ]);

        if (cancelled) return;

        const rawRatios = (ratioResult as any)?.data;
        const ratios = (Array.isArray(rawRatios) ? rawRatios[0] : rawRatios) as any ?? {};

        const tbRows: any[] = Array.isArray((trialBalResult as any)?.data) ? (trialBalResult as any).data : [];
        const bankRows   = tbRows.filter((r: any) => isBankType(String(r.account_type ?? '')));
        const creditRows = tbRows.filter((r: any) => isCreditType(String(r.account_type ?? '')));

        const netCash  = bankRows.reduce((s: number, r: any) => s + Number(r.total_balance ?? 0), 0);
        const cardDebt = Math.abs(creditRows.reduce((s: number, r: any) => s + Number(r.total_balance ?? 0), 0));

        const accounts: AccountRow[] = [...bankRows, ...creditRows].map((r: any) => ({
          id:      r.account_id,
          name:    r.account_name ?? '',
          type:    accountDisplayType(String(r.account_type ?? '')),
          balance: Number(r.total_balance ?? 0),
          limit:   undefined, // credit_limit column not yet in schema
        }));

        const categItems: PendingAction[] = Array.isArray(categResult?.items) ? categResult.items : [];
        const pendingActions: InboxAction[] = categItems.map((a) => ({
          id:         a.id,
          desc:       a.title,
          category:   (a.payload as any)?.predicted_account_name ?? 'Unknown',
          confidence: a.confidence,
          amount:     Number((a.payload as any)?.posting_amount ?? 0),
          from:       (a.payload as any)?.account_name ?? '',
        }));

        setData({
          netCash,
          cardDebt,
          netWorth:     Number(ratios.net_worth       ?? 0),
          assets:       Number(ratios.total_asset     ?? 0),
          liabilities:  Number(ratios.total_liability ?? 0),
          accounts,
          pendingActions,
          uncategorized: categResult?.total  ?? 0,
          unreconciled:  reconcResult?.total ?? 0,
        });
      } catch (err) {
        console.error('PersonalDashboard: failed to load position data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [entityId, fyType]); // period changes must NOT be in this dep array

  return { data, loading };
}

// ── Activity hook — reloads when period changes ────────────────────────────────
function useActivityData(fromDate: string, toDate: string, entityId: string | null) {
  const [data, setData] = useState<ActivityData>(ACTIVITY_EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const legalEntityIds = entityId ? [entityId] : [];
        const [ratioResult, spendingResult] = await Promise.all([
          reportAPI.getReport('financial_ratios', {
            from_date: fromDate, to_date: toDate, legal_entity_ids: legalEntityIds,
          }),
          reportAPI.getReport('classification_breakdown', {
            classification: 'Expense', from_date: fromDate, to_date: toDate,
            legal_entity_ids: legalEntityIds,
          }),
        ]);

        if (cancelled) return;

        const rawRatios = (ratioResult as any)?.data;
        const ratios = (Array.isArray(rawRatios) ? rawRatios[0] : rawRatios) as any ?? {};

        const breakdown: any[] = Array.isArray((spendingResult as any)?.data?.breakdown)
          ? (spendingResult as any).data.breakdown : [];
        const categories: CategoryRow[] = breakdown
          .map((c: any, i: number) => ({ name: c.name, amount: Number(c.value ?? 0), color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
          .filter((c) => c.amount > 0);

        setData({
          net:         Number(ratios.total_income ?? 0) - Number(ratios.total_expense ?? 0),
          savingsRate: Math.round(Number(ratios.saving_ratio ?? 0) * 100),
          categories,
        });
      } catch (err) {
        console.error('PersonalDashboard: failed to load activity data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [fromDate, toDate, entityId]);

  return { data, loading };
}

// ── StatTile ───────────────────────────────────────────────────────────────────
interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  cta?: string;
  positive?: boolean;
  loading?: boolean;
}

export const StatTile: React.FC<StatTileProps> = ({ label, value, sub, cta, positive = true, loading }) => {
  const [hov, setHov] = useState(false);
  if (loading) return (
    <div style={{ ...card, padding: '10px 14px' }}>
      <Skeleton w={80} h={9} />
      <Skeleton w={110} h={22} style={{ marginTop: 6 }} />
      <Skeleton w={100} h={9} style={{ marginTop: 6 }} />
    </div>
  );
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...card, padding: '10px 14px', cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s', boxShadow: hov ? hoverCard.boxShadow : card.boxShadow, borderColor: hov ? hoverCard.borderColor : C.border }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: positive ? C.gray900 : '#dc2626', marginTop: 2 }}>
        {positive ? '' : '−'}{value}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: C.muted }}>{sub}</span>
        {cta && <button style={{ fontSize: 10, fontWeight: 700, color: C.primary, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Lato,sans-serif', padding: 0 }}>{cta} →</button>}
      </div>
    </div>
  );
};

// ── BandHeader ─────────────────────────────────────────────────────────────────
const BandHeader: React.FC<{ label: string; period: string; children?: React.ReactNode }> = ({ label, period, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: C.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {label} <span style={{ color: C.gray700, fontWeight: 700 }}>· {period}</span>
    </div>
    <div style={{ flex: 1, height: 1, background: C.gray200 }} />
    {children}
  </div>
);

// ── AccountChip ────────────────────────────────────────────────────────────────
const AccountChip: React.FC<{ a: AccountRow; fmt: (n: number) => string; onClick: () => void }> = ({ a, fmt, onClick }) => {
  const [hov, setHov] = useState(false);
  const isCredit     = a.type === 'credit';
  const isInvestment = a.type === 'investment';
  const utilPct      = isCredit && a.limit ? Math.round((Math.abs(a.balance) / a.limit) * 100) : null;
  const glyphBg    = isCredit ? C.primary50 : isInvestment ? '#dbeafe' : 'rgba(22,163,74,.08)';
  const glyphColor = isCredit ? C.primary   : isInvestment ? '#1e40af' : '#16a34a';
  const glyphIcon  = isCredit ? 'dollar'    : isInvestment ? 'trending' : 'bank';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...card, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 0', boxShadow: hov ? hoverCard.boxShadow : card.boxShadow, borderColor: hov ? hoverCard.borderColor : C.border, transition: 'box-shadow .15s, border-color .15s' }}
    >
      <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: glyphBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={glyphIcon} size={12} color={glyphColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.gray700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
        {isCredit && utilPct !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <div style={{ height: 3, width: 36, background: C.gray100, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${utilPct}%`, background: utilPct > 30 ? '#f59e0b' : '#16a34a' }} />
            </div>
            <span style={{ fontSize: 9, color: C.muted }}>{utilPct}%</span>
          </div>
        ) : (
          <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{a.type}</div>
        )}
      </div>
      <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 12, fontWeight: 700, color: a.balance < 0 ? '#dc2626' : C.gray900, flexShrink: 0 }}>
        {a.balance < 0 ? '−' : ''}{fmt(Math.abs(a.balance))}
      </div>
    </div>
  );
};

// ── MoreChip ───────────────────────────────────────────────────────────────────
const MoreChip: React.FC<{ count: number; onClick: () => void }> = ({ count, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...card, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0, flex: '1 1 0', background: hov ? C.primary100 : C.primary50, borderColor: C.primary100, transition: 'background .15s' }}
    >
      <Icon name="layers" size={12} color={C.primary} />
      <span style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>+{count} more</span>
      <Icon name="arrowRight" size={11} color={C.primary} />
    </div>
  );
};

// ── AccountsDrawer ─────────────────────────────────────────────────────────────
const AccountsDrawer: React.FC<{ open: boolean; accounts: AccountRow[]; fmt: (n: number) => string; onClose: () => void }> = ({ open, accounts, fmt, onClose }) => {
  if (!open) return null;
  const groups: Record<string, AccountRow[]> = {
    Cash:        accounts.filter(a => a.type === 'checking' || a.type === 'savings'),
    Credit:      accounts.filter(a => a.type === 'credit'),
    Investments: accounts.filter(a => a.type === 'investment'),
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.42)', zIndex: 200, animation: 'v2DrawerFade .28s ease', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', borderLeft: `1px solid ${C.border}`, boxShadow: '-12px 0 36px rgba(17,24,39,.18)', zIndex: 201, animation: 'v2DrawerSlide .42s cubic-bezier(.22,1,.36,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 15, color: C.gray900 }}>All accounts</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{accounts.length} connected · as-of today</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn variant="outline" size="sm">Manage connections</Btn>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 18px' }}>
          {Object.entries(groups).map(([groupName, items]) => items.length === 0 ? null : (
            <div key={groupName} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>
                {groupName} <span style={{ color: C.gray700 }}>· {items.length}</span>
              </div>
              {items.map((a, idx) => {
                const isCredit = a.type === 'credit';
                const utilPct  = isCredit && a.limit ? Math.round((Math.abs(a.balance) / a.limit) * 100) : null;
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: idx < items.length - 1 ? `1px solid ${C.gray50}` : 'none' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: isCredit ? C.primary50 : 'rgba(22,163,74,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={isCredit ? 'dollar' : a.type === 'investment' ? 'trending' : 'bank'} size={14} color={isCredit ? C.primary : a.type === 'investment' ? '#1e40af' : '#16a34a'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.gray900 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                        {a.type}{isCredit && utilPct !== null ? ` · ${utilPct}% utilized` : ''}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 14, fontWeight: 700, color: a.balance < 0 ? '#dc2626' : C.gray900, flexShrink: 0 }}>
                      {a.balance < 0 ? '−' : ''}{fmt(Math.abs(a.balance))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ── SpendingCard ───────────────────────────────────────────────────────────────
const SpendingCard: React.FC<{ loading?: boolean; categories: CategoryRow[]; fmt: (n: number) => string }> = ({ loading, categories, fmt }) => {
  const totalSpend = categories.reduce((s, c) => s + c.amount, 0);
  return (
    <div style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase' }}>
          Spending{!loading && totalSpend > 0 ? ` · ${fmt(totalSpend)}` : ''}
        </div>
        <button style={{ fontSize: 10, fontWeight: 700, color: C.primary, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Lato,sans-serif', padding: 0 }}>View all →</button>
      </div>
      {loading ? [1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ marginBottom: 11 }}>
          <Skeleton w={100} h={9} />
          <Skeleton w="100%" h={5} style={{ marginTop: 5, borderRadius: 3 }} />
        </div>
      )) : categories.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, padding: '4px 0' }}>No spending data for this period</div>
      ) : categories.map(c => {
        const pct = totalSpend > 0 ? Math.round((c.amount / totalSpend) * 100) : 0;
        return (
          <div key={c.name} style={{ marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.gray700, fontWeight: 500 }}>{c.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: C.muted }}>{pct}%</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.gray900 }}>{fmt(c.amount)}</span>
              </div>
            </div>
            <div style={{ height: 5, background: C.gray100, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: 3, transition: 'width .4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── PositionBand ───────────────────────────────────────────────────────────────
const PositionBand: React.FC<{ data: PositionData; loading: boolean; fmt: (n: number) => string; onOpenAccountsDrawer: () => void }> = ({ data, loading, fmt, onOpenAccountsDrawer }) => {
  const accounts = data.accounts;
  const showMore = accounts.length > 4;
  const inline   = showMore ? accounts.slice(0, 3) : accounts.slice(0, 4);
  const overflow = showMore ? accounts.length - 3 : 0;
  const assetPct = data.assets + data.liabilities > 0
    ? Math.round((data.assets / (data.assets + data.liabilities)) * 100) : 0;

  return (
    <div>
      <BandHeader label="Position" period="as-of today" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <StatTile loading={loading} label="Net Cash"     value={fmt(data.netCash)}  sub="Bank accounts" cta="View transactions" positive={true} />
        <StatTile loading={loading} label="Card Balance" value={fmt(data.cardDebt)} sub="Total owed"     cta="View cards"        positive={false} />
        {loading ? (
          <div style={{ ...card, padding: '10px 14px' }}>
            <Skeleton w={80} h={9} />
            <Skeleton w={110} h={22} style={{ marginTop: 6 }} />
            <Skeleton w="100%" h={4} style={{ marginTop: 8 }} />
          </div>
        ) : (
          <NetWorthTile netWorth={data.netWorth} assets={data.assets} liabilities={data.liabilities} assetPct={assetPct} fmt={fmt} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, minWidth: 0, alignItems: 'stretch' }}>
        {loading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} w="100%" h={48} r={8} />)
        ) : (
          <>
            {inline.map(a => (
              <AccountChip key={a.id} a={a} fmt={fmt} onClick={onOpenAccountsDrawer} />
            ))}
            {showMore ? (
              <MoreChip count={overflow} onClick={onOpenAccountsDrawer} />
            ) : (
              <ViewAllButton onClick={onOpenAccountsDrawer} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

const NetWorthTile: React.FC<{ netWorth: number; assets: number; liabilities: number; assetPct: number; fmt: (n: number) => string }> = ({ netWorth, assets, liabilities, assetPct, fmt }) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...card, padding: '10px 14px', cursor: 'pointer', boxShadow: hov ? hoverCard.boxShadow : card.boxShadow, borderColor: hov ? hoverCard.borderColor : C.border, transition: 'box-shadow .15s, border-color .15s' }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: C.muted, textTransform: 'uppercase' }}>Net Worth</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
        <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 22, fontWeight: 700, color: C.gray900 }}>{fmt(netWorth)}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>+{fmt(assets)}</span>
          <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>−{fmt(liabilities)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
        <div style={{ width: `${assetPct}%`, background: '#16a34a' }} />
        <div style={{ flex: 1, background: '#fca5a5' }} />
      </div>
    </div>
  );
};

const ViewAllButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...card, padding: '8px 12px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: hov ? C.primary50 : '#fff', borderStyle: 'dashed', borderColor: hov ? C.primary : C.primary100, fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: 'Lato,sans-serif', transition: 'background .15s, border-color .15s' } as React.CSSProperties}
    >
      View all <Icon name="arrowRight" size={11} color={C.primary} />
    </button>
  );
};

// ── PersonalAgentInbox ────────────────────────────────────────────────────────
const PersonalAgentInbox: React.FC<{ loading?: boolean; data: PositionData; fmt: (n: number) => string; onLaunchAgent: (goal: string) => void }> = ({ loading, data, fmt, onLaunchAgent }) => {
  const [tab, setTab]           = useState<'review' | 'high' | 'resolved'>('review');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const actions      = data.pendingActions;
  const pending      = actions.filter(a => !approved.has(a.id) && !rejected.has(a.id));
  const highConf     = pending.filter(a => a.confidence === 'high');
  const resolvedList = actions.filter(a => approved.has(a.id) || rejected.has(a.id));
  const allClear     = !loading && pending.length === 0;

  const approve = (id: string) => { setApproved(s => new Set([...s, id])); setSelected(s => { const n = new Set(s); n.delete(id); return n; }); };
  const reject  = (id: string) => { setRejected(s => new Set([...s, id])); setSelected(s => { const n = new Set(s); n.delete(id); return n; }); };
  const toggle  = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const displayed = tab === 'review' ? pending : tab === 'high' ? highConf : resolvedList;
  const isEmpty   = !loading && actions.length === 0;

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(isEmpty ? {} : { minHeight: 320 }) }}>
      {/* Banner */}
      <div style={{ padding: '10px 16px', borderBottom: isEmpty ? 'none' : `1px solid ${C.gray100}`, background: allClear ? '#f0fdf4' : '#fff7ed', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: allClear ? 'rgba(22,163,74,.12)' : 'rgba(249,115,22,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={allClear ? 'checkCircle' : 'clock'} size={15} color={allClear ? '#16a34a' : '#f97316'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray900 }}>
            {loading ? 'Loading...' : allClear ? 'All actions reviewed' : `${pending.length} action${pending.length !== 1 ? 's' : ''} awaiting your review`}
          </div>
          {!isEmpty && (
            <div style={{ display: 'flex', gap: 12, marginTop: 3, alignItems: 'center' }}>
              {[
                { icon: 'tag',     val: data.uncategorized, label: 'uncategorized', color: '#f59e0b' },
                { icon: 'refresh', val: data.unreconciled,  label: 'unreconciled',  color: '#3b82f6' },
              ].map(w => (
                <button key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, fontFamily: 'Lato,sans-serif' }}>
                  <Icon name={w.icon} size={10} color={w.color} />
                  <span style={{ fontSize: 10, color: C.muted }}>
                    <strong style={{ color: C.gray700, fontWeight: 700 }}>{w.val}</strong> {w.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {selected.size > 0 && (
            <Btn variant="primary" size="sm" onClick={() => selected.forEach(id => approve(id))}>Approve {selected.size} selected</Btn>
          )}
          {highConf.length > 0 && selected.size === 0 && !allClear && (
            <Btn variant="success" size="sm" onClick={() => highConf.forEach(a => approve(a.id))}>Approve all high-confidence ({highConf.length})</Btn>
          )}
          <button style={{ fontSize: 11, fontWeight: 600, color: C.primary, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Lato,sans-serif' }} onClick={() => onLaunchAgent('')}>View workbench →</button>
        </div>
      </div>

      {!isEmpty && (
        <>
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.gray100}`, padding: '0 16px', background: '#fff' }}>
            {([
              { id: 'review'   as const, label: 'Needs Review',    count: pending.length },
              { id: 'high'     as const, label: 'High Confidence', count: highConf.length },
              { id: 'resolved' as const, label: 'Resolved',        count: resolvedList.length },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 14px', border: 'none', borderBottom: tab === t.id ? `2px solid ${C.primary}` : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? C.primary : C.muted, fontFamily: 'Lato,sans-serif', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 5 }}>
                {t.label}
                {t.count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9999, background: tab === t.id ? C.primary : C.gray200, color: tab === t.id ? '#fff' : C.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? [1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${C.gray50}` }}>
                <Skeleton w={14} h={14} r={3} />
                <Skeleton w={200} h={12} />
                <Skeleton w={60} h={20} r={10} style={{ marginLeft: 'auto' }} />
                <Skeleton w={60} h={28} r={6} />
              </div>
            )) : displayed.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', color: C.muted, gap: 8 }}>
                <Icon name={tab === 'resolved' ? 'checkCircle' : 'inbox'} size={22} />
                <div style={{ fontSize: 13 }}>{tab === 'resolved' ? 'No resolved actions yet' : 'Nothing to review right now'}</div>
              </div>
            ) : displayed.map(a => {
              const sel        = selected.has(a.id);
              const isApproved = approved.has(a.id);
              const isRejected = rejected.has(a.id);
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.gray50}`, background: sel ? C.primary50 : '#fff', opacity: isApproved || isRejected ? 0.5 : 1, transition: 'background .1s, opacity .2s' }}>
                  <input type="checkbox" checked={sel} onChange={() => toggle(a.id)} style={{ width: 14, height: 14, accentColor: C.primary, cursor: 'pointer', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.gray900 }}>{a.desc}</span>
                      <Badge variant={confidenceVariant[a.confidence]} label={confidenceLabel[a.confidence] + ' confidence'} size="xs" />
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      → <strong style={{ color: C.gray700 }}>{a.category}</strong>
                      {a.from && <><span style={{ margin: '0 6px', color: C.gray200 }}>·</span>{a.from}</>}
                      {a.amount > 0 && <><span style={{ margin: '0 6px', color: C.gray200 }}>·</span>{fmt(a.amount)}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Btn variant="outlineDanger" size="sm" onClick={() => reject(a.id)}  disabled={isRejected || isApproved}>Reject</Btn>
                    <Btn variant="primary"       size="sm" onClick={() => approve(a.id)} disabled={isRejected || isApproved}>Approve</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ── ActivityBand ───────────────────────────────────────────────────────────────
const ActivityBand: React.FC<{
  activityData:    ActivityData;
  activityLoading: boolean;
  positionData:    PositionData;
  positionLoading: boolean;
  selectedFY:      FinancialYearOption;
  selectedMonth:   MonthOption | null;
  monthOptions:    MonthOption[];
  fyType?:         string;
  fmt:             (n: number) => string;
  onFYChange:      (fy: FinancialYearOption) => void;
  onMonthChange:   (m: MonthOption | null) => void;
  onLaunchAgent:   (goal: string) => void;
}> = ({ activityData, activityLoading, positionData, positionLoading, selectedFY, selectedMonth, monthOptions, fyType, fmt, onFYChange, onMonthChange, onLaunchAgent }) => {
  const periodLabel = selectedMonth
    ? `${selectedMonth.label} · ${selectedFY.label}`
    : selectedFY.label;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <BandHeader label="Activity" period={periodLabel}>
        <FinancialYearSelector
          fyType={fyType}
          value={selectedFY.value}
          onChange={onFYChange}
          className="h-7 border-slate-300 text-xs shrink-0 w-[120px]"
        />
        <Select
          value={selectedMonth?.value ?? '__all__'}
          onValueChange={(v) => onMonthChange(v === '__all__' ? null : (monthOptions.find((m) => m.value === v) ?? null))}
        >
          <SelectTrigger className="h-7 border-slate-300 text-xs shrink-0 w-[130px]">
            <SelectValue placeholder="All Months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Months</SelectItem>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </BandHeader>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatTile loading={activityLoading} label="Net This Period" value={fmt(Math.abs(activityData.net))} sub="Income − Expenses" cta="Explain" positive={activityData.net >= 0} />
        <StatTile loading={activityLoading} label="Savings Rate"    value={`${activityData.savingsRate}%`}  sub="Net / Income"      cta="Improve" positive={true} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '58fr 42fr', gap: 10, alignItems: 'flex-start' }}>
        <PersonalAgentInbox loading={positionLoading} data={positionData} fmt={fmt} onLaunchAgent={onLaunchAgent} />
        <SpendingCard loading={activityLoading} categories={activityData.categories} fmt={fmt} />
      </div>
    </div>
  );
};

// ── Command Strip ─────────────────────────────────────────────────────────────
const PersonalCommandStrip: React.FC<{ uncategorized: number; onLaunchAgent: (goal: string) => void }> = ({ uncategorized, onLaunchAgent }) => {
  const [goal, setGoal]             = useState('');
  const [focused, setFocused]       = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const chips = [
    { label: 'Categorize expenses', hint: 'Categorize all uncategorized transactions for the selected period.' },
    { label: 'Reconcile accounts',  hint: 'Reconcile bank transactions for the selected period.' },
    { label: 'Review spending',     hint: 'Analyse spending patterns and flag anomalies for the selected period.' },
    { label: 'Explain income',      hint: 'Explain income sources and trends for the selected period.' },
  ];

  const showChips = focused || !!activeChip;
  const pickChip  = (c: { label: string; hint: string }) => {
    if (activeChip === c.label) { setActiveChip(null); setGoal(''); return; }
    setActiveChip(c.label); setGoal(c.hint);
  };

  return (
    <div style={{ position: 'relative' }}>
      {showChips && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px 8px 0 0', borderBottom: 'none', padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="zap" size={11} color={C.muted} />
          {chips.map(c => (
            <Chip key={c.label} label={c.label} active={activeChip === c.label} onClick={() => pickChip(c)} />
          ))}
        </div>
      )}
      <div style={{ background: '#fff', border: `1px solid ${focused ? C.primary : C.border}`, borderRadius: showChips ? '0 0 8px 8px' : 8, boxShadow: focused ? `0 0 0 3px ${C.primary50}` : '0 1px 2px rgba(0,0,0,.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, transition: 'border-color .15s, box-shadow .15s, border-radius .1s' }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: C.primary50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkles" size={14} color={C.primary} />
        </div>
        <input
          value={goal} onChange={e => setGoal(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter' && goal.trim()) { onLaunchAgent(goal); setGoal(''); } }}
          placeholder="What do you want to do today?"
          style={{ flex: 1, fontFamily: 'Lato,sans-serif', fontSize: 13, border: 'none', outline: 'none', color: C.gray900, background: 'transparent' }}
        />
        {!goal && uncategorized > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 12, borderRight: `1px solid ${C.gray100}`, flexShrink: 0 }}>
            <Icon name="sparkles" size={11} color="#f59e0b" />
            <span style={{ fontSize: 11, color: '#854d0e', fontWeight: 600 }}>{uncategorized} transactions need categorizing</span>
          </div>
        )}
        <Btn variant="primary" size="md" disabled={!goal.trim()} onClick={() => { onLaunchAgent(goal); setGoal(''); }}>Launch session</Btn>
      </div>
    </div>
  );
};

// ── Personal Dashboard shell ───────────────────────────────────────────────────
interface PersonalDashboardProps {
  fyType?:       string;
  onLaunchAgent: (goal: string) => void;
}

export const PersonalDashboard: React.FC<PersonalDashboardProps> = ({ fyType, onLaunchAgent }) => {
  const { currentEntity, currentEntityId } = useEntity();
  const currencyCode = currentEntity?.currency?.code ?? 'INR';
  const fmt = (n: number) => formatCurrency(n, currencyCode);

  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() =>
    getPreviousFYOption((fyType as FinancialYearType) ?? 'JAN_DEC')
  );
  const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);

  useEffect(() => {
    setSelectedFY(getPreviousFYOption((fyType as FinancialYearType) ?? 'JAN_DEC'));
    setSelectedMonth(null);
  }, [fyType]);

  const monthOptions = useMemo(() => buildMonthOptions(selectedFY), [selectedFY]);
  const handleFYChange = (opt: FinancialYearOption) => { setSelectedFY(opt); setSelectedMonth(null); };

  const fromDate = selectedMonth?.from_date ?? selectedFY.from_date;
  const toDate   = selectedMonth?.to_date   ?? selectedFY.to_date;

  const { data: positionData, loading: positionLoading } = usePositionData(currentEntityId, fyType);
  const { data: activityData, loading: activityLoading } = useActivityData(fromDate, toDate, currentEntityId);

  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PositionBand
        data={positionData}
        loading={positionLoading}
        fmt={fmt}
        onOpenAccountsDrawer={() => setDrawerOpen(true)}
      />

      <ActivityBand
        activityData={activityData}
        activityLoading={activityLoading}
        positionData={positionData}
        positionLoading={positionLoading}
        selectedFY={selectedFY}
        selectedMonth={selectedMonth}
        monthOptions={monthOptions}
        fyType={fyType}
        fmt={fmt}
        onFYChange={handleFYChange}
        onMonthChange={setSelectedMonth}
        onLaunchAgent={onLaunchAgent}
      />

      <PersonalCommandStrip uncategorized={positionData.uncategorized} onLaunchAgent={onLaunchAgent} />

      <AccountsDrawer
        open={drawerOpen}
        accounts={positionData.accounts}
        fmt={fmt}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};
