import { AxiosError } from 'axios';
import { QuickBooksAPIClient } from '../quickbooks/quickbooks_api_client';
import { ConnectionConfig } from './erp-connection-loader';
import logger from '../../../src/utils/logger';

export interface TestConnectionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export async function testErpConnection(
  systemType: string,
  credentials: ConnectionConfig['oauth'],
  connectionId?: string
): Promise<TestConnectionResult> {
  try {
    switch (systemType.toLowerCase()) {
      case 'quickbooks':
        return await testQuickBooksConnection(credentials, connectionId);
      case 'zoho_books':
      case 'xero':
      case 'netsuite':
        return {
          success: false,
          message: `${systemType} connection testing is not wired on books yet`,
        };
      default:
        return {
          success: false,
          message: `Unsupported system type: ${systemType}`,
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : `Failed to test ${systemType}`;
    logger.error(`Error testing ${systemType} connection:`, error);
    return { success: false, message };
  }
}

async function testQuickBooksConnection(
  credentials: ConnectionConfig['oauth'],
  connectionId?: string
): Promise<TestConnectionResult> {
  try {
    if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
      return {
        success: false,
        message:
          'Missing required credentials: client_id, client_secret, and refresh_token are required',
      };
    }
    if (!credentials.realm_id) {
      return {
        success: false,
        message: 'Missing required credential: realm_id (Company ID) is required',
      };
    }

    const client = new QuickBooksAPIClient({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
      realm_id: credentials.realm_id,
      environment: credentials.environment || 'production',
      connectionId,
    });

    const accounts = await client.getExpenseAccounts();
    return {
      success: true,
      message: `Successfully connected to QuickBooks Online. Found ${accounts.length} expense account(s).`,
      data: { expenseAccountsCount: accounts.length },
    };
  } catch (error: unknown) {
    const errorInfo: Record<string, unknown> = {
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    if (error instanceof AxiosError) {
      errorInfo.status = error.response?.status;
      errorInfo.responseData = error.response?.data;
    }
    logger.error('QuickBooks connection test failed:', errorInfo);

    let errorMessage = 'Failed to connect to QuickBooks Online';
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('refresh token')) {
      errorMessage = 'Invalid refresh token. Please generate a new refresh token.';
    } else if (msg.includes('client')) {
      errorMessage = 'Invalid client ID or client secret.';
    } else if (msg) {
      errorMessage = msg;
    }
    return { success: false, message: errorMessage };
  }
}
