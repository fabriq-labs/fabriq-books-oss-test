#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Xero DBT Pipeline Runner

Runs the Xero DBT pipeline stages: staging -> integrations -> normalized

This script runs all models incrementally by default (only processes changed records).
For full refresh, set FORCE_PROCESS_ALL=true.

Environment Variables:
- DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME: PostgreSQL connection
- DBT_THREADS: Number of threads for parallel execution (default: 2, reduced from 4 to avoid deadlocks)
- FORCE_PROCESS_ALL: Set to 'true' to process all records (default: 'false')

First Run Detection:
- Automatically detects first run by checking if key tables exist across schemas (datalake.source_system, public.invoice)
- On first run, uses sequential execution (threads=1) to avoid deadlocks from parallel table creation
- On subsequent runs, uses conservative threading (default threads=2, configurable via DBT_THREADS env var) to avoid deadlocks
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

try:
    import psycopg2
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def load_env_file():
    """Load environment variables from env or .env file."""
    script_dir = Path(__file__).parent
    # Also check parent directory for shared env file
    env_files = [
        script_dir / '.env', 
        script_dir / 'env',
        script_dir.parent / '.env',
        script_dir.parent / 'env'
    ]
    
    for env_file in env_files:
        if env_file.exists():
            logger.info(f"Loading environment from {env_file}")
            try:
                with open(env_file, 'r') as f:
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
                logger.info(f"✅ Environment loaded from {env_file}")
                return True
            except Exception as e:
                logger.warning(f"Failed to load {env_file}: {e}")
    return False


def validate_environment():
    """Validate required environment variables."""
    required_vars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    missing = [var for var in required_vars if not os.getenv(var)]

    if missing:
        logger.error(f"Missing required environment variables: {missing}")
        return False

    logger.info("✅ Environment validation passed")
    return True


def check_table_exists(table_name, schema='public'):
    """Check if a table exists in the database."""
    if not PSYCOPG2_AVAILABLE:
        logger.warning("psycopg2 not available, assuming first run")
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
                WHERE table_schema = %s AND table_name = %s
            )
        """, (schema, table_name))
        exists = cur.fetchone()[0]
        cur.close()
        conn.close()
        return exists
    except Exception as e:
        logger.warning(f"Could not check table existence: {e}")
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
        ('invoice', 'public'),          # Normalized table
    ]
    
    for table_name, schema in key_tables:
        if not check_table_exists(table_name, schema=schema):
            logger.info(f"First run detected: {schema}.{table_name} does not exist")
            return True
    
    # All key tables exist, this is a subsequent run
    return False


def run_dbt_command(command, stage_name):
    """Run a dbt command and return success status."""
    try:
        logger.info(f"Starting {stage_name}...")
        logger.info(f"Command: {command}")

        result = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )

        logger.info(f"✅ {stage_name} completed")
        if result.stdout.strip():
            logger.info(f"Output:\n{result.stdout}")

        return True

    except subprocess.CalledProcessError as e:
        logger.error(f"❌ {stage_name} failed!")
        logger.error(f"Exit code: {e.returncode}")
        if e.stderr:
            logger.error(f"Error:\n{e.stderr}")
        if e.stdout:
            logger.info(f"Output:\n{e.stdout}")
        return False


def main():
    """Main execution function."""
    logger.info("=" * 60)
    logger.info("Xero DBT Pipeline Started")
    logger.info("=" * 60)

    load_env_file()

    if not validate_environment():
        logger.error("Environment validation failed")
        sys.exit(1)

    # Check flags
    force_process_all = os.getenv('FORCE_PROCESS_ALL', 'false').lower() == 'true'
    if force_process_all:
        logger.info("FORCE_PROCESS_ALL=true: Processing ALL records")
        vars_flag = '--vars \'{"force_process_all": true}\''
    else:
        logger.info("Running incrementally")
        vars_flag = ''

    # First run detection
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

    # Pipeline stages
    stages = [
        ("staging", f"dbt run --select staging.* --profiles-dir . {threads_flag}".strip()),
        ("integrations", f"dbt run --select integrations.* --profiles-dir . {threads_flag}".strip()),
        ("normalized", f"dbt run --select normalized.* --profiles-dir . {vars_flag} {threads_flag}".strip())
    ]

    success = True
    completed_stages = []

    for stage_name, command in stages:
        if not run_dbt_command(command, stage_name):
            success = False
            break
        completed_stages.append(stage_name)

    # Run tests
    if success:
        logger.info("Running dbt tests...")
        if run_dbt_command("dbt test --profiles-dir .", "tests"):
            logger.info("✅ DBT tests passed")
        else:
            logger.warning("⚠️ DBT tests failed")

    # Summary
    logger.info("=" * 60)
    if success:
        logger.info("✅ Xero DBT Pipeline Completed Successfully")
        logger.info(f"Completed stages: {', '.join(completed_stages)}")
        sys.exit(0)
    else:
        logger.error("❌ Xero DBT Pipeline Failed")
        logger.error(f"Completed stages: {', '.join(completed_stages)}")
        sys.exit(1)


if __name__ == "__main__":
    main()

