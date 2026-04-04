/**
 * ERP Connector Factory
 * 
 * Creates and returns the appropriate ERPConnector based on connection ID.
 * Loads OAuth credentials from database connection.
 */

import { ERPConnector } from './types';
import { ZohoBooksConnector } from '../zoho_books/connectors/purchase_order_connector';
import { QuickBooksConnector } from '../quickbooks/connectors/purchase_order_connector';
import prisma from '../../../lib/prisma';
import logger from '../../../utils/logger';

/**
 * Create an ERP connector instance from a connection ID
 * @param connectionId The source_system connection ID
 * @returns The appropriate ERPConnector implementation
 * @throws Error if connection not found, inactive, or invalid
 */
export async function createERPConnector(
  connectionId: string
): Promise<ERPConnector> {
  try {
    // Load connection from database
    const connection = await prisma.source_system.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (!connection.is_active) {
      throw new Error(`Connection is inactive: ${connectionId}`);
    }

    // connection_config is automatically decrypted by Prisma middleware
    const connectionConfig = connection.connection_config as any;
    
    if (!connectionConfig || typeof connectionConfig !== 'object') {
      throw new Error(
        `Invalid connection_config format for connection ${connectionId}. ` +
        `Expected object, got ${typeof connectionConfig}`
      );
    }

    if (!connectionConfig.oauth) {
      throw new Error(
        `No OAuth credentials found in connection config for ${connectionId}. ` +
        `Expected 'oauth' key in connection_config.`
      );
    }

    const oauthConfig = connectionConfig.oauth;
    const systemType = connection.system_type.toLowerCase();

    // Create appropriate connector based on system type
    switch (systemType) {
      case 'zoho_books': {
        return new ZohoBooksConnector({
          client_id: oauthConfig.client_id,
          client_secret: oauthConfig.client_secret,
          refresh_token: oauthConfig.refresh_token,
          organization_id: oauthConfig.organization_id,
          api_domain: oauthConfig.api_domain || 'www.zohoapis.com',
          accounts_domain: oauthConfig.accounts_domain || 'https://accounts.zoho.com',
        });
      }
      
      case 'quickbooks': {
        return new QuickBooksConnector({
          client_id: oauthConfig.client_id,
          client_secret: oauthConfig.client_secret,
          refresh_token: oauthConfig.refresh_token,
          realm_id: oauthConfig.realm_id || oauthConfig.organization_id || '', // QuickBooks uses realm_id
          environment: oauthConfig.environment || 'production',
          connectionId: connectionId, // Pass connection ID for token persistence
        });
      }
      
      // Future: Add other ERPs here
      // case 'xero': {
      //   return new XeroConnector(oauthConfig);
      // }
      
      default:
        throw new Error(`Unsupported ERP type: ${systemType}`);
    }
  } catch (error) {
    logger.error(`Failed to create ERP connector for connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Legacy factory function for backward compatibility
 * @deprecated Use createERPConnector(connectionId) instead
 */
export async function createPurchaseOrderConnector(
  erpType: string,
  orgId: string
): Promise<ERPConnector> {
  logger.warn('createPurchaseOrderConnector is deprecated. Use createERPConnector(connectionId) instead.');
  
  // Find connection by orgId and systemType
  const connection = await prisma.source_system.findFirst({
    where: {
      org_id: orgId,
      system_type: erpType,
      is_active: true,
    },
  });

  if (!connection) {
    throw new Error(
      `No active ERP connection found for org_id='${orgId}', system_type='${erpType}'. ` +
      `Please use createERPConnector(connectionId) with a specific connection ID.`
    );
  }

  return createERPConnector(connection.id);
}

