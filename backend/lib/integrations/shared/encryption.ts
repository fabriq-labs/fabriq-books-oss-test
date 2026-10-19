import crypto from 'crypto';

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

/**
 * AES-256 key from ERP_CONFIG_ENCRYPTION_KEY (base64-encoded 32 bytes).
 * Compatible with backend/integrations/shared/encryption.py.
 */
function getEncryptionKey(): Buffer {
  const keyStr = process.env.ERP_CONFIG_ENCRYPTION_KEY;
  if (!keyStr) {
    throw new EncryptionError('ERP_CONFIG_ENCRYPTION_KEY environment variable not set');
  }

  try {
    if (keyStr.length > 32) {
      try {
        const standardBase64 = keyStr.replace(/-/g, '+').replace(/_/g, '/');
        const padding = '='.repeat((4 - (standardBase64.length % 4)) % 4);
        const key = Buffer.from(standardBase64 + padding, 'base64');
        if (key.length === 32) return key;
      } catch {
        const key = Buffer.from(keyStr, 'base64');
        if (key.length === 32) return key;
      }
      throw new EncryptionError('Key must decode to exactly 32 bytes');
    }
    return Buffer.from(keyStr.padEnd(32).slice(0, 32));
  } catch (error) {
    if (error instanceof EncryptionError) throw error;
    throw new EncryptionError(`Invalid encryption key format: ${error}`);
  }
}

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/** Format: `iv:ciphertext` (both base64). */
export function encryptConfig(config: object): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const text = JSON.stringify(config);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return `${iv.toString('base64')}:${encrypted}`;
  } catch (error) {
    throw new EncryptionError(`Encryption failed: ${error}`);
  }
}

export function decryptConfig(encryptedStr: string): Record<string, unknown> {
  try {
    const key = getEncryptionKey();
    const parts = encryptedStr.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format. Expected iv:ciphertext');
    }
    const iv = Buffer.from(parts[0], 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(parts[1], 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    throw new EncryptionError(`Decryption failed: ${error}`);
  }
}
