import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, X, AlertTriangle, Receipt, FileText, Link2,
  ArrowRightLeft, Clock, DollarSign, Building2, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { pendingActionAPI, viewAPI } from '@/api/api';
import { useAgentSession, type PendingAction } from '@/contexts/AgentSessionContext';
import { useCurrencyFormatting } from '@/utils/currencyUtils';

// ── Types ──────────────────────────────────────────────────────

interface PostingData {
  id: string;
  description: string | null;
  name: string | null;
  amount: number | null;
  value_date: string | null;
  posting_date: string | null;
  account_name: string | null;
  account_id: string | null;
  category_name: string | null;
  reconciliation_status: string | null;
  matched_reference: string | null;
  payment_receipt_id: string | null;
}

interface MatchData {
  id: string;
  reference: string | null;
  amount: number | null;
  date: string | null;
  customer_name: string | null;
  customer_id: string | null;
  payment_method: string | null;
  notes: string | null;
  type: 'payment_receipt' | 'invoice';
}

interface OtherCandidate {
  id: string;
  reference: string;
  confidence: string;
  amount: number;
}

const confidenceColors: Record<string, string> = {
  high: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-red-100 text-red-700 border-red-200',
};

const confidenceDots: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

// ── Component ──────────────────────────────────────────────────

export const ReconciliationDetail: React.FC = () => {
  const { sessionId, actionId } = useParams();
  const navigate = useNavigate();
  const { approvePendingAction, rejectPendingAction, refreshPendingActions } = useAgentSession();
  const { formatCurrency } = useCurrencyFormatting();

  const [action, setAction] = useState<PendingAction | null>(null);
  const [posting, setPosting] = useState<PostingData | null>(null);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    if (!actionId) return;
    loadData();
  }, [actionId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const actionData = await pendingActionAPI.get(actionId!);
      setAction(actionData);

      const payload = actionData.payload;
      let fetchedPosting = false;
      let fetchedMatch = false;

      // Try to fetch fresh posting data
      if (payload?.posting_id) {
        try {
          const postingResult: any = await viewAPI.getById('posting', payload.posting_id, 'posting_view');
          const p = postingResult?.data || postingResult;
          if (p?.id) {
            setPosting({
              id: p.id,
              description: p.description || p.name,
              name: p.name,
              amount: p.amount != null ? Number(p.amount) : null,
              value_date: p.value_date,
              posting_date: p.posting_date,
              account_name: p.account_name || p.account?.name,
              account_id: p.account_id,
              category_name: p.category_name || p.category?.name,
              reconciliation_status: p.reconciliation_status,
              matched_reference: p.matched_reference,
              payment_receipt_id: p.payment_receipt_id,
            });
            fetchedPosting = true;
          }
        } catch {
          // Fall back to preview
        }
      }

      // Try to fetch fresh match data
      if (payload?.match_id && payload?.match_type) {
        try {
          const matchType = payload.match_type === 'payment_receipt' ? 'payment_receipt' : 'invoice';
          const viewName = matchType === 'payment_receipt' ? 'payment_receipt_view' : 'invoice_view';
          const matchResult: any = await viewAPI.getById(matchType, payload.match_id, viewName);
          const m = matchResult?.data || matchResult;
          if (m?.id) {
            setMatch({
              id: m.id,
              reference: m.receipt_number || m.invoice_number || m.payment_reference || payload.match_reference,
              amount: m.amount != null ? Number(m.amount) : null,
              date: m.receipt_date || m.invoice_date,
              customer_name: m.customer?.customer_name || m.customer_name,
              customer_id: m.customer_id,
              payment_method: m.payment_method,
              notes: m.notes,
              type: payload.match_type,
            });
            fetchedMatch = true;
          }
        } catch {
          // Fall back to preview
        }
      }

      // Fallback to preview data
      if (!fetchedPosting && payload?.preview?.posting) {
        const pp = payload.preview.posting;
        setPosting({
          id: payload.posting_id || '',
          description: pp.description,
          name: pp.description,
          amount: pp.amount != null ? Number(pp.amount) : null,
          value_date: pp.date,
          posting_date: pp.date,
          account_name: pp.account,
          account_id: null,
          category_name: null,
          reconciliation_status: null,
          matched_reference: null,
          payment_receipt_id: null,
        });
        setUsingFallback(true);
      }

      if (!fetchedMatch && payload?.preview?.match) {
        const pm = payload.preview.match;
        setMatch({
          id: payload.match_id || '',
          reference: pm.reference,
          amount: pm.amount != null ? Number(pm.amount) : null,
          date: pm.date,
          customer_name: pm.customer,
          customer_id: null,
          payment_method: null,
          notes: null,
          type: payload.match_type || 'payment_receipt',
        });
        setUsingFallback(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div>;
  }

  if (!action) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Action not found</div>;
  }

  const isPending = action.status === 'pending';
  const confidence = action.confidence;
  const otherCandidates: OtherCandidate[] = action.payload?.other_candidates || [];

  const goBack = () => {
    if (action.batch_id) {
      navigate(`/workbench/sessions/${sessionId}/batch/${action.batch_id}`);
    } else {
      navigate(`/workbench/sessions/${sessionId}`);
    }
  };

  const handleApprove = async () => {
    await approvePendingAction(action.id);
    await refreshPendingActions();
    goBack();
  };

  const handleReject = async () => {
    await rejectPendingAction(action.id, rejectReason || 'Rejected from detail view');
    await refreshPendingActions();
    goBack();
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="p-5 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="sm" onClick={goBack} className="text-xs">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-800">{action.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{action.action_type} match detail</p>
        </div>
        <Badge variant="outline" className={`${confidenceColors[confidence]} text-xs px-2.5`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${confidenceDots[confidence]}`} />
          {confidence.toUpperCase()} confidence
        </Badge>
        {!isPending && (
          <Badge variant="outline" className="text-xs capitalize">{action.status}</Badge>
        )}
      </div>

      {/* Fallback warning */}
      {usingFallback && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-700">
            Showing cached preview data. Live data could not be fetched — details may be outdated.
          </span>
        </div>
      )}

      {/* Match visualization */}
      <div className="grid grid-cols-[1fr,auto,1fr] gap-4 mb-5">
        {/* Posting (left side) */}
        <Card className="border-blue-200">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-blue-600 uppercase flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Bank Transaction
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {posting ? (
              <>
                <div>
                  <span className="text-[11px] text-gray-400 uppercase">Description</span>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{posting.description || posting.name || '-'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Amount</span>
                    <p className="text-lg font-semibold text-gray-900 mt-0.5">
                      {posting.amount != null ? formatCurrency(posting.amount) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Date</span>
                    <p className="text-sm text-gray-700 mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-400" />
                      {formatDate(posting.value_date || posting.posting_date)}
                    </p>
                  </div>
                </div>
                <Separator />
                <div>
                  <span className="text-[11px] text-gray-400 uppercase">Account</span>
                  <p className="text-sm text-gray-700 mt-0.5 flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-gray-400" />
                    {posting.account_name || '-'}
                  </p>
                </div>
                {posting.category_name && (
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Category</span>
                    <p className="text-sm text-gray-700 mt-0.5">{posting.category_name}</p>
                  </div>
                )}
                {posting.reconciliation_status && (
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Reconciliation Status</span>
                    <Badge variant="outline" className="mt-0.5 text-[10px]">{posting.reconciliation_status}</Badge>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">No posting data</p>
            )}
          </CardContent>
        </Card>

        {/* Arrow connector */}
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <ArrowRightLeft className="h-5 w-5 text-gray-400" />
            <Link2 className="h-4 w-4 text-primary" />
          </div>
        </div>

        {/* Match (right side) */}
        <Card className="border-green-200">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-green-600 uppercase flex items-center gap-1.5">
              {match?.type === 'invoice' ? (
                <FileText className="h-3.5 w-3.5" />
              ) : (
                <Receipt className="h-3.5 w-3.5" />
              )}
              {match?.type === 'invoice' ? 'Invoice' : 'Payment Receipt'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {match ? (
              <>
                <div>
                  <span className="text-[11px] text-gray-400 uppercase">Reference</span>
                  <p className="text-sm font-medium text-gray-800 mt-0.5 flex items-center gap-1">
                    <Hash className="h-3 w-3 text-gray-400" />
                    {match.reference || '-'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Amount</span>
                    <p className="text-lg font-semibold text-gray-900 mt-0.5">
                      {match.amount != null ? formatCurrency(match.amount) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Date</span>
                    <p className="text-sm text-gray-700 mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-400" />
                      {formatDate(match.date)}
                    </p>
                  </div>
                </div>
                <Separator />
                {match.customer_name && (
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Customer</span>
                    <p className="text-sm text-gray-700 mt-0.5 flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-gray-400" />
                      {match.customer_name}
                    </p>
                  </div>
                )}
                {match.payment_method && (
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Payment Method</span>
                    <p className="text-sm text-gray-700 mt-0.5">{match.payment_method}</p>
                  </div>
                )}
                {match.notes && (
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase">Notes</span>
                    <p className="text-xs text-gray-500 mt-0.5">{match.notes}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">No match data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Amount comparison */}
      {posting?.amount != null && match?.amount != null && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-gray-50 border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Amount comparison</span>
            {Math.abs(Number(posting.amount) - Number(match.amount)) < 0.01 ? (
              <Badge className="bg-green-100 text-green-700 border-0">
                <Check className="h-3 w-3 mr-1" /> Exact match
              </Badge>
            ) : (
              <span className="text-amber-600 font-medium">
                Difference: {formatCurrency(Math.abs(Number(posting.amount) - Number(match.amount)))}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Confidence basis */}
      {action.payload?.confidence_detail && (
        <Card className="mb-5">
          <CardContent className="px-4 py-3">
            <p className="text-xs text-gray-400 uppercase font-medium mb-1.5">Match Basis</p>
            <p className="text-sm text-gray-700 leading-relaxed">{action.payload.confidence_detail}</p>
          </CardContent>
        </Card>
      )}

      {/* Other candidates */}
      {otherCandidates.length > 0 && (
        <Card className="mb-5">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-gray-500 uppercase">
              Other Candidates ({otherCandidates.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2">
              {otherCandidates.map((c, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                  <Hash className="h-3 w-3 text-gray-400 shrink-0" />
                  <span className="text-sm font-medium text-gray-700 flex-1">{c.reference}</span>
                  <span className="text-sm text-gray-500">{formatCurrency(c.amount)}</span>
                  <Badge variant="outline" className={`${confidenceColors[c.confidence] || ''} text-[10px]`}>
                    {c.confidence}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      {isPending && (
        <div className="flex items-start gap-3 mt-6 pt-4 border-t">
          <Button onClick={() => void handleApprove()} className="flex-1 h-10">
            <Check className="h-4 w-4 mr-2" />
            Approve Match
          </Button>
          {!showRejectForm ? (
            <Button
              variant="outline"
              onClick={() => setShowRejectForm(true)}
              className="flex-1 h-10 text-red-600 border-red-200 hover:bg-red-50"
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
          ) : (
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Reason for rejection (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleReject()}
                  className="text-xs flex-1"
                >
                  Confirm Reject
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowRejectForm(false)} className="text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Execution result for already-executed actions */}
      {action.executed_at && (
        <Card className="mt-5 border-green-200 bg-green-50/50">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Executed</span>
              <span className="text-xs text-green-600">{formatDate(action.executed_at)}</span>
            </div>
            {action.execution_result && (
              <p className="text-xs text-green-600 mt-1">
                Status: {action.execution_result?.reconciliation_status || 'completed'}
              </p>
            )}
            {action.execution_error && (
              <p className="text-xs text-red-600 mt-1">Error: {action.execution_error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
