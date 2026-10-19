import prisma from '../../../src/lib/prisma';
import logger from '../../../src/utils/logger';

export interface ConnectionConfig {
  oauth: {
    client_id: string;
    client_secret: string;
    refresh_token: string;
    organization_id?: string;
    realm_id?: string;
    api_domain?: string;
    accounts_domain?: string;
    tenant_id?: string;
    environment?: 'sandbox' | 'production';
  };
}

export async function getErpConnectionConfig(
  orgId: string,
  systemType: string
): Promise<ConnectionConfig> {
  const sourceSystem = await prisma.source_system.findFirst({
    where: {
      org_id: orgId,
      system_type: systemType,
      is_active: true,
    },
  });

  if (!sourceSystem) {
    throw new Error(
      `No active ERP connection found for org_id='${orgId}', system_type='${systemType}'.`
    );
  }

  const connectionConfig = sourceSystem.connection_config as ConnectionConfig | null;
  if (!connectionConfig || typeof connectionConfig !== 'object' || !connectionConfig.oauth) {
    throw new Error(`Invalid connection_config for ${systemType}: expected object with oauth`);
  }

  logger.info(`Loaded connection config for ${systemType} (org_id=${orgId})`);
  return connectionConfig;
}

export async function getOAuthCredentials(
  orgId: string,
  systemType: string
): Promise<ConnectionConfig['oauth']> {
  const config = await getErpConnectionConfig(orgId, systemType);
  return config.oauth;
}
