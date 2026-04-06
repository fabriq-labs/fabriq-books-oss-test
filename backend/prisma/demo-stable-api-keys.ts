/**
 * Stable X-API-Key plaintexts for demo seeds (Indian + US-CA + metadata admin).
 * Hashes are bcrypt(10) — stored in user.api_key; plaintext is only in this docstring and setup logs.
 *
 * After `setup-db.js`, use header: X-API-Key: <plaintext below>
 *
 * - Metadata admin (setup-metadata.ts):
 *     fabriq-demo-api-admin-local
 *
 * - Indian demo users (setup-indian-demo.ts), one key per user id from CSV:
 *     fabriq-indian-demo-<user.id>
 *   Example id from seed: fabriq-indian-demo-user_xxx
 *
 * - US-CA demo users (setup-us-ca-demo.ts):
 *     fabriq-us-ca-demo-<user.id>
 *
 * These strings are stable across DB resets as long as user ids in CSV do not change.
 */

import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

/** Admin created in setup-metadata.ts (admin@example.com / admin123). */
export function stableMetadataAdminApiKeyPlaintext(): string {
  return 'fabriq-demo-api-admin-local';
}

/** Indian demo CSV users — unique per stable user id. */
export function stableIndianDemoApiKeyPlaintext(userId: string): string {
  return `fabriq-indian-demo-${userId}`;
}

/** US-CA demo CSV users — unique per stable user id. */
export function stableUsCaDemoApiKeyPlaintext(userId: string): string {
  return `fabriq-us-ca-demo-${userId}`;
}

export async function hashStableDemoApiKey(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}
