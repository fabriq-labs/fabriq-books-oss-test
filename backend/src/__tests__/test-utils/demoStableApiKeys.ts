/**
 * Stable demo X-API-Key plaintext patterns for test fixtures.
 * Must match `backend/prisma/demo-stable-api-keys.ts`.
 */

export function stableIndianDemoApiKeyPlaintext(userId: string): string {
  return `fabriq-indian-demo-${userId}`;
}

export function stableUsCaDemoApiKeyPlaintext(userId: string): string {
  return `fabriq-us-ca-demo-${userId}`;
}
