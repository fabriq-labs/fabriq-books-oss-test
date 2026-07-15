import { Router, Request, Response } from 'express';
import { streamText, convertToCoreMessages, type Message as UIMessage } from 'ai';
import { authMiddleware } from '../auth/middleware';
import type { AuthContext } from '../auth/types';
import { getModel } from '../lib/ai/modelProvider';
import { createBrokerConnector } from '../lib/integrations/broker/connectors';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

function getAuthContext(req: Request): AuthContext | null {
  const auth = (req as any).context?.auth as AuthContext | undefined;
  if (!auth?.user?.id || !auth.user.org_id) return null;
  return auth;
}

const OPTION_ANALYSIS_SYSTEM = `You are an expert options trading analyst embedded in a portfolio management tool.
The user holds short options positions and wants concise, actionable insights.

When given position data and live Greeks, produce a structured analysis covering:
1. Theta decay quality — is the position decaying favourably?
2. Directional risk — how exposed is the position to adverse underlying moves?
3. Key risk flags — gamma acceleration near expiry, IV changes, upcoming events
4. Suggested action — hold, close at target, roll, or hedge

Be specific and use the numbers provided. Do not invent data. Keep it under 250 words.
If the user asks follow-up questions, answer them directly using the position context.`;

function buildPositionContextBlock(position: Record<string, unknown>, quote: Record<string, unknown> | null): string {
  const lines: string[] = ['## Position Context'];
  lines.push(`Symbol: ${position.symbol}`);
  lines.push(`Underlying: ${position.underlying_symbol ?? 'unknown'}`);
  lines.push(`Option type: ${position.option_type === 'P' ? 'Put' : position.option_type === 'C' ? 'Call' : 'unknown'}`);
  lines.push(`Strike: ${position.strike_price ?? 'unknown'}`);
  lines.push(`Quantity (signed): ${position.position_qty}`);
  lines.push(`Account: ${position.account_name}`);
  if (position.open_leg && typeof position.open_leg === 'object') {
    const leg = position.open_leg as Record<string, unknown>;
    lines.push(`Entry date: ${leg.value_date}`);
    lines.push(`Entry price: ${leg.price}`);
    lines.push(`Premium collected: ${position.sale_cost}`);
  }
  lines.push(`Underlying current price: ${position.underlying_current_price ?? 'unknown'}`);
  lines.push(`Option mark price: ${position.option_current_price ?? 'unknown'}`);
  lines.push(`Unrealized P/L: ${position.unrealized_pnl ?? 'unknown'}`);

  if (quote) {
    lines.push('');
    lines.push('## Live Greeks (from Questrade)');
    if (quote.delta != null) lines.push(`Delta: ${quote.delta}`);
    if (quote.gamma != null) lines.push(`Gamma: ${quote.gamma}`);
    if (quote.theta != null) lines.push(`Theta: ${quote.theta} (per share per day)`);
    if (quote.vega != null) lines.push(`Vega: ${quote.vega}`);
    if (quote.rho != null) lines.push(`Rho: ${quote.rho}`);
    if (quote.volatility != null) lines.push(`Implied Volatility: ${(Number(quote.volatility)).toFixed(1)}%`);
    if (quote.openInterest != null) lines.push(`Open Interest: ${quote.openInterest}`);
    if (quote.bidPrice != null && quote.askPrice != null)
      lines.push(`Bid / Ask: ${quote.bidPrice} / ${quote.askPrice}`);
    if (quote.volume != null) lines.push(`Volume: ${quote.volume}`);
  }

  return lines.join('\n');
}

export function createInvestmentsRouter(): Router {
  const router = Router();

  /**
   * POST /api/investments/option-quote
   * Fetch live Greeks + market data from Questrade for an open option holding.
   * Body: { instrument_id: string }
   */
  router.post('/option-quote', authMiddleware, async (req: Request, res: Response) => {
    const auth = getAuthContext(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const orgId = auth.user.org_id;

    const { instrument_id } = req.body as { instrument_id?: string };
    if (!instrument_id) return res.status(400).json({ error: 'instrument_id is required' });

    try {
      const instrument = await prisma.instrument.findFirst({
        where: { id: instrument_id },
        select: { external_symbol_id: true, symbol: true },
      });

      if (!instrument) {
        return res.status(404).json({ error: 'Instrument not found' });
      }

      const connection = await prisma.source_system.findFirst({
        where: { org_id: orgId, system_type: 'questrade', is_active: true },
        orderBy: { last_sync_at: 'desc' },
        select: { id: true },
      });

      if (!connection) return res.status(404).json({ error: 'No active Questrade connection' });

      const { connector } = await createBrokerConnector(connection.id);
      await connector.ensureAuth();

      if (!connector.getOptionQuotes) {
        return res.status(501).json({ error: 'Broker connector does not support option quotes' });
      }

      // Resolve symbolId: prefer cached external_symbol_id, fall back to symbol search
      let symbolId = instrument.external_symbol_id;
      if (!symbolId) {
        if (!connector.searchSymbol) {
          return res.status(404).json({ error: 'Instrument has no Questrade symbol ID and broker does not support symbol search' });
        }
        const found = await connector.searchSymbol(instrument.symbol);
        if (!found?.symbolId) {
          return res.status(404).json({ error: `Could not resolve Questrade symbol ID for ${instrument.symbol}` });
        }
        symbolId = found.symbolId;
        // Persist so future calls skip the search
        await prisma.instrument.update({
          where: { id: instrument_id },
          data: { external_symbol_id: symbolId },
        });
      }

      const quotes = await connector.getOptionQuotes({ optionIds: [symbolId] });
      const quote = quotes[0] ?? null;

      return res.json({ quote });
    } catch (error) {
      logger.error('Failed to fetch option quote', { error, instrument_id, orgId });
      return res.status(500).json({ error: 'Failed to fetch live quote from Questrade' });
    }
  });

  /**
   * POST /api/investments/option-analysis
   * Stream an LLM analysis of an open option position with conversation history.
   * Body: { messages: UIMessage[], positionContext: object, liveQuote: object | null }
   */
  router.post('/option-analysis', authMiddleware, async (req: Request, res: Response) => {
    const auth = getAuthContext(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { messages, positionContext, liveQuote } = req.body as {
      messages?: UIMessage[];
      positionContext?: Record<string, unknown>;
      liveQuote?: Record<string, unknown> | null;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }
    if (!positionContext) {
      return res.status(400).json({ error: 'positionContext is required' });
    }

    try {
      const contextBlock = buildPositionContextBlock(positionContext, liveQuote ?? null);
      const systemPrompt = `${OPTION_ANALYSIS_SYSTEM}\n\n${contextBlock}`;

      const result = streamText({
        model: getModel('agent'),
        system: systemPrompt,
        messages: convertToCoreMessages(messages),
        onError: ({ error }) => {
          logger.error('streamText error in option-analysis', { error });
        },
      });

      result.pipeDataStreamToResponse(res);
    } catch (error) {
      logger.error('Error in POST /api/investments/option-analysis', { error });
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to stream analysis' });
      }
      res.end();
    }
  });

  return router;
}
