# ERP Integration Architecture

## Overview

The Fabriq Integration Platform is a middleware solution that connects to multiple ERP/accounting and CRM systems, extracts financial transactions, and normalizes data to a universal internal data model. This enables advanced processing, agentic automation, analytics, and reporting across disparate source systems.

The platform supports two types of data synchronization:
- **Forward Sync**: Data flows from external ERP systems into Fabriq (ELT/DBT pipelines)
- **Reverse Sync**: Data flows from Fabriq to external ERP systems (workflow-triggered API calls)

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Source Systems (ERPs/CRMs)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Zoho Books  │  │  NetSuite   │  │  QuickBooks  │  ...     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │      Airbyte (PSO-Managed)         │
          │  - Connection Management          │
          │  - Data Extraction                │
          │  - Incremental Sync               │
          │  - Schema Detection               │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │    PostgreSQL Database            │
          │                                   │
          │  ┌─────────────────────────────┐ │
          │  │   datalake schema           │ │
          │  │  - Raw Airbyte data          │ │
          │  │  - Staging views (stg_*)     │ │
          │  │  - Integration metadata      │ │
          │  └─────────────────────────────┘ │
          │                                   │
          │  ┌─────────────────────────────┐ │
          │  │   public schema             │ │
          │  │  - Normalized Fabriq models │ │
          │  │  - Universal data model     │ │
          │  │  - source_system (encrypted)│ │
          │  └─────────────────────────────┘ │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │      DBT (Data Build Tool)        │
          │  - Staging Layer                  │
          │  - Integration Metadata           │
          │  - Normalization Layer            │
          │  - Field Mapping                  │
          │  - Lineage Tracking               │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │      Fabriq Application          │
          │  - Metadata Framework             │
          │  - Workflow Engine                │
          │  - Agentic Automation              │
          │  - Reverse Sync (API calls)       │
          │  - Analytics & Reporting          │
          │  - REST APIs                      │
          └───────────────────────────────────┘
```

## Forward Sync (ELT Pipeline)

### Components

#### 1. Source Systems (ERPs/CRMs)

**Purpose**: External systems that contain financial and business data.

**Supported Systems** (Current & Planned):
- ✅ **Zoho Books** (Phase 1 - Active, Airbyte Cloud)
- ✅ **Xero** (Phase 1 - Active, Direct API Client)
- ✅ **QuickBooks Online** (Phase 1 - Active, Airbyte Cloud)
- 🔄 **NetSuite** (Planned)
- 🔄 **SAP** (Planned)
- 🔄 **Microsoft Dynamics** (Planned)
- 🔄 **Oracle** (Planned)
- 🔄 **Tally** (Planned)

**Data Types Extracted**:
- Invoices (Sales & Purchase)
- Sales Orders
- Payment Receipts
- Customer Records
- Supplier Records
- General Ledger Entries
- Credit Notes
- And more...

#### 2. Data Extraction (Airbyte Cloud & Direct API)

**Purpose**: Handles data extraction from source systems and loads into the data lake.

**Two Extraction Methods**:

##### Airbyte Cloud (for Zoho Books and QuickBooks Online)
- **Management**: PSO (Professional Services Organization) team manages connections
- **Connectors**: Uses Airbyte Cloud's managed connectors
- **Table Prefixes**: 
  - Zoho Books: `zb_` (e.g., `datalake.zb_invoices`)
  - QuickBooks Online: `qb_` (e.g., `datalake.qb_customers`)

##### Direct API Client (for Xero)
- **Management**: Self-managed via Python scripts (`xero_api_sync.py`)
- **Deployment**: Railway cron service
- **State Storage**: Incremental sync via `UpdatedDateUTC` field
- **Table Prefix**: `xero_` (e.g., `datalake.xero_invoices`)
- **Note**: We use direct API instead of PyAirbyte due to a bug in PyAirbyte's Xero connector with .NET date format parsing

**Responsibilities**:
- **Connection Management**: Establish and maintain connections to source systems
- **Schema Detection**: Automatically detect and map source schemas
- **Incremental Sync**: Track and sync only changed records
- **Data Extraction**: Pull data from source APIs/databases
- **Data Loading**: Load raw data into PostgreSQL `datalake` schema

**Output**: Raw data tables in `datalake` schema with naming pattern: `<prefix>_<stream_name>`
- Zoho: `datalake.zb_invoices`, `datalake.zb_sales_orders`
- Xero: `datalake.xero_invoices`, `datalake.xero_contacts`
- QuickBooks: `datalake.qb_customers`, `datalake.qb_vendors`, `datalake.qb_items`, `datalake.qb_accounts`

**Metadata Included**:
- `_airbyte_raw_id`: Unique record identifier
- `_airbyte_extracted_at`: Timestamp of extraction
- `_airbyte_generation_id`: Batch/sync job identifier
- `_airbyte_meta`: Additional metadata (JSONB)

#### 3. PostgreSQL Database

**Purpose**: Central data store for both raw and normalized data.

##### Schema: `datalake`
**Contains**:
- **Raw Airbyte Data**: Tables created by Airbyte Cloud (e.g., `zb_invoices`, `zb_sales_orders`)
- **Raw Direct API Data**: Tables created by direct API clients (e.g., `xero_invoices`, `xero_contacts`)
- **Staging Views**: DBT-created views (`stg_zoho_*`, `stg_xero_*`) for copy-only transformations
- **Integration Metadata**:
  - `sync_batch`: Audit trail of sync operations (Airbyte Cloud and direct API)

**Characteristics**:
- Raw data preserved as-is from source systems
- No transformations applied
- All Airbyte metadata retained
- Schema-agnostic (handles schema variations)

##### Schema: `public`
**Contains**:
- **Normalized Business Data**: Fabriq transactional tables
- **Universal Data Model**: Standardized schema across all source systems
- **Lineage Tracking**: Source system, record ID, batch information
- **Source System Configuration**: `source_system` table with encrypted OAuth credentials

**Key Tables**:
- `invoice`: Normalized invoices from all sources
- `sales_order`: Normalized sales orders
- `payment_receipt`: Normalized payment receipts
- `customers`: Customer master data
- `supplier`: Supplier master data
- `source_system`: ERP connection configurations (encrypted)
- And more...

#### 4. DBT (Data Build Tool)

**Purpose**: Transforms raw data from source systems into the universal Fabriq data model.

**Location**: `backend/integrations/<source_system>/dbt/`

**Architecture Layers**:

##### Layer 1: Staging (`datalake` schema)
- **Purpose**: Copy-only selection from raw Airbyte tables
- **Materialization**: Views
- **Naming**: `stg_<source>_<stream>`
- **Example**: `stg_zoho_invoices`, `stg_zoho_sales_orders`
- **Operations**: Minimal renaming, no calculations, no filtering

##### Layer 2: Integration Metadata (`datalake` schema)
- **Purpose**: Track source systems and sync operations
- **Materialization**: Tables
- **Models**:
  - `sync_batch`: Batch metadata and audit trail
- **Operations**: Summarize Airbyte syncs, track lineage

##### Layer 3: Normalized (`public` schema)
- **Purpose**: Map source fields to universal Fabriq model
- **Materialization**: Incremental tables (merge strategy)
- **Naming**: Matches Prisma model names
- **Example**: `invoice`, `sales_order`, `payment_receipt`
- **Operations**:
  - Field mapping from source to target
  - Data type conversions
  - Lineage field population
  - Incremental updates (merge on `source_record_id`)

**Key Features**:
- **Incremental Processing**: Only processes new/changed records
- **Lineage Tracking**: Every record tracks its source system, source record ID, and batch
- **Duplicate Prevention**: Lateral joins with `DISTINCT ON` to prevent duplicates
- **Schema Management**: Custom `generate_schema_name` macro for proper schema placement

### Data Flow

#### Phase 1: Current Implementation

```
1. PSO Team sets up Airbyte connection to Zoho Books
   ↓
2. Airbyte syncs data incrementally
   ↓
3. Raw data lands in datalake.zb_* tables
   ↓
4. DBT staging views (stg_zoho_*) select from raw tables
   ↓
5. DBT sync_batch model summarizes sync operations
   ↓
6. DBT normalized models map to public.* tables
   ↓
7. Fabriq application consumes normalized data
```

#### Detailed Flow Example: Invoice

```
Zoho Books API
  ↓ (Airbyte extracts)
datalake.zb_invoices (raw table)
  ↓ (DBT staging - copy only)
datalake.stg_zoho_invoices (view)
  ↓ (DBT normalized - field mapping)
public.invoice (normalized table)
  ↓ (Fabriq application)
REST API / Workflows / Analytics
```

### Integration Metadata & Lineage

#### Source System Tracking

**Table**: `public.source_system`
- Tracks all connected source systems per organization
- Fields: `id`, `org_id`, `system_type`, `name`, `is_active`, `region`, `connection_config` (encrypted)
- One record per `org_id` per ERP system type
- OAuth credentials stored encrypted in `connection_config` JSONB field

#### Sync Batch Tracking

**Table**: `datalake.sync_batch`
- Tracks each Airbyte sync operation
- Fields: `id`, `source_system_id`, `stream_name`, `row_count`, `started_at`, `completed_at`, `airbyte_job_id`
- One record per stream per sync
- Used for audit trail and lineage

#### Lineage Fields (in normalized tables)

Every normalized record includes:
- `source_system_id`: FK to `public.source_system`
- `source_record_id`: Original record ID from source system
- `source_updated_at`: Last update timestamp from source
- `ingest_batch_id`: FK to `datalake.sync_batch`

**Benefits**:
- Full traceability back to source
- Audit trail for data changes
- Support for incremental updates
- Multi-source system support

## Reverse Sync (Fabriq → ERP)

### Overview

Reverse Sync refers to the flow of data from **Fabriq to External ERP Systems** (e.g., Zoho Books, Xero). Unlike forward sync which uses ELT/DBT pipelines, reverse sync is triggered by application events (Workflow Side-Effects) and performed via direct API calls.

### Architecture

We use a **Connector Factory Pattern** to make the reverse sync logic ERP-agnostic. The application logic interacts with a generic `ERPConnector` interface, and a factory loads the correct implementation based on organization configuration.

### Key Components

1. **Generic Action** (`backend/src/lib/actions/purchase_order.ts`)
   - The entry point triggered by workflows (e.g., "PO Issued")
   - Reads `org.erp_system_type` from the organization record
   - Uses the factory to get the appropriate connector
   - Orchestrates the sync and updates Fabriq records

2. **Connector Factory** (`backend/src/lib/integrations/connectors/index.ts`)
   - Instantiates the correct connector class based on connection's `system_type`
   - Loads OAuth credentials from `public.source_system` table
   - Handles connection ID-based connector creation

3. **Connector Interface** (`backend/src/lib/integrations/connectors/types.ts`)
   - Defines the standard contract for ERP interactions (e.g., `createPurchaseOrder`)
   - Ensures consistent API across all ERP implementations

4. **ERP Implementation** (`backend/src/lib/integrations/<erp>/connectors/`)
   - Contains the specific logic to map data and call the ERP API
   - Handles ERP-specific authentication and API quirks

### Directory Structure

We maintain a strict separation between Forward Sync (Data Pipeline) and Reverse Sync (App Logic).

```
backend/integrations/          # FORWARD SYNC (ELT/DBT)
├── zoho_books/                # Zoho-specific ELT
│   ├── dbt/                   # DBT models for normalization
│   └── sync_and_transform.py  # Extraction scripts
└── xero/                      # Xero-specific ELT

backend/src/lib/integrations/   # REVERSE SYNC (App Logic)
├── connectors/                # Shared Connector Interfaces & Factory
│   ├── index.ts               # Factory (createERPConnector)
│   └── types.ts               # Interfaces (ERPConnector)
├── zoho_books/                # Zoho Reverse Sync Implementation
│   ├── connectors/            # Zoho Connector Implementation
│   ├── mappers/               # Data Mapping Logic
│   └── zoho_api_client.ts     # Direct API Client
└── xero/                      # (Future) Xero Implementation
```

### Configuration

The ERP system type is configured per organization in the `org.erp_system_type` field. This replaces the previous `ERP_TYPE` environment variable approach.

**Setting ERP System Type:**
- Configure the `erp_system_type` field on the `org` model (e.g., `'zoho_books'`, `'xero'`, `'quickbooks'`)
- This can be set via the API or database directly
- Each organization can have its own ERP system type

**Backward Compatibility:**
- If `org.erp_system_type` is not set, the system will fall back to the `ERP_TYPE` environment variable (if set)
- This allows for a gradual migration from environment-based to org-based configuration

### Adding a New ERP (e.g., Xero)

To add support for a new ERP system for purchase orders:

1. **Create Directory**:
   Create `backend/src/lib/integrations/xero/connectors/`.

2. **Implement Interface**:
   Create `backend/src/lib/integrations/xero/connectors/purchase_order_connector.ts` implementing `ERPConnector`.

   ```typescript
   import { ERPConnector } from '../../connectors/types';

   export class XeroPurchaseOrderConnector implements ERPConnector {
     getSystemType() { return 'xero'; }
     async createPurchaseOrder(fabriqPO: any, tx: any) {
       // Implement mapping and API call
     }
   }
   ```

3. **Register in Factory**:
   Update `backend/src/lib/integrations/connectors/index.ts` to handle the new type.

   ```typescript
   case 'xero':
     return new XeroPurchaseOrderConnector(oauthConfig);
   ```

4. **Configure**:
   Set the `erp_system_type` field on the organization record to `'xero'` (via API or database).

### Zoho Books Implementation Details

- **API Client**: `backend/src/lib/integrations/zoho_books/zoho_api_client.ts` handles OAuth token refresh and raw API calls
- **Mappers**: `backend/src/lib/integrations/zoho_books/mappers/purchase_order_mapper.ts` transforms the Fabriq Prisma model into the Zoho JSON payload
- **Tax Handling**: Uses `ZOHO_DEFAULT_TAX_ID` env var if available, or falls back to `reverse_charge: false`

## Credentials Management

### Overview

ERP integration OAuth credentials are stored in a centralized, encrypted database storage system. This enables:
- **Multi-tenancy**: One connection configuration per organization per ERP system
- **Security**: Encrypted storage of sensitive OAuth credentials
- **Centralized Management**: Single source of truth for all ERP connections
- **Cross-platform Compatibility**: Accessible by both Python (forward sync) and Node.js (reverse sync) services

### Database Schema

#### `public.source_system` Table

The `source_system` table stores ERP connection configurations:

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
- `system_type`: ERP system type (e.g., `'zoho_books'`, `'xero'`, `'quickbooks'`)
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
    "tenant_id": "...",          // Xero specific
    "realm_id": "..."            // QuickBooks specific
  }
}
```

### Encryption

#### Algorithm
- **Algorithm**: AES-256-CBC
- **Key Management**: Application-level encryption key stored in environment variable
- **Format**: `iv:ciphertext` (both base64-encoded, colon-separated)

#### Encryption Key

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

### Usage

#### Python (Forward Sync)

**Location**: `backend/integrations/shared/db_config_loader.py`

**Key Functions:**
- `get_db_connection()`: Connects using DBT-style credentials
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

#### Node.js (Reverse Sync)

**Location**: `backend/src/lib/integrations/shared/erp-connection-loader.ts`

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

### Configuration Setup

1. **Set Encryption Key**: Add `ERP_CONFIG_ENCRYPTION_KEY` to environment variables
2. **Create ERP Connection via API**: ERP connections are created and managed through the frontend API
3. **Environment Variables**: Keep database credentials in `.env` files (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)

## Current Implementation Status

### Phase 1: Complete ✅

**Implemented**:
- ✅ Zoho Books integration (Airbyte Cloud)
- ✅ Xero integration (Direct API Client)
- ✅ QuickBooks Online integration (Airbyte Cloud)
- ✅ Streams: Invoices, Contacts, Payments (Zoho/Xero), Accounts/Customers/Vendors/Items (QuickBooks)
- ✅ Complete DBT pipeline (staging → integration → normalized)
- ✅ Lineage tracking
- ✅ Duplicate prevention
- ✅ Incremental processing
- ✅ Encrypted credential storage
- ✅ Reverse sync for purchase orders (Zoho Books, QuickBooks)
- ✅ Documentation

**Xero-Specific Features**:
- ✅ Direct API client for extraction (workaround for PyAirbyte connector bug)
- ✅ OAuth 2.0 authentication with automatic token refresh
- ✅ Dual-role contacts (same contact can be customer AND supplier)
- ✅ Single invoice table with Type field (ACCREC/ACCPAY)
- ✅ Incremental sync via `UpdatedDateUTC` field

**Limitations (By Design)**:
- No FK population (customer_id, location_id, etc. are null)
- No calculations (copy-only transforms)
- No line items (invoice_line_item, sales_order_item not populated)
- Handwritten transforms (no JSON-based code generation)

### Phase 2: Planned 🔄

**Planned Features**:
- Field mapping JSON configuration
- Automatic FK population
- Line item handling
- Multi-source system support
- Calculation logic (taxes, balances)
- Bidirectional sync support
- Additional ERP systems (NetSuite, SAP, etc.)

## Adding New Source Systems

### Process

1. **Airbyte Setup** (PSO Team):
   - Create Airbyte connection to new source system
   - Configure streams to extract
   - Set destination to PostgreSQL `datalake` schema
   - Configure incremental sync

2. **DBT Setup**:
   - Create new directory: `backend/integrations/<source_name>/dbt/`
   - Copy structure from `zoho_books/dbt/` as template
   - Create staging views for each stream
   - Create normalized models mapping to Fabriq schema
   - Update `sync_batch` to handle new streams

3. **Prisma Schema**:
   - Ensure target models exist in `public` schema
   - Add lineage fields if not present
   - Run migrations

4. **Reverse Sync** (if needed):
   - Create connector implementation in `backend/src/lib/integrations/<source_name>/`
   - Register in connector factory
   - Update organization `erp_system_type` field

5. **Testing**:
   - Verify data flow end-to-end
   - Check lineage tracking
   - Validate incremental processing
   - Test duplicate prevention
   - Test reverse sync (if applicable)

## Security & Compliance

### Data Security
- **Encryption in Transit**: All connections use TLS/SSL
- **Encryption at Rest**: Database-level encryption
- **Credential Encryption**: AES-256-CBC encryption for OAuth credentials
- **Access Control**: Role-based permissions via Fabriq metadata framework

### Data Residency
- Support for regional data residency requirements
- Source system metadata includes `region` field
- Can be extended for region-specific processing

### Audit Trail
- Complete lineage tracking for all records
- Sync batch metadata for all operations
- Source system tracking
- Timestamps for all operations

## Monitoring & Operations

### Key Metrics
- Sync batch row counts
- Processing times
- Error rates
- Data freshness (source_updated_at vs. current time)

### Monitoring Points
- Airbyte sync status (PSO-managed)
- DBT run status
- Data quality checks
- Lineage completeness
- Reverse sync success rates

### Operational Tools
- DBT run scripts (`run_pipeline.sh`, `run_dbt.py`)
- Database setup scripts
- Documentation for troubleshooting

## Future Architecture Enhancements

### Phase 2+
- **Automated Airbyte Management**: API-driven connection setup
- **Field Mapping Engine**: JSON-based transform generation
- **Multi-Source Analytics**: Cross-system reporting
- **Real-Time Processing**: Stream processing for critical data
- **Data Quality Framework**: Validation rules and alerts
- **Enhanced Reverse Sync**: Support for more document types and ERP systems
- **Live bank/card feed (e.g. Plaid)**: Scheduled pull of bank and credit card transactions into the same ledger (`posting`) model. Complements existing [CSV/PDF import and AI extractors](../IMPORT_FUNCTIONALITY.md) (account and credit card statements → posting); Plaid would add automated connectivity.

## Key Principles

1. **Separation of Concerns**: Each component has a clear responsibility
2. **Data Preservation**: Raw data always preserved in `datalake` schema
3. **Incremental Processing**: Only process new/changed data
4. **Lineage Tracking**: Every record tracks its origin
5. **Extensibility**: Easy to add new source systems and streams
6. **Auditability**: Complete audit trail for all operations
7. **Security First**: Encrypted credentials, secure connections
8. **Multi-tenancy**: Organization-level isolation and configuration

## Related Documentation

### ERP-Specific Documentation
- **Zoho Books**: `backend/integrations/zoho_books/ZOHO_BOOKS_STRATEGY.md`
- **Xero**: `backend/integrations/xero/XERO_STRATEGY.md`
- **QuickBooks**: `backend/integrations/quickbooks/QUICKBOOKS_STRATEGY.md`

### DBT Project Documentation
- **Zoho Books**: `backend/integrations/zoho_books/dbt/README.md`
- **Xero**: `backend/integrations/xero/dbt/README.md`
- **QuickBooks**: `backend/integrations/quickbooks/dbt/README.md`

