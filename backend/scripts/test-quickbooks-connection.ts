#!/usr/bin/env ts-node
/**
 * Test QuickBooks Connection Script
 * 
 * Loads encrypted credentials from source_system table and tests the connection.
 */

import prisma from '../src/lib/prisma';
import { testErpConnection } from '../src/lib/integrations/shared/test-connection';
import logger from '../src/utils/logger';

async function main() {
  try {
    logger.info('Loading QuickBooks connection from database...');

    // Find QuickBooks connection
    const sourceSystem = await prisma.source_system.findFirst({
      where: {
        system_type: 'quickbooks',
        is_active: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (!sourceSystem) {
      throw new Error('No active QuickBooks connection found in database');
    }

    logger.info(`Found QuickBooks connection: ${sourceSystem.name} (ID: ${sourceSystem.id})`);

    // Prisma middleware automatically decrypts connection_config
    const connectionConfig = sourceSystem.connection_config as any;

    if (!connectionConfig || typeof connectionConfig !== 'object') {
      throw new Error(
        `Invalid connection_config format. Expected object, got ${typeof connectionConfig}`
      );
    }

    if (!connectionConfig.oauth) {
      throw new Error('No OAuth credentials found in connection_config');
    }

    logger.info('Connection config loaded (decrypted by Prisma middleware)');
    logger.info('OAuth fields present:', {
      hasClientId: !!connectionConfig.oauth.client_id,
      hasClientSecret: !!connectionConfig.oauth.client_secret,
      hasRefreshToken: !!connectionConfig.oauth.refresh_token,
      hasRealmId: !!connectionConfig.oauth.realm_id,
      environment: connectionConfig.oauth.environment || 'production',
    });

    // Verify decryption worked (credentials should not be encrypted strings)
    const refreshToken = connectionConfig.oauth.refresh_token;
    if (typeof refreshToken === 'string' && refreshToken.includes(':')) {
      logger.warn('⚠️  Refresh token appears to still be encrypted (contains colon). Decryption may have failed.');
    } else {
      logger.info('✅ Decryption verified: Refresh token is not in encrypted format');
    }

    // Test the connection
    logger.info('Testing QuickBooks connection...');
    logger.info('Using credentials:', {
      clientId: connectionConfig.oauth.client_id ? `${connectionConfig.oauth.client_id.substring(0, 10)}...` : 'missing',
      hasClientSecret: !!connectionConfig.oauth.client_secret,
      refreshToken: connectionConfig.oauth.refresh_token ? `${connectionConfig.oauth.refresh_token.substring(0, 10)}...` : 'missing',
      realmId: connectionConfig.oauth.realm_id || 'missing',
      environment: connectionConfig.oauth.environment || 'production',
    });
    
    const result = await testErpConnection('quickbooks', connectionConfig.oauth);

    if (result.success) {
      logger.info('✅ Connection test PASSED');
      logger.info(`Message: ${result.message}`);
      if (result.data) {
        logger.info('Response data:', JSON.stringify(result.data, null, 2));
      }
      process.exit(0);
    } else {
      logger.error('❌ Connection test FAILED');
      logger.error(`Message: ${result.message}`);
      process.exit(1);
    }
  } catch (error: any) {
    logger.error('Error testing QuickBooks connection:', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

