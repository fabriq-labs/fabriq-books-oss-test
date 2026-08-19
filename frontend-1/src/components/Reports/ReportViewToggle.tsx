import { cn } from "@/lib/utils";

export type ReportViewMode = "Summary" | "Details";

/** Compact segmented control for table density. Lives on the results pane, not in filters. */
export function ReportViewToggle({
  value,
  onChange,
  className,
}: {
  value: ReportViewMode;
  onChange: (next: ReportViewMode) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs font-medium text-slate-500">View</span>
      <div
        role="group"
        aria-label="Report view"
        className="inline-flex rounded-md border border-slate-200 bg-white p-0.5"
      >
        <button
          type="button"
          onClick={() => onChange("Summary")}
          aria-pressed={value === "Summary"}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === "Summary"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          )}
        >
          Summary
        </button>
        <button
          type="button"
          onClick={() => onChange("Details")}
          aria-pressed={value === "Details"}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === "Details"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          )}
        >
          Detailed
        </button>
      </div>
    </div>
  );
}
