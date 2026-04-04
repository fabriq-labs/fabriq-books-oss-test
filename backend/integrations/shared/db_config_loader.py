#!/usr/bin/env python3
"""
Database Config Loader for ERP Connections

Loads and decrypts ERP connection configuration from public.source_system table.
Used by forward sync scripts (Python/DBT) to get OAuth credentials.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, Any
import logging
from shared.encryption import decrypt_config, EncryptionError

logger = logging.getLogger(__name__)


def get_db_connection():
    """
    Get database connection using the same credentials as DBT.
    Uses individual environment variables: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
    
    Returns:
        psycopg2 connection object
    """
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT", "5432")
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_name = os.getenv("DB_NAME")
    
    if not all([db_host, db_user, db_password, db_name]):
        missing = [var for var, val in [
            ("DB_HOST", db_host),
            ("DB_USER", db_user),
            ("DB_PASSWORD", db_password),
            ("DB_NAME", db_name)
        ] if not val]
        raise ValueError(f"Missing required database environment variables: {', '.join(missing)}")
    
    return psycopg2.connect(
        host=db_host,
        port=int(db_port),
        user=db_user,
        password=db_password,
        dbname=db_name
    )


def get_erp_connection_config(
    org_id: str,
    system_type: str
) -> Dict[str, Any]:
    """
    Get ERP connection configuration from database for a specific org and system type.
    
    Args:
        org_id: Organization ID
        system_type: ERP system type (e.g., 'zoho_books', 'xero')
    
    Returns:
        Decrypted connection config dictionary with OAuth credentials:
        {
            "oauth": {
                "client_id": "...",
                "client_secret": "...",
                "refresh_token": "...",
                "organization_id": "...",  # Zoho/Xero specific
                "api_domain": "...",       # Zoho specific
                "accounts_domain": "..."    # Zoho specific
            }
        }
    
    Raises:
        ValueError: If connection not found or invalid
        EncryptionError: If decryption fails
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query source_system table
        cursor.execute("""
            SELECT 
                id,
                org_id,
                system_type,
                name,
                connection_config,
                is_active
            FROM public.source_system
            WHERE org_id = %s
              AND system_type = %s
              AND is_active = true
            LIMIT 1
        """, (org_id, system_type))
        
        result = cursor.fetchone()
        cursor.close()
        
        if not result:
            raise ValueError(
                f"No active ERP connection found for org_id='{org_id}', system_type='{system_type}'. "
                f"Please configure the ERP connection via the API before running sync scripts."
            )
        
        # Decrypt connection_config
        encrypted_config = result['connection_config']
        
        # Handle case where connection_config might be a dict (already decrypted) or string (encrypted)
        if isinstance(encrypted_config, dict):
            # Already decrypted (shouldn't happen, but handle gracefully)
            logger.warning("connection_config appears to be already decrypted")
            return encrypted_config
        
        # Decrypt the JSONB value
        try:
            decrypted_config = decrypt_config(encrypted_config)
        except EncryptionError as e:
            raise EncryptionError(
                f"Failed to decrypt connection config for {system_type}: {e}. "
                f"Check that ERP_CONFIG_ENCRYPTION_KEY is set correctly."
            ) from e
        
        logger.info(f"Successfully loaded connection config for {system_type} (org_id={org_id})")
        return decrypted_config
        
    except psycopg2.Error as e:
        logger.error(f"Database error loading connection config: {e}")
        raise ValueError(f"Database error: {e}") from e
    finally:
        if conn:
            conn.close()


def get_oauth_credentials(
    org_id: str,
    system_type: str
) -> Dict[str, str]:
    """
    Convenience function to get OAuth credentials from connection config.
    
    Args:
        org_id: Organization ID
        system_type: ERP system type (e.g., 'zoho_books', 'xero')
    
    Returns:
        Dictionary with OAuth credentials:
        {
            "client_id": "...",
            "client_secret": "...",
            "refresh_token": "...",
            "organization_id": "...",  # Optional, system-specific
            "api_domain": "...",        # Optional, Zoho-specific
            "accounts_domain": "..."    # Optional, Zoho-specific
        }
    """
    config = get_erp_connection_config(org_id, system_type)
    
    oauth = config.get("oauth", {})
    if not oauth:
        raise ValueError(
            f"No OAuth credentials found in connection config for {system_type}. "
            f"Expected 'oauth' key in connection_config."
        )
    
    return oauth
