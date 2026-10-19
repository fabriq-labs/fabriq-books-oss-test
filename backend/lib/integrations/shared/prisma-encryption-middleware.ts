/**
 * Prisma middleware: encrypt/decrypt source_system.connection_config + extraction_config.
 * Format matches Python integrations/shared/encryption.py (AES-256-CBC, iv:ciphertext).
 */

import { Prisma } from '@prisma/client';
import { decryptConfig, encryptConfig } from './encryption';
import logger from '../../../src/utils/logger';

const ENCRYPTED_JSON_FIELDS = ['connection_config', 'extraction_config'] as const;

export function sourceSystemEncryptionMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    if (params.model !== 'source_system') {
      return next(params);
    }

    if (['create', 'update', 'updateMany', 'upsert'].includes(params.action)) {
      const encryptField = (data: Record<string, unknown> | undefined) => {
        if (!data || typeof data !== 'object') return;

        for (const fieldName of ENCRYPTED_JSON_FIELDS) {
          const val = data[fieldName];
          if (!val) continue;

          if (typeof val === 'object' && val !== null) {
            data[fieldName] = encryptConfig(val as object);
          } else if (typeof val === 'string' && val.includes(':')) {
            // already encrypted
          }
        }

        if (data.update && typeof data.update === 'object') {
          encryptField(data.update as Record<string, unknown>);
        }
        if (data.create && typeof data.create === 'object' && !Array.isArray(data.create)) {
          encryptField(data.create as Record<string, unknown>);
        }
      };

      if (params.args?.data) {
        encryptField(params.args.data as Record<string, unknown>);
      }
      if (params.action === 'upsert') {
        if (params.args?.update) encryptField(params.args.update as Record<string, unknown>);
        if (params.args?.create) encryptField(params.args.create as Record<string, unknown>);
      }
    }

    const result = await next(params);

    if (
      ['findUnique', 'findFirst', 'findMany', 'findFirstOrThrow', 'findUniqueOrThrow'].includes(
        params.action
      )
    ) {
      const decryptField = (item: Record<string, unknown> | null | undefined) => {
        if (!item || typeof item !== 'object') return;
        for (const fieldName of ENCRYPTED_JSON_FIELDS) {
          const val = item[fieldName];
          if (val === undefined || val === null) continue;
          if (typeof val === 'string' && val.includes(':')) {
            try {
              item[fieldName] = decryptConfig(val);
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              logger.error(`Failed to decrypt ${fieldName}`, { error: message });
              throw new Error(`Failed to decrypt ${fieldName}: ${message}`);
            }
          }
        }
      };

      if (Array.isArray(result)) {
        result.forEach(decryptField);
      } else if (result) {
        decryptField(result as Record<string, unknown>);
      }
    }

    return result;
  };
}
