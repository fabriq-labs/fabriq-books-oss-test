import { cn } from '@/lib/utils';

type ReconciliationStatus = 'CONFIRMED' | 'MATCHED' | 'UNMATCHED' | null | undefined;

interface ReconciliationStatusBadgeProps {
  status: ReconciliationStatus;
}

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  CONFIRMED: { dot: 'bg-green-500', label: 'Confirmed' },
  MATCHED: { dot: 'bg-amber-400', label: 'Matched' },
  UNMATCHED: { dot: 'bg-gray-300', label: 'Unmatched' },
};

export function ReconciliationStatusBadge({ status }: ReconciliationStatusBadgeProps) {
  if (!status) return null;
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full flex-shrink-0', config.dot)} />
      {config.label}
    </span>
  );
}
