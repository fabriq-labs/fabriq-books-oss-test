/**
 * Builds `source_system.extraction_config` for the integration sync service (Airbyte Public API).
 * Prisma middleware encrypts this JSON like `connection_config`.
 *
 * Env:
 * - AIRBYTE_CLIENT_ID, AIRBYTE_CLIENT_SECRET (required when setting extraction)
 * - AIRBYTE_CONNECTION_ID_ZOHO | AIRBYTE_CONNECTION_ID_QUICKBOOKS — Airbyte connection UUID passed per demo setup
 * - AIRBYTE_API_BASE (optional, default https://api.airbyte.com)
 */
export function buildAirbyteExtractionConfigFromEnv(
  airbyteConnectionUuid: string | undefined
): Record<string, unknown> | null {
  const clientId = process.env.AIRBYTE_CLIENT_ID?.trim();
  const clientSecret = process.env.AIRBYTE_CLIENT_SECRET?.trim();
  const connectionId = airbyteConnectionUuid?.trim();
  if (!clientId || !clientSecret || !connectionId) {
    return null;
  }
  const apiBase = process.env.AIRBYTE_API_BASE?.trim();
  const cfg: Record<string, unknown> = {
    type: 'airbyte',
    client_id: clientId,
    client_secret: clientSecret,
    connection_id: connectionId,
  };
  if (apiBase) {
    cfg.api_base = apiBase;
  }
  return cfg;
}
