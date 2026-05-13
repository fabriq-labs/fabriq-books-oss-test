#!/bin/sh
# Entrypoint: run embedded PostgreSQL or external-DB mode from USE_EMBEDDED_PG.
# Set USE_EMBEDDED_PG=true (or 1) for in-container Postgres; else use DATABASE_URL (external DB).

# Optional: full service account JSON in env (e.g. Railway secret). Writes ADC key file before Node starts.
# Clear any custom Railway start command; keep CMD as /start.sh only.
if [ -n "${GCP_SA_JSON}" ]; then
  printf '%s' "${GCP_SA_JSON}" > /tmp/gcp-sa.json
  chmod 600 /tmp/gcp-sa.json 2>/dev/null || true
  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-sa.json
fi

if [ "$USE_EMBEDDED_PG" = "true" ] || [ "$USE_EMBEDDED_PG" = "1" ]; then
  exec /start-with-pg.sh
else
  exec /start-external.sh
fi
