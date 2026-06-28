import axios, { AxiosError, AxiosInstance } from 'axios';
import logger from '../../../../../utils/logger';
import {
  BrokerAccountDTO,
  BrokerBalanceDTO,
  BrokerConnector,
  BrokerOptionChainDTO,
  BrokerOptionQuoteDTO,
  BrokerOptionQuoteRequest,
  BrokerPositionDTO,
  BrokerQuoteDTO,
  BrokerSymbolDTO,
  BrokerTradeDTO,
} from '../types';
import { BrokerOAuthConfig } from '../types';
import { QuestradeAuth } from './questrade_auth';
import { mapAccount, mapBalance, mapPosition, mapActivity, mapSymbol, mapQuote } from './questrade_mappers';
import { mapOptionChain, mapOptionQuote } from './questrade_option_mappers';

const MAX_ACTIVITY_WINDOW_DAYS = 30;
const RATE_LIMIT_LOW_THRESHOLD = 5;
const RATE_LIMIT_BACKOFF_MS = 1000;

export class QuestradeConnector implements BrokerConnector {
  private readonly auth: QuestradeAuth;
  private http: AxiosInstance | null = null;

  constructor(connectionId: string, oauth: BrokerOAuthConfig) {
    this.auth = new QuestradeAuth(connectionId, oauth);
  }

  getSystemType(): string {
    return 'questrade';
  }

  async ensureAuth(): Promise<void> {
    const session = await this.auth.ensureAuth();
    this.http = axios.create({ baseURL: session.apiServer, timeout: 30000 });
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const { data } = await this.requestWithHeaders<T>('GET', path, undefined, params);
    return data;
  }

  private parseRateLimitRemaining(headers: unknown): number | null {
    if (!headers || typeof headers !== 'object') return null;
    const h = headers as Record<string, unknown>;
    const raw = h['x-ratelimit-remaining'] ?? h['X-RateLimit-Remaining'];
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private async maybeBackoffForRateLimit(headers: unknown): Promise<void> {
    const remaining = this.parseRateLimitRemaining(headers);
    if (remaining != null && remaining <= RATE_LIMIT_LOW_THRESHOLD) {
      logger.warn(`Questrade rate limit low (${remaining}); backing off ${RATE_LIMIT_BACKOFF_MS}ms`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_BACKOFF_MS));
    }
  }

  private async requestWithHeaders<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<{ data: T; headers: unknown }> {
    if (!this.http) {
      await this.ensureAuth();
    }
    const session = await this.auth.ensureAuth();
    const execute = async () => {
      if (method === 'GET') {
        return this.http!.get<T>(path, {
          params,
          headers: { Authorization: `Bearer ${session.accessToken}` },
          baseURL: session.apiServer,
        });
      }
      return this.http!.post<T>(path, body ?? {}, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        baseURL: session.apiServer,
      });
    };

    try {
      const response = await execute();
      await this.maybeBackoffForRateLimit(response.headers);
      return { data: response.data, headers: response.headers };
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        const retry = await this.auth.forceRefresh();
        this.http = axios.create({ baseURL: retry.apiServer, timeout: 30000 });
        const response = await this.http.request<T>({
          method,
          url: path,
          params,
          data: body,
          headers: {
            Authorization: `Bearer ${retry.accessToken}`,
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
        });
        await this.maybeBackoffForRateLimit(response.headers);
        return { data: response.data, headers: response.headers };
      }
      const status = axiosError.response?.status;
      const responseBody = axiosError.response?.data;
      logger.error(`Questrade API request failed: ${method} ${path}`, { status, body: responseBody });
      throw new Error(
        `Questrade API ${method} ${path} failed with status ${status}: ${JSON.stringify(responseBody ?? {})}`
      );
    }
  }

  async getAccounts(): Promise<BrokerAccountDTO[]> {
    const data = await this.request<{ accounts: any[] }>('v1/accounts');
    return (data.accounts ?? []).map(mapAccount);
  }

  async getBalances(accountExternalId: string): Promise<BrokerBalanceDTO[]> {
    const data = await this.request<{ perCurrencyBalances: any[] }>(
      `v1/accounts/${accountExternalId}/balances`
    );
    return (data.perCurrencyBalances ?? []).map(mapBalance);
  }

  async getPositions(accountExternalId: string): Promise<BrokerPositionDTO[]> {
    const data = await this.request<{ positions: any[] }>(
      `v1/accounts/${accountExternalId}/positions`
    );
    return (data.positions ?? []).map((p) => mapPosition(p));
  }

  async getActivities(
    accountExternalId: string,
    startTime: Date,
    endTime: Date
  ): Promise<BrokerTradeDTO[]> {
    const trades: BrokerTradeDTO[] = [];
    for (const [windowStart, windowEnd] of chunkWindows(startTime, endTime)) {
      let data: { activities: any[] };
      try {
        data = await this.request<{ activities: any[] }>(
          `v1/accounts/${accountExternalId}/activities`,
          { startTime: windowStart.toISOString(), endTime: windowEnd.toISOString() }
        );
      } catch (err) {
        // Some account types return 400 for activity windows with no history — skip window
        logger.warn(`Skipping activity window for account ${accountExternalId}: ${(err as Error).message}`);
        continue;
      }
      for (const activity of data.activities ?? []) {
        const mapped = mapActivity(accountExternalId, activity);
        if (mapped) {
          trades.push(mapped);
        }
      }
    }
    return trades;
  }

  async getSymbol(symbolId: number): Promise<BrokerSymbolDTO | null> {
    const data = await this.request<{ symbols?: unknown[]; symbol?: unknown }>(
      `v1/symbols/${symbolId}`
    );
    const raw = data.symbols?.[0] ?? data.symbol;
    if (!raw || typeof raw !== 'object') return null;
    return mapSymbol(raw as Parameters<typeof mapSymbol>[0]);
  }

  async getQuotes(symbolIds: number[]): Promise<BrokerQuoteDTO[]> {
    if (symbolIds.length === 0) return [];
    const data = await this.request<{ quotes: unknown[] }>('v1/markets/quotes', {
      ids: symbolIds.join(','),
    });
    return (data.quotes ?? []).map((q) => mapQuote(q as Parameters<typeof mapQuote>[0]));
  }

  async searchSymbol(symbol: string): Promise<BrokerSymbolDTO | null> {
    const data = await this.request<{ symbols: unknown[] }>('v1/symbols', {
      names: symbol,
    });
    const rows = data.symbols ?? [];
    const exact =
      rows.find(
        (row) =>
          typeof row === 'object' &&
          row != null &&
          (row as { symbol?: string }).symbol?.toUpperCase() === symbol.toUpperCase()
      ) ?? rows[0];
    if (!exact || typeof exact !== 'object') return null;
    return mapSymbol(exact as Parameters<typeof mapSymbol>[0]);
  }

  async getOptionChain(underlyingSymbolId: number, underlyingSymbol?: string): Promise<BrokerOptionChainDTO> {
    const data = await this.request<{ options?: unknown[] }>(`v1/symbols/${underlyingSymbolId}/options`);
    return mapOptionChain(underlyingSymbolId, data as Parameters<typeof mapOptionChain>[1], underlyingSymbol);
  }

  async getOptionQuotes(request: BrokerOptionQuoteRequest): Promise<BrokerOptionQuoteDTO[]> {
    const { data } = await this.requestWithHeaders<{ optionQuotes?: unknown[] }>(
      'POST',
      'v1/markets/quotes/options',
      request
    );
    return (data.optionQuotes ?? []).map((q) => mapOptionQuote(q as Parameters<typeof mapOptionQuote>[0]));
  }
}

/** Split [start, end] into <=31-day windows (Questrade activities API limit). */
function chunkWindows(start: Date, end: Date): Array<[Date, Date]> {
  const windows: Array<[Date, Date]> = [];
  const windowMs = MAX_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let cursor = start.getTime();
  const endMs = end.getTime();
  while (cursor < endMs) {
    const next = Math.min(cursor + windowMs, endMs);
    windows.push([new Date(cursor), new Date(next)]);
    cursor = next;
  }
  if (windows.length === 0) {
    windows.push([start, end]);
  }
  return windows;
}
