import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

// ── Types ──────────────────────────────────────────────────────

export type SessionEventType =
  | 'snapshot'
  | 'step_started'
  | 'step_completed'
  | 'tool_called'
  | 'action_queued'
  | 'session_status_changed'
  | 'inbox_count_changed'
  | 'heartbeat';

export interface SessionEvent {
  id: string;
  sessionId: string;
  orgId: string;
  type: SessionEventType;
  timestamp: string; // ISO 8601
  data: Record<string, any>;
}

// ── Bus ────────────────────────────────────────────────────────

class SessionEventBusImpl extends EventEmitter {
  constructor() {
    super();
    // Allow many SSE subscribers per session without Node.js warning
    this.setMaxListeners(200);
  }

  /** Emit a structured event for a session. Returns the event (with generated id). */
  emitSessionEvent(
    sessionId: string,
    orgId: string,
    type: SessionEventType,
    data: Record<string, any> = {}
  ): SessionEvent {
    const event: SessionEvent = {
      id: `evt_${randomBytes(8).toString('hex')}`,
      sessionId,
      orgId,
      type,
      timestamp: new Date().toISOString(),
      data,
    };
    // Per-session channel
    this.emit(`session:${sessionId}`, event);
    // Per-org channel (for inbox count, etc.)
    this.emit(`org:${orgId}`, event);
    return event;
  }

  /**
   * Subscribe to all events for a specific session.
   * Returns an unsubscribe function.
   */
  subscribeSession(
    sessionId: string,
    handler: (event: SessionEvent) => void
  ): () => void {
    const channel = `session:${sessionId}`;
    this.on(channel, handler);
    return () => this.off(channel, handler);
  }

  /**
   * Subscribe to org-level events (e.g. inbox_count_changed).
   * Returns an unsubscribe function.
   */
  subscribeOrg(
    orgId: string,
    handler: (event: SessionEvent) => void
  ): () => void {
    const channel = `org:${orgId}`;
    this.on(channel, handler);
    return () => this.off(channel, handler);
  }
}

// Singleton — shared across the entire Node.js process
export const sessionEventBus = new SessionEventBusImpl();
