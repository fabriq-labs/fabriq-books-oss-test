import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { pendingActionAPI } from '@/api/api';
import { useAgentSession, type PendingAction } from '@/contexts/AgentSessionContext';

const confidenceColors: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

export const PlaceholderDetail: React.FC = () => {
  const { sessionId, actionId } = useParams();
  const navigate = useNavigate();
  const { approvePendingAction, rejectPendingAction, refreshPendingActions } = useAgentSession();
  const [action, setAction] = useState<PendingAction | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!actionId) return;
    setLoading(true);
    pendingActionAPI.get(actionId)
      .then(setAction)
      .finally(() => setLoading(false));
  }, [actionId]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div>;
  }

  if (!action) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Action not found</div>;
  }

  const isPending = action.status === 'pending';

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

  return (
    <div className="p-4 h-full overflow-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={goBack} className="text-xs">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back
        </Button>
        <h3 className="text-sm font-semibold text-gray-700 flex-1">{action.title}</h3>
        <Badge variant="outline" className={`${confidenceColors[action.confidence]} border-0 text-xs`}>
          {action.confidence.toUpperCase()}
        </Badge>
        <Badge variant="outline" className="text-xs">{action.status}</Badge>
      </div>

      {/* Generic payload display */}
      <Card className="mb-4">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs text-gray-500 uppercase">{action.action_type}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {action.description && (
            <p className="text-sm text-gray-700 mb-3">{action.description}</p>
          )}
          {action.payload?.preview && (
            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 overflow-auto max-h-60">
              {JSON.stringify(action.payload.preview, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      {isPending && (
        <div className="flex items-center gap-3 mt-6">
          <Button onClick={() => void handleApprove()} className="flex-1">
            <Check className="h-4 w-4 mr-2" />
            Approve
          </Button>
          {!showRejectForm ? (
            <Button variant="outline" onClick={() => setShowRejectForm(true)} className="flex-1 text-red-600 border-red-200 hover:bg-red-50">
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
                <Button variant="destructive" size="sm" onClick={() => void handleReject()} className="text-xs flex-1">
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
    </div>
  );
};
