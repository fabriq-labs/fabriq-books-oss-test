# ERP Integration Credentials Migration to Database

## Overview

ERP integration OAuth credentials have been migrated from `.env` files to a centralized, encrypted database storage system. This change enables:

- **Multi-tenancy**: One connection configuration per organization per ERP system
- **Security**: Encrypted storage of sensitive OAuth credentials
- **Centralized Management**: Single source of truth for all ERP connections
- **Cross-platform Compatibility**: Accessible by both Python (forward sync) and Node.js (reverse sync) services

## Date

December 3, 2024

## Architecture Changes

### Before

- OAuth credentials stored in `.env` files in each integration directory
- Separate configuration for forward sync (Python/DBT) and reverse sync (Node.js)
- No encryption at rest
- Difficult to manage multiple organizations

### After

- OAuth credentials stored in `public.source_system` table (encrypted)
- Single configuration accessible by both forward and reverse sync
- AES-256-CBC encryption with application-level key management
- One connection per `org_id` per ERP system type

## Database Schema

### `public.source_system` Table

The `source_system` table has been moved from `datalake` schema to `public` schema and enhanced:

```sql
CREATE TABLE public.source_system (
    id VARCHAR(50) PRIMARY KEY,
    org_id VARCHAR(50) NOT NULL,
    system_type VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    region VARCHAR(255),
    connector_version VARCHAR(255),
    connection_config JSONB NOT NULL,  -- Encrypted OAuth credentials
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    modified_at TIMESTAMP DEFAULT now() @updatedAt,
    created_by VARCHAR(255),
    modified_by VARCHAR(255),
    
    UNIQUE(org_id, system_type)  -- One connection per org per ERP type
);
```

**Key Fields:**
- `org_id`: Organization identifier (required)
- `system_type`: ERP system type (e.g., `'zoho_books'`, `'xero'`)
- `connection_config`: JSONB field containing encrypted OAuth credentials

### Connection Config Structure

The `connection_config` JSONB field stores encrypted data with this structure:

```json
{
  "oauth": {
    "client_id": "...",
    "client_secret": "...",
    "refresh_token": "...",
    "organization_id": "...",  // Zoho/Xero specific
    "api_domain": "...",        // Zoho specific
    "accounts_domain": "...",   // Zoho specific
    "tenant_id": "..."          // Xero specific
  }
}
```

## Encryption

### Algorithm

- **Algorithm**: AES-256-CBC
- **Key Management**: Application-level encryption key stored in environment variable
- **Format**: `iv:ciphertext` (both base64-encoded, colon-separated)

### Encryption Key

**Environment Variable**: `ERP_CONFIG_ENCRYPTION_KEY`

**Requirements:**
- 32 bytes (256 bits) for AES-256
- Base64-encoded (URL-safe base64 is supported)
- Must be the same across all environments that share the same database

**Generation:**

```bash
# Python
python3 -c "import secrets; import base64; key = secrets.token_bytes(32); print('ERP_CONFIG_ENCRYPTION_KEY=' + base64.urlsafe_b64encode(key).decode('utf-8'))"

# Node.js
node -e "const crypto = require('crypto'); const key = crypto.randomBytes(32); console.log('ERP_CONFIG_ENCRYPTION_KEY=' + key.toString('base64'));"
```

**Security Notes:**
- Never commit the encryption key to git
- Store in secure secret management (Railway secrets, AWS Secrets Manager, etc.)
- Rotate periodically
- Use the same key across environments that share the same database

## Implementation Details

### Python (Forward Sync)

**Location**: `integrations/shared/db_config_loader.py`

**Key Functions:**
- `get_db_connection()`: Connects using DBT-style credentials (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
- `get_erp_connection_config(org_id, system_type)`: Loads and decrypts connection config
- `get_oauth_credentials(org_id, system_type)`: Convenience function for OAuth credentials

**Usage:**

```python
from shared.db_config_loader import get_oauth_credentials

# Load OAuth credentials for an organization
oauth = get_oauth_credentials(org_id='org_123', system_type='zoho_books')

# Use credentials
client_id = oauth['client_id']
client_secret = oauth['client_secret']
refresh_token = oauth['refresh_token']
```

**Updated Scripts:**
- `integrations/zoho_books/zoho_accounts_sync.py`
- `integrations/xero/xero_api_sync.py`
- `integrations/zoho_books/sync_and_transform.py`
- `integrations/xero/sync_and_transform.py`

### Node.js (Reverse Sync)

**Location**: `src/lib/integrations/shared/erp-connection-loader.ts`

**Key Functions:**
- `getErpConnectionConfig(orgId, systemType)`: Loads and decrypts connection config
- `getOAuthCredentials(orgId, systemType)`: Convenience function for OAuth credentials

**Usage:**

```typescript
import { getOAuthCredentials } from '../shared/erp-connection-loader';

// Load OAuth credentials for an organization
const oauth = await getOAuthCredentials('org_123', 'zoho_books');

// Use credentials
const clientId = oauth.client_id;
const clientSecret = oauth.client_secret;
const refreshToken = oauth.refresh_token;
```

**Updated Files:**
- `src/lib/integrations/zoho_books/zoho_api_client.ts`
- `src/lib/integrations/zoho_books/connectors/purchase_order_connector.ts`
- `src/lib/integrations/connectors/index.ts`
- `src/lib/actions/purchase_order.ts`

### DBT Models

**Updated References:**
- All DBT models now reference `public.source_system` directly (table is managed by Prisma)
- The `source_system` table is created by Prisma migrations and populated via API from the frontend
- No DBT models are needed for `source_system` since it's not part of the data transformation pipeline

## Configuration Setup

### Step 1: Set Encryption Key

Add to your `.env` file or environment:

```bash
ERP_CONFIG_ENCRYPTION_KEY=<your-32-byte-base64-key>
```

### Step 2: Create ERP Connection via API

ERP connections are created and managed through the frontend API. The API will:
1. Accept OAuth credentials from the user
2. Encrypt credentials using `ERP_CONFIG_ENCRYPTION_KEY`
3. Insert or update records in `public.source_system` table

**Note:** Migration scripts are no longer needed. All configuration is done through the application API.

### Step 3: Update Environment Variables

**OAuth credentials are now managed via API:**
- OAuth credentials (client_id, client_secret, refresh_token, etc.) are entered through the frontend
- They are encrypted and stored in `public.source_system` table
- No need to store them in `.env` files

**Keep in `.env` files** (still required):
- `org_id`: Organization ID (required for all sync scripts)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Database credentials (same as DBT)
- `ERP_CONFIG_ENCRYPTION_KEY`: Encryption key (required)
- `XERO_START_DATE` / `ZOHO_START_DATE`: Optional, for limiting historical data on first run

### Step 4: Verify

Test the integration:

```bash
# Zoho Books
cd integrations/zoho_books
python sync_and_transform.py

# Xero
cd integrations/xero
python sync_and_transform.py
```

**Note:** Ensure the ERP connection is configured in the database via the API before running sync scripts.

## Environment Variables

### Required for All Integrations

| Variable | Description | Example |
|----------|-------------|---------|
| `org_id` | Organization ID | `org_indian_demo` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `password` |
| `DB_NAME` | PostgreSQL database name | `fabriq` |
| `ERP_CONFIG_ENCRYPTION_KEY` | 32-byte base64 encryption key | `23HQTtZPILu_fgHxjdmHDQ6MZde6v2GyaLPYVUC0c8U=` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `XERO_START_DATE` | Limit historical data for Xero | None (fetches all) |
| `ZOHO_START_DATE` | Limit historical data for Zoho | None (fetches all) |
| `FORCE_FULL_REFRESH` | Force full data refresh | `false` |
| `SKIP_EXTRACTION` | Skip API extraction step | `false` |
| `SKIP_DBT` | Skip DBT transformation step | `false` |

## Dependencies

### Python

Added to `integrations/zoho_books/requirements.txt` and `integrations/xero/requirements.txt`:

```
cryptography>=41.0.0
```

Install:

```bash
pip install -r integrations/zoho_books/requirements.txt
# or
pip install -r integrations/xero/requirements.txt
```

### Node.js

No new dependencies required (uses built-in `crypto` module).

## Troubleshooting

### "No active ERP connection found"

**Error**: `No active ERP connection found for org_id='...', system_type='...'`

**Solution**: Create the ERP connection via the frontend API. The connection must be configured in the database before running sync scripts.

### "Decryption failed: Invalid padding bytes"

**Error**: `Decryption failed: Invalid padding bytes. Check that ERP_CONFIG_ENCRYPTION_KEY is set correctly.`

**Causes**:
1. Wrong encryption key
2. Data encrypted with different key
3. Key format mismatch

**Solutions**:
1. Verify `ERP_CONFIG_ENCRYPTION_KEY` is set correctly
2. Re-encrypt data via API (update the connection configuration)
3. Ensure key is the same across all environments sharing the database

### "Missing required database environment variables"

**Error**: `Missing required database environment variables: DB_HOST, DB_USER, ...`

**Solution**: Set the same database credentials that DBT uses:
- `DB_HOST`
- `DB_PORT` (default: 5432)
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

### Import Path Errors

**Error**: `ModuleNotFoundError: No module named 'shared'`

**Solution**: Ensure you're running scripts from the integration directory, and the `integrations/` directory is in Python path. The scripts automatically add it.

## Security Considerations

1. **Encryption Key Management**:
   - Store `ERP_CONFIG_ENCRYPTION_KEY` in secure secret management
   - Never commit to git
   - Rotate periodically
   - Use same key across environments sharing the database

2. **Access Control**:
   - Only authorized services should access `public.source_system` table
   - Consider row-level security (RLS) policies for multi-tenant isolation

3. **Audit Trail**:
   - `created_at` and `modified_at` timestamps track changes
   - Consider adding audit logging for config access/modification

4. **Key Rotation**:
   - To rotate keys, re-encrypt all connection configs:
     1. Decrypt with old key
     2. Re-encrypt with new key
     3. Update `ERP_CONFIG_ENCRYPTION_KEY` environment variable

## Rollback Plan

If issues arise:

1. **Keep `.env` files** until migration is verified
2. **Feature flag**: Add environment variable to toggle between `.env` and database config
3. **Backward compatibility**: Scripts can temporarily support both methods during transition

## Future Enhancements

1. **Admin API**: Web interface for managing ERP connections
2. **Key Rotation**: Automated key rotation process
3. **Connection Testing**: Test connection before saving
4. **Audit Logging**: Track who accessed/modified connections
5. **Multi-region Support**: Support for different API domains/regions per connection

## Related Files

### Python
- `integrations/shared/encryption.py` - Encryption utilities
- `integrations/shared/db_config_loader.py` - Database config loader

### TypeScript
- `src/lib/integrations/shared/encryption.ts` - Encryption utilities
- `src/lib/integrations/shared/erp-connection-loader.ts` - Database config loader

### Database
- `prisma/schema/metadata.prisma` - `source_system` model definition
- `prisma/setup-fabriq-source-system.sql` - Fabriq source system setup (if needed)

### API
- Frontend API endpoints for creating/updating ERP connections
- Credentials are encrypted and stored via API calls

## Summary

This migration centralizes ERP integration credentials in the database with encryption, enabling:
- ✅ Multi-tenant support (one connection per org per ERP)
- ✅ Encrypted storage of sensitive credentials
- ✅ Cross-platform access (Python and Node.js)
- ✅ Centralized management
- ✅ Better security practices

All forward sync (Python/DBT) and reverse sync (Node.js) services now use the same encrypted database configuration.

