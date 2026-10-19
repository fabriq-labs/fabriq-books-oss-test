from __future__ import annotations

from shared.db import connect


def validate_org_api_key_hash(org_id: str, api_key_hash: str) -> bool:
    """
    Validate that the incoming key exactly matches a stored user.api_key hash
    for at least one user in this org.
    """
    if not org_id or not api_key_hash:
        return False

    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM "user"
                WHERE org_id = %s
                  AND api_key = %s
                LIMIT 1
                """,
                (org_id, api_key_hash),
            )
            return cur.fetchone() is not None
    finally:
        conn.close()
