import React, { useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, GitMerge, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import { useToast } from '@/hooks/use-toast';
import { postingAPI } from '@/api/api';
import { formatCurrency } from '@/lib/formatters';

export interface PostingRowLike {
    id: string;
    amount?: number | string | null;
    value_date?: string | null;
    account_id?: string | { id: string; name?: string } | null;
    credit_account_id?: string | { id: string; name?: string } | null;
    account_name?: string | null;
    description?: string | null;
    notes?: string | null;
    reconciliation_status?: string | null;
    payment_receipt_id?: string | null;
    posting_type?: string | null;
    status?: string | null;
    legal_entity_id?: string | null;
}

interface MergePostingsModalProps {
    open: boolean;
    onClose: () => void;
    rows: [PostingRowLike, PostingRowLike];
    /** Receives the updated primary row and the (now-marked) duplicate row. */
    onMerged?: (primary: Record<string, any>, duplicate: Record<string, any>) => void;
}

const idOf = (x: any): string | null =>
    x == null ? null : typeof x === 'object' && 'id' in x ? (x.id as string) : (x as string);

function preflight(a: PostingRowLike, b: PostingRowLike): { ok: boolean; reason?: string } {
    if (a.id === b.id) return { ok: false, reason: 'Same posting selected twice' };
    if ((a.legal_entity_id ?? null) !== (b.legal_entity_id ?? null)) {
        return { ok: false, reason: 'Postings belong to different legal entities' };
    }
    const blocked = (r: PostingRowLike) =>
        r.posting_type === 'DUPLICATE' || r.status === 'REVERSED' || r.status === 'DUPLICATE';
    if (blocked(a) || blocked(b)) {
        return { ok: false, reason: 'One row is already marked as duplicate or reversed' };
    }
    const amtA = Math.abs(Number(a.amount ?? 0));
    const amtB = Math.abs(Number(b.amount ?? 0));
    if (Math.abs(amtA - amtB) > 0.005) {
        return {
            ok: false,
            reason: `Amounts differ: ${formatCurrency(amtA)} vs ${formatCurrency(amtB)}`,
        };
    }
    const legsA = [idOf(a.account_id), idOf(a.credit_account_id)].filter(Boolean) as string[];
    const legsB = [idOf(b.account_id), idOf(b.credit_account_id)].filter(Boolean) as string[];
    if (!legsA.some((x) => legsB.includes(x))) {
        return { ok: false, reason: 'No shared account between the two postings' };
    }
    return { ok: true };
}

const PostingCard: React.FC<{
    row: PostingRowLike;
    isPrimary: boolean;
    onSelectPrimary: () => void;
    disabled?: boolean;
}> = ({ row, isPrimary, onSelectPrimary, disabled }) => (
    <button
        type="button"
        onClick={onSelectPrimary}
        disabled={disabled}
        className={`text-left border rounded-md p-3 transition w-full ${isPrimary
            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
            : 'border-muted hover:border-primary/40'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        <div className="flex justify-between items-start gap-2">
            <div className="font-medium text-sm truncate">
                {row.description || row.account_name || row.id}
            </div>
            {isPrimary ? (
                <Badge variant="default" className="text-[10px] shrink-0">KEEP</Badge>
            ) : (
                <Badge variant="outline" className="text-[10px] shrink-0">DUPLICATE</Badge>
            )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
            <div>
                Amount:{' '}
                <span className="text-foreground font-medium">
                    {formatCurrency(Math.abs(Number(row.amount ?? 0)))}
                </span>
            </div>
            <div>Value date: {row.value_date ? dayjs(row.value_date).format('YYYY-MM-DD') : '—'}</div>
            <div>Debit acct: {idOf(row.account_id) ?? '—'}</div>
            <div>Credit acct: {idOf(row.credit_account_id) ?? '—'}</div>
            {row.reconciliation_status && (
                <div>
                    Reconciliation:{' '}
                    <span className="text-foreground">{row.reconciliation_status}</span>
                </div>
            )}
        </div>
    </button>
);

export const MergePostingsModal: React.FC<MergePostingsModalProps> = ({
    open,
    onClose,
    rows,
    onMerged,
}) => {
    const { toast } = useToast();
    const [primaryId, setPrimaryId] = useState<string>(rows[0]?.id);
    const [mergeNotes, setMergeNotes] = useState(true);
    const [busy, setBusy] = useState(false);

    const primary = rows.find((r) => r.id === primaryId) ?? rows[0];
    const duplicate = rows.find((r) => r.id !== primaryId) ?? rows[1];

    const check = useMemo(() => preflight(primary, duplicate), [primary, duplicate]);
    const reconciledDuplicate =
        duplicate.reconciliation_status === 'CONFIRMED' || !!duplicate.payment_receipt_id;

    const handleSubmit = async () => {
        setBusy(true);
        try {
            const result = await postingAPI.merge(primary.id, duplicate.id, mergeNotes);
            if (!result?.success) throw new Error('Merge failed');
            toast({
                title: 'Postings merged',
                description: 'One posting has been marked as a duplicate of the other.',
            });
            onMerged?.(result.data.primary, result.data.duplicate);
            onClose();
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Merge failed',
                description: err?.message || 'Please try again.',
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitMerge className="w-5 h-5 text-primary" />
                        Merge duplicate postings
                    </DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                    Pick the posting to keep. The other will be soft-deleted (marked as a
                    duplicate, pointing to the one you keep). The action is reversible.
                </p>

                <div className="grid grid-cols-2 gap-3">
                    {rows.map((r) => (
                        <PostingCard
                            key={r.id}
                            row={r}
                            isPrimary={r.id === primaryId}
                            onSelectPrimary={() => setPrimaryId(r.id)}
                            disabled={busy}
                        />
                    ))}
                </div>

                {!check.ok && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{check.reason}</span>
                    </div>
                )}
                {check.ok && reconciledDuplicate && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                            The posting to be marked as duplicate is already reconciled. Swap
                            selection.
                        </span>
                    </div>
                )}

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <Checkbox
                        checked={mergeNotes}
                        onCheckedChange={(v) => setMergeNotes(v === true)}
                        disabled={busy}
                    />
                    <span>Append duplicate's description/notes to the kept posting</span>
                </label>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={busy || !check.ok || reconciledDuplicate}
                    >
                        {busy ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Merging…
                            </>
                        ) : (
                            'Merge'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default MergePostingsModal;
