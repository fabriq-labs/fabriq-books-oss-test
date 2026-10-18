import { useMemo, useState, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function ReportAdvancedField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ReportAdvancedSummaryChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  );
}

export function ReportAdvancedFilters({
  children,
  summary,
}: {
  children: ReactNode;
  summary?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggleLabel = useMemo(() => (open ? 'Hide advanced options' : 'Advanced options'), [open]);

  return (
    <div className="mt-2.5 border-t border-slate-100 pt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {toggleLabel}
        </button>
        {!open && summary ? (
          <button type="button" onClick={() => setOpen(true)} className="flex flex-wrap items-center gap-1.5 text-left">
            {summary}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
