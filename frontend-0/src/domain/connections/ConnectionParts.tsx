import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';

export type Tone = 'positive' | 'warning' | 'neutral';

const toneClasses: Record<Tone, string> = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  neutral: 'border-border bg-muted text-muted-foreground',
};

export const StatusBadge: React.FC<{ tone: Tone; children: React.ReactNode; className?: string }> = ({
  tone,
  children,
  className,
}) => (
  <Badge variant="outline" className={cn('font-medium', toneClasses[tone], className)}>
    {children}
  </Badge>
);

export const DisclosureButton: React.FC<{
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  controls?: string;
}> = ({ open, onToggle, children, controls }) => (
  <button
    type="button"
    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    aria-expanded={open}
    aria-controls={controls}
    onClick={onToggle}
  >
    <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')} />
    {children}
  </button>
);

export const formatDateTime = (iso: string | null | undefined): string | null =>
  iso ? new Date(iso).toLocaleString() : null;

export const environmentLabel = (env: string | null | undefined): string | null => {
  if (!env) return null;
  if (env === 'production') return 'Live company';
  if (env === 'sandbox') return 'Sandbox company';
  return env;
};
