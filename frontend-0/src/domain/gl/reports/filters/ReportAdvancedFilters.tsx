import { useMemo, useState, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

export function ReportAdvancedFilters({
  children,
  summary,
  className,
  defaultOpen = false,
}: {
  children: ReactNode;
  summary?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggleLabel = useMemo(() => (open ? 'Hide Advanced options' : 'Advanced options'), [open]);

  return (
    <div className={cn('mt-2.5 border-t border-slate-100 pt-2.5', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="text-sm font-medium text-[#7D23B2] transition-colors hover:text-[#5b1a8a] hover:underline"
        >
          {toggleLabel}
        </button>
        {!open && summary ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Show advanced options"
            className="flex flex-wrap items-center gap-1.5 rounded-md text-left text-xs text-slate-500 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            {summary}
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          className={cn(
            'mt-3 rounded-lg border border-violet-100/80 bg-gradient-to-br from-violet-50/50 via-white to-slate-50',
            'p-4 shadow-sm animate-in fade-in-0 slide-in-from-top-1 duration-200'
          )}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function ReportAdvancedSummaryChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex cursor-pointer items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600',
        'hover:border-violet-300 hover:bg-violet-50/80',
        className
      )}
    >
      {children}
    </span>
  );
}

export function ReportActivityFilterField({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <ReportAdvancedField
      label="Rows"
      hint="When on, accounts with no movement or balance in the period are hidden."
      className="md:col-span-3"
    >
      <div className="flex min-h-9 items-center gap-2">
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-700">
          Show only rows with activity
        </Label>
      </div>
    </ReportAdvancedField>
  );
}
