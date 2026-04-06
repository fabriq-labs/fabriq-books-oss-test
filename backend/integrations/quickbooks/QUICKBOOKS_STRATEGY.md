# QuickBooks Online Integration Strategy & Design Decisions

This document consolidates all key architectural decisions, strategies, and design patterns for the QuickBooks Online integration.

## Table of Contents

1. [QuickBooks Online vs Desktop](#quickbooks-online-vs-desktop)
2. [OAuth 2.0 Authentication](#oauth-20-authentication)
3. [Data Extraction Strategy](#data-extraction-strategy)
4. [Field Mapping Strategy](#field-mapping-strategy)
5. [Incremental Sync Strategy](#incremental-sync-strategy)

---

## QuickBooks Online vs Desktop

### Decision: QuickBooks Online Only

**Rationale**: QuickBooks Online (QBO) provides a modern REST API with OAuth 2.0 authentication, making it suitable for cloud-based integrations. QuickBooks Desktop requires the Web Connector, which is more complex and less suitable for automated sync.

### Key Differences

| Aspect | QuickBooks Online | QuickBooks Desktop |
|--------|-------------------|-------------------|
| API | REST API v3 | Web Connector (SOAP) |
| Authentication | OAuth 2.0 | File-based authentication |
| Data Format | JSON | XML |
| Real-time | Yes | No (batch only) |
| Company ID | `realm_id` (Company ID) | Company file path |

---

## OAuth 2.0 Authentication

### OAuth Flow

1. **App Registration**: Register app at https://developer.intuit.com/app/developer/dashboard
2. **Authorization**: User authorizes app (redirects to callback URL)
3. **Token Exchange**: Exchange authorization code for access token and refresh token
4. **Realm ID**: Extract `realm_id` (Company ID) from OAuth callback
5. **Token Refresh**: Use refresh token to get new access tokens (expires in 1 hour)

### Required Credentials

- `client_id`: OAuth Client ID from Intuit Developer Portal
- `client_secret`: OAuth Client Secret
- `refresh_token`: OAuth Refresh Token (long-lived)
- `realm_id`: Company ID (required for all API calls)
- `environment`: `sandbox` or `production` (default: production)

### API Endpoints

- **Production**: `https://quickbooks.api.intuit.com`
- **Sandbox**: `https://sandbox-quickbooks.api.intuit.com`
- **Token URL**: `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`

### Realm ID Requirement

**Critical**: All QuickBooks API calls require the `realm_id` (Company ID) in the URL path:
- `/v3/company/{realmId}/query?query=SELECT * FROM Customer`
- `/v3/company/{realmId}/companyinfo/{realmId}`

The `realm_id` is obtained during the OAuth callback and must be stored with the connection credentials.

---

## Data Extraction Strategy

### Method: Airbyte Cloud

**Decision**: Use Airbyte Cloud for data extraction (same pattern as Zoho Books).

**Rationale**:
- PSO team manages connections
- Automatic schema detection
- Incremental sync support
- Less custom code to maintain

### Table Prefix

- **Prefix**: `qb_` (e.g., `datalake.qb_customers`, `datalake.qb_vendors`)

### Data Format

Airbyte extracts QuickBooks data as JSONB in a `data` column:
- Raw JSONB structure matches QuickBooks API response
- Staging models extract fields from JSONB using `->` and `->>` operators

### Supported Entities (Phase 1)

- **Accounts**: Chart of Accounts (`qb_accounts`)
- **Customers**: Customer records (`qb_customers`)
- **Vendors**: Vendor/Supplier records (`qb_vendors`)
- **Items**: Product/Service items (`qb_items`)

---

## Field Mapping Strategy

### QuickBooks Field Naming

QuickBooks uses **PascalCase** for field names:
- `Id`, `DisplayName`, `CompanyName`, `PrimaryEmailAddr`, `MetaData`

### Staging Layer Extraction

Extract from JSONB using PostgreSQL operators:
```sql
data->>'Id' as customer_id,
data->>'DisplayName' as display_name,
data->'PrimaryEmailAddr'->>'Address' as primary_email,
data->'MetaData'->>'LastUpdatedTime' as last_updated_time
```

### Key Field Mappings

#### Customers

| QBO Field | Staging Field | Normalized Field | Notes |
|-----------|---------------|------------------|-------|
| `Id` | `customer_id` | `source_record_id` | |
| `DisplayName` | `display_name` | `customer_name` | Primary name field |
| `CompanyName` | `company_name` | - | Fallback for customer_name |
| `PrimaryEmailAddr.Address` | `primary_email` | `primary_email` | JSONB extraction |
| `PrimaryPhone.FreeFormNumber` | `primary_phone` | `primary_phone` | JSONB extraction |
| `BillAddr.Line1` | `billing_address_line1` | `customer_address` | JSONB extraction |
| `MetaData.LastUpdatedTime` | `last_updated_time` | `source_updated_at` | For incremental sync |

#### Vendors

| QBO Field | Staging Field | Normalized Field | Notes |
|-----------|---------------|------------------|-------|
| `Id` | `vendor_id` | `source_record_id` | |
| `DisplayName` | `display_name` | `supplier_name` | Primary name field |
| `CompanyName` | `company_name` | `legal_name` | Legal entity name |
| `PrimaryEmailAddr.Address` | `primary_email` | `primary_email` | JSONB extraction |
| `BillAddr.Line1` | `billing_address_line1` | `supplier_address` | JSONB extraction |

#### Items

| QBO Field | Staging Field | Normalized Field | Notes |
|-----------|---------------|------------------|-------|
| `Id` | `item_id` | `source_record_id` | |
| `Name` | `name` | `item_name` | |
| `Type` | `item_type` | `item_type` | Service, Inventory, NonInventory |
| `Sku` | `sku` | `item_code` | |
| `UnitPrice` | `unit_price` | `unit_price` | |
| `TrackQtyOnHand` | `track_qty_on_hand` | `stockable` | Converted to Yes/No |

#### Accounts

| QBO Field | Staging Field | Normalized Field | Notes |
|-----------|---------------|------------------|-------|
| `Id` | `account_id` | `source_record_id` | |
| `Name` | `account_name` | `name` | |
| `AccountType` | `account_type` | `type` | Expense, Income, Asset, etc. |
| `AccountSubType` | `account_sub_type` | `sub_type` | |
| `CurrentBalance` | `current_balance` | `balance` | |
| `ParentRef.value` | `parent_account_id` | `parent_account_id` | JSONB extraction |

---

## Incremental Sync Strategy

### Timestamp Field

QuickBooks uses `MetaData.LastUpdatedTime` for tracking changes:
- Format: ISO 8601 timestamp (e.g., `2024-01-15T10:30:00-08:00`)
- Available on all entities
- Updated when any field changes

### Incremental Filter Pattern

```sql
{% if is_incremental() and not var('force_process_all', false) %}
and (
    (select max(source_updated_at) from {{ this }}) is null
    or {{ parse_qbo_date('stg.last_updated_time') }} > (select max(source_updated_at) from {{ this }})
)
{% endif %}
```

### Force Process All

Use DBT variable to force full refresh:
```bash
dbt run --select normalized.* --vars '{"force_process_all": true}'
```

### Airbyte Incremental Sync

Airbyte Cloud handles incremental extraction:
- Uses `MetaData.LastUpdatedTime` for cursor-based incremental sync
- Only extracts records changed since last sync
- Reduces API calls and processing time

---

## Key Differences from Zoho/Xero

| Aspect | Zoho Books | Xero | QuickBooks Online |
|--------|------------|------|-------------------|
| Sync Method | Airbyte Cloud | Direct API | Airbyte Cloud |
| Table Prefix | `zb_` | `xero_` | `qb_` |
| Company ID | `organization_id` | `tenant_id` | `realm_id` |
| Token URL | Regional domains | identity.xero.com | oauth.platform.intuit.com |
| Query Style | REST endpoints | REST endpoints | SQL-like queries |
| Incremental | `modified_time` | `UpdatedDateUTC` | `MetaData.LastUpdatedTime` |
| Field Naming | snake_case | PascalCase | PascalCase |
| Data Format | Direct fields | JSONB | JSONB |

---

## Future Enhancements (Phase 2)

1. **Additional Entities**:
   - Invoices (Sales & Purchase)
   - Payments
   - Purchase Orders
   - Estimates

2. **FK Population**:
   - Map account references (income_account_id, expense_account_id)
   - Map parent account relationships
   - Map payment terms

3. **Reverse Sync**:
   - Create Purchase Orders in QuickBooks
   - Create Invoices in QuickBooks
   - Create Vendors in QuickBooks

---

## Summary

### Key Design Decisions

1. ✅ **QuickBooks Online Only**: Focus on cloud-based QBO API
2. ✅ **Airbyte Cloud**: Use managed Airbyte connections (PSO team)
3. ✅ **JSONB Extraction**: Extract fields from Airbyte's JSONB structure
4. ✅ **Incremental Sync**: Use `MetaData.LastUpdatedTime` for efficient updates
5. ✅ **Realm ID Required**: Store and use `realm_id` for all API calls

### Current Implementation Status

- ✅ OAuth 2.0 authentication configured
- ✅ System type configuration added
- ✅ Test connection implementation
- ✅ DBT project structure created
- ✅ Staging models (4 entities)
- ✅ Normalized models (4 entities)
- ✅ Sync batch tracking
- 🔄 Airbyte connection setup (PSO team)
- 🔄 Additional entities (Phase 2)
- 🔄 Reverse sync (Phase 2)


