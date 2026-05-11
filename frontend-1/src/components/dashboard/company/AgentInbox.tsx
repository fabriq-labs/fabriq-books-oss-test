// Layer 3 — Agent Inbox + Edit & Approve Drawer
// Converted from dashboard-inbox.jsx (handoff).
// TODO: Replace makeMockActions() with real pending actions from useAgentSession().

import React, { useState, useCallback } from 'react';
import { C, card, Icon, Badge, Btn, Skeleton, Select, confidenceVariant, confidenceLabel, ACTION_TYPES } from '../design-system';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Action {
  id: string;
  action_type: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected';
  rationale: string;
  account: string;
  counterparty: string;
  amount: string;
  date: string;
  session: string;
  session_id: string;
  created_at: string;
}

// ── Mock data ─────────────────────────────────────────────────────────────────
// TODO: replace with real pending actions from useAgentSession()

const makeMockActions = (): Action[] => [
  { id:'a1', action_type:'categorize_transaction', confidence:'low',    status:'pending',  rationale:'Merchant "Zomato Biz" matches food & beverage but also travel. Needs your call.', account:'Food & Beverage',              counterparty:'Zomato Business',       amount:'₹4,200',    date:'Apr 22', session:'Categorise expenses — Apr', session_id:'s1', created_at: new Date(Date.now()-1000*60*35).toISOString() },
  { id:'a2', action_type:'reconcile_posting',      confidence:'medium', status:'pending',  rationale:'Bank line matches within ₹50 tolerance — possible bank charge difference.',       account:'HDFC Current A/C',             counterparty:'Client Alpha Ltd',      amount:'₹45,000',   date:'Apr 21', session:'Reconcile bank — Mar',       session_id:'s2', created_at: new Date(Date.now()-1000*60*90).toISOString() },
  { id:'a3', action_type:'send_email',             confidence:'low',    status:'pending',  rationale:'Invoice INV-0048 is 38 days overdue. Draft follow-up email ready for review.',   account:'AR — Client Beta',             counterparty:'Beta Solutions Pvt Ltd',amount:'₹82,500',   date:'Mar 14', session:'AR Follow-ups draft',        session_id:'s3', created_at: new Date(Date.now()-1000*60*120).toISOString() },
  { id:'a4', action_type:'categorize_transaction', confidence:'high',   status:'pending',  rationale:'AWS India charges match "Cloud Infrastructure" account with 98% confidence.',    account:'Cloud Infrastructure',         counterparty:'Amazon Web Services',   amount:'₹12,400',   date:'Apr 22', session:'Categorise expenses — Apr', session_id:'s1', created_at: new Date(Date.now()-1000*60*20).toISOString() },
  { id:'a5', action_type:'categorize_transaction', confidence:'high',   status:'pending',  rationale:'Recurring Razorpay fee — matches "Payment Gateway Charges" account.',            account:'Payment Gateway Charges',      counterparty:'Razorpay',              amount:'₹1,840',    date:'Apr 21', session:'Categorise expenses — Apr', session_id:'s1', created_at: new Date(Date.now()-1000*60*22).toISOString() },
  { id:'a6', action_type:'reconcile_posting',      confidence:'high',   status:'pending',  rationale:'Exact match on reference number REF-882291 in bank statement.',                  account:'HDFC Current A/C',             counterparty:'Vendor Corp',           amount:'₹28,000',   date:'Apr 20', session:'Reconcile bank — Mar',       session_id:'s2', created_at: new Date(Date.now()-1000*60*40).toISOString() },
  { id:'a7', action_type:'create_posting',         confidence:'high',   status:'pending',  rationale:'Advance payment received from Gamma Inc — credit to advances account.',          account:'Advances from Customers',      counterparty:'Gamma Inc',             amount:'₹1,50,000', date:'Apr 19', session:'Categorise expenses — Apr', session_id:'s1', created_at: new Date(Date.now()-1000*60*55).toISOString() },
  { id:'a8', action_type:'categorize_transaction', confidence:'medium', status:'pending',  rationale:'Swiggy charge — likely office meals but could be team event. Verify category.',  account:'Staff Welfare / Meals',        counterparty:'Swiggy for Business',   amount:'₹6,300',    date:'Apr 20', session:'Categorise expenses — Apr', session_id:'s1', created_at: new Date(Date.now()-1000*60*80).toISOString() },
  { id:'r1', action_type:'categorize_transaction', confidence:'high',   status:'approved', rationale:'Matched Google Workspace subscription.',                                          account:'SaaS Subscriptions',           counterparty:'Google India',          amount:'₹8,580',    date:'Apr 22', session:'Categorise expenses — Apr', session_id:'s1', created_at: new Date(Date.now()-1000*60*180).toISOString() },
  { id:'r2', action_type:'reconcile_posting',      confidence:'medium', status:'rejected', rationale:'Amount mismatch after deduction.',                                                account:'HDFC Current A/C',             counterparty:'Delta Traders',         amount:'₹14,200',   date:'Apr 21', session:'Reconcile bank — Mar',       session_id:'s2', created_at: new Date(Date.now()-1000*60*200).toISOString() },
  { id:'r3', action_type:'create_posting',         confidence:'high',   status:'approved', rationale:'Salary advance — Raj Menon, payable entry.',                                     account:'Salary Advances',              counterparty:'Raj Menon',             amount:'₹25,000',   date:'Apr 20', session:'Categorise expenses — Apr', session_id:'s1', created_at: new Date(Date.now()-1000*60*220).toISOString() },
];

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Edit & Approve Drawer ─────────────────────────────────────────────────────

const ACCOUNTS = ['Food & Beverage','Office Supplies','Cloud Infrastructure','SaaS Subscriptions','Staff Welfare / Meals','Payment Gateway Charges','Salary Advances','Advances from Customers','Travel & Entertainment'];

interface DrawerProps {
  action: Action | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const EditApproveDrawer: React.FC<DrawerProps> = ({ action, onClose, onApprove, onReject }) => {
  const [note, setNote] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(action?.account || '');
  if (!action) return null;
  const meta = ACTION_TYPES[action.action_type] ?? ACTION_TYPES.categorize_transaction;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,.25)' }} />
      <div style={{ width: 440, background: '#fff', borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 24px rgba(0,0,0,.1)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 14, color: C.gray900 }}>Edit &amp; Approve</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{meta.label} · {action.counterparty}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <Badge label={confidenceLabel[action.confidence] + ' confidence'} variant={confidenceVariant[action.confidence]} />
            <span style={{ fontSize: 11, color: C.muted }}>· {formatAge(action.created_at)}</span>
          </div>
          <div style={{ background: C.gray50, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Why suggested</div>
            <div style={{ fontSize: 13, color: C.gray700 }}>{action.rationale}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Transaction details</div>
            {[
              { label: 'Counterparty', val: action.counterparty },
              { label: 'Amount',       val: action.amount },
              { label: 'Date',         val: action.date },
              { label: 'Session',      val: action.session },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, color: C.muted }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.gray700 }}>{r.val}</span>
              </div>
            ))}
          </div>
          {(action.action_type === 'categorize_transaction' || action.action_type === 'create_posting') && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Account</div>
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
                style={{ width: '100%', height: 34, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 8px', fontSize: 13, fontFamily: 'Lato,sans-serif', color: C.gray700, background: '#fff', outline: 'none' }}>
                {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Resolution note <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></div>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…"
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'Lato,sans-serif', color: C.gray700, resize: 'vertical', minHeight: 72, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
          <Btn variant="success" onClick={() => onApprove(action.id)} style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="check" size={14} /> Approve
          </Btn>
          <Btn variant="outlineDanger" onClick={() => onReject(action.id)} style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="x" size={14} /> Reject
          </Btn>
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
};

// ── Inbox Card ────────────────────────────────────────────────────────────────

const ACTION_BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  categorize_transaction: { bg: '#f5ebf9', text: '#7028a0', border: '#d1a9e4' },
  reconcile_posting:      { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  create_posting:         { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  send_email:             { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
};

interface InboxCardProps {
  action: Action;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (action: Action) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}

const InboxCard: React.FC<InboxCardProps> = ({ action, onApprove, onReject, onEdit, selected, onSelect }) => {
  const [hov, setHov] = useState(false);
  const meta = ACTION_TYPES[action.action_type] ?? ACTION_TYPES.categorize_transaction;
  const isPending = action.status === 'pending';
  const bc = ACTION_BADGE_COLORS[action.action_type] ?? ACTION_BADGE_COLORS.send_email;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: selected ? '#f0f9ff' : hov ? C.gray50 : '#fff', borderBottom: `1px solid ${C.border}`, padding: '12px 16px', transition: 'background .1s' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {isPending
          ? <input type="checkbox" checked={selected} onChange={() => onSelect(action.id)} style={{ marginTop: 3, flexShrink: 0, accentColor: C.primary, cursor: 'pointer' }} />
          : <div style={{ width: 16, flexShrink: 0 }} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ background: bc.bg, color: bc.text, border: `1px solid ${bc.border}`, borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{meta.label}</span>
            <Badge label={confidenceLabel[action.confidence]} variant={confidenceVariant[action.confidence]} size="xs" />
            {!isPending && <Badge label={action.status === 'approved' ? 'Approved' : 'Rejected'} variant={action.status === 'approved' ? 'green' : 'red'} size="xs" />}
            <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>{formatAge(action.created_at)}</span>
          </div>
          <div style={{ fontSize: 12, color: C.gray700, marginBottom: 5, lineHeight: 1.4 }}>{action.rationale}</div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.muted, flexWrap: 'wrap' }}>
            <span><span style={{ color: C.gray700, fontWeight: 500 }}>{action.counterparty}</span></span>
            <span style={{ fontWeight: 600, color: C.gray900 }}>{action.amount}</span>
            <span>{action.date}</span>
            <span style={{ marginLeft: 'auto', color: C.primary, cursor: 'pointer', fontWeight: 500 }}>↗ {action.session}</span>
          </div>
        </div>
        {isPending && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 4 }}>
            <Btn variant="outlineSuccess" size="sm" onClick={() => onApprove(action.id)} style={{ fontSize: 11, padding: '0 8px', height: 26 }}>
              <Icon name="check" size={11} /> Approve
            </Btn>
            <Btn variant="outlineDanger" size="sm" onClick={() => onReject(action.id)} style={{ fontSize: 11, padding: '0 8px', height: 26 }}>
              <Icon name="x" size={11} /> Reject
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => onEdit(action)} style={{ fontSize: 11, padding: '0 8px', height: 26 }} title="Edit & Approve">
              <Icon name="edit" size={11} />
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Filter Bar ────────────────────────────────────────────────────────────────

interface Filters { type: string; confidence: string; session: string; }

const FilterBar: React.FC<{ filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>> }> = ({ filters, setFilters }) => (
  <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: `1px solid ${C.border}`, background: C.gray50, flexWrap: 'wrap', alignItems: 'center' }}>
    <Select value={filters.type} onChange={v => setFilters(f => ({...f, type: v}))} style={{ fontSize: 12, height: 28 }}
      options={[{ value:'', label:'All types' },{ value:'categorize_transaction', label:'Categorise' },{ value:'reconcile_posting', label:'Reconcile' },{ value:'create_posting', label:'Book' },{ value:'send_email', label:'Send email' }]} />
    <Select value={filters.confidence} onChange={v => setFilters(f => ({...f, confidence: v}))} style={{ fontSize: 12, height: 28 }}
      options={[{ value:'', label:'All confidence' },{ value:'high', label:'High' },{ value:'medium', label:'Medium' },{ value:'low', label:'Low' }]} />
    <Select value={filters.session} onChange={v => setFilters(f => ({...f, session: v}))} style={{ fontSize: 12, height: 28 }}
      options={[{ value:'', label:'All sessions' },{ value:'s1', label:'Categorise expenses' },{ value:'s2', label:'Reconcile bank' },{ value:'s3', label:'AR follow-ups' }]} />
  </div>
);

// ── Main Inbox ────────────────────────────────────────────────────────────────

interface AgentInboxProps {
  loading?: boolean;
  contextualSuggestion?: string;
  onLaunchAgent: (goal: string) => void;
}

export const AgentInbox: React.FC<AgentInboxProps> = ({ loading, contextualSuggestion, onLaunchAgent }) => {
  const [tab, setTab] = useState<'needs_review' | 'high_confidence' | 'recently_resolved'>('needs_review');
  const [allActions, setAllActions] = useState<Action[]>(makeMockActions());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editAction, setEditAction] = useState<Action | null>(null);
  const [filters, setFilters] = useState<Filters>({ type: '', confidence: '', session: '' });

  const approve = useCallback((id: string) => {
    setAllActions(a => a.map(x => x.id === id ? {...x, status: 'approved' as const} : x));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    setEditAction(null);
  }, []);

  const reject = useCallback((id: string) => {
    setAllActions(a => a.map(x => x.id === id ? {...x, status: 'rejected' as const} : x));
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    setEditAction(null);
  }, []);

  const bulkApprove = (ids: string[]) => { ids.forEach(approve); setSelected(new Set()); };
  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyFilters = (arr: Action[]) => arr.filter(a =>
    (!filters.type || a.action_type === filters.type) &&
    (!filters.confidence || a.confidence === filters.confidence) &&
    (!filters.session || a.session_id === filters.session)
  );

  const needsReview = applyFilters(allActions.filter(a => a.status === 'pending' && a.confidence !== 'high'));
  const highConf    = applyFilters(allActions.filter(a => a.status === 'pending' && a.confidence === 'high'));
  const resolved    = applyFilters(allActions.filter(a => a.status !== 'pending'));
  const current     = tab === 'needs_review' ? needsReview : tab === 'high_confidence' ? highConf : resolved;
  const highConfPendingIds = allActions.filter(a => a.status === 'pending' && a.confidence === 'high').map(a => a.id);

  const TABS = [
    { id: 'needs_review'      as const, label: 'Needs review',      count: allActions.filter(a => a.status==='pending' && a.confidence!=='high').length },
    { id: 'high_confidence'   as const, label: 'High confidence',   count: allActions.filter(a => a.status==='pending' && a.confidence==='high').length },
    { id: 'recently_resolved' as const, label: 'Recently resolved', count: allActions.filter(a => a.status!=='pending').length },
  ];

  const emptyMessages = {
    needs_review:      { icon: 'checkCircle', title: 'All caught up.',              sub: 'Launch an agent session from the command bar.' },
    high_confidence:   { icon: 'sparkles',    title: 'No bulk-ready actions.',      sub: 'High-confidence suggestions will appear here.' },
    recently_resolved: { icon: 'activity',    title: 'Nothing resolved in the last 24h.', sub: 'Resolved actions appear here.' },
  };

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 0', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 600, fontSize: 14, color: C.gray900 }}>Agent inbox</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {tab === 'high_confidence' && highConfPendingIds.length > 0 && (
              <Btn variant="outlineSuccess" size="sm" onClick={() => bulkApprove(highConfPendingIds)} style={{ fontSize: 11 }}>
                <Icon name="checkCircle" size={12} /> Approve all {highConfPendingIds.length} high-confidence
              </Btn>
            )}
            {selected.size > 0 && (
              <>
                <Btn variant="success" size="sm" onClick={() => bulkApprove([...selected])} style={{ fontSize: 11 }}>
                  <Icon name="check" size={12} /> Approve {selected.size}
                </Btn>
                <Btn variant="outlineDanger" size="sm" onClick={() => { [...selected].forEach(reject); setSelected(new Set()); }} style={{ fontSize: 11 }}>
                  <Icon name="x" size={12} /> Reject {selected.size}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setSelected(new Set())} style={{ fontSize: 11 }}>Clear</Btn>
              </>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSelected(new Set()); }}
              style={{ fontFamily: 'Lato,sans-serif', fontSize: 12, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? C.primary : C.muted, background: 'transparent', border: 'none', borderBottom: tab === t.id ? `2px solid ${C.primary}` : '2px solid transparent', padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'color .1s', marginBottom: -1 }}>
              {t.label}
              {t.count > 0 && <span style={{ background: tab === t.id ? C.primary : C.gray200, color: tab === t.id ? '#fff' : C.muted, borderRadius: 9999, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} />

      {/* Contextual suggestion */}
      {tab === 'needs_review' && contextualSuggestion && (
        <div style={{ margin: '10px 16px 0', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <Icon name="zap" size={13} color="#d97706" />
          <span style={{ color: '#92400e' }}>{contextualSuggestion}</span>
          <Btn variant="ghost" size="sm" onClick={() => onLaunchAgent('Categorise Expenses')} style={{ fontSize: 11, marginLeft: 'auto', color: C.primary }}>Launch →</Btn>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ padding: '12px 0' }}>
                <Skeleton h={12} w={120} style={{ marginBottom: 8 }} />
                <Skeleton h={14} style={{ marginBottom: 5 }} />
                <Skeleton h={10} w="70%" />
              </div>
            ))}
          </div>
        ) : current.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 8, color: C.muted }}>
            <Icon name={emptyMessages[tab].icon} size={32} color={C.gray200} />
            <div style={{ fontWeight: 600, fontSize: 13, color: C.gray700 }}>{emptyMessages[tab].title}</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>{emptyMessages[tab].sub}</div>
          </div>
        ) : (
          current.map(a => (
            <InboxCard key={a.id} action={a}
              onApprove={approve} onReject={reject} onEdit={setEditAction}
              selected={selected.has(a.id)} onSelect={toggleSelect} />
          ))
        )}
      </div>

      {editAction && (
        <EditApproveDrawer action={editAction} onClose={() => setEditAction(null)} onApprove={approve} onReject={reject} />
      )}
    </div>
  );
};
