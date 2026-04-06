/**
 * Prisma Middleware for Encrypting/Decrypting source_system sensitive JSON fields
 * (connection_config, extraction_config).
 *
 * This middleware transparently encrypts these fields before write operations
 * and decrypts them after read operations, ensuring Python can decrypt using the
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

const SOURCE_SYSTEM_ENCRYPTED_JSON_FIELDS = ['connection_config', 'extraction_config'] as const;

/**
 * Prisma middleware to encrypt/decrypt sensitive JSON fields for source_system model
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

        for (const fieldName of SOURCE_SYSTEM_ENCRYPTED_JSON_FIELDS) {
          const val = data[fieldName];
          if (!val) continue;

          if (typeof val === 'object' && val !== null) {
            try {
              const encrypted = encryptConfig(val);
              data[fieldName] = encrypted as any;
              logger.info(`✅ Encrypted ${fieldName} at ${path}`, {
                encryptedLength: encrypted.length,
                encryptedPreview: encrypted.substring(0, 50) + '...',
              });
            } catch (error: any) {
              logger.error(`❌ Failed to encrypt ${fieldName} at ${path}:`, error);
              throw error;
            }
          } else if (typeof val === 'string' && val.includes(':')) {
            logger.debug(`${fieldName} at ${path} already encrypted, skipping`);
          } else {
            logger.warn(
              `${fieldName} at ${path} is not an object or encrypted string, type: ${typeof val}`
            );
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

        for (const fieldName of SOURCE_SYSTEM_ENCRYPTED_JSON_FIELDS) {
          const val = item[fieldName];
          if (val === undefined || val === null) continue;

          if (typeof val === 'string') {
            if (val.includes(':')) {
              try {
                const decrypted = decryptConfig(val);
                item[fieldName] = decrypted;
                logger.debug(`✅ Decrypted ${fieldName}`);
              } catch (error: any) {
                logger.error(`❌ Failed to decrypt ${fieldName}:`, {
                  error: error.message,
                  encryptedPreview: val.substring(0, 50) + '...',
                });
                throw new Error(`Failed to decrypt ${fieldName}: ${error.message}`);
              }
            } else {
              logger.warn(
                `${fieldName} is a string but not in encrypted format (no colon separator)`
              );
            }
          } else if (typeof val === 'object') {
            logger.debug(`${fieldName} is already an object (not encrypted)`);
          } else {
            logger.warn(`${fieldName} has unexpected type: ${typeof val}`);
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

