"""
Airbyte sync entrypoint: credentials from source_system.extraction_config (DB), not env.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from sync_service.airbyte_connector import AirbyteConnector
from sync_service.extraction_config_loader import load_airbyte_extraction_from_db

logger = logging.getLogger(__name__)


def run_airbyte_sync(org_id: str, fabriq_connection_id: Optional[str]) -> dict[str, Any]:
    if os.getenv("SKIP_AIRBYTE", "").lower() in ("1", "true", "yes"):
        logger.warning("SKIP_AIRBYTE set — skipping Airbyte sync")
        return {"skipped": True, "reason": "SKIP_AIRBYTE"}

    if not fabriq_connection_id:
        raise RuntimeError("connection_id (source_system id) is required for Airbyte sync")

    creds = load_airbyte_extraction_from_db(org_id, fabriq_connection_id)
    connector = AirbyteConnector(
        creds["client_id"],
        creds["client_secret"],
        creds.get("api_base"),
    )
    return connector.run_connection_sync(creds["airbyte_connection_id"])
