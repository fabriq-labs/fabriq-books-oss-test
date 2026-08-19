import { Play } from "lucide-react";

/** Empty body shown until the user clicks Run report. */
export function ReportIdleState({
  onRun,
  disabled,
}: {
  onRun: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <p className="text-sm font-medium text-slate-700">Set your filters, then run the report</p>
      <p className="text-xs text-slate-500 mt-1 max-w-md">
        Results load only when you click Run report, so changing year, month, entity, or currency
        will not refetch until you are ready.
      </p>
      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Play className="h-4 w-4" />
        Run report
      </button>
    </div>
  );
}
