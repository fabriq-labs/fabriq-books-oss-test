/**
 * ERP Connection Config Loader for Node.js
 * 
 * Loads and decrypts ERP connection configuration from public.source_system table.
 * Used by reverse sync (Node.js) to get OAuth credentials.
 * 
 * Note: connection_config is automatically decrypted by Prisma middleware.
 * No manual decryption needed in this file.
 */

import prisma from '../../../lib/prisma';
import logger from '../../../utils/logger';

export interface ConnectionConfig {
  oauth: {
    client_id?: string;
    client_secret?: string;
    refresh_token: string;
    organization_id?: string;  // Zoho/Xero specific
    realm_id?: string;         // QuickBooks specific (Company ID)
    api_domain?: string;       // Zoho specific
    accounts_domain?: string;  // Zoho specific
    tenant_id?: string;        // Xero specific
    environment?: 'sandbox' | 'production'; // QuickBooks specific
    token_endpoint?: string;   // Questrade specific
    api_server?: string;       // Questrade specific
  };
}

/**
 * Get ERP connection configuration from database for a specific org and system type.
 * 
 * @param orgId - Organization ID
 * @param systemType - ERP system type (e.g., 'zoho_books', 'xero')
 * @returns Decrypted connection config with OAuth credentials
 * @throws Error if connection not found or decryption fails
 */
export async function getErpConnectionConfig(
  orgId: string,
  systemType: string
): Promise<ConnectionConfig> {
  try {
    const sourceSystem = await prisma.source_system.findFirst({
      where: {
        org_id: orgId,
        system_type: systemType,
        is_active: true,
      },
    });

    if (!sourceSystem) {
      throw new Error(
        `No active ERP connection found for org_id='${orgId}', system_type='${systemType}'. ` +
        `Please run the migration script to import credentials from .env files.`
      );
    }

    // Prisma middleware automatically decrypts connection_config
    // It should be an object with oauth property
    const connectionConfig = sourceSystem.connection_config as any;
    
    if (!connectionConfig || typeof connectionConfig !== 'object') {
      throw new Error(
        `Invalid connection_config format for ${systemType}. ` +
        `Expected object, got ${typeof connectionConfig}`
      );
    }

    if (!connectionConfig.oauth) {
      throw new Error(
        `No OAuth credentials found in connection config for ${systemType}. ` +
        `Expected 'oauth' key in connection_config.`
      );
    }

    logger.info(`Successfully loaded connection config for ${systemType} (org_id=${orgId})`);
    return connectionConfig as ConnectionConfig;

  } catch (error) {
    logger.error(`Error loading connection config: ${error}`);
    throw error;
  }
}

/**
 * Convenience function to get OAuth credentials from connection config.
 * 
 * @param orgId - Organization ID
 * @param systemType - ERP system type (e.g., 'zoho_books', 'xero')
 * @returns OAuth credentials dictionary
 */
export async function getOAuthCredentials(
  orgId: string,
  systemType: string
): Promise<ConnectionConfig['oauth']> {
  const config = await getErpConnectionConfig(orgId, systemType);
  
  if (!config.oauth) {
    throw new Error(
      `No OAuth credentials found in connection config for ${systemType}. ` +
      `Expected 'oauth' key in connection_config.`
    );
  }
  
  return config.oauth;
}

