import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { sessionAPI, pendingActionAPI } from '@/api/api';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────

export interface PlanStep {
  index: number;
  type: 'query' | 'analysis' | 'action' | 'report';
  title: string;
  description: string;
  status: string;
  requires_approval: boolean;
}

export interface ClarificationRequest {
  question: string;
  context: {
    searched_for?: string;
    available?: string[];
    [key: string]: any;
  };
  step_index: number;
}

export interface AgentSession {
  id: string;
  name: string | null;
  goal: string;
  goal_model?: string;
  status: string; // 'planning' | 'executing' | 'awaiting_approval' | 'awaiting_input' | 'completed' | 'failed'
  plan: PlanStep[] | null;
  current_step_index: number | null;
  pending_actions_count: number;
  completed_actions_count: number;
  mode: 'supervised' | 'semi_auto' | 'autonomous';
  accumulated_context: Record<string, any> | null;
  clarification_request: ClarificationRequest | null;
  template_id: string | null;
  started_at: string;
  last_active_at: string;
  completed_at: string | null;
}

export interface AgentSessionSummary {
  id: string;
  name: string | null;
  goal: string;
  status: string;
  pending_actions_count: number;
  completed_actions_count: number;
  started_at: string;
  last_active_at: string;
}

export interface PendingAction {
  id: string;
  org_id: string;
  session_id: string | null;
  action_type: string;
  batch_id: string | null;
  batch_total: number | null;
  title: string;
  description: string | null;
  payload: any;
  confidence: 'high' | 'medium' | 'low';
  confidence_score: number | null;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  on_approve: string;
  executed_at: string | null;
  execution_result: any;
  execution_error: string | null;
  created_at: string;
}

interface AgentSessionContextValue {
  // Session list (for sidebar)
  sessions: AgentSessionSummary[];
  refreshSessions: () => Promise<void>;
  inboxCount: number;

  // Session creation
  createSession: (params: {
    goal: string;
    mode: string;
    goalModel?: string;
    templateId?: string;
  }) => Promise<string>;

  // Per-session actions (used by SessionView)
  approvePendingAction: (id: string) => Promise<void>;
  rejectPendingAction: (id: string, reason: string) => Promise<void>;
  bulkApprove: (batchId: string, confidence?: 'high' | 'medium' | 'low') => Promise<void>;
}

const AgentSessionContext = createContext<AgentSessionContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────

export const AgentSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const { toast } = useToast();
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const data = await sessionAPI.list();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      // handled by fetchAPI
    }
  }, []);

  // Inbox count = total unresolved pending actions across all sessions
  const inboxCount = sessions.reduce((sum, s) => sum + (s.pending_actions_count || 0), 0);

  // Load sessions on mount + 60-second fallback poll (SSE handles real-time per session)
  useEffect(() => {
    void refreshSessions();
    fallbackPollRef.current = setInterval(() => {
      void refreshSessions();
    }, 60000);
    return () => {
      if (fallbackPollRef.current) clearInterval(fallbackPollRef.current);
    };
  }, [refreshSessions]);

  const createSession = useCallback(async (params: {
    goal: string;
    mode: string;
    goalModel?: string;
    templateId?: string;
  }): Promise<string> => {
    const session = await sessionAPI.create({
      goal: params.goal,
      mode: params.mode,
      goal_model: params.goalModel,
      template_id: params.templateId,
    });
    await refreshSessions();
    return session.id;
  }, [refreshSessions]);

  const approvePendingAction = useCallback(async (id: string) => {
    await pendingActionAPI.resolve(id, { status: 'approved' });
    toast({ title: 'Action approved' });
    await refreshSessions();
  }, [refreshSessions, toast]);

  const rejectPendingAction = useCallback(async (id: string, reason: string) => {
    await pendingActionAPI.resolve(id, { status: 'rejected', resolution_note: reason });
    toast({ title: 'Action rejected' });
    await refreshSessions();
  }, [refreshSessions, toast]);

  const bulkApprove = useCallback(async (batchId: string, confidence?: 'high' | 'medium' | 'low') => {
    await pendingActionAPI.bulkApprove(batchId, confidence);
    toast({ title: confidence ? `${confidence}-confidence actions approved` : 'Batch approved' });
    await refreshSessions();
  }, [refreshSessions, toast]);

  return (
    <AgentSessionContext.Provider value={{
      sessions,
      refreshSessions,
      inboxCount,
      createSession,
      approvePendingAction,
      rejectPendingAction,
      bulkApprove,
    }}>
      {children}
    </AgentSessionContext.Provider>
  );
};

export const useAgentSession = () => {
  const context = useContext(AgentSessionContext);
  if (!context) {
    throw new Error('useAgentSession must be used within an AgentSessionProvider');
  }
  return context;
};
