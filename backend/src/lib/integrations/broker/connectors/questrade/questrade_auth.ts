import axios, { AxiosError } from 'axios';
import logger from '../../../../../utils/logger';
import { BrokerOAuthConfig, ReauthRequiredError } from '../types';
import { persistBrokerOAuth } from '../../shared/broker-connection-loader';

const DEFAULT_TOKEN_ENDPOINT = 'https://login.questrade.com/oauth2/token';

interface QuestradeTokenResponse {
  access_token: string;
  refresh_token: string;
  api_server: string;
  expires_in: number;
  token_type: string;
}

export interface QuestradeSession {
  accessToken: string;
  apiServer: string;
}

/**
 * Manages Questrade OAuth2 with rotating refresh tokens. The refresh token is
 * single-use: every successful refresh returns a new one that MUST be persisted
 * immediately, or the connection becomes unusable.
 */
export class QuestradeAuth {
  private accessToken: string | null = null;
  private apiServer: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private refreshToken: string;
  private readonly tokenEndpoint: string;

  constructor(private readonly connectionId: string, oauth: BrokerOAuthConfig) {
    this.refreshToken = oauth.refresh_token;
    this.apiServer = oauth.api_server ?? null;
    this.tokenEndpoint = oauth.token_endpoint || DEFAULT_TOKEN_ENDPOINT;
    if (!this.refreshToken) {
      throw new ReauthRequiredError('No refresh token configured for Questrade connection');
    }
  }

  async ensureAuth(): Promise<QuestradeSession> {
    if (this.accessToken && this.apiServer && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return { accessToken: this.accessToken, apiServer: this.apiServer };
    }
    return this.refresh();
  }

  /** Force a token refresh, used on a mid-sync 401. */
  async forceRefresh(): Promise<QuestradeSession> {
    this.accessToken = null;
    return this.refresh();
  }

  getApiServer(): string {
    if (!this.apiServer) {
      throw new Error('Questrade api_server not yet resolved; call ensureAuth() first');
    }
    return this.apiServer;
  }

  private async refresh(): Promise<QuestradeSession> {
    try {
      logger.info(`Refreshing Questrade access token for connection ${this.connectionId}`);
      const response = await axios.get<QuestradeTokenResponse>(this.tokenEndpoint, {
        params: { grant_type: 'refresh_token', refresh_token: this.refreshToken },
        timeout: 30000,
      });

      const { access_token, refresh_token, api_server, expires_in } = response.data;
      if (!access_token || !api_server || !refresh_token) {
        throw new Error('Incomplete token response from Questrade');
      }

      this.accessToken = access_token;
      this.apiServer = api_server.endsWith('/') ? api_server : `${api_server}/`;
      this.refreshToken = refresh_token;
      this.tokenExpiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

      await persistBrokerOAuth(this.connectionId, {
        refresh_token: refresh_token,
        api_server: this.apiServer,
        token_endpoint: this.tokenEndpoint,
      });

      return { accessToken: this.accessToken, apiServer: this.apiServer };
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string }>;
      const status = axiosError.response?.status;
      const body = axiosError.response?.data;
      if (status === 400 || body?.error === 'invalid_grant') {
        logger.error(`Questrade refresh token rejected for connection ${this.connectionId}`, { status, body });
        throw new ReauthRequiredError('Questrade refresh token is invalid or expired. Re-paste a new Personal Access Token.');
      }
      logger.error(`Failed to refresh Questrade token for connection ${this.connectionId}`, {
        status,
        message: axiosError.message,
      });
      throw new Error(`Failed to refresh Questrade token: ${axiosError.message}`);
    }
  }
}
