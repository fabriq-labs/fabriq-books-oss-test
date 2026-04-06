#!/usr/bin/env python3
"""
Restore Prisma-managed database constraints after dbt runs.

dbt can recreate public tables without primary keys, defaults, or triggers.
This script re-applies functions.sql (which is idempotent) to restore them.

Can be run standalone or called from run_dbt.py via subprocess.
"""

import os
import sys
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def load_env_file():
    """Load .env from the caller's working directory (integration root)."""
    for name in ['.env', 'env']:
        env_file = Path.cwd() / name
        if env_file.exists():
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' in line:
                        key, value = line.split('=', 1)
                        key, value = key.strip(), value.strip()
                        if key and key not in os.environ:
                            os.environ[key] = value
            return


def run_functions_sql():
    """Execute functions.sql against the database via psycopg2."""
    try:
        import psycopg2
    except ImportError:
        logger.error("psycopg2 is required but not installed")
        return False

    functions_sql_path = Path(__file__).parent.parent.parent / "prisma" / "functions.sql"
    if not functions_sql_path.exists():
        logger.warning(f"functions.sql not found at {functions_sql_path}")
        return False

    try:
        logger.info("Restoring database constraints from functions.sql...")
        sql_content = functions_sql_path.read_text()
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST'),
            port=os.getenv('DB_PORT', '5432'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            dbname=os.getenv('DB_NAME')
        )
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql_content)
        cur.close()
        conn.close()
        logger.info("Database constraints restored successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to restore database constraints: {e}")
        return False


if __name__ == "__main__":
    load_env_file()
    success = run_functions_sql()
    sys.exit(0 if success else 1)
