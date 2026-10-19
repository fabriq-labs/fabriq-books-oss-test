"""Postgres connection helpers shared by sync_service and dbt runners."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg2
from psycopg2.extensions import connection as PgConnection

from shared.settings import ensure_db_env_from_database_url, load_dotenv_files


def connect() -> PgConnection:
    load_dotenv_files()
    ensure_db_env_from_database_url()
    dsn = os.getenv("DATABASE_URL")
    sslmode = os.getenv("PGSSLMODE", "prefer")
    if dsn:
        return psycopg2.connect(dsn, sslmode=sslmode)

    host = os.getenv("DB_HOST")
    port = os.getenv("DB_PORT", "5432")
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD")
    dbname = os.getenv("DB_NAME")
    if not all([host, user, password, dbname]):
        raise RuntimeError(
            "DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME is required"
        )
    return psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        sslmode=sslmode,
        connect_timeout=int(os.getenv("PGCONNECT_TIMEOUT", "30")),
    )


@contextmanager
def get_conn() -> Iterator[PgConnection]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def table_exists(table_name: str, schema: str = "public") -> bool:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = %s AND table_name = %s
                )
                """,
                (schema, table_name),
            )
            return bool(cur.fetchone()[0])
