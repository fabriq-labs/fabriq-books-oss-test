import React from 'react';
import type { PendingAction } from '@/contexts/AgentSessionContext';
import { CategorizeTransactionDetail } from './CategorizeTransactionDetail';
import { Tag, BookOpen, RefreshCw, HelpCircle, FileText } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

export interface ActionRowSummary {
  primary: string;       // main description line
  secondary?: string;    // sub-line (e.g. "→ Office Supplies")
  amount?: string;       // formatted amount if relevant
}

export interface ActionDetailProps {
  action: PendingAction;
}

export interface ActionTypeEntry {
  label: string;
  icon: React.ElementType;
  badgeClass: string;    // Tailwind classes for the type badge
  renderRowSummary: (action: PendingAction) => ActionRowSummary;
  DetailComponent: React.ComponentType<ActionDetailProps>;
}

// ── Helpers ────────────────────────────────────────────────────

function formatAmount(amount: number | string | null | undefined, currency = 'INR'): string {
  if (amount == null) return '';
  const n = Number(amount);
  if (isNaN(n)) return '';
  const locale = currency === 'CAD' ? 'en-CA' : 'en-IN';
  return n.toLocaleString(locale, { style: 'currency', currency, maximumFractionDigits: 2 });
}

// ── Generic fallback ───────────────────────────────────────────

const GenericDetail: React.ComponentType<ActionDetailProps> = ({ action }) =>
  React.createElement('div', { className: 'p-5 space-y-3' },
    React.createElement('p', { className: 'text-sm font-semibold text-gray-700' }, action.title),
    action.description && React.createElement('p', { className: 'text-xs text-gray-500' }, action.description),
    React.createElement('pre', { className: 'text-xs text-gray-600 bg-gray-50 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all' },
      JSON.stringify(action.payload, null, 2)
    )
  );

// ── Registry ───────────────────────────────────────────────────

const REGISTRY: Record<string, ActionTypeEntry> = {

  categorize_transaction: {
    label: 'Categorise',
    icon: Tag,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    renderRowSummary: (action) => {
      const p = action.payload as any;
      return {
        amount: formatAmount(p.amount, p.currency || 'INR'),
      };
    },
    DetailComponent: CategorizeTransactionDetail,
  },

  approve_tax_package: {
    label: 'Tax package',
    icon: FileText,
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    renderRowSummary: (action) => {
      const p = action.payload as any;
      return {
        primary: action.title,
        secondary: p.recipient
          ? `TY ${p.tax_year || ''} · ${p.recipient}`
          : action.description ?? undefined,
      };
    },
    DetailComponent: GenericDetail,
  },

  create_posting: {
    label: 'Book',
    icon: BookOpen,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    renderRowSummary: (action) => {
      const p = action.payload as any;
      return {
        primary: p.description || action.title,
        secondary: p.account_name ? `→ ${p.account_name}` : undefined,
        amount: formatAmount(p.amount),
      };
    },
    DetailComponent: GenericDetail,
  },

  reconcile_posting: {
    label: 'Reconcile',
    icon: RefreshCw,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    renderRowSummary: (action) => ({
      primary: action.title,
      secondary: action.description ?? undefined,
    }),
    DetailComponent: GenericDetail,
  },
};

const FALLBACK: ActionTypeEntry = {
  label: 'Action',
  icon: HelpCircle,
  badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  renderRowSummary: (action) => ({ primary: action.title, secondary: action.description ?? undefined }),
  DetailComponent: GenericDetail,
};

export function getActionType(actionType: string): ActionTypeEntry {
  return REGISTRY[actionType] ?? FALLBACK;
}

export { formatAmount };
