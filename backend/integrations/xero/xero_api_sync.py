#!/usr/bin/env python3
"""
Xero Direct API Sync (Workaround for PyAirbyte connector bug)

This module extracts data directly from Xero API and loads to PostgreSQL.
Used as a fallback when PyAirbyte Xero connector has issues.

Handles:
- OAuth 2.0 token refresh
- Pagination
- Incremental sync via UpdatedDateUTC
"""

import os
import sys
import json
import logging
import requests
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, List, Any

# Import database config loader
# Add integrations directory to path
integrations_dir = Path(__file__).parent.parent  # integrations/
sys.path.insert(0, str(integrations_dir))
from shared.db_config_loader import get_oauth_credentials

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Xero API endpoints
XERO_API_BASE = "https://api.xero.com/api.xro/2.0"
XERO_TOKEN_URL = "https://identity.xero.com/connect/token"

# Global variable to store OAuth credentials (loaded from database)
_oauth_config: Optional[Dict[str, str]] = None


def load_env_file():
    """
    Load environment variables from .env file.
    NOTE: OAuth credentials are now loaded from database, not .env.
    This function only loads non-OAuth config (e.g., DATABASE_URL, org_id).
    """
    script_dir = Path(__file__).parent
    env_files = [script_dir / '.env', script_dir / 'env']
    
    for env_file in env_files:
        if env_file.exists():
            logger.info(f"Loading environment from {env_file.name}")
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        # Skip OAuth credentials - these come from database now
                        if key in ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET', 'XERO_REFRESH_TOKEN']:
                            continue
                        if key and key not in os.environ:
                            os.environ[key] = value
            return True
    return False


def load_oauth_config_from_db(org_id: str) -> Dict[str, str]:
    """
    Load OAuth credentials from database.
    
    Args:
        org_id: Organization ID
    
    Returns:
        Dictionary with OAuth credentials
    """
    global _oauth_config
    if _oauth_config is None:
        try:
            _oauth_config = get_oauth_credentials(org_id, 'xero')
            logger.info("✅ Loaded OAuth credentials from database")
        except Exception as e:
            logger.error(f"Failed to load OAuth credentials from database: {e}")
            raise
    return _oauth_config


def load_tokens_from_file() -> Optional[Dict[str, Any]]:
    """Load tokens from .xero_tokens.json file if it exists."""
    script_dir = Path(__file__).parent
    token_file = script_dir / ".xero_tokens.json"
    
    if token_file.exists():
        try:
            with open(token_file, 'r') as f:
                tokens = json.load(f)
                # Update env vars from file
                if "access_token" in tokens:
                    os.environ["XERO_ACCESS_TOKEN"] = tokens["access_token"]
                if "refresh_token" in tokens:
                    os.environ["XERO_REFRESH_TOKEN"] = tokens["refresh_token"]
                return tokens
        except Exception as e:
            logger.warning(f"Failed to load tokens from file: {e}")
    return None


def is_token_expired(token_created_at: Optional[datetime] = None, expires_in: Optional[int] = None) -> bool:
    """
    Check if access token is expired.
    Xero access tokens expire in 30 minutes (1800 seconds) by default.
    
    Args:
        token_created_at: When the token was created (from token file)
        expires_in: Token expiration time in seconds (from token file)
        
    Returns:
        True if token is expired or missing, False otherwise
    """
    access_token = os.getenv("XERO_ACCESS_TOKEN")
    
    if not access_token:
        return True
    
    # If we have token creation time and expiration info, check precisely
    if token_created_at and expires_in:
        elapsed = (datetime.now(timezone.utc) - token_created_at).total_seconds()
        # Refresh 2 minutes before expiry to be safe
        if elapsed > (expires_in - 120):
            logger.debug(f"Token is expired (created {elapsed:.0f} seconds ago, expires in {expires_in} seconds)")
            return True
        return False
    
    # If we have token creation time but no expires_in, use default 30 minutes
    if token_created_at:
        elapsed = (datetime.now(timezone.utc) - token_created_at).total_seconds()
        # Refresh 2 minutes before default expiry (28 minutes)
        if elapsed > 1680:  # 28 minutes
            logger.debug(f"Token is expired (created {elapsed:.0f} seconds ago, using default 30min expiry)")
            return True
        return False
    
    # If no creation time, we can't determine expiration - assume it might be expired
    # This will cause a refresh, which is safe
    logger.debug("No token creation time available, will refresh to be safe")
    return True


def refresh_access_token(org_id: Optional[str] = None) -> Optional[str]:
    """
    Refresh Xero access token using refresh token.
    
    Args:
        org_id: Organization ID (required if OAuth config not already loaded)
    """
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error("org_id is required (set via environment variable or parameter)")
            return None
    
    # Load OAuth credentials from database
    try:
        oauth = load_oauth_config_from_db(org_id)
    except Exception as e:
        logger.error(f"Failed to load OAuth config: {e}")
        return None
    
    client_id = oauth.get("client_id")
    client_secret = oauth.get("client_secret")
    refresh_token = oauth.get("refresh_token")
    
    if not all([client_id, client_secret, refresh_token]):
        logger.error("Missing OAuth credentials in database connection config")
        return None
    
    try:
        logger.info("Refreshing Xero access token...")
        response = requests.post(
            XERO_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        if response.status_code == 200:
            tokens = response.json()
            access_token = tokens.get("access_token")
            new_refresh_token = tokens.get("refresh_token")
            expires_in = tokens.get("expires_in", 1800)  # Default 30 minutes
            
            if not access_token:
                logger.error("Token refresh response missing access_token")
                return None
            
            # Add token creation timestamp
            tokens["created_at"] = datetime.now(timezone.utc).isoformat()
            tokens["expires_in"] = expires_in
            
            # Save new tokens
            script_dir = Path(__file__).parent
            token_file = script_dir / ".xero_tokens.json"
            with open(token_file, 'w') as f:
                json.dump(tokens, f, indent=2)
            
            # Update env vars
            os.environ["XERO_ACCESS_TOKEN"] = access_token
            if new_refresh_token:
                os.environ["XERO_REFRESH_TOKEN"] = new_refresh_token
            
            logger.info(f"✅ Access token refreshed successfully (expires in {expires_in} seconds)")
            return access_token
        else:
            error_text = response.text
            try:
                error_json = response.json()
                error_detail = error_json.get("error_description", error_json.get("error", error_text))
            except:
                error_detail = error_text
            
            logger.error(f"Token refresh failed: {response.status_code} - {error_detail}")
            
            # If refresh token is invalid, provide helpful message
            if response.status_code == 400 and "invalid_grant" in error_detail.lower():
                logger.error("Refresh token is invalid or expired. Please run oauth_setup.py to get new tokens.")
            
            return None
            
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        return None


def ensure_valid_token(org_id: Optional[str] = None) -> bool:
    """
    Ensure we have a valid access token, refreshing if needed.
    
    Args:
        org_id: Organization ID (required if OAuth config not already loaded)
    
    Returns:
        True if we have a valid token, False otherwise
    """
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error("org_id is required (set via environment variable or parameter)")
            return False
    
    # Try to load tokens from file first
    tokens = load_tokens_from_file()
    
    # Check if token is expired
    token_created_at = None
    expires_in = None
    if tokens:
        if "created_at" in tokens:
            try:
                token_created_at = datetime.fromisoformat(tokens["created_at"].replace('Z', '+00:00'))
            except Exception:
                pass
        if "expires_in" in tokens:
            expires_in = tokens.get("expires_in")
    
    # Check if token exists and is not expired
    access_token = os.getenv("XERO_ACCESS_TOKEN")
    
    if not access_token:
        logger.info("No access token found, refreshing...")
        new_token = refresh_access_token(org_id)
        if new_token:
            logger.info("✅ Successfully obtained new access token")
            return True
        else:
            logger.error("Failed to obtain access token")
            return False
    
    # Check if token is expired
    if is_token_expired(token_created_at, expires_in):
        logger.info("Access token expired, refreshing...")
        new_token = refresh_access_token(org_id)
        if new_token:
            logger.info("✅ Successfully refreshed expired access token")
            return True
        else:
            logger.error("Failed to refresh expired access token")
            return False
    
    # Token exists and is not expired
    if token_created_at:
        elapsed = (datetime.now(timezone.utc) - token_created_at).total_seconds()
        remaining = (expires_in - elapsed) if expires_in else "unknown"
        logger.debug(f"Access token is valid (created {elapsed:.0f} seconds ago, {remaining} seconds remaining)")
    
    return True


def get_xero_headers(org_id: Optional[str] = None) -> Dict[str, str]:
    """
    Get headers for Xero API requests. Ensures token is valid before returning.
    
    Args:
        org_id: Organization ID (required if OAuth config not already loaded)
    """
    # Ensure we have a valid token before making requests
    if not ensure_valid_token(org_id):
        raise Exception("Cannot get headers: no valid access token available")
    
    access_token = os.getenv("XERO_ACCESS_TOKEN")
    
    # Get tenant_id from database config or environment
    tenant_id = None
    if org_id is None:
        org_id = os.getenv("org_id")
    
    if org_id:
        try:
            oauth = load_oauth_config_from_db(org_id)
            tenant_id = oauth.get("tenant_id")  # Xero-specific
        except Exception:
            pass
    
    # Fallback to environment variable
    if not tenant_id:
        tenant_id = os.getenv("XERO_TENANT_ID")
    
    if not access_token:
        raise Exception("Access token not available after refresh attempt")
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    if tenant_id:
        headers["Xero-Tenant-Id"] = tenant_id
    
    return headers


def fetch_xero_stream(
    endpoint: str,
    stream_name: str,
    modified_since: Optional[str] = None,
    org_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Fetch data from a Xero API endpoint with pagination.
    
    Args:
        endpoint: API endpoint (e.g., "Invoices", "Contacts")
        stream_name: Name for logging
        modified_since: ISO date for incremental sync
        org_id: Organization ID (required for loading OAuth config from database)
        
    Returns:
        List of records
    """
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error(f"Cannot fetch {stream_name}: org_id is required")
            return []
    
    # Ensure valid token before starting
    if not ensure_valid_token(org_id):
        logger.error(f"Cannot fetch {stream_name}: no valid access token")
        return []
    
    url = f"{XERO_API_BASE}/{endpoint}"
    headers = get_xero_headers(org_id)
    
    if modified_since:
        headers["If-Modified-Since"] = modified_since
    
    all_records = []
    page = 1
    
    while True:
        try:
            params = {"page": page}
            response = requests.get(url, headers=headers, params=params)
            
            if response.status_code == 401:
                logger.warning("Access token expired during request, refreshing...")
                # Force refresh (don't check expiration, just refresh)
                new_token = refresh_access_token(org_id)
                if new_token:
                    # Update headers with new token
                    headers["Authorization"] = f"Bearer {new_token}"
                    logger.info("Retrying request with refreshed token...")
                    response = requests.get(url, headers=headers, params=params)
                    # If still 401, the refresh token might be invalid
                    if response.status_code == 401:
                        logger.error("Still getting 401 after token refresh. Refresh token may be invalid or expired.")
                        raise Exception(f"Token refresh failed: {response.text}")
                else:
                    raise Exception("Failed to refresh access token after 401 error")
            
            if response.status_code == 304:
                logger.info(f"  {stream_name}: No changes since {modified_since}")
                break
            
            if response.status_code != 200:
                logger.error(f"API error: {response.status_code} - {response.text}")
                break
            
            data = response.json()
            
            # Xero wraps data in a key matching the endpoint
            records = data.get(endpoint, [])
            
            if not records:
                break
            
            all_records.extend(records)
            logger.info(f"  {stream_name}: Fetched page {page} ({len(records)} records)")
            
            # Check if more pages
            if len(records) < 100:  # Xero default page size
                break
            
            page += 1
            
        except Exception as e:
            logger.error(f"Error fetching {stream_name}: {e}")
            break
    
    return all_records


def get_db_connection():
    """Get PostgreSQL connection."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT", 5432),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


def upsert_to_postgres(
    records: List[Dict[str, Any]],
    table_name: str,
    primary_key: str
):
    """
    Upsert records to PostgreSQL table.
    Creates table if not exists.
    """
    if not records:
        return 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Add Airbyte-style metadata columns
        now = datetime.now(timezone.utc).isoformat()
        generation_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        
        for record in records:
            record["_airbyte_raw_id"] = f"{record.get(primary_key, '')}_{generation_id}"
            record["_airbyte_extracted_at"] = now
            record["_airbyte_generation_id"] = generation_id
            record["_airbyte_meta"] = json.dumps({})
        
        # Get all columns from first record
        columns = list(records[0].keys())
        
        # Create table if not exists (JSONB for flexibility)
        create_sql = f"""
        CREATE TABLE IF NOT EXISTS datalake.{table_name} (
            _airbyte_raw_id TEXT PRIMARY KEY,
            _airbyte_extracted_at TIMESTAMPTZ,
            _airbyte_generation_id TEXT,
            _airbyte_meta JSONB,
            data JSONB
        );
        
        -- Add unique index on Xero ID to prevent duplicates
        CREATE UNIQUE INDEX IF NOT EXISTS {table_name}_xero_id_idx 
        ON datalake.{table_name} ((data->>'{primary_key}'))
        WHERE data->>'{primary_key}' IS NOT NULL;
        """
        cursor.execute(create_sql)
        
        # Insert/upsert data as JSONB
        # Use MERGE-like logic: delete old record if exists, then insert new one
        # This prevents duplicates based on Xero ID
        updated_count = 0
        skipped_count = 0
        
        for record in records:
            xero_id = record.get(primary_key)
            if not xero_id:
                logger.warning(f"  Skipping record without {primary_key}")
                skipped_count += 1
                continue
            
            # Extract record data (without _airbyte metadata)
            record_data = {k: v for k, v in record.items() if not k.startswith("_airbyte")}
            record_json = json.dumps(record_data)
            new_updated = record_data.get('UpdatedDateUTC')
            
            # Check if record already exists and compare UpdatedDateUTC
            
            if new_updated:
                cursor.execute(f"""
                    SELECT data->>'UpdatedDateUTC' as existing_updated
                    FROM datalake.{table_name}
                    WHERE data->>'{primary_key}' = %s
                    LIMIT 1
                """, (xero_id,))
                
                existing = cursor.fetchone()
                
                if existing and existing[0]:
                    # If UpdatedDateUTC is the same, skip (no changes)
                    # (This handles the case where Xero returns the same record due to If-Modified-Since being inclusive)
                    existing_updated = existing[0]
                    if existing_updated == new_updated:
                        skipped_count += 1
                        continue
            
            # Delete existing record with same Xero ID (if any)
            cursor.execute(f"""
                DELETE FROM datalake.{table_name}
                WHERE data->>'{primary_key}' = %s
            """, (xero_id,))
            
            # Insert new record
            cursor.execute(f"""
                INSERT INTO datalake.{table_name} 
                    (_airbyte_raw_id, _airbyte_extracted_at, _airbyte_generation_id, _airbyte_meta, data)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                record["_airbyte_raw_id"],
                record["_airbyte_extracted_at"],
                record["_airbyte_generation_id"],
                record["_airbyte_meta"],
                record_json,
            ))
            updated_count += 1
        
        if skipped_count > 0:
            logger.info(f"  Skipped {skipped_count} unchanged records")
        conn.commit()
        
        logger.info(f"  ✅ Upserted {updated_count} records to datalake.{table_name}")
        return updated_count
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


def get_last_sync_time(table_name: str) -> Optional[str]:
    """
    Get the last sync time for incremental sync.
    Uses the max UpdatedDateUTC from the actual Xero data (not extraction timestamp).
    This ensures we only fetch records that Xero has actually updated.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Extract UpdatedDateUTC from JSONB data column
        # Handle both .NET format (/Date(...)/) and ISO format
        cursor.execute(f"""
            SELECT MAX(
                CASE 
                    -- .NET JSON date format: /Date(1234567890000+0000)/
                    -- Use substring which is more reliable than regexp_replace
                    WHEN data->>'UpdatedDateUTC' ~ '^/Date' THEN
                        to_timestamp(
                            (substring(data->>'UpdatedDateUTC' from '/Date\\(([0-9]+)'))::bigint / 1000.0
                        )
                    -- ISO 8601 format
                    WHEN data->>'UpdatedDateUTC' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
                        (data->>'UpdatedDateUTC')::timestamp
                    ELSE NULL
                END
            ) as max_updated_date
            FROM datalake.{table_name}
            WHERE data->>'UpdatedDateUTC' IS NOT NULL
        """)
        
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if result and result[0]:
            # Add 1 second buffer to avoid Xero returning records with exact same timestamp
            # Xero's If-Modified-Since is inclusive (>=), so we add 1s to make it exclusive (>)
            # This prevents Xero from returning the same record we just synced
            max_date = result[0]
            buffered_date = max_date + timedelta(seconds=1)
            # Return as ISO format for Xero API
            return buffered_date.isoformat()
        return None
        
    except Exception as e:
        logger.warning(f"Could not get last sync time for {table_name}: {e}")
        import traceback
        logger.warning(traceback.format_exc())
        return None


def run_xero_sync(streams: Optional[List[str]] = None, force_full_refresh: bool = False, org_id: Optional[str] = None):
    """
    Run Xero data extraction and load to PostgreSQL.
    
    Args:
        streams: List of streams to sync
        force_full_refresh: Ignore last sync time
        org_id: Organization ID (required - set via environment variable or parameter)
    """
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error("org_id is required (set via environment variable or parameter)")
            return {"success": False, "error": "org_id is required"}
    
    if streams is None:
        streams = ['invoices', 'contacts', 'payments']
    
    # Stream configurations: (endpoint, table_name, primary_key)
    stream_config = {
        'invoices': ('Invoices', 'xero_invoices', 'InvoiceID'),
        'contacts': ('Contacts', 'xero_contacts', 'ContactID'),
        'payments': ('Payments', 'xero_payments', 'PaymentID'),
    }
    
    logger.info("=" * 60)
    logger.info("Starting Xero Direct API Sync")
    logger.info(f"Organization ID: {org_id}")
    logger.info(f"Streams: {streams}")
    logger.info(f"Force Full Refresh: {force_full_refresh}")
    logger.info("=" * 60)
    
    start_time = datetime.now()
    total_records = 0
    
    # Ensure we have a valid access token (will auto-refresh if expired)
    if not ensure_valid_token(org_id):
        logger.error("Failed to obtain valid access token")
        return {"success": False, "error": "No valid access token available"}
    
    try:
        for stream in streams:
            if stream not in stream_config:
                logger.warning(f"Unknown stream: {stream}, skipping")
                continue
            
            endpoint, table_name, primary_key = stream_config[stream]
            logger.info(f"\nSyncing {stream}...")
            
            # Get last sync time for incremental
            modified_since = None
            if not force_full_refresh:
                modified_since = get_last_sync_time(table_name)
                if modified_since:
                    logger.info(f"  Incremental sync since: {modified_since}")
                else:
                    # First run: require XERO_START_DATE to limit historical data
                    start_date = os.getenv("XERO_START_DATE")
                    if not start_date:
                        error_msg = (
                            f"First run detected for {stream} (no records in datalake.{table_name}), "
                            f"but XERO_START_DATE is not set in environment. "
                            f"This would fetch ALL historical records which could be very slow/large. "
                            f"Please set XERO_START_DATE in your .env file (e.g., XERO_START_DATE=2024-01-01T00:00:00Z)"
                        )
                        logger.error("=" * 60)
                        logger.error(error_msg)
                        logger.error("=" * 60)
                        raise ValueError(error_msg)
                    
                    modified_since = start_date
                    logger.info(f"  First run: syncing from start date: {modified_since}")
            
            # Fetch data from Xero
            records = fetch_xero_stream(endpoint, stream, modified_since, org_id)
            
            if records:
                # Upsert to PostgreSQL
                count = upsert_to_postgres(records, table_name, primary_key)
                total_records += count
            else:
                logger.info(f"  {stream}: No new records")
        
        duration = (datetime.now() - start_time).total_seconds()
        
        logger.info("=" * 60)
        logger.info("Xero Sync Completed Successfully")
        logger.info(f"Total records: {total_records}")
        logger.info(f"Duration: {duration:.2f} seconds")
        logger.info("=" * 60)
        
        return {
            "success": True,
            "total_records": total_records,
            "duration_seconds": duration,
            "streams": streams,
        }
        
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        return {"success": False, "error": str(e)}


def main():
    """Main entry point."""
    load_env_file()
    
    # Try to load tokens from file first (if available)
    tokens_loaded = load_tokens_from_file()
    
    # Get org_id (required)
    org_id = os.getenv("org_id")
    if not org_id:
        logger.error("=" * 60)
        logger.error("org_id environment variable is required")
        logger.error("Set org_id in .env file or environment variable")
        logger.error("=" * 60)
        sys.exit(1)
    
    # Validate config (non-OAuth)
    required = ['XERO_START_DATE']  # XERO_TENANT_ID can come from database config
    missing = [v for v in required if not os.getenv(v)]
    
    if missing:
        logger.error("=" * 60)
        logger.error("Missing required config:")
        for var in missing:
            logger.error(f"  - {var}")
        if 'XERO_START_DATE' in missing:
            logger.error("")
            logger.error("XERO_START_DATE is required to limit historical data on first run.")
            logger.error("Set it in your .env file (e.g., XERO_START_DATE=2024-01-01T00:00:00Z)")
        logger.error("=" * 60)
        sys.exit(1)
    
    # Check if we have cached tokens (token file is used for runtime caching)
    has_access_token = bool(os.getenv("XERO_ACCESS_TOKEN"))
    has_token_file = (Path(__file__).parent / ".xero_tokens.json").exists()
    
    # Note: OAuth credentials are now loaded from database, not env
    # Token file is still used for runtime token caching
    if not has_access_token and not has_token_file:
        logger.info("No cached access token found, will refresh from database config")
    
    # Try to ensure valid token (will load from database if needed)
    if not ensure_valid_token(org_id):
        logger.error("Failed to obtain access token from database config")
        logger.error("Please configure the ERP connection via the API before running sync scripts")
        sys.exit(1)
    
    force_full = os.getenv("FORCE_FULL_REFRESH", "false").lower() == "true"
    
    result = run_xero_sync(
        streams=['invoices', 'contacts', 'payments'],
        force_full_refresh=force_full,
        org_id=org_id
    )
    
    if not result["success"]:
        sys.exit(1)


if __name__ == "__main__":
    main()

