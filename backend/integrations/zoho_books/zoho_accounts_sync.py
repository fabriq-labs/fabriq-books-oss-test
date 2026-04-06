#!/usr/bin/env python3
"""
Zoho Books Direct API Sync for Chart of Accounts

This module extracts Chart of Accounts data directly from Zoho Books API and loads to PostgreSQL.
Handles:
- OAuth 2.0 token refresh
- Pagination
- Incremental sync via last_modified_time
"""

import os
import sys
import json
import logging
import requests
import psycopg2
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

# Zoho Books API configuration
ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token"
ZOHO_API_BASE_TEMPLATE = "https://{api_domain}/books/v3"

# Global variable to store OAuth credentials (loaded from database)
_oauth_config: Optional[Dict[str, str]] = None

# Token tracking for smart refresh (in-memory only, per-process)
_token_refresh_time: Optional[datetime] = None
_token_expires_in: Optional[int] = None  # seconds


def load_env_file():
    """
    Load environment variables from .env file.
    NOTE: OAuth credentials are primarily loaded from database.
    Environment variables are used as fallback (with ERROR logging).
    This function loads all config including OAuth (for fallback support).
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
                        # OAuth credentials can be loaded from env as fallback
                        if key and key not in os.environ:
                            os.environ[key] = value
            return True
    return False


def load_oauth_config_from_db(org_id: str) -> Dict[str, str]:
    """
    Load OAuth credentials from database.
    Falls back to environment variables if database record not found.
    
    Args:
        org_id: Organization ID
    
    Returns:
        Dictionary with OAuth credentials
    """
    global _oauth_config
    if _oauth_config is None:
        try:
            _oauth_config = get_oauth_credentials(org_id, 'zoho_books')
            logger.info("✅ Loaded OAuth credentials from database")
        except Exception as e:
            logger.error(f"Failed to load OAuth credentials from database: {e}")
            # Fallback to environment variables
            logger.error("⚠️  FALLING BACK TO ENVIRONMENT VARIABLES - This is not recommended for production!")
            client_id = os.getenv("ZOHO_CLIENT_ID")
            client_secret = os.getenv("ZOHO_CLIENT_SECRET")
            refresh_token = os.getenv("ZOHO_REFRESH_TOKEN")
            
            if not all([client_id, client_secret, refresh_token]):
                raise ValueError(
                    "OAuth credentials not found in database and missing required environment variables: "
                    "ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN"
                )
            
            _oauth_config = {
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "organization_id": os.getenv("ZOHO_ORGANIZATION_ID"),
                "api_domain": os.getenv("ZOHO_API_DOMAIN", "www.zohoapis.com"),
                "accounts_domain": os.getenv("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.com"),
            }
            logger.error("Using OAuth credentials from environment variables")
    return _oauth_config




def refresh_access_token(org_id: Optional[str] = None) -> Optional[str]:
    """
    Refresh Zoho access token using refresh token.
    
    Args:
        org_id: Organization ID (required if OAuth config not already loaded)
    """
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error("org_id is required (set via environment variable or parameter)")
            return None
    
    # Load OAuth credentials (from database or environment fallback)
    try:
        oauth = load_oauth_config_from_db(org_id)
    except Exception as e:
        logger.error(f"Failed to load OAuth config: {e}")
        return None
    
    client_id = oauth.get("client_id")
    client_secret = oauth.get("client_secret")
    refresh_token = oauth.get("refresh_token")
    accounts_domain = oauth.get("accounts_domain", "https://accounts.zoho.com")
    
    if not all([client_id, client_secret, refresh_token]):
        logger.error("Missing Zoho OAuth credentials (client_id, client_secret, or refresh_token)")
        return None
    
    try:
        token_url = f"{accounts_domain}/oauth/v2/token"
        logger.info("Refreshing Zoho access token...")
        
        response = requests.post(
            token_url,
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30
        )
        
        if response.status_code != 200:
            logger.error(f"Token refresh failed: {response.status_code} - {response.text}")
            return None
        
        data = response.json()
        
        if "access_token" not in data:
            logger.error(f"No access token in response: {data}")
            return None
        
        access_token = data["access_token"]
        expires_in = data.get("expires_in", 3600)
        
        # Update refresh token if provided
        new_refresh_token = data.get("refresh_token", refresh_token)
        
        # Update environment variables (in-memory only, no file caching)
        os.environ["ZOHO_ACCESS_TOKEN"] = access_token
        os.environ["ZOHO_REFRESH_TOKEN"] = new_refresh_token
        
        # Track token refresh time and expiry for smart refresh
        global _token_refresh_time, _token_expires_in
        _token_refresh_time = datetime.now(timezone.utc)
        _token_expires_in = expires_in
        
        logger.info(f"✅ Successfully refreshed access token (expires in {expires_in}s)")
        return access_token
        
    except Exception as e:
        logger.error(f"Error refreshing token: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


def ensure_valid_token(org_id: Optional[str] = None) -> bool:
    """
    Ensure we have a valid access token, refreshing only if necessary.
    Uses in-memory token tracking to avoid unnecessary refreshes.
    
    Args:
        org_id: Organization ID (required if OAuth config not already loaded)
    """
    global _token_refresh_time, _token_expires_in
    
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error("org_id is required (set via environment variable or parameter)")
            return False
    
    # Check if access token exists in environment
    access_token = os.getenv("ZOHO_ACCESS_TOKEN")
    
    if not access_token:
        logger.info("No access token found, refreshing...")
        new_token = refresh_access_token(org_id)
        if new_token:
            logger.info("✅ Successfully obtained new access token")
            return True
        else:
            logger.error("Failed to obtain access token")
            return False
    
    # Check if token is still valid based on refresh time and expiry
    if _token_refresh_time and _token_expires_in:
        elapsed = (datetime.now(timezone.utc) - _token_refresh_time).total_seconds()
        time_until_expiry = _token_expires_in - elapsed
        
        # Refresh if token will expire in less than 5 minutes (300 seconds)
        if time_until_expiry > 300:
            # Token is still valid, no refresh needed
            logger.debug(f"Access token is valid ({time_until_expiry:.0f}s remaining)")
            return True
        else:
            # Token is expired or about to expire, refresh it
            logger.info(f"Access token expired or expiring soon ({time_until_expiry:.0f}s remaining), refreshing...")
    else:
        # No tracking info available, refresh to be safe
        logger.info("No token tracking info available, refreshing to ensure validity...")
    
    # Refresh the token
    new_token = refresh_access_token(org_id)
    if new_token:
        logger.info("✅ Successfully refreshed access token")
        return True
    else:
        logger.error("Failed to refresh access token")
        return False


def get_zoho_headers(org_id: Optional[str] = None) -> Dict[str, str]:
    """
    Get headers for Zoho Books API requests. Ensures token is valid before returning.
    
    Args:
        org_id: Organization ID (required if OAuth config not already loaded)
    """
    # Ensure we have a valid token before making requests
    if not ensure_valid_token(org_id):
        raise Exception("Cannot get headers: no valid access token available")
    
    access_token = os.getenv("ZOHO_ACCESS_TOKEN")
    
    # Get organization_id from database config or environment
    if org_id is None:
        org_id = os.getenv("org_id")
    
    organization_id = None
    if org_id:
        try:
            oauth = load_oauth_config_from_db(org_id)
            organization_id = oauth.get("organization_id")
        except Exception:
            pass
    
    # Fallback to environment variable
    if not organization_id:
        organization_id = os.getenv("ZOHO_ORGANIZATION_ID")
    
    if not access_token:
        raise Exception("Access token not available after refresh attempt")
    
    headers = {
        "Authorization": f"Zoho-oauthtoken {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    
    return headers


def get_api_base_url(org_id: Optional[str] = None) -> str:
    """
    Get Zoho Books API base URL based on API domain.
    
    Args:
        org_id: Organization ID (to get api_domain from database config)
    """
    api_domain = "www.zohoapis.com"  # Default
    
    # Try to get from database config
    if org_id is None:
        org_id = os.getenv("org_id")
    
    if org_id:
        try:
            oauth = load_oauth_config_from_db(org_id)
            api_domain = oauth.get("api_domain", api_domain)
        except Exception:
            pass
    
    # Fallback to environment variable
    if api_domain == "www.zohoapis.com":
        api_domain = os.getenv("ZOHO_API_DOMAIN", api_domain)
    
    return ZOHO_API_BASE_TEMPLATE.format(api_domain=api_domain)


def get_organization_id(org_id: Optional[str] = None) -> str:
    """
    Get Zoho organization ID from database config, env, or fetch from API.
    
    Args:
        org_id: Organization ID (for loading from database config)
    """
    # Try to get from database config first
    if org_id is None:
        org_id = os.getenv("org_id")
    
    if org_id:
        try:
            oauth = load_oauth_config_from_db(org_id)
            zoho_org_id = oauth.get("organization_id")
            if zoho_org_id:
                return zoho_org_id
        except Exception:
            pass
    
    # Fallback to environment variable
    zoho_org_id = os.getenv("ZOHO_ORGANIZATION_ID")
    if zoho_org_id:
        return zoho_org_id
    
    # Fetch first organization (similar to TypeScript client)
    try:
        api_base = get_api_base_url(org_id)
        url = f"{api_base}/organizations"
        headers = get_zoho_headers(org_id)
        
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 401:
            logger.warning("Access token expired during request, refreshing...")
            refresh_access_token(org_id)
            headers = get_zoho_headers(org_id)
            response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch organizations: {response.status_code} - {response.text}")
        
        data = response.json()
        organizations = data.get("organizations", [])
        
        if not organizations:
            raise Exception("No organizations found in Zoho account")
        
        zoho_org_id = organizations[0]["organization_id"]
        logger.info(f"Auto-fetched organization ID: {zoho_org_id}")
        os.environ["ZOHO_ORGANIZATION_ID"] = zoho_org_id
        return zoho_org_id
        
    except Exception as e:
        logger.error(f"Error fetching organization ID: {e}")
        raise


def fetch_zoho_accounts(modified_since: Optional[str] = None, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fetch Chart of Accounts from Zoho Books API.
    
    Args:
        modified_since: ISO date for incremental sync (not supported by Zoho, but we can filter client-side)
        org_id: Organization ID (required for loading OAuth config from database)
        
    Returns:
        List of account records
    """
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error("org_id is required (set via environment variable or parameter)")
            return []
    
    api_base = get_api_base_url(org_id)
    zoho_org_id = get_organization_id(org_id)
    url = f"{api_base}/chartofaccounts"
    headers = get_zoho_headers(org_id)
    
    params = {"organization_id": zoho_org_id}
    
    all_records = []
    page = 1
    
    while True:
        try:
            params["page"] = page
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code == 401:
                logger.warning("Access token expired during request, refreshing...")
                refresh_access_token(org_id)
                headers = get_zoho_headers(org_id)
                response = requests.get(url, headers=headers, params=params, timeout=30)
                if response.status_code == 401:
                    logger.error("Still getting 401 after token refresh. Refresh token may be invalid.")
                    raise Exception(f"Token refresh failed: {response.text}")
            
            if response.status_code != 200:
                logger.error(f"API error: {response.status_code} - {response.text}")
                break
            
            data = response.json()
            
            # Zoho wraps data in 'chartofaccounts' key
            records = data.get("chartofaccounts", [])
            
            if not records:
                break
            
            all_records.extend(records)
            logger.info(f"  Accounts: Fetched page {page} ({len(records)} records)")
            
            # Check if more pages
            page_context = data.get("page_context", {})
            has_more_page = page_context.get("has_more_page", False)
            
            if not has_more_page:
                break
            
            page += 1
            
        except Exception as e:
            logger.error(f"Error fetching accounts: {e}")
            break
    
    # Filter by modified_since if provided (client-side filtering)
    if modified_since and all_records:
        try:
            cutoff = datetime.fromisoformat(modified_since.replace('Z', '+00:00'))
            filtered = []
            for record in all_records:
                last_modified = record.get("last_modified_time")
                if last_modified:
                    try:
                        record_time = datetime.fromisoformat(last_modified.replace('Z', '+00:00'))
                        if record_time > cutoff:
                            filtered.append(record)
                    except Exception:
                        # If we can't parse, include it to be safe
                        filtered.append(record)
                else:
                    # If no last_modified_time, include it
                    filtered.append(record)
            all_records = filtered
            logger.info(f"  Filtered to {len(all_records)} records modified after {modified_since}")
        except Exception as e:
            logger.warning(f"Error filtering by modified_since: {e}")
    
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
        
        -- Add unique index on Zoho account ID to prevent duplicates
        CREATE UNIQUE INDEX IF NOT EXISTS {table_name}_zoho_id_idx 
        ON datalake.{table_name} ((data->>'{primary_key}'))
        WHERE data->>'{primary_key}' IS NOT NULL;
        """
        cursor.execute(create_sql)
        
        # Insert/upsert data as JSONB
        updated_count = 0
        skipped_count = 0
        
        for record in records:
            zoho_id = record.get(primary_key)
            if not zoho_id:
                logger.warning(f"  Skipping record without {primary_key}")
                skipped_count += 1
                continue
            
            # Extract record data (without _airbyte metadata)
            record_data = {k: v for k, v in record.items() if not k.startswith("_airbyte")}
            record_json = json.dumps(record_data)
            new_modified = record_data.get('last_modified_time')
            
            # Check if record already exists and compare last_modified_time
            if new_modified:
                cursor.execute(f"""
                    SELECT data->>'last_modified_time' as existing_modified
                    FROM datalake.{table_name}
                    WHERE data->>'{primary_key}' = %s
                    LIMIT 1
                """, (zoho_id,))
                
                existing = cursor.fetchone()
                
                if existing and existing[0]:
                    # If last_modified_time is the same, skip (no changes)
                    existing_modified = existing[0]
                    if existing_modified == new_modified:
                        skipped_count += 1
                        continue
            
            # Delete existing record with same Zoho ID (if any)
            cursor.execute(f"""
                DELETE FROM datalake.{table_name}
                WHERE data->>'{primary_key}' = %s
            """, (zoho_id,))
            
            # Insert new record
            cursor.execute(f"""
                INSERT INTO datalake.{table_name} 
                (_airbyte_raw_id, _airbyte_extracted_at, _airbyte_generation_id, _airbyte_meta, data)
                VALUES (%s, %s, %s, %s, %s::jsonb)
            """, (
                record["_airbyte_raw_id"],
                record["_airbyte_extracted_at"],
                record["_airbyte_generation_id"],
                record["_airbyte_meta"],
                record_json
            ))
            updated_count += 1
        
        conn.commit()
        logger.info(f"  ✅ Upserted {updated_count} records, skipped {skipped_count} unchanged")
        return updated_count
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error upserting to PostgreSQL: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise
    finally:
        cursor.close()
        conn.close()


def get_last_sync_time(table_name: str) -> Optional[str]:
    """
    Get the last sync time for incremental sync.
    Uses the max last_modified_time from the actual Zoho data.
    Returns None if table doesn't exist (first run) or has no data.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # First check if table exists (handles first run gracefully)
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'datalake' 
                AND table_name = %s
            )
        """, (table_name,))
        
        table_exists = cursor.fetchone()[0]
        
        if not table_exists:
            # Table doesn't exist yet (first run) - this is normal, no warning needed
            cursor.close()
            conn.close()
            return None
        
        # Extract last_modified_time from JSONB data column
        cursor.execute(f"""
            SELECT MAX(
                CASE 
                    WHEN data->>'last_modified_time' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
                        (data->>'last_modified_time')::timestamp
                    ELSE NULL
                END
            ) as max_modified_time
            FROM datalake.{table_name}
            WHERE data->>'last_modified_time' IS NOT NULL
        """)
        
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if result and result[0]:
            # Add 1 second buffer to avoid returning records with exact same timestamp
            max_date = result[0]
            buffered_date = max_date + timedelta(seconds=1)
            # Return as ISO format
            return buffered_date.isoformat()
        return None
        
    except Exception as e:
        # Only log warning if it's not a "table doesn't exist" error
        error_str = str(e)
        if "does not exist" not in error_str and "relation" not in error_str.lower():
            logger.warning(f"Could not get last sync time for {table_name}: {e}")
            import traceback
            logger.warning(traceback.format_exc())
        return None


def run_zoho_accounts_sync(force_full_refresh: bool = False, org_id: Optional[str] = None):
    """
    Run Zoho Books Chart of Accounts extraction and load to PostgreSQL.
    
    Args:
        force_full_refresh: Ignore last sync time
        org_id: Organization ID (required - set via environment variable or parameter)
    """
    # Get org_id from parameter or environment
    if org_id is None:
        org_id = os.getenv("org_id")
        if not org_id:
            logger.error("org_id is required (set via environment variable or parameter)")
            return {"success": False, "error": "org_id is required"}
    
    logger.info("=" * 60)
    logger.info("Starting Zoho Books Accounts Sync")
    logger.info(f"Organization ID: {org_id}")
    logger.info(f"Force Full Refresh: {force_full_refresh}")
    logger.info("=" * 60)
    
    start_time = datetime.now()
    
    try:
        table_name = "zb_accounts"
        primary_key = "account_id"
        
        logger.info(f"\nSyncing accounts...")
        
        # Get last sync time for incremental
        modified_since = None
        if not force_full_refresh:
            modified_since = get_last_sync_time(table_name)
            if modified_since:
                logger.info(f"  Incremental sync since: {modified_since}")
            else:
                # First run: check for ZOHO_START_DATE
                start_date = os.getenv("ZOHO_START_DATE")
                if start_date:
                    logger.info(f"  First run: using ZOHO_START_DATE={start_date}")
                    modified_since = start_date
                else:
                    logger.warning("  ⚠️  First run detected but ZOHO_START_DATE not set!")
                    logger.warning("  This will fetch ALL historical accounts (may be slow/large).")
                    logger.warning("  Set ZOHO_START_DATE in .env to limit historical data.")
        else:
            logger.info("  Force full refresh: fetching all accounts")
        
        # Fetch accounts
        records = fetch_zoho_accounts(modified_since=modified_since, org_id=org_id)
        
        if not records:
            logger.info("  No accounts to sync")
            return {"success": True, "records": 0}
        
        logger.info(f"  Fetched {len(records)} accounts from Zoho")
        
        # Upsert to PostgreSQL
        updated_count = upsert_to_postgres(records, table_name, primary_key)
        
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info("=" * 60)
        logger.info(f"✅ Accounts sync completed in {elapsed:.1f}s")
        logger.info(f"   Records processed: {updated_count}")
        logger.info("=" * 60)
        
        return {"success": True, "records": updated_count}
        
    except Exception as e:
        logger.error(f"Error during accounts sync: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    # Load environment (non-OAuth config only)
    load_env_file()
    
    # Get org_id (required)
    org_id = os.getenv("org_id")
    if not org_id:
        logger.error("org_id environment variable is required")
        logger.error("Set org_id in .env file or environment variable")
        sys.exit(1)
    
    # Check for force full refresh
    force_full_refresh = os.getenv("FORCE_FULL_REFRESH", "false").lower() == "true"
    
    # Run sync
    result = run_zoho_accounts_sync(force_full_refresh=force_full_refresh, org_id=org_id)
    
    if not result.get("success"):
        sys.exit(1)

