from __future__ import annotations

import os

import psycopg2


def _connect():
    dsn = os.getenv("DATABASE_URL")
    if dsn:
        return psycopg2.connect(dsn)

    host = os.getenv("DB_HOST")
    port = os.getenv("DB_PORT", "5432")
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD")
    dbname = os.getenv("DB_NAME")
    if not all([host, user, password, dbname]):
        raise RuntimeError("DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME is required")
    return psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        sslmode=os.getenv("PGSSLMODE", "prefer"),
    )


def validate_org_api_key_hash(org_id: str, api_key_hash: str) -> bool:
    """
    Validate that the incoming key exactly matches a stored user.api_key hash
    for at least one user in this org.
    """
    if not org_id or not api_key_hash:
        return False

    conn = _connect()
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
