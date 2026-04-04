#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zoho Books Integration: Sync and Transform Pipeline

This is the main entry point for Railway cron service.
Orchestrates:
1. Direct API client extraction from Zoho Books API -> datalake.zb_* tables
2. DBT transformation -> public.* normalized tables

Environment Variables:
- See zoho_accounts_sync.py for Zoho/DB config
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
                logger.info(f"✅ Environment loaded from {env_file.name}")
                return True
            except Exception as e:
                logger.warning(f"Failed to load {env_file.name}: {e}")
    return False


def run_zoho_extraction():
    """Run Zoho Books API extraction."""
    logger.info("=" * 60)
    logger.info("Step 1: Zoho Books API Extraction")
    logger.info("=" * 60)
    
    script_dir = Path(__file__).parent
    sync_script = script_dir / "zoho_accounts_sync.py"
    
    if not sync_script.exists():
        logger.error(f"Sync script not found: {sync_script}")
        return False
    
    try:
        result = subprocess.run(
            [sys.executable, str(sync_script)],
            cwd=str(script_dir),
            capture_output=False,
            text=True
        )
        
        if result.returncode != 0:
            logger.error("Zoho extraction failed")
            return False
        
        logger.info("✅ Zoho extraction completed")
        return True
        
    except Exception as e:
        logger.error(f"Error running Zoho extraction: {e}")
        return False


def run_dbt():
    """Run DBT transformations."""
    logger.info("=" * 60)
    logger.info("Step 2: DBT Transformations")
    logger.info("=" * 60)
    
    script_dir = Path(__file__).parent
    dbt_dir = script_dir / "dbt"
    
    if not dbt_dir.exists():
        logger.error(f"DBT directory not found: {dbt_dir}")
        return False
    
    # Check for run_dbt.py script in integration root (not in dbt folder)
    run_dbt_script = script_dir / "run_dbt.py"
    
    if run_dbt_script.exists():
        # Use run_dbt.py script from integration root
        try:
            result = subprocess.run(
                [sys.executable, str(run_dbt_script)],
                cwd=str(script_dir),  # Run from integration root
                capture_output=False,
                text=True
            )
            
            if result.returncode != 0:
                logger.error("DBT transformation failed")
                return False
            
            logger.info("✅ DBT transformation completed")
            return True
            
        except Exception as e:
            logger.error(f"Error running DBT: {e}")
            return False
    else:
        # Fallback: run dbt directly
        logger.warning("run_dbt.py not found, running dbt directly")
        try:
            result = subprocess.run(
                ["dbt", "run", "--profiles-dir", ".", "--project-dir", "."],
                cwd=str(dbt_dir),
                capture_output=False,
                text=True
            )
            
            if result.returncode != 0:
                logger.error("DBT transformation failed")
                return False
            
            logger.info("✅ DBT transformation completed")
            return True
            
        except Exception as e:
            logger.error(f"Error running DBT: {e}")
            return False


def main():
    """Main pipeline orchestrator."""
    logger.info("=" * 60)
    logger.info("Zoho Books Sync and Transform Pipeline")
    logger.info(f"Started at: {datetime.now().isoformat()}")
    logger.info("=" * 60)
    
    # Load environment
    load_env_file()
    
    # Get org_id (required)
    org_id = os.getenv("org_id")
    if not org_id:
        logger.error("org_id environment variable is required")
        logger.error("Set org_id in .env file or environment variable")
        sys.exit(1)
    
    # Set org_id in environment for subprocess
    os.environ["org_id"] = org_id
    
    # Check flags
    skip_extraction = os.getenv("SKIP_EXTRACTION", "false").lower() == "true"
    skip_dbt = os.getenv("SKIP_DBT", "false").lower() == "true"
    
    success = True
    
    # Step 1: API Extraction
    if not skip_extraction:
        if not run_zoho_extraction():
            success = False
            logger.error("Pipeline failed at extraction step")
            if not skip_dbt:
                logger.warning("Skipping DBT due to extraction failure")
                sys.exit(1)
    else:
        logger.info("Skipping API extraction (SKIP_EXTRACTION=true)")
    
    # Step 2: DBT Transformations
    if not skip_dbt:
        if not run_dbt():
            success = False
            logger.error("Pipeline failed at DBT step")
            sys.exit(1)
    else:
        logger.info("Skipping DBT (SKIP_DBT=true)")
    
    # Summary
    logger.info("=" * 60)
    if success:
        logger.info("✅ Pipeline completed successfully")
    else:
        logger.error("❌ Pipeline completed with errors")
    logger.info("=" * 60)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

