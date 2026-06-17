import prisma from '../../../prisma';
import logger from '../../../../utils/logger';
import { BrokerConnectionConfig, BrokerOAuthConfig } from '../connectors/types';

export interface LoadedBrokerConnection {
  id: string;
  orgId: string;
  systemType: string;
  config: BrokerConnectionConfig;
}

export async function loadBrokerConnection(connectionId: string): Promise<LoadedBrokerConnection> {
  const connection = await prisma.source_system.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    throw new Error(`Broker connection not found: ${connectionId}`);
  }
  if (!connection.is_active) {
    throw new Error(`Broker connection is inactive: ${connectionId}`);
  }

  // connection_config is decrypted by the Prisma encryption middleware.
  const config = connection.connection_config as unknown as BrokerConnectionConfig;
  if (!config || typeof config !== 'object' || !config.oauth) {
    throw new Error(`Invalid connection_config for broker connection ${connectionId}: missing 'oauth'`);
  }

  return {
    id: connection.id,
    orgId: connection.org_id,
    systemType: connection.system_type.toLowerCase(),
    config,
  };
}

/**
 * Persist a rotated OAuth payload immediately. Questrade rotates refresh tokens
 * on every refresh, so losing the new token bricks the connection.
 */
export async function persistBrokerOAuth(
  connectionId: string,
  oauth: BrokerOAuthConfig
): Promise<void> {
  const connection = await prisma.source_system.findUnique({
    where: { id: connectionId },
  });
  if (!connection) {
    throw new Error(`Broker connection not found while persisting OAuth: ${connectionId}`);
  }

  const existing = (connection.connection_config as unknown as BrokerConnectionConfig) ?? { oauth: {} as BrokerOAuthConfig };
  const updated: BrokerConnectionConfig = {
    ...existing,
    oauth: { ...existing.oauth, ...oauth },
  };

  await prisma.source_system.update({
    where: { id: connectionId },
    data: { connection_config: updated as unknown as object },
  });
  logger.info(`Persisted rotated broker OAuth tokens for connection ${connectionId}`);
}
