#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Xero Integration: Sync and Transform Pipeline

This is the main entry point for Railway cron service.
Orchestrates:
1. Direct API client extraction from Xero API -> datalake.xero_* tables
2. DBT transformation -> public.* normalized tables

Environment Variables:
- See xero_api_sync.py for Xero/DB config
- SKIP_EXTRACTION: Set to 'true' to skip API extraction (run DBT only)
- SKIP_DBT: Set to 'true' to skip DBT (run extraction only)
- FORCE_FULL_REFRESH: Set to 'true' to force full data refresh
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from datetime import datetime

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
    env_files = [script_dir / '.env', script_dir / 'env']
    
    for env_file in env_files:
        if env_file.exists():
            logger.info(f"Loading environment from {env_file.name}")
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
                return True
            except Exception as e:
                logger.warning(f"Failed to load {env_file.name}: {e}")
    return False


def run_xero_extraction():
    """Run Xero data extraction (direct API - workaround for PyAirbyte bug)."""
    logger.info("=" * 60)
    logger.info("Phase 1: Xero Data Extraction (Direct API)")
    logger.info("=" * 60)
    
    # Get org_id (required)
    org_id = os.getenv("org_id")
    if not org_id:
        logger.error("org_id environment variable is required")
        return False
    
    try:
        # Use direct API sync (PyAirbyte connector has empty date parsing bug)
        from xero_api_sync import run_xero_sync
        
        force_full = os.getenv("FORCE_FULL_REFRESH", "false").lower() == "true"
        
        result = run_xero_sync(
            streams=['invoices', 'contacts', 'payments'],
            force_full_refresh=force_full,
            org_id=org_id
        )
        
        if not result["success"]:
            logger.error(f"Extraction failed: {result.get('error', 'Unknown error')}")
            return False
            
        logger.info(f"✅ Extraction complete: {result.get('total_records', 0)} records")
        return True
        
    except ImportError as e:
        logger.error(f"Failed to import xero_api_sync: {e}")
        logger.error("Check if xero_api_sync.py exists")
        return False
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        logger.exception("Full traceback:")
        return False


def run_dbt_pipeline():
    """Run DBT transformation pipeline."""
    logger.info("=" * 60)
    logger.info("Phase 2: DBT Transformation")
    logger.info("=" * 60)
    
    dbt_dir = Path(__file__).parent / "dbt"
    
    if not dbt_dir.exists():
        logger.error(f"DBT directory not found: {dbt_dir}")
        return False
    
    run_dbt_script = dbt_dir / "run_dbt.py"
    
    if run_dbt_script.exists():
        # Use run_dbt.py if available
        try:
            result = subprocess.run(
                [sys.executable, str(run_dbt_script)],
                cwd=str(dbt_dir),
                check=True,
                capture_output=True,
                text=True
            )
            logger.info("✅ DBT pipeline completed successfully")
            if result.stdout:
                logger.info(result.stdout)
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"DBT pipeline failed with exit code {e.returncode}")
            if e.stderr:
                logger.error(e.stderr)
            if e.stdout:
                logger.info(e.stdout)
            return False
    else:
        # Fallback: run dbt commands directly
        logger.info("run_dbt.py not found, running dbt commands directly")
        
        stages = [
            ("staging", "dbt run --select staging.* --profiles-dir ."),
            ("integrations", "dbt run --select integrations.* --profiles-dir ."),
            ("normalized", "dbt run --select normalized.* --profiles-dir ."),
        ]
        
        for stage_name, command in stages:
            logger.info(f"Running {stage_name}...")
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    cwd=str(dbt_dir),
                    check=True,
                    capture_output=True,
                    text=True
                )
                logger.info(f"✅ {stage_name} completed")
            except subprocess.CalledProcessError as e:
                logger.error(f"{stage_name} failed")
                if e.stderr:
                    logger.error(e.stderr)
                return False
        
        logger.info("✅ DBT pipeline completed successfully")
        return True


def main():
    """Main orchestration function."""
    start_time = datetime.now()
    
    logger.info("=" * 60)
    logger.info("Xero Integration Pipeline Started")
    logger.info(f"Start time: {start_time.isoformat()}")
    logger.info("=" * 60)
    
    # Load environment
    load_env_file()
    
    # Get org_id (required)
    org_id = os.getenv("org_id")
    if not org_id:
        logger.error("org_id environment variable is required")
        logger.error("Set org_id in .env file or environment variable")
        sys.exit(1)
    
    skip_extraction = os.getenv("SKIP_EXTRACTION", "false").lower() == "true"
    skip_dbt = os.getenv("SKIP_DBT", "false").lower() == "true"
    
    success = True
    
    # Phase 1: Extraction
    if not skip_extraction:
        if not run_xero_extraction():
            logger.error("Extraction phase failed")
            success = False
    else:
        logger.info("Skipping extraction (SKIP_EXTRACTION=true)")
    
    # Phase 2: DBT (only if extraction succeeded or was skipped)
    if success and not skip_dbt:
        if not run_dbt_pipeline():
            logger.error("DBT phase failed")
            success = False
    elif skip_dbt:
        logger.info("Skipping DBT (SKIP_DBT=true)")
    
    # Final summary
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    logger.info("=" * 60)
    if success:
        logger.info("Xero Integration Pipeline Completed Successfully")
    else:
        logger.error("Xero Integration Pipeline Failed")
    logger.info(f"Duration: {duration:.2f} seconds")
    logger.info("=" * 60)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

