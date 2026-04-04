import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { sessionAPI, pendingActionAPI } from '@/api/api';
import { useAgentSession, type AgentSession, type PendingAction } from '@/contexts/AgentSessionContext';
import { useSessionEvents } from '@/hooks/useSessionEvents';
import { SessionHeader, type ViewMode } from '@/components/workbench/SessionHeader';
import { ExecutingView } from '@/components/workbench/ExecutingView';
import { ExecutingViewV2 } from '@/components/workbench/ExecutingViewV2';
import { AwaitingApprovalView } from '@/components/workbench/AwaitingApprovalView';
import { CompletedView } from '@/components/workbench/CompletedView';
import { Loader2 } from 'lucide-react';

const ACTIVE_STATUSES = ['planning', 'executing', 'awaiting_approval', 'awaiting_input'];
const VIEW_MODE_KEY = 'workbench_view_mode';

export const SessionView: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { refreshSessions, approvePendingAction, rejectPendingAction, bulkApprove } = useAgentSession();

  const [session, setSession] = useState<AgentSession | null>(null);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? 'v2'
  );

  const { snapshot, events, connectionStatus } = useSessionEvents(sessionId);

  const streamStartedRef = useRef(false);
  const loadedSessionIdRef = useRef<string | null>(null);

  // ── Load session from backend when sessionId changes ─────────
  useEffect(() => {
    if (!sessionId) return;
    if (loadedSessionIdRef.current === sessionId) return;
    loadedSessionIdRef.current = sessionId;
    streamStartedRef.current = false;

    setIsLoading(true);
    setSession(null);
    setPendingActions([]);

    Promise.all([
      sessionAPI.get(sessionId),
      pendingActionAPI.list({ session_id: sessionId }),
    ]).then(([sess, actions]) => {
      setSession(sess);
      setPendingActions(Array.isArray(actions) ? actions : []);
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, [sessionId]);

  // ── Apply SSE snapshot (fires on every connect/reconnect) ─────
  // snapshot shape: { session: {...}, trace: {...} }
  useEffect(() => {
    if (!snapshot?.session) return;
    setSession(snapshot.session);
    // Also refresh pending actions from trace if available
    if (Array.isArray(snapshot.trace?.actions)) {
      // trace.actions are TraceAction format — fetch proper PendingAction list instead
      if (sessionId) {
        pendingActionAPI.list({ session_id: sessionId })
          .then((actions) => setPendingActions(Array.isArray(actions) ? actions : []))
          .catch(() => {});
      }
    }
  }, [snapshot, sessionId]);

  // ── Apply SSE live events ──────────────────────────────────────
  useEffect(() => {
    if (events.length === 0 || !sessionId) return;
    const latest = events[events.length - 1];

    if (latest.type === 'session_status_changed') {
      // Re-fetch full session to get updated plan/step index
      sessionAPI.get(sessionId).then(setSession).catch(() => {});
      void refreshSessions();
    }

    if (latest.type === 'action_queued' || latest.type === 'action_resolved' || latest.type === 'inbox_count_changed') {
      pendingActionAPI.list({ session_id: sessionId })
        .then((actions) => setPendingActions(Array.isArray(actions) ? actions : []))
        .catch(() => {});
      sessionAPI.get(sessionId).then(setSession).catch(() => {});
      void refreshSessions();
    }

    if (latest.type === 'step_completed') {
      // Refresh session so header step bar updates
      sessionAPI.get(sessionId).then(setSession).catch(() => {});
    }
  }, [events, sessionId, refreshSessions]);

  // ── Fallback poll while active (catches missed SSE events) ────
  useEffect(() => {
    if (!sessionId || !session) return;
    if (!ACTIVE_STATUSES.includes(session.status)) return;

    const interval = setInterval(() => {
      sessionAPI.get(sessionId).then((updated) => {
        setSession(updated);
        if (updated.status !== session.status) {
          void refreshSessions();
        }
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, session?.status, refreshSessions]);

  // ── Fire initial stream when session is newly created ─────────
  useEffect(() => {
    if (!session || streamStartedRef.current) return;
    if (session.status === 'planning' && !session.plan) {
      streamStartedRef.current = true;
      void sessionAPI.startStream(session.id, session.goal, session.goal_model);
    }
  }, [session]);

  // ── Refresh session list when session completes ───────────────
  useEffect(() => {
    if (session?.status === 'completed' || session?.status === 'failed') {
      void refreshSessions();
    }
  }, [session?.status, refreshSessions]);

  // ── Action handlers ───────────────────────────────────────────
  const refreshAfterAction = useCallback(async () => {
    if (!sessionId) return;
    const [sess, actions] = await Promise.all([
      sessionAPI.get(sessionId),
      pendingActionAPI.list({ session_id: sessionId }),
    ]);
    setSession(sess);
    setPendingActions(Array.isArray(actions) ? actions : []);
  }, [sessionId]);

  const handleApprove = useCallback(async (id: string) => {
    await approvePendingAction(id);
    await refreshAfterAction();
  }, [approvePendingAction, refreshAfterAction]);

  const handleReject = useCallback(async (id: string, reason: string) => {
    await rejectPendingAction(id, reason);
    await refreshAfterAction();
  }, [rejectPendingAction, refreshAfterAction]);

  const handleBulkApprove = useCallback(async (batchId: string, confidence?: 'high' | 'medium' | 'low') => {
    await bulkApprove(batchId, confidence);
    await refreshAfterAction();
  }, [bulkApprove, refreshAfterAction]);

  const handleClarify = useCallback(async (answer: string) => {
    if (!sessionId) return;
    await sessionAPI.clarify(sessionId, answer);
    // Session resumes via SSE session_status_changed → executing
  }, [sessionId]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  // ── Render ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-500">Session not found.</p>
      </div>
    );
  }

  const isExecutingState = session.status === 'executing' || session.status === 'awaiting_input';

  return (
    <div className="flex flex-col h-full">
      <SessionHeader
        session={session}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />
      <div className="flex-1 overflow-auto">
        {session.status === 'planning' && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">Agent is creating a plan…</p>
          </div>
        )}

        {isExecutingState && viewMode === 'v1' && (
          <ExecutingView
            session={session}
            events={events}
            connectionStatus={connectionStatus}
          />
        )}

        {isExecutingState && viewMode === 'v2' && (
          <ExecutingViewV2
            session={session}
            events={events}
            connectionStatus={connectionStatus}
            onClarify={handleClarify}
          />
        )}

        {session.status === 'awaiting_approval' && (
          <AwaitingApprovalView
            session={session}
            pendingActions={pendingActions}
            onApprove={handleApprove}
            onReject={handleReject}
            onBulkApprove={handleBulkApprove}
          />
        )}

        {session.status === 'completed' && (
          <CompletedView session={session} />
        )}

        {session.status === 'failed' && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm font-medium text-red-600">Session failed</p>
            <p className="text-xs text-gray-400">Check the session trace for details.</p>
          </div>
        )}
      </div>
    </div>
  );
};
