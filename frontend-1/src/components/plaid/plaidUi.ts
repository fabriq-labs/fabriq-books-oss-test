/** Shared Plaid Link–inspired layout tokens (Fabriq-owned UI, not Plaid iframe). */
export const plaidUi = {
  modal:
    'relative w-full max-w-[420px] max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden',
  modalWide:
    'relative w-full max-w-[720px] max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden',
  overlay: 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]',
  progressDotActive: 'h-1 w-10 rounded-full bg-slate-900',
  progressDotInactive: 'h-1 w-10 rounded-full bg-slate-200',
  institutionBadge:
    'mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white text-sm font-bold',
  title: 'text-[22px] font-semibold text-slate-900 tracking-tight',
  subtitle: 'text-sm text-slate-500 leading-relaxed',
  accountRow:
    'w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/80',
  accountRowSelected: 'bg-slate-50',
  accountIcon:
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white',
  accountName: 'font-medium text-slate-900 text-[15px] truncate',
  accountMeta: 'text-xs text-slate-400 capitalize mt-0.5',
  balance: 'text-[15px] font-medium text-slate-900 tabular-nums shrink-0',
  primaryBtn:
    'w-full h-12 rounded-xl bg-[#111111] hover:bg-black text-white text-[15px] font-semibold shadow-none',
  footer: 'shrink-0 bg-[#1a1a1a] px-4 py-2 text-center',
  footerText: 'text-[11px] text-slate-400',
  card: 'rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden',
  cardHeader: 'px-5 py-4 border-b border-slate-100',
  listDivide: 'divide-y divide-slate-100',
} as const;
