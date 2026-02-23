#!/bin/sh
# Entrypoint: run embedded PostgreSQL or external-DB mode from USE_EMBEDDED_PG.
# Set USE_EMBEDDED_PG=true (or 1) for in-container Postgres; else use DATABASE_URL (external DB).

if [ "$USE_EMBEDDED_PG" = "true" ] || [ "$USE_EMBEDDED_PG" = "1" ]; then
  exec /start-with-pg.sh
else
  exec /start-external.sh
fi
