import logger from '../../../../utils/logger';
import { BrokerConnector } from './types';
import { QuestradeConnector } from './questrade/questrade_connector';
import { loadBrokerConnection } from '../shared/broker-connection-loader';

export interface BrokerConnectorContext {
  connector: BrokerConnector;
  connectionId: string;
  orgId: string;
}

/**
 * Build a broker connector from a source_system connection id. The factory loads
 * and decrypts credentials, then dispatches on system_type.
 */
export async function createBrokerConnector(connectionId: string): Promise<BrokerConnectorContext> {
  const connection = await loadBrokerConnection(connectionId);

  switch (connection.systemType) {
    case 'questrade':
      return {
        connector: new QuestradeConnector(connection.id, connection.config.oauth),
        connectionId: connection.id,
        orgId: connection.orgId,
      };
    default:
      logger.error(`Unsupported broker type: ${connection.systemType}`);
      throw new Error(`Unsupported broker type: ${connection.systemType}`);
  }
}
