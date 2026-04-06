import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import Cookies from 'js-cookie';

const API_URL = import.meta.env.VITE_API_BASE_URL || '';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface SessionEvent {
  type: string;
  data: any;
  id?: string;
}

export interface UseSessionEventsReturn {
  /** Latest session snapshot from the server (updated on connect and on session_status_changed) */
  snapshot: any | null;
  /** Live events since last connect (type/data extracted from JSON body, not SSE event: field) */
  events: SessionEvent[];
  connectionStatus: ConnectionStatus;
  clearEvents: () => void;
}

const BACKOFF_MS = [2000, 4000, 8000, 30000];

/**
 * Backend SSE format: each message is a single `data:` line with a JSON body.
 * The JSON body has shape: { id, type, sessionId, orgId, timestamp, data }
 * There is NO SSE `event:` field — type is always embedded in the JSON.
 *
 * Snapshot: data = { session, trace }
 * Other events: data = event-specific payload (e.g. { status } for session_status_changed)
 */
export function useSessionEvents(sessionId: string | null | undefined): UseSessionEventsReturn {
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  const abortRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const seenIdsRef = useRef(new Set<string>());

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setSnapshot(null);
      setEvents([]);
      setConnectionStatus('offline');
      return;
    }

    let cancelled = false;
    seenIdsRef.current = new Set();
    retryCountRef.current = 0;

    const connect = () => {
      if (cancelled) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setConnectionStatus(retryCountRef.current === 0 ? 'connecting' : 'reconnecting');

      fetchEventSource(`${API_URL}/api/agent/sessions/${sessionId}/events`, {
        headers: {
          Authorization: `Bearer ${Cookies.get('__session') || ''}`,
        },
        signal: controller.signal,
        openWhenHidden: true,

        onopen: async (response) => {
          if (response.ok) {
            retryCountRef.current = 0;
            setConnectionStatus('connected');
          } else {
            throw new Error(`SSE open failed: ${response.status}`);
          }
        },

        onmessage: (msg) => {
          if (cancelled || !msg.data) return;

          // Parse the JSON body — the backend sends everything in the data field
          let envelope: any;
          try {
            envelope = JSON.parse(msg.data);
          } catch {
            return;
          }

          const eventType: string = envelope.type;
          const eventId: string | undefined = envelope.id;
          const eventData: any = envelope.data ?? {};

          if (eventType === 'heartbeat') return;

          if (eventType === 'snapshot') {
            // eventData = { session: {...}, trace: {...} }
            setSnapshot(eventData);
            return;
          }

          // Deduplicate on reconnect using the event's own id
          if (eventId) {
            if (seenIdsRef.current.has(eventId)) return;
            seenIdsRef.current.add(eventId);
          }

          setEvents((prev) => [...prev, { type: eventType, data: eventData, id: eventId }]);

          // NOTE: We intentionally do NOT patch `snapshot` on status changes.
          // The consumer (SessionView) already fetches fresh session data via
          // sessionAPI.get() when it sees 'session_status_changed' in events.
          // Patching snapshot here would create a stale partial-session object
          // (original plan + new status) that would race with the fresh fetch,
          // causing the UI to flash back to older step statuses.
        },

        onerror: (err) => {
          if (cancelled) return;
          setConnectionStatus('reconnecting');
          retryCountRef.current = Math.min(retryCountRef.current + 1, BACKOFF_MS.length - 1);
          const delay = BACKOFF_MS[retryCountRef.current];
          setTimeout(() => {
            if (!cancelled) connect();
          }, delay);
          throw err; // Prevent library's own retry
        },

        onclose: () => {
          if (!cancelled) setConnectionStatus('offline');
        },
      });
    };

    connect();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      setConnectionStatus('offline');
    };
  }, [sessionId]);

  return { snapshot, events, connectionStatus, clearEvents };
}
