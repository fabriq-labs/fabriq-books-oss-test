import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ChevronDown, ChevronUp, FileCheck, Loader2, XCircle } from 'lucide-react';
import { agentAPI } from '@/api/api';
import { useToast } from '@/components/ui/use-toast';

/** Shape of a reconciliation match suggestion */
export interface MatchSuggestion {
    type: 'payment_receipt' | 'invoice';
    id: string;
    reference: string;
    amount: number;
    date: string;
    customer: string | null;
    confidence: 'high' | 'medium' | 'low';
}

/** Reconciliation data for a single posting */
export interface ReconciliationData {
    status: 'SUGGESTED' | 'UNMATCHED' | 'SKIPPED' | 'MATCHED';
    best_match: MatchSuggestion | null;
    alternatives: MatchSuggestion[];
}

interface ReconciliationSuggestionsModalProps {
    open: boolean;
    onClose: () => void;
    postingId: string;
    postingDescription?: string;
    postingAmount?: number;
    reconciliation: ReconciliationData;
    /** Called after successful confirm – receives the updated posting row for in-place merge */
    onConfirmed?: (updatedPosting: Record<string, any>) => void;
}

export const ReconciliationSuggestionsModal: React.FC<ReconciliationSuggestionsModalProps> = ({
    open,
    onClose,
    postingId,
    postingDescription,
    postingAmount,
    reconciliation,
    onConfirmed,
}) => {
    const { toast } = useToast();
    const [showAlternatives, setShowAlternatives] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [localStatus, setLocalStatus] = useState<ReconciliationData['status']>(reconciliation.status);

    const handleConfirmMatch = async () => {
        setIsConfirming(true);
        try {
            const result = await agentAPI.confirmReconciliation({ posting_id: postingId });
            if (!result.success || !result.data) {
                throw new Error((result as any).error || 'Confirm failed');
            }
            setLocalStatus('MATCHED');
            toast({
                title: "Match confirmed",
                description: "Transaction is now linked to the receipt and marked as reconciled.",
            });
            onConfirmed?.(result.data.posting);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Failed to confirm match",
                description: error.message || "Please try again.",
            });
        } finally {
            setIsConfirming(false);
        }
    };

    const { best_match, alternatives } = reconciliation;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-primary" />
                        Reconciliation Suggestions
                    </DialogTitle>
                </DialogHeader>

                {/* Posting summary */}
                <div className="text-sm text-muted-foreground border-b pb-3">
                    <div className="font-medium text-foreground truncate">{postingDescription || 'Transaction'}</div>
                    {postingAmount != null && (
                        <div className="mt-0.5">
                            Amount: {postingAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                        </div>
                    )}
                </div>

                {/* Unmatched */}
                {reconciliation.status === 'UNMATCHED' && (
                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                        <XCircle className="w-4 h-4" />
                        <span className="text-sm">No matching invoice or payment receipt found. Transaction has been categorized.</span>
                    </div>
                )}

                {/* Best match */}
                {best_match && (
                    <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 px-4 py-3 border-b">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-primary" />
                                    <span className="font-medium text-sm">Best Match</span>
                                    <Badge variant={
                                        best_match.confidence === 'high' ? 'default' :
                                        best_match.confidence === 'medium' ? 'secondary' : 'outline'
                                    }>
                                        {best_match.confidence}
                                    </Badge>
                                </div>
                                {localStatus === 'MATCHED' ? (
                                    <Badge className="text-xs bg-green-600 hover:bg-green-600">Confirmed</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-xs">SUGGESTED</Badge>
                                )}
                            </div>
                        </div>

                        <div className="px-4 py-3 bg-primary/5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-primary" />
                                        <span className="font-medium text-sm">
                                            {best_match.type === 'payment_receipt' ? 'Payment Receipt' : 'Invoice'}: {best_match.reference}
                                        </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground ml-6 space-y-0.5">
                                        <div>Amount: {best_match.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</div>
                                        {best_match.date && (
                                            <div>Date: {new Date(best_match.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                        )}
                                        {best_match.customer && (
                                            <div>Customer: {best_match.customer}</div>
                                        )}
                                    </div>
                                </div>
                                {localStatus === 'SUGGESTED' && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="shrink-0"
                                        onClick={handleConfirmMatch}
                                        disabled={isConfirming}
                                    >
                                        {isConfirming ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Confirming...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                Confirm match
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Alternatives toggle */}
                        {alternatives.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 flex items-center justify-center gap-1 border-t transition-colors"
                                    onClick={() => setShowAlternatives(!showAlternatives)}
                                >
                                    {showAlternatives ? (
                                        <>
                                            <ChevronUp className="w-3 h-3" />
                                            Hide {alternatives.length} other suggestion{alternatives.length > 1 ? 's' : ''}
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-3 h-3" />
                                            Show {alternatives.length} other suggestion{alternatives.length > 1 ? 's' : ''}
                                        </>
                                    )}
                                </button>

                                {showAlternatives && (
                                    <div className="border-t divide-y">
                                        {alternatives.map((alt, idx) => (
                                            <div key={idx} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-muted-foreground">
                                                                {alt.type === 'payment_receipt' ? 'Receipt' : 'Invoice'}: {alt.reference}
                                                            </span>
                                                            <Badge variant="outline" className="text-xs">
                                                                {alt.confidence}
                                                            </Badge>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {alt.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                            {alt.customer && ` - ${alt.customer}`}
                                                            {alt.date && ` - ${new Date(alt.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default ReconciliationSuggestionsModal;
