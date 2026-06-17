import axios, { AxiosError, AxiosInstance } from 'axios';
import logger from '../../../../../utils/logger';
import {
  BrokerAccountDTO,
  BrokerBalanceDTO,
  BrokerConnector,
  BrokerPositionDTO,
  BrokerTradeDTO,
} from '../types';
import { BrokerOAuthConfig } from '../types';
import { QuestradeAuth } from './questrade_auth';
import { mapAccount, mapBalance, mapPosition, mapActivity } from './questrade_mappers';

const MAX_ACTIVITY_WINDOW_DAYS = 31;

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
    if (!this.http) {
      await this.ensureAuth();
    }
    const session = await this.auth.ensureAuth();
    try {
      const response = await this.http!.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${session.accessToken}` },
        baseURL: session.apiServer,
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        // Access token expired mid-sync: refresh once and retry.
        const retry = await this.auth.forceRefresh();
        this.http = axios.create({ baseURL: retry.apiServer, timeout: 30000 });
        const response = await this.http.get<T>(path, {
          params,
          headers: { Authorization: `Bearer ${retry.accessToken}` },
        });
        return response.data;
      }
      logger.error(`Questrade API request failed: ${path}`, {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });
      throw error;
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
      const data = await this.request<{ activities: any[] }>(
        `v1/accounts/${accountExternalId}/activities`,
        { startTime: windowStart.toISOString(), endTime: windowEnd.toISOString() }
      );
      for (const activity of data.activities ?? []) {
        const mapped = mapActivity(accountExternalId, activity);
        if (mapped) {
          trades.push(mapped);
        }
      }
    }
    return trades;
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
