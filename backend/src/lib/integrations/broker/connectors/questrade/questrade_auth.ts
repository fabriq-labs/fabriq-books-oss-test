import axios, { AxiosError } from 'axios';
import logger from '../../../../../utils/logger';
import { BrokerOAuthConfig, ReauthRequiredError } from '../types';
import { persistBrokerOAuth } from '../../shared/broker-connection-loader';

const DEFAULT_TOKEN_ENDPOINT = 'https://login.questrade.com/oauth2/token';
/** Refresh slightly before Questrade invalidates the access token (see expires_in). */
const ACCESS_TOKEN_BUFFER_MS = 60_000;

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

/** Coalesce concurrent OAuth refreshes per connection (parallel MCP tool calls). */
const refreshLocks = new Map<string, Promise<QuestradeSession>>();

function computeAccessTokenExpiry(expiresInSeconds: number): Date {
  return new Date(Date.now() + Math.max(0, expiresInSeconds) * 1000 - ACCESS_TOKEN_BUFFER_MS);
}

function isAccessTokenValid(accessToken: string | null | undefined, expiresAt: Date | null): boolean {
  return Boolean(accessToken && expiresAt && new Date() < expiresAt);
}

function normalizeApiServer(apiServer: string): string {
  return apiServer.endsWith('/') ? apiServer : `${apiServer}/`;
}

/**
 * Manages Questrade OAuth2 with rotating refresh tokens. The refresh token is
 * single-use: every successful refresh returns a new one that MUST be persisted
 * immediately, or the connection becomes unusable.
 *
 * Access tokens are short-lived (Questrade docs: 300–1800s). We persist a cached
 * access_token + access_token_expires_at in connection_config so new connector
 * instances (e.g. successive MCP tool calls) reuse a valid token without hitting
 * the OAuth endpoint or rotating the refresh token unnecessarily.
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
    this.hydrateFromPersistedAccessToken(oauth);
  }

  async ensureAuth(): Promise<QuestradeSession> {
    if (isAccessTokenValid(this.accessToken, this.tokenExpiresAt) && this.apiServer) {
      return { accessToken: this.accessToken!, apiServer: this.apiServer };
    }
    return this.refresh();
  }

  /** Force a token refresh, used on a mid-sync 401. */
  async forceRefresh(): Promise<QuestradeSession> {
    this.accessToken = null;
    this.tokenExpiresAt = null;
    return this.refresh();
  }

  getApiServer(): string {
    if (!this.apiServer) {
      throw new Error('Questrade api_server not yet resolved; call ensureAuth() first');
    }
    return this.apiServer;
  }

  private hydrateFromPersistedAccessToken(oauth: BrokerOAuthConfig): void {
    if (!oauth.access_token || !oauth.access_token_expires_at) {
      return;
    }
    const expiresAt = new Date(oauth.access_token_expires_at);
    if (!isAccessTokenValid(oauth.access_token, expiresAt)) {
      return;
    }
    this.accessToken = oauth.access_token;
    this.tokenExpiresAt = expiresAt;
    if (oauth.api_server) {
      this.apiServer = normalizeApiServer(oauth.api_server);
    }
    logger.debug(`Reusing persisted Questrade access token for connection ${this.connectionId}`, {
      expiresAt: expiresAt.toISOString(),
    });
  }

  private async refresh(): Promise<QuestradeSession> {
    const inFlight = refreshLocks.get(this.connectionId);
    if (inFlight) {
      logger.debug(`Awaiting in-flight Questrade token refresh for connection ${this.connectionId}`);
      return inFlight;
    }

    const refreshPromise = this.performRefresh().finally(() => {
      refreshLocks.delete(this.connectionId);
    });
    refreshLocks.set(this.connectionId, refreshPromise);
    return refreshPromise;
  }

  private async performRefresh(): Promise<QuestradeSession> {
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
      this.apiServer = normalizeApiServer(api_server);
      this.refreshToken = refresh_token;
      this.tokenExpiresAt = computeAccessTokenExpiry(expires_in);

      await persistBrokerOAuth(this.connectionId, {
        refresh_token,
        api_server: this.apiServer,
        token_endpoint: this.tokenEndpoint,
        access_token,
        access_token_expires_at: this.tokenExpiresAt.toISOString(),
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

/** @internal */
export function __resetQuestradeRefreshLocksForTests(): void {
  refreshLocks.clear();
}

/** Build oauth cache fields after a successful token exchange (test connection, etc.). */
export function buildQuestradeAccessTokenCache(
  accessToken: string,
  apiServer: string,
  expiresInSeconds: number
): Pick<BrokerOAuthConfig, 'access_token' | 'access_token_expires_at' | 'api_server'> {
  const normalized = normalizeApiServer(apiServer);
  return {
    access_token: accessToken,
    api_server: normalized,
    access_token_expires_at: computeAccessTokenExpiry(expiresInSeconds).toISOString(),
  };
}
