import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActionDetailProps } from './registry';

const confidenceBar: Record<string, { width: string; color: string }> = {
  high:   { width: 'w-full',   color: 'bg-green-400' },
  medium: { width: 'w-2/3',    color: 'bg-amber-400' },
  low:    { width: 'w-1/3',    color: 'bg-red-400'   },
};

const confidenceLabel: Record<string, string> = {
  high:   'text-green-700',
  medium: 'text-amber-700',
  low:    'text-red-700',
};

function formatAmount(amount: number | string | null | undefined): string {
  if (amount == null) return '';
  const n = Number(amount);
  return isNaN(n) ? '' : n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const CategorizeTransactionDetail: React.FC<ActionDetailProps> = ({ action }) => {
  const p = action.payload as {
    posting_id?: string;
    description?: string;
    amount?: number;
    value_date?: string | null;
    predicted_account_id?: string | null;
    predicted_account_name?: string | null;
    confidence_score?: number | null;
    reasoning?: string | null;
  };

  const confidence = action.confidence;
  const bar = confidenceBar[confidence] ?? confidenceBar.low;
  const scorePercent = p.confidence_score != null ? Math.round(p.confidence_score * 100) : null;

  return (
    <div className="p-5 space-y-5">
      {/* Transaction card */}
      <div className="rounded-lg border bg-gray-50 p-4 space-y-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Transaction</p>
        <p className="text-sm font-medium text-gray-800">{p.description || '—'}</p>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{formatDate(p.value_date)}</span>
          {p.amount != null && (
            <span className="font-semibold text-gray-700">{formatAmount(p.amount)}</span>
          )}
        </div>
      </div>

      {/* Prediction card */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">AI Prediction</p>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Category</span>
          <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
          <span className="text-sm font-semibold text-gray-800">
            {p.predicted_account_name || '—'}
          </span>
        </div>

        {/* Confidence bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Confidence</span>
            <span className={cn('font-semibold capitalize', confidenceLabel[confidence] ?? 'text-gray-600')}>
              {confidence}
              {scorePercent != null && ` (${scorePercent}%)`}
            </span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', bar.width, bar.color)} />
          </div>
        </div>

        {/* Reasoning */}
        {p.reasoning && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Reasoning</p>
            <p className="text-xs text-gray-600 leading-relaxed">{p.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
};
