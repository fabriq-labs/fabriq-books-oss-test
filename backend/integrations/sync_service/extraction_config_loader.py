"""
Load and decrypt source_system.extraction_config for Airbyte (same encryption as connection_config).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from shared.db import connect as _connect
from shared.encryption import EncryptionError, decrypt_config

logger = logging.getLogger(__name__)


def _normalize_extraction_raw(raw: Any) -> dict[str, Any]:
    if raw is None:
        raise RuntimeError("extraction_config is not set for this connection")

    if isinstance(raw, str):
        if ":" in raw:
            try:
                return decrypt_config(raw)
            except EncryptionError as e:
                raise RuntimeError(f"Failed to decrypt extraction_config: {e}") from e
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
        raise RuntimeError("extraction_config is invalid (expected encrypted blob or JSON object)")

    if isinstance(raw, dict):
        return raw

    raise RuntimeError(f"extraction_config has unsupported type: {type(raw)}")


def load_airbyte_extraction_from_db(org_id: str, source_system_id: str) -> dict[str, Any]:
    """
    Returns dict with: client_id, client_secret, airbyte_connection_id, api_base (optional).
    extraction_config JSON uses connection_id for the Airbyte connection UUID.
    """
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT extraction_config
                FROM source_system
                WHERE id = %s AND org_id = %s
                """,
                (source_system_id, org_id),
            )
            row = cur.fetchone()
            if not row:
                raise RuntimeError(
                    f"source_system not found for id={source_system_id} org_id={org_id}"
                )
            raw = row[0]
    finally:
        conn.close()

    cfg = _normalize_extraction_raw(raw)
    if cfg.get("type") != "airbyte":
        raise RuntimeError(
            f'extraction_config.type must be "airbyte", got {cfg.get("type")!r}'
        )

    client_id = cfg.get("client_id")
    client_secret = cfg.get("client_secret")
    airbyte_connection_id = cfg.get("connection_id")
    api_base = cfg.get("api_base")

    if not client_id or not client_secret or not airbyte_connection_id:
        raise RuntimeError(
            "extraction_config must include client_id, client_secret, and connection_id (Airbyte)"
        )

    out: dict[str, Any] = {
        "client_id": str(client_id).strip(),
        "client_secret": str(client_secret).strip(),
        "airbyte_connection_id": str(airbyte_connection_id).strip(),
    }
    if api_base:
        out["api_base"] = str(api_base).strip()
    return out
