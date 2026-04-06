#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Railway DBT Cron Service
Runs the QuickBooks DBT pipeline stages: staging -> integrations -> normalized

This script runs all models incrementally by default (only processes changed records).
For full refresh after Airbyte full refresh, set FORCE_PROCESS_ALL=true.

First Run Detection:
- Automatically detects first run by checking if key tables exist across schemas (datalake.source_system, public.customers)
- On first run, uses sequential execution (threads=1) to avoid deadlocks from parallel table creation
- On subsequent runs, uses conservative threading (default threads=2, configurable via DBT_THREADS env var) to avoid deadlocks
- If psycopg2 is not available, assumes first run (safe fallback)

Environment Variables:
- Automatically loads from 'env' or '.env' file in integration root directory (parent of dbt folder)
- Railway environment variables take precedence if already set (production)
- Required variables:
  - DB_HOST: PostgreSQL host
  - DB_PORT: PostgreSQL port (default: 5432)
  - DB_USER: PostgreSQL username
  - DB_PASSWORD: PostgreSQL password
  - DB_NAME: PostgreSQL database name
- Optional variables:
  - DB_SCHEMA: PostgreSQL schema (optional, default: public)
  - DBT_SOURCE_TABLE_PREFIX: Source table prefix (optional, default: qb)
  - DBT_THREADS: Number of threads for parallel execution (default: 2, reduced from 4 to avoid deadlocks)
  - FORCE_PROCESS_ALL: Set to 'true' to process all records (default: 'false')
    - Use this after Airbyte does a full refresh
    - Note: This does NOT drop tables (uses merge strategy)
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from urllib.parse import urlparse

try:
    import psycopg2
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

# Setup structured logging (Railway captures stdout/stderr)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

def _apply_env_file(path: Path) -> bool:
    if not path.is_file():
        return False
    logger.info(f"Loading environment variables from {path}")
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    if key and key not in os.environ:
                        os.environ[key] = value
        logger.info(f"✅ Environment variables loaded from {path.name}")
        return True
    except Exception as e:
        logger.warning(f"Failed to load {path}: {e}")
        return False


def load_env_file():
    """Load from integration .env, then shared backend .env (Docker: /app/backend/.env).

    Already-set environment variables (e.g. from Docker env_file) take precedence.
    """
    script_dir = Path(__file__).parent
    candidates = [
        script_dir / '.env',
        script_dir / 'env',
    ]
    extra = os.getenv('BACKEND_ENV_FILE')
    if extra:
        candidates.append(Path(extra))
    candidates.append(Path('/app/backend/.env'))

    loaded_any = False
    for env_file in candidates:
        if _apply_env_file(env_file):
            loaded_any = True

    if not loaded_any:
        logger.info("No env file found, using environment variables (Railway or system)")
    return loaded_any


def ensure_db_env_from_database_url() -> None:
    """If DB_* are missing, parse DATABASE_URL (same idea as sync_service main)."""
    if os.getenv('DB_HOST'):
        return
    url = os.getenv('DATABASE_URL')
    if not url:
        return
    try:
        p = urlparse(url)
        if p.hostname:
            os.environ['DB_HOST'] = p.hostname
        if p.port:
            os.environ['DB_PORT'] = str(p.port)
        else:
            os.environ.setdefault('DB_PORT', '5432')
        if p.username:
            os.environ['DB_USER'] = p.username
        if p.password:
            os.environ['DB_PASSWORD'] = p.password
        path = (p.path or '').lstrip('/')
        if path:
            dbname = path.split('?')[0]
            if dbname:
                os.environ['DB_NAME'] = dbname
        logger.info('Derived DB_* from DATABASE_URL')
    except Exception as e:
        logger.warning('Could not parse DATABASE_URL for DB_*: %s', e)

def validate_environment():
    """Validate required environment variables are present"""
    required_vars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    missing = [var for var in required_vars if not os.getenv(var)]

    if missing:
        logger.error("Missing required environment variables: {}".format(missing))
        return False

    logger.info("Environment validation passed")
    return True

def check_table_exists(table_name, schema='public'):
    """Check if a table exists in the database.
    
    This helps detect first run to avoid deadlocks from parallel table creation.
    
    Args:
        table_name (str): Name of the table to check
        schema (str): Schema name (default: 'public')
    
    Returns:
        bool: True if table exists, False otherwise
    """
    if not PSYCOPG2_AVAILABLE:
        # Fallback: assume first run if psycopg2 not available
        logger.warning("psycopg2 not available, cannot check table existence. Assuming first run.")
        return False
    
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST'),
            port=os.getenv('DB_PORT', '5432'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            dbname=os.getenv('DB_NAME')
        )
        cur = conn.cursor()
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = %s 
                AND table_name = %s
            )
        """, (schema, table_name))
        exists = cur.fetchone()[0]
        cur.close()
        conn.close()
        return exists
    except Exception as e:
        logger.warning(f"Could not check if table {schema}.{table_name} exists: {e}")
        logger.warning("Assuming first run to be safe (will use sequential execution)")
        return False

def is_first_run():
    """Check if this is the first run by checking if key tables exist across all schemas.
    
    Returns:
        bool: True if this appears to be a first run (key tables don't exist)
    """
    # Check multiple key tables across different schemas to be more accurate
    # If any of these don't exist, it's likely a first run
    key_tables = [
        ('source_system', 'datalake'),  # Integration metadata table
        ('customers', 'public'),         # Normalized table
    ]
    
    for table_name, schema in key_tables:
        if not check_table_exists(table_name, schema=schema):
            logger.info(f"First run detected: {schema}.{table_name} does not exist")
            return True
    
    # All key tables exist, this is a subsequent run
    return False

def run_dbt_command(command, stage_name, dbt_dir):
    """Run a dbt command and return success status

    Args:
        command (str): The dbt command to execute
        stage_name (str): Name of the stage for logging
        dbt_dir (Path): Path to dbt directory

    Returns:
        bool: True if successful, False if failed
    """
    try:
        logger.info("Starting {}...".format(stage_name))
        logger.info("Command: {}".format(command))

        result = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
            cwd=str(dbt_dir)  # Run from dbt directory
        )

        logger.info("{} completed successfully".format(stage_name))
        if result.stdout.strip():
            logger.info("Output:\n{}".format(result.stdout))

        return True

    except subprocess.CalledProcessError as e:
        logger.error("{} failed!".format(stage_name))
        logger.error("Exit code: {}".format(e.returncode))
        if e.stderr:
            logger.error("Error output:\n{}".format(e.stderr))
        if e.stdout:
            logger.info("Standard output:\n{}".format(e.stdout))
        return False

def main():
    """Main execution function"""
    logger.info("=" * 60)
    logger.info("DBT Pipeline Cron Job Started")
    logger.info("=" * 60)

    # Load environment variables from env file (if exists)
    # Railway environment variables take precedence if already set
    load_env_file()
    ensure_db_env_from_database_url()

    # Validate environment variables
    if not validate_environment():
        logger.error("Environment validation failed. Exiting.")
        sys.exit(1)

    # Get dbt directory (subdirectory of script location)
    script_dir = Path(__file__).parent
    dbt_dir = script_dir / "dbt"
    
    if not dbt_dir.exists():
        logger.error(f"DBT directory not found: {dbt_dir}")
        sys.exit(1)

    # Check if force_process_all is enabled
    force_process_all = os.getenv('FORCE_PROCESS_ALL', 'false').lower() == 'true'
    
    # Get org_id from environment (required for normalized models)
    org_id = os.getenv('org_id')
    if not org_id:
        logger.error("Environment variable 'org_id' is required but not set. Exiting.")
        sys.exit(1)
    
    # Build vars flag with org_id and optionally force_process_all
    vars_dict = {'org_id': org_id}
    if force_process_all:
        logger.info("FORCE_PROCESS_ALL=true: Will process ALL records (not just changed ones)")
        vars_dict['force_process_all'] = True
    else:
        logger.info("Running incrementally: Only processing changed records")
    
    # Convert vars dict to JSON string for DBT
    import json
    vars_flag = f'--vars \'{json.dumps(vars_dict)}\''
    logger.info(f"Using org_id: {org_id}")

    # Check if this is a first run (to avoid deadlocks from parallel table creation)
    first_run = is_first_run()
    if first_run:
        logger.info("First run detected: Using sequential execution (threads=1) to avoid deadlocks")
        threads_flag = '--threads 1'
    else:
        # For subsequent runs, use a conservative thread count to avoid deadlocks
        # Default DBT threads=4 can cause deadlocks with complex dependencies
        default_threads = os.getenv('DBT_THREADS', '2')  # Reduced from default 4 to 2
        logger.info(f"Subsequent run: Using {default_threads} threads (reduced from default 4 to avoid deadlocks)")
        threads_flag = f'--threads {default_threads}'

    # Define pipeline stages in order
    # Staging: Views (always run, no incremental logic needed)
    # Integrations: Tables (incremental by default)
    # Normalized: Incremental tables (use force_process_all if set, threads=1 on first run)
    stages = [
        ("staging", f"dbt run --select staging.* --profiles-dir . {threads_flag}".strip()),
        ("integrations", f"dbt run --select integrations.* --profiles-dir . {threads_flag}".strip()),
        ("normalized", f"dbt run --select normalized.* --profiles-dir . {vars_flag} {threads_flag}".strip())
    ]

    success = True
    completed_stages = []

    for stage_name, command in stages:
        if not run_dbt_command(command, stage_name, dbt_dir):
            success = False
            break  # Stop on first failure
        completed_stages.append(stage_name)

    # Restore Prisma constraints after dbt (idempotent)
    if success:
        restore_script = script_dir.parent / "shared" / "restore_constraints.py"
        if restore_script.exists():
            logger.info("Restoring database constraints...")
            try:
                subprocess.run(
                    [sys.executable, str(restore_script)],
                    cwd=str(script_dir),
                    check=True,
                    capture_output=True,
                    text=True
                )
                logger.info("Database constraints restored successfully")
            except subprocess.CalledProcessError as e:
                logger.warning("Constraint restoration failed, but dbt stages succeeded")
                if e.stderr:
                    logger.warning("Error: {}".format(e.stderr))
        else:
            logger.warning(f"restore_constraints.py not found at {restore_script}")

    # Run tests only if all stages completed successfully
    if success:
        logger.info("Running dbt tests...")
        if run_dbt_command("dbt test --profiles-dir .", "tests", dbt_dir):
            logger.info("DBT tests completed successfully")
        else:
            logger.warning("DBT tests failed, but pipeline stages succeeded")

    # Final status reporting
    logger.info("=" * 60)
    if success:
        logger.info("DBT Pipeline Completed Successfully")
        logger.info("Completed stages: {}".format(', '.join(completed_stages)))
        if force_process_all:
            logger.info("Mode: Full refresh (all records processed)")
        else:
            logger.info("Mode: Incremental (only changed records processed)")
        logger.info("=" * 60)
        sys.exit(0)
    else:
        logger.error("DBT Pipeline Failed")
        logger.error("Successfully completed stages: {}".format(', '.join(completed_stages)))
        logger.error("=" * 60)
        sys.exit(1)

if __name__ == "__main__":
    main()

