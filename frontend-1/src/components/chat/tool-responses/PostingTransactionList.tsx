import React from 'react';
import moment from 'moment';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';

export type PostingTransactionListRow = {
    id?: string;
    value_date?: string;
    partyName: string;
    partySubtitle?: string;
    amount: number;
    /** When set, shows signed amount with inflow/outflow colours. */
    isReceived?: boolean;
    currency?: string;
};

interface PostingTransactionListProps {
    rows: PostingTransactionListRow[];
    currencyCode?: string;
    sidebarMode?: boolean;
    title?: string;
    showBalanceColumn?: boolean;
    balanceByRowId?: Record<string, number>;
}

function partyInitial(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toUpperCase();
}

function partyColor(name: string): string {
    const palette = [
        'bg-primary text-primary-foreground',
        'bg-primary/85 text-primary-foreground',
        'bg-primary/70 text-primary-foreground',
        'bg-accent text-accent-foreground',
        'bg-secondary text-secondary-foreground',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
}

export const PostingTransactionList: React.FC<PostingTransactionListProps> = ({
    rows,
    currencyCode = 'INR',
    sidebarMode,
    title,
    showBalanceColumn,
    balanceByRowId,
}) => {
    if (!rows.length) {
        return (
            <div className="text-center py-6 text-sm text-muted-foreground bg-muted rounded-lg border border-border">
                No transactions found.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {title && <p className="text-sm font-medium text-foreground">{title}</p>}
            <div
                className={cn(
                    'rounded-lg border border-border bg-muted/50 overflow-hidden',
                    sidebarMode ? 'max-h-[50vh]' : 'max-h-[60vh]'
                )}
            >
                <div className="grid grid-cols-[88px_1fr_auto] gap-3 px-4 py-2 border-b border-border bg-card">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Date
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Party
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right min-w-[100px]">
                        Amount
                    </span>
                </div>

                <div className="overflow-y-auto divide-y divide-border">
                    {rows.map((row, index) => {
                        const currency = row.currency ?? currencyCode;
                        const amount = Math.abs(Number(row.amount ?? 0));
                        const showSign = row.isReceived != null;
                        const isReceived = row.isReceived ?? true;
                        const date = row.value_date ? moment(row.value_date) : null;
                        const rowKey = String(row.id ?? index);
                        const balance = balanceByRowId?.[rowKey];

                        return (
                            <div
                                key={rowKey}
                                className="grid grid-cols-[88px_1fr_auto] gap-3 px-4 py-3.5 bg-card hover:bg-accent/40 transition-colors items-center"
                            >
                                <div className="leading-tight">
                                    {date?.isValid() ? (
                                        <>
                                            <div className="text-sm font-semibold text-foreground">
                                                {date.format('MMM D')}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {date.format('YYYY')}
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">—</span>
                                    )}
                                </div>

                                <div className="flex items-start gap-2.5 min-w-0">
                                    <div
                                        className={cn(
                                            'shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold',
                                            partyColor(row.partyName)
                                        )}
                                        aria-hidden
                                    >
                                        {partyInitial(row.partyName)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-foreground truncate">
                                            {row.partyName || '—'}
                                        </div>
                                        {row.partySubtitle && (
                                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                {row.partySubtitle}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="text-right min-w-[100px]">
                                    {showSign ? (
                                        <span
                                            className={cn('text-sm font-semibold tabular-nums', {
                                                'text-primary': isReceived,
                                                'text-destructive': !isReceived,
                                            })}
                                        >
                                            {isReceived ? '' : '−'}
                                            {formatCurrency(amount, currency).replace(/^-/, '')}
                                        </span>
                                    ) : (
                                        <span className="text-sm font-semibold text-foreground tabular-nums">
                                            {formatCurrency(amount, currency)}
                                        </span>
                                    )}
                                    {showBalanceColumn && balance != null && Number.isFinite(balance) && (
                                        <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                                            Bal {formatCurrency(balance, currency)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
