/** Shared layout tokens aligned with Fabriq shadcn design system. */
export const plaidUi = {
  progressDotActive: 'h-1 w-8 rounded-full bg-primary',
  progressDotInactive: 'h-1 w-8 rounded-full bg-muted',
  institutionAvatar:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-sm font-semibold',
  accountIcon:
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40',
  accountName: 'font-medium text-foreground text-sm truncate',
  accountMeta: 'text-xs text-muted-foreground capitalize mt-0.5',
  balance: 'text-sm font-medium text-foreground tabular-nums shrink-0',
  accountRow:
    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
  accountRowSelected: 'bg-muted/60',
  listDivide: 'divide-y divide-border',
  panelBox:
    'flex items-start gap-3 rounded-md border bg-muted/30 p-3 min-h-[5.5rem] h-full',
  mappedBox:
    'flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 min-h-[5.5rem] h-full',
} as const;
