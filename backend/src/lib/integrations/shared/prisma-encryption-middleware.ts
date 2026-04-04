/**
 * Prisma Middleware for Encrypting/Decrypting source_system.connection_config
 * 
 * This middleware transparently encrypts connection_config before write operations
 * and decrypts it after read operations, ensuring Python DBT can decrypt using the
 * same AES-256-CBC algorithm and format.
 * 
 * Usage:
 *   import prisma from '../lib/prisma';
 *   import { sourceSystemEncryptionMiddleware } from './integrations/shared/prisma-encryption-middleware';
 *   prisma.$use(sourceSystemEncryptionMiddleware());
 */

import { Prisma } from '@prisma/client';
import { encryptConfig, decryptConfig } from './encryption';
import logger from '../../../utils/logger';

/**
 * Prisma middleware to encrypt/decrypt connection_config for source_system model
 * 
 * Encryption: Before create/update operations
 * Decryption: After find operations
 * 
 * Format: Uses AES-256-CBC with format "iv:ciphertext" (both base64)
 * Compatible with Python decryption in integrations/shared/encryption.py
 */
export function sourceSystemEncryptionMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    // Only process source_system model
    if (params.model !== 'source_system') {
      return next(params);
    }

    // ===== ENCRYPTION: Before write operations =====
    if (['create', 'update', 'updateMany', 'upsert'].includes(params.action)) {
      const encryptField = (data: any, path: string = '') => {
        if (!data || typeof data !== 'object') return;

        // Handle direct connection_config
        if (data.connection_config) {
          if (typeof data.connection_config === 'object' && data.connection_config !== null) {
            try {
              const encrypted = encryptConfig(data.connection_config);
              // Store as string - Prisma JSONB will store this as a JSON string value
              data.connection_config = encrypted as any; // Prisma JSONB typing
              logger.info(`✅ Encrypted connection_config at ${path}`, {
                encryptedLength: encrypted.length,
                encryptedPreview: encrypted.substring(0, 50) + '...',
              });
            } catch (error: any) {
              logger.error(`❌ Failed to encrypt connection_config at ${path}:`, error);
              throw error;
            }
          } else if (typeof data.connection_config === 'string' && data.connection_config.includes(':')) {
            // Already encrypted, skip
            logger.debug(`connection_config at ${path} already encrypted, skipping`);
          } else {
            logger.warn(`connection_config at ${path} is not an object or encrypted string, type: ${typeof data.connection_config}`);
          }
        }

        // Handle nested update operations (for upsert)
        if (data.update && typeof data.update === 'object') {
          encryptField(data.update, `${path}.update`);
        }

        // Handle nested create operations (for upsert)
        if (data.create && typeof data.create === 'object') {
          encryptField(data.create, `${path}.create`);
        }

        // Handle array of creates/updates
        if (Array.isArray(data.create)) {
          data.create.forEach((item: any, index: number) => {
            encryptField(item, `${path}.create[${index}]`);
          });
        }
        if (Array.isArray(data.update)) {
          data.update.forEach((item: any, index: number) => {
            encryptField(item, `${path}.update[${index}]`);
          });
        }
      };

      // Handle different operation types
      if (params.args.data) {
        encryptField(params.args.data, 'data');
      }
      
      // For upsert, also check update and create separately
      if (params.action === 'upsert') {
        if (params.args.update && typeof params.args.update === 'object') {
          encryptField(params.args.update, 'update');
        }
        if (params.args.create && typeof params.args.create === 'object') {
          encryptField(params.args.create, 'create');
        }
      }
    }

    // ===== DECRYPTION: After read operations =====
    const result = await next(params);

    if (['findUnique', 'findFirst', 'findMany', 'findFirstOrThrow', 'findUniqueOrThrow'].includes(params.action)) {
      const decryptField = (item: any) => {
        if (!item || typeof item !== 'object') return;

        if (item.connection_config !== undefined && item.connection_config !== null) {
          // Handle string (encrypted value from JSONB)
          if (typeof item.connection_config === 'string') {
            // Check if it's encrypted (format: "iv:ciphertext")
            if (item.connection_config.includes(':')) {
              try {
                const decrypted = decryptConfig(item.connection_config);
                item.connection_config = decrypted;
                logger.debug('✅ Decrypted connection_config');
              } catch (error: any) {
                logger.error('❌ Failed to decrypt connection_config:', {
                  error: error.message,
                  encryptedPreview: item.connection_config.substring(0, 50) + '...',
                });
                // Don't throw - might be invalid data, but log for debugging
                throw new Error(`Failed to decrypt connection_config: ${error.message}`);
              }
            } else {
              // String but not encrypted format - might be malformed data
              logger.warn('connection_config is a string but not in encrypted format (no colon separator)');
            }
          } else if (typeof item.connection_config === 'object') {
            // Already decrypted or stored as object (shouldn't happen, but handle gracefully)
            logger.debug('connection_config is already an object (not encrypted)');
          } else {
            logger.warn(`connection_config has unexpected type: ${typeof item.connection_config}`);
          }
        }
      };

      if (Array.isArray(result)) {
        result.forEach(decryptField);
      } else if (result) {
        decryptField(result);
      }
    }

    return result;
  };
}

