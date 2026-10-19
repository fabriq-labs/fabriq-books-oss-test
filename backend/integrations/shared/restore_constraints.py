#!/usr/bin/env python3
"""Restore Prisma-managed constraints after dbt (idempotent functions.sql when present)."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from shared.db import connect
from shared.settings import ensure_db_env_from_database_url, load_dotenv_files

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def run_functions_sql() -> bool:
    load_dotenv_files()
    ensure_db_env_from_database_url()

    functions_sql_path = Path(__file__).resolve().parent.parent.parent / "prisma" / "functions.sql"
    if not functions_sql_path.exists():
        functions_sql_path = Path("/app/backend/prisma/functions.sql")
    if not functions_sql_path.exists():
        logger.info("functions.sql not found — skip constraint restore (normal on books kernel)")
        return True

    try:
        logger.info("Restoring database constraints from functions.sql...")
        sql_content = functions_sql_path.read_text()
        conn = connect()
        try:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute(sql_content)
        finally:
            conn.close()
        logger.info("Database constraints restored successfully")
        return True
    except Exception as e:
        logger.error("Failed to restore database constraints: %s", e)
        return False


if __name__ == "__main__":
    sys.exit(0 if run_functions_sql() else 1)
