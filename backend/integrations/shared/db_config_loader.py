#!/usr/bin/env python3
"""Load and decrypt ERP connection_config from public.source_system."""

from __future__ import annotations

import logging
from typing import Any, Dict

from psycopg2.extras import RealDictCursor

from shared.db import connect
from shared.encryption import EncryptionError, decrypt_config

logger = logging.getLogger(__name__)


def get_erp_connection_config(org_id: str, system_type: str) -> Dict[str, Any]:
    conn = connect()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            SELECT id, org_id, system_type, name, connection_config, is_active
            FROM public.source_system
            WHERE org_id = %s
              AND system_type = %s
              AND is_active = true
            LIMIT 1
            """,
            (org_id, system_type),
        )
        result = cursor.fetchone()
        cursor.close()
        if not result:
            raise ValueError(
                f"No active ERP connection for org_id={org_id!r} system_type={system_type!r}"
            )
        encrypted_config = result["connection_config"]
        if isinstance(encrypted_config, dict):
            logger.warning("connection_config already decrypted")
            return encrypted_config
        try:
            return decrypt_config(encrypted_config)
        except EncryptionError as e:
            raise EncryptionError(
                f"Failed to decrypt connection config for {system_type}: {e}"
            ) from e
    finally:
        conn.close()


def get_oauth_credentials(org_id: str, system_type: str) -> Dict[str, str]:
    config = get_erp_connection_config(org_id, system_type)
    oauth = config.get("oauth", {})
    if not oauth:
        raise ValueError(f"No oauth key in connection_config for {system_type}")
    return oauth
