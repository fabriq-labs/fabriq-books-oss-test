/**
 * QuickBooks Online API client — OAuth refresh + connection probe (Phase 2).
 * Reverse sync (PO create) stays out of scope.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import prisma from '../../../src/lib/prisma';
import logger from '../../../src/utils/logger';

interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface QuickBooksOAuthConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  realm_id: string;
  environment?: 'sandbox' | 'production';
  connectionId?: string;
}

export class QuickBooksAPIClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private realmId: string;
  private environment: 'sandbox' | 'production';
  private connectionId: string | undefined;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private axiosInstance: AxiosInstance;
  private baseURL: string;

  constructor(oauthConfig: QuickBooksOAuthConfig) {
    this.clientId = oauthConfig.client_id;
    this.clientSecret = oauthConfig.client_secret;
    this.refreshToken = oauthConfig.refresh_token;
    this.realmId = oauthConfig.realm_id;
    this.environment = oauthConfig.environment || 'production';
    this.connectionId = oauthConfig.connectionId;

    if (!this.clientId || !this.clientSecret || !this.refreshToken || !this.realmId) {
      throw new Error(
        'Missing QuickBooks OAuth credentials. Required: client_id, client_secret, refresh_token, realm_id'
      );
    }

    this.baseURL =
      this.environment === 'sandbox'
        ? 'https://sandbox-quickbooks.api.intuit.com'
        : 'https://quickbooks.api.intuit.com';

    this.axiosInstance = axios.create({
      baseURL: `${this.baseURL}/v3/company/${this.realmId}`,
      timeout: 30000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  private async ensureValidToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return;
    }
    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
      const response = await axios.post<QuickBooksTokenResponse>(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          },
        }
      );

      if (!response.data.access_token) {
        throw new Error('No access token in refresh response');
      }

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiresAt = new Date(Date.now() + (expiresIn - 300) * 1000);

      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
        if (this.connectionId) {
          await this.updateRefreshTokenInDatabase(response.data.refresh_token);
        }
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to refresh QuickBooks access token', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });
      throw new Error(`Failed to refresh QuickBooks access token: ${axiosError.message}`);
    }
  }

  /** Probe Accounts Payable accounts — validates OAuth + realm access. */
  async getExpenseAccounts(): Promise<Array<{ account_id: string; account_name: string }>> {
    await this.ensureValidToken();
    const query =
      "SELECT Id, Name, Classification, AccountType, AccountSubType FROM Account WHERE Classification = 'Liability' AND AccountSubType = 'AccountsPayable' AND Active = true";
    const response = await this.axiosInstance.get(`/query?query=${encodeURIComponent(query)}`);

    if (!response.data.QueryResponse?.Account) {
      return [];
    }

    const accountData = Array.isArray(response.data.QueryResponse.Account)
      ? response.data.QueryResponse.Account
      : [response.data.QueryResponse.Account];

    return accountData.map((account: { Id: string; Name: string }) => ({
      account_id: account.Id,
      account_name: account.Name,
    }));
  }

  private async updateRefreshTokenInDatabase(newRefreshToken: string): Promise<void> {
    if (!this.connectionId) return;
    try {
      const connection = await prisma.source_system.findUnique({
        where: { id: this.connectionId },
      });
      if (!connection) return;

      const connectionConfig = connection.connection_config as {
        oauth?: Record<string, unknown>;
      } | null;
      if (!connectionConfig?.oauth) return;

      await prisma.source_system.update({
        where: { id: this.connectionId },
        data: {
          connection_config: {
            ...connectionConfig,
            oauth: {
              ...connectionConfig.oauth,
              refresh_token: newRefreshToken,
            },
          } as object,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to update refresh token in database', {
        connectionId: this.connectionId,
        error: message,
      });
    }
  }
}
