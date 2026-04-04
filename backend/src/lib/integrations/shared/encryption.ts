import crypto from 'crypto';

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

/**
 * Get the encryption key from environment variable.
 * Returns a 32-byte buffer for AES-256-CBC.
 */
function getEncryptionKey(): Buffer {
  const keyStr = process.env.ERP_CONFIG_ENCRYPTION_KEY;
  if (!keyStr) {
    throw new EncryptionError('ERP_CONFIG_ENCRYPTION_KEY environment variable not set');
  }

  try {
    // Key should be a base64-encoded 32-byte value
    // Handle both URL-safe base64 (with _ and -) and standard base64
    if (keyStr.length > 32) {
      try {
        // Try URL-safe base64 first (handles _ and - characters)
        // Convert URL-safe base64 to standard base64
        const standardBase64 = keyStr.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        const padding = '='.repeat((4 - (standardBase64.length % 4)) % 4);
        const key = Buffer.from(standardBase64 + padding, 'base64');
        if (key.length === 32) {
          return key;
        }
      } catch {
        // Fallback to standard base64
        const key = Buffer.from(keyStr, 'base64');
        if (key.length === 32) {
          return key;
        }
      }
      throw new EncryptionError('Key must decode to exactly 32 bytes');
    }
    // If key is short, pad or slice to 32 bytes (not recommended)
    return Buffer.from(keyStr.padEnd(32).slice(0, 32));
  } catch (error) {
    throw new EncryptionError(`Invalid encryption key format: ${error}`);
  }
}

// Using AES-256-CBC for compatibility with Python decryption
// Format: "iv:ciphertext" (both base64-encoded, colon-separated)
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

export function encryptConfig(config: object): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const text = JSON.stringify(config);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Return IV + Encrypted Data as base64 (similar to how we might want to store it)
    // Format: iv:encrypted
    return `${iv.toString('base64')}:${encrypted}`;
  } catch (error) {
    throw new EncryptionError(`Encryption failed: ${error}`);
  }
}

export function decryptConfig(encryptedStr: string): any {
  try {
    const key = getEncryptionKey();
    
    // Split IV and encrypted data
    const parts = encryptedStr.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format. Expected iv:ciphertext');
    }
    
    const iv = Buffer.from(parts[0], 'base64');
    const encryptedText = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    throw new EncryptionError(`Decryption failed: ${error}`);
  }
}
