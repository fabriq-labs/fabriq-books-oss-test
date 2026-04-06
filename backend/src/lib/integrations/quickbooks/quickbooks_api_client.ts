/**
 * QuickBooks Online API Client
 * 
 * Handles authentication and API calls to QuickBooks Online for creating purchase orders.
 * Uses OAuth 2.0 with refresh token for authentication.
 * 
 * Credentials required:
 * - client_id (OAuth Client ID)
 * - client_secret (OAuth Client Secret)
 * - refresh_token (OAuth Refresh Token)
 * - realm_id (Company ID - required for all API calls)
 * - environment (optional, 'sandbox' or 'production', default: 'production')
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../../../utils/logger';
import prisma from '../../../lib/prisma';

interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface QuickBooksPurchaseOrder {
  VendorRef: {
    value: string;
    name?: string;
  };
  APAccountRef?: {
    value: string;
    name?: string;
  };
  Line?: Array<{
    Id?: string;
    Amount?: number;
    DetailType: string;
    ItemBasedExpenseLineDetail?: {
      ItemRef?: {
        value: string;
        name?: string;
      };
      UnitPrice?: number;
      Qty?: number;
      TaxCodeRef?: {
        value: string;
      };
      BillableStatus?: string;
    };
    Description?: string;
  }>;
  TxnDate: string;
  DueDate?: string;
  RefNumber?: string;
  CurrencyRef?: {
    value: string;
    name?: string;
  };
  ExchangeRate?: number;
  PrivateNote?: string;
  GlobalTaxCalculation?: string;
  TotalAmt?: number;
}

export interface QuickBooksCreatePOResponse {
  QueryResponse?: {
    PurchaseOrder?: Array<{
      Id: string;
      DocNumber: string;
      [key: string]: any;
    }>;
  };
  PurchaseOrder?: {
    Id: string;
    DocNumber: string;
    [key: string]: any;
  };
  time?: string;
}

export interface QuickBooksOAuthConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  realm_id: string;
  environment?: 'sandbox' | 'production';
  connectionId?: string; // Optional connection ID for persisting refresh token updates
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

    // Set base URL based on environment
    this.baseURL = this.environment === 'sandbox'
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';

    // Create axios instance with base URL
    this.axiosInstance = axios.create({
      baseURL: `${this.baseURL}/v3/company/${this.realmId}`,
      timeout: 30000, // 30 seconds
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include access token
    this.axiosInstance.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      if (this.accessToken) {
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  /**
   * Ensure we have a valid access token, refreshing if needed
   */
  private async ensureValidToken(): Promise<void> {
    // Check if token exists and is not expired
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return; // Token is still valid
    }

    // Token is missing or expired, refresh it
    await this.refreshAccessToken();
  }

  /**
   * Refresh access token using refresh token
   * 
   * Uses Basic authentication (client_id:client_secret as base64) for OAuth token refresh.
   * Note: OAuth token endpoint is the same for both sandbox and production environments.
   */
  private async refreshAccessToken(): Promise<void> {
    try {
      logger.info('Refreshing QuickBooks access token...');

      // OAuth token endpoint is the same for both sandbox and production
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
            'Accept': 'application/json',
            // Use Basic auth header (consistent with test-connection endpoint)
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          },
        }
      );

      if (response.data.access_token) {
        this.accessToken = response.data.access_token;
        
        // Calculate expiration time (default 1 hour = 3600 seconds)
        const expiresIn = response.data.expires_in || 3600;
        this.tokenExpiresAt = new Date(Date.now() + (expiresIn - 300) * 1000); // Refresh 5 min before expiry

        // Update refresh token if provided (some OAuth flows return new refresh token)
        if (response.data.refresh_token) {
          const newRefreshToken = response.data.refresh_token;
          this.refreshToken = newRefreshToken;
          logger.info('QuickBooks refresh token updated in memory');
          
          // Persist new refresh token to database if connectionId is provided
          if (this.connectionId) {
            await this.updateRefreshTokenInDatabase(newRefreshToken);
          }
        }

        logger.info('✅ Successfully refreshed QuickBooks access token', {
          expiresAt: this.tokenExpiresAt.toISOString(),
        });
      } else {
        throw new Error('No access token in refresh response');
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

  /**
   * Create a purchase order in QuickBooks Online
   */
  async createPurchaseOrder(po: QuickBooksPurchaseOrder): Promise<QuickBooksCreatePOResponse> {
    try {
      await this.ensureValidToken();

      logger.info('Creating purchase order in QuickBooks', {
        vendorId: po.VendorRef?.value,
        lineItemsCount: po.Line?.length || 0,
        realmId: this.realmId,
        endpoint: `/purchaseorder`,
      });

      // QuickBooks API: purchase orders are sent directly (not wrapped)
      const response = await this.axiosInstance.post<QuickBooksCreatePOResponse>(
        '/purchaseorder',
        po
      );

      if (response.data.PurchaseOrder) {
        logger.info('✅ Successfully created purchase order in QuickBooks', {
          purchaseOrderId: response.data.PurchaseOrder.Id,
          docNumber: response.data.PurchaseOrder.DocNumber,
        });
        return response.data;
      } else {
        throw new Error('QuickBooks API returned success but no purchase order data');
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to create purchase order in QuickBooks', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      // Provide more helpful error messages
      if (axiosError.response?.status === 401) {
        throw new Error('QuickBooks authentication failed. Please check your credentials.');
      } else if (axiosError.response?.status === 400) {
        const errorData = axiosError.response.data as any;
        const fault = errorData?.Fault;
        if (fault) {
          const errorDetail = fault.Error?.[0] || fault.error?.[0];
          throw new Error(
            `QuickBooks API error: ${errorDetail?.Message || errorDetail?.message || 'Invalid request'}`
          );
        }
      } else if (axiosError.response?.data) {
        const errorData = axiosError.response.data as any;
        const fault = errorData?.Fault;
        if (fault) {
          const errorDetail = fault.Error?.[0] || fault.error?.[0];
          throw new Error(
            `QuickBooks API error: ${errorDetail?.Message || errorDetail?.message || 'Unknown error'}`
          );
        }
      }

      throw new Error(`Failed to create purchase order in QuickBooks: ${axiosError.message}`);
    }
  }

  /**
   * Get purchase order by ID
   */
  async getPurchaseOrder(purchaseOrderId: string): Promise<any> {
    try {
      await this.ensureValidToken();

      // QuickBooks uses SQL-like query syntax
      const query = `SELECT * FROM PurchaseOrder WHERE Id = '${purchaseOrderId}'`;
      const response = await this.axiosInstance.get(`/query?query=${encodeURIComponent(query)}`);

      if (response.data.QueryResponse?.PurchaseOrder?.[0]) {
        return response.data.QueryResponse.PurchaseOrder[0];
      } else {
        throw new Error('Purchase order not found');
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to get purchase order from QuickBooks', {
        purchaseOrderId,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });
      throw new Error(`Failed to get purchase order from QuickBooks: ${axiosError.message}`);
    }
  }

  /**
   * Get Accounts Payable accounts from QuickBooks Chart of Accounts
   * For QuickBooks, the default purchase account must be a Liability account
   * with AccountSubType = 'AccountsPayable'
   */
  async getExpenseAccounts(): Promise<Array<{ account_id: string; account_name: string }>> {
    try {
      await this.ensureValidToken();

      logger.info('Fetching Accounts Payable accounts from QuickBooks', {
        realmId: this.realmId,
      });

      // QuickBooks uses SQL-like query syntax
      // Query for Accounts Payable accounts: Classification = 'Liability' AND AccountSubType = 'AccountsPayable'
      const query = "SELECT Id, Name, Classification, AccountType, AccountSubType FROM Account WHERE Classification = 'Liability' AND AccountSubType = 'AccountsPayable' AND Active = true";
      const response = await this.axiosInstance.get(`/query?query=${encodeURIComponent(query)}`);

      if (response.data.QueryResponse?.Account) {
        // Normalize to array: QuickBooks API returns single object or array
        const accountData = Array.isArray(response.data.QueryResponse.Account)
          ? response.data.QueryResponse.Account
          : [response.data.QueryResponse.Account];
        
        const accounts = accountData.map((account: any) => ({
          account_id: account.Id,
          account_name: account.Name,
        }));

        logger.info('✅ Successfully fetched Accounts Payable accounts from QuickBooks', {
          count: accounts.length,
        });

        return accounts;
      } else {
        return [];
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Failed to get Accounts Payable accounts from QuickBooks', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      if (axiosError.response?.data) {
        const errorData = axiosError.response.data as any;
        const fault = errorData?.Fault;
        if (fault) {
          const errorDetail = fault.Error?.[0] || fault.error?.[0];
          throw new Error(
            `QuickBooks API error: ${errorDetail?.Message || errorDetail?.message || 'Unknown error'}`
          );
        }
      }

      throw new Error(`Failed to get Accounts Payable accounts from QuickBooks: ${axiosError.message}`);
    }
  }

  /**
   * Update the refresh token in the source_system database record
   * This ensures the new refresh token is persisted and available for other processes
   */
  private async updateRefreshTokenInDatabase(newRefreshToken: string): Promise<void> {
    if (!this.connectionId) {
      return; // No connection ID, skip database update
    }

    try {
      // Get current connection config
      const connection = await prisma.source_system.findUnique({
        where: { id: this.connectionId },
      });

      if (!connection) {
        logger.warn(`Connection ${this.connectionId} not found, skipping refresh token update`);
        return;
      }

      // connection_config is automatically decrypted by Prisma middleware
      const connectionConfig = connection.connection_config as any;
      
      if (!connectionConfig || !connectionConfig.oauth) {
        logger.warn(`Invalid connection_config for ${this.connectionId}, skipping refresh token update`);
        return;
      }

      // Update the refresh token in the config
      const updatedConfig = {
        ...connectionConfig,
        oauth: {
          ...connectionConfig.oauth,
          refresh_token: newRefreshToken,
        },
      };

      // Update the database - Prisma middleware will encrypt it automatically
      await prisma.source_system.update({
        where: { id: this.connectionId },
        data: {
          connection_config: updatedConfig as any,
        },
      });

      logger.info('✅ Successfully updated QuickBooks refresh token in database', {
        connectionId: this.connectionId,
      });
    } catch (error: any) {
      // Log error but don't throw - token refresh succeeded, DB update is secondary
      logger.error('Failed to update refresh token in database', {
        connectionId: this.connectionId,
        error: error.message,
      });
    }
  }
}

