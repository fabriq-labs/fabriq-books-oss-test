import { useMemo, useState, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ReportAdvancedFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function ReportAdvancedField({ label, hint, children, className }: ReportAdvancedFieldProps) {
  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-slate-500 leading-snug">{hint}</p> : null}
    </div>
  );
}

interface ReportAdvancedFiltersProps {
  children: ReactNode;
  /** Shown beside the toggle when collapsed — e.g. active filter summary */
  summary?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

export function ReportAdvancedFilters({
  children,
  summary,
  className,
  defaultOpen = false,
}: ReportAdvancedFiltersProps) {
  const [open, setOpen] = useState(defaultOpen);

  const toggleLabel = useMemo(
    () => (open ? "Hide Advanced options" : "Advanced options"),
    [open]
  );

  return (
    <div className={cn("mt-2.5 border-t border-slate-100 pt-2.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="text-sm font-medium text-[#7D23B2] hover:text-[#5b1a8a] hover:underline transition-colors"
        >
          {toggleLabel}
        </button>
        {!open && summary ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{summary}</div>
        ) : null}
      </div>

      {open ? (
        <div
          className={cn(
            "mt-3 rounded-lg border border-violet-100/80 bg-gradient-to-br from-violet-50/50 via-white to-slate-50",
            "p-4 shadow-sm animate-in fade-in-0 slide-in-from-top-1 duration-200"
          )}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Compact pill for collapsed advanced summary */
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
        "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600",
        className
      )}
    >
      {children}
    </span>
  );
}
