/**
 * SessionTimeoutService
 *
 * Kills sessions that stay in `planning` or `executing` longer than the
 * configured wall-clock limit. The timer is per-session and is:
 *   • Armed   — when the agent starts a new turn (handleRequest / handleStreamingRequest)
 *   • Reset   — if arm() is called again while a timer is already running (new LLM turn)
 *   • Cancelled — when the session reaches completed / failed / awaiting_approval
 *   • Re-armed — when the session transitions back from awaiting_approval → executing
 *
 * Configuration (env vars):
 *   AGENT_SESSION_TIMEOUT_MS  — timeout in milliseconds (default: 300000 = 5 min)
 *                               Set to 0 to disable timeouts entirely.
 */

import prisma from '../../lib/prisma';
import { sessionEventBus } from './SessionEventBus';
import logger from '../../utils/logger';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class SessionTimeoutService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private get timeoutMs(): number {
    const raw = process.env.AGENT_SESSION_TIMEOUT_MS;
    if (raw !== undefined) return parseInt(raw, 10);
    return DEFAULT_TIMEOUT_MS;
  }

  /**
   * Arm (or reset) the timeout for a session.
   * Safe to call multiple times — resets the clock on each call.
   */
  arm(sessionId: string): void {
    const ms = this.timeoutMs;
    if (ms <= 0) return; // Disabled

    this.cancel(sessionId); // Clear any existing timer first

    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.killSession(sessionId);
    }, ms);

    // Allow Node to exit even if this timer is still running
    if (timer.unref) timer.unref();

    this.timers.set(sessionId, timer);
    logger.debug('Session timeout armed', { sessionId, timeoutMs: ms });
  }

  /**
   * Cancel the timeout for a session.
   * Safe to call when no timer exists.
   */
  cancel(sessionId: string): void {
    const existing = this.timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(sessionId);
      logger.debug('Session timeout cancelled', { sessionId });
    }
  }

  private async killSession(sessionId: string): Promise<void> {
    try {
      const session = await prisma.agent_session.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, org_id: true },
      });

      if (!session) return;

      // Only kill sessions that are still actively running
      if (session.status !== 'planning' && session.status !== 'executing') {
        logger.debug('Session timeout fired but session already in terminal state', {
          sessionId,
          status: session.status,
        });
        return;
      }

      logger.warn('Session timed out — marking as failed', {
        sessionId,
        status: session.status,
        timeoutMs: this.timeoutMs,
      });

      await prisma.agent_session.update({
        where: { id: sessionId },
        data: {
          status: 'failed',
          completed_at: new Date(),
        },
      });

      sessionEventBus.emitSessionEvent(sessionId, session.org_id, 'session_status_changed', {
        status: 'failed',
        reason: 'timeout',
      });
    } catch (err) {
      logger.error('Error killing timed-out session', { sessionId, err });
    }
  }
}

export const sessionTimeoutService = new SessionTimeoutService();
