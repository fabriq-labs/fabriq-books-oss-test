import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { pendingActionAPI } from '@/api/api';
import { type PendingAction } from '@/contexts/AgentSessionContext';
import { ReconciliationDetail } from './ReconciliationDetail';
import { PlaceholderDetail } from './PlaceholderDetail';

// ── Component registry ─────────────────────────────────────────
// Maps action_type to specialized detail component.
// ReconciliationDetail is the only V1 specialized component.
const ACTION_DETAIL_COMPONENTS: Record<string, React.ComponentType> = {
  reconcile_posting: ReconciliationDetail,
};

export const PendingActionDetail: React.FC = () => {
  const { actionId } = useParams();
  const [actionType, setActionType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!actionId) return;
    setLoading(true);
    pendingActionAPI.get(actionId)
      .then((action: PendingAction) => setActionType(action.action_type))
      .catch(() => setActionType(null))
      .finally(() => setLoading(false));
  }, [actionId]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div>;
  }

  // Route to specialized component or fallback to placeholder
  const DetailComponent = (actionType && ACTION_DETAIL_COMPONENTS[actionType]) || PlaceholderDetail;
  return <DetailComponent />;
};
