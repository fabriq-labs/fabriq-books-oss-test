/**
 * Test ERP Connection Utility
 * 
 * Tests ERP connections by making a test API call with provided credentials.
 * Used for validating credentials before saving to database.
 */

import axios, { AxiosError } from 'axios';
import { ZohoBooksAPIClient } from '../zoho_books/zoho_api_client';
import { QuickBooksAPIClient } from '../quickbooks/quickbooks_api_client';
import { ConnectionConfig } from './erp-connection-loader';
import logger from '../../../utils/logger';
import { persistBrokerOAuth } from '../broker/shared/broker-connection-loader';
import { buildQuestradeAccessTokenCache } from '../broker/connectors/questrade/questrade_auth';

export interface TestConnectionResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Test ERP connection with provided credentials
 * 
 * @param systemType - ERP system type (e.g., 'zoho_books', 'xero')
 * @param credentials - OAuth credentials to test
 * @param connectionId - Optional connection ID to save refreshed tokens back to database
 * @returns Test result with success status and message
 */
export async function testErpConnection(
  systemType: string,
  credentials: ConnectionConfig['oauth'],
  connectionId?: string
): Promise<TestConnectionResult> {
  try {
    switch (systemType.toLowerCase()) {
      case 'zoho_books':
        return await testZohoBooksConnection(credentials, connectionId);
      
      case 'xero':
        // TODO: Implement Xero connection test
        return {
          success: false,
          message: 'Xero connection testing not yet implemented',
        };
      
      case 'netsuite':
        // TODO: Implement Netsuite connection test
        return {
          success: false,
          message: 'Netsuite connection testing not yet implemented',
        };
      
      case 'quickbooks':
        return await testQuickBooksConnection(credentials, connectionId);

      case 'questrade':
        return await testQuestradeConnection(credentials, connectionId);
        // eslint-disable-next-line no-fallthrough

      default:
        return {
          success: false,
          message: `Unsupported system type: ${systemType}`,
        };
    }
  } catch (error: any) {
    logger.error(`Error testing ${systemType} connection:`, error);
    return {
      success: false,
      message: error.message || `Failed to test ${systemType} connection`,
    };
  }
}

/**
 * Test Zoho Books connection by fetching organizations
 */
async function testZohoBooksConnection(
  credentials: ConnectionConfig['oauth'],
  connectionId?: string
): Promise<TestConnectionResult> {
  try {
    // Validate required credentials
    if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
      return {
        success: false,
        message: 'Missing required credentials: client_id, client_secret, and refresh_token are required',
      };
    }

    // Create temporary API client
    const client = new ZohoBooksAPIClient({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
      organization_id: credentials.organization_id,
      api_domain: credentials.api_domain || 'www.zohoapis.com',
      accounts_domain: credentials.accounts_domain || 'https://accounts.zoho.com',
    });

    // Test connection by fetching organizations
    const organizations = await client.getOrganizations();

    if (organizations && organizations.length > 0) {
      return {
        success: true,
        message: `Successfully connected to Zoho Books. Found ${organizations.length} organization(s).`,
        data: {
          organizations: organizations.map((org: any) => ({
            organization_id: org.organization_id,
            name: org.name,
            contact_name: org.contact_name,
          })),
        },
      };
    } else {
      return {
        success: false,
        message: 'Connection successful but no organizations found. Please check your organization access.',
      };
    }
  } catch (error: any) {
    // Extract error information without circular references
    const errorInfo: any = {
      message: error.message || 'Unknown error',
    };
    
    if (error instanceof AxiosError) {
      errorInfo.status = error.response?.status;
      errorInfo.statusText = error.response?.statusText;
      errorInfo.responseData = error.response?.data;
      errorInfo.code = error.code;
    }
    
    logger.error('Zoho Books connection test failed:', errorInfo);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to connect to Zoho Books';
    
    if (error.message) {
      if (error.message.includes('refresh token')) {
        errorMessage = 'Invalid refresh token. Please generate a new refresh token.';
      } else if (error.message.includes('client')) {
        errorMessage = 'Invalid client ID or client secret. Please check your credentials.';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * Test QuickBooks Online connection by using the QuickBooksAPIClient
 * This ensures we use the exact same authentication and API calls as the actual connector
 */
async function testQuickBooksConnection(
  credentials: ConnectionConfig['oauth'],
  connectionId?: string
): Promise<TestConnectionResult> {
  try {
    // Validate required credentials
    if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
      return {
        success: false,
        message: 'Missing required credentials: client_id, client_secret, and refresh_token are required',
      };
    }

    if (!credentials.realm_id) {
      return {
        success: false,
        message: 'Missing required credential: realm_id (Company ID) is required for QuickBooks API calls',
      };
    }

    // Use QuickBooksAPIClient for testing - ensures consistency with actual connector
    // Pass connectionId so that refreshed tokens are saved back to the database
    const client = new QuickBooksAPIClient({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
      realm_id: credentials.realm_id,
      environment: credentials.environment || 'production',
      connectionId: connectionId,
    });

    // Test connection by fetching expense accounts (simple query that should work)
    // This validates both authentication and API access
    const accounts = await client.getExpenseAccounts();

    // Connection is valid if we can fetch accounts
    // This proves authentication works and we have API access
    return {
      success: true,
      message: `Successfully connected to QuickBooks Online. Found ${accounts.length} expense account(s).`,
      data: {
        expenseAccountsCount: accounts.length,
      },
    };
  } catch (error: any) {
    // Extract error information without circular references
    const errorInfo: any = {
      message: error.message || 'Unknown error',
    };
    
    if (error instanceof AxiosError) {
      errorInfo.status = error.response?.status;
      errorInfo.statusText = error.response?.statusText;
      errorInfo.responseData = error.response?.data;
      errorInfo.code = error.code;
    }
    
    logger.error('QuickBooks connection test failed:', errorInfo);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to connect to QuickBooks Online';
    
    // Check error message for OAuth errors (may be wrapped in Error object)
    const errorMessageStr = (error.message || '').toLowerCase();
    if (errorMessageStr.includes('invalid_grant') || 
        errorMessageStr.includes('refresh token') || 
        errorMessageStr.includes('incorrect or invalid refresh token') ||
        (errorMessageStr.includes('refresh') && errorMessageStr.includes('400'))) {
      errorMessage = 'Invalid refresh token. This may be due to expiration, revocation, concurrent refresh from another process, or a mismatch with your client credentials. Please generate a new refresh token using the QuickBooks OAuth flow.';
    } else if (error instanceof AxiosError) {
      if (error.response?.status === 401) {
        errorMessage = 'Invalid credentials. Please check your client ID, client secret, and refresh token.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Company not found. Please check your realm_id (Company ID).';
      } else if (error.response?.status === 400) {
        // Try to extract more specific error from QuickBooks API response
        const errorData = error.response?.data as any;
        
        // Check for OAuth token refresh errors
        if (errorData?.error === 'invalid_grant') {
          // invalid_grant can mean: expired, revoked, client mismatch, already used, concurrent refresh, or format issue
          // QuickBooks invalidates the old refresh token when a new one is issued, so concurrent refreshes can cause this error
          errorMessage = 'Invalid refresh token. This may be due to expiration, revocation, concurrent refresh from another process, or a mismatch with your client credentials. Please generate a new refresh token using the QuickBooks OAuth flow.';
        } else if (errorData?.error_description) {
          errorMessage = `QuickBooks OAuth error: ${errorData.error_description}`;
        } else {
          // Check for QuickBooks API Fault errors
          const fault = errorData?.Fault;
          if (fault) {
            const errorDetail = fault.Error?.[0] || fault.error?.[0];
            const qbMessage = errorDetail?.Message || errorDetail?.message;
            if (qbMessage) {
              errorMessage = `QuickBooks API error: ${qbMessage}`;
            } else {
              errorMessage = 'Invalid request. Please check your credentials and realm_id.';
            }
          } else {
            errorMessage = 'Invalid request. Please check your credentials and realm_id.';
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
    } else if (error.message) {
      // Check if error message contains OAuth error info
      if (error.message.includes('invalid_grant') || error.message.includes('refresh token')) {
        errorMessage = 'Invalid refresh token. This may be due to expiration, revocation, concurrent refresh from another process, or a mismatch with your client credentials. Please generate a new refresh token using the QuickBooks OAuth flow.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      message: errorMessage,
    };
  }
}



/**
 * Test Questrade connection.
 * Exchanges the Personal Access Token (PAT) for an access token, then calls
 * GET v1/accounts — a read-only, non-mutating endpoint. If connectionId is
 * supplied (editing an existing connection) the rotated refresh token is
 * persisted back so the connection stays live.
 */
async function testQuestradeConnection(
  credentials: ConnectionConfig['oauth'],
  connectionId?: string
): Promise<TestConnectionResult> {
  const refreshToken = credentials.refresh_token;
  const tokenEndpoint = credentials.token_endpoint || 'https://login.questrade.com/oauth2/token';

  if (!refreshToken) {
    return { success: false, message: 'Personal Access Token (refresh_token) is required' };
  }

  try {
    const tokenResp = await axios.get<{
      access_token: string;
      refresh_token: string;
      api_server: string;
      expires_in: number;
    }>(tokenEndpoint, {
      params: { grant_type: 'refresh_token', refresh_token: refreshToken },
      timeout: 15000,
    });

    const { access_token, refresh_token: newRefreshToken, api_server, expires_in } = tokenResp.data;
    if (!access_token || !api_server) {
      return { success: false, message: 'Questrade returned an incomplete token response' };
    }

    const apiBase = api_server.endsWith('/') ? api_server : `${api_server}/`;

    const accountsResp = await axios.get<{ accounts: Array<{ number: string; type: string; status: string }> }>(
      `${apiBase}v1/accounts`,
      { headers: { Authorization: `Bearer ${access_token}` }, timeout: 15000 }
    );

    const accounts = accountsResp.data.accounts ?? [];
    const accountSummary = accounts.map(a => `${a.type} (${a.number})`).join(', ');

    if (connectionId) {
      // Editing existing connection: persist the rotated token immediately
      await persistBrokerOAuth(connectionId, {
        refresh_token: newRefreshToken,
        api_server: apiBase,
        token_endpoint: tokenEndpoint,
        ...buildQuestradeAccessTokenCache(access_token, apiBase, expires_in ?? 1800),
      });
      return {
        success: true,
        message: `Connected to Questrade. Found ${accounts.length} account${accounts.length !== 1 ? 's' : ''}: ${accountSummary}. Token refreshed and saved.`,
        data: { accounts: accounts.map(a => ({ number: a.number, type: a.type, status: a.status })) },
      };
    }

    // New connection: return the rotated token so the UI can update the form field before saving.
    // The original PAT is now consumed — if the UI saves the original, the first sync will fail.
    return {
      success: true,
      message: `Connected to Questrade. Found ${accounts.length} account${accounts.length !== 1 ? 's' : ''}: ${accountSummary}.`,
      data: {
        accounts: accounts.map(a => ({ number: a.number, type: a.type, status: a.status })),
        new_refresh_token: newRefreshToken,
      },
    };
  } catch (error: any) {
    const axiosError = error as AxiosError<{ error?: string }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    logger.error('Questrade connection test failed', { status, body, message: error.message });

    if (status === 400 || body?.error === 'invalid_grant') {
      return {
        success: false,
        message: 'Invalid or expired Personal Access Token. Generate a new one at the Questrade App Hub.',
      };
    }
    return { success: false, message: error.message || 'Failed to connect to Questrade' };
  }
}
