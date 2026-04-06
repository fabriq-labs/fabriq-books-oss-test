# Zoho Books Purchase Order Sync Implementation

## Overview

This document describes the implementation of bidirectional sync between Fabriq and Zoho Books for purchase orders. When a purchase order is approved in Fabriq (reaches "PO Issued" state), it is automatically created in Zoho Books.

## Architecture

```
Fabriq Purchase Order Workflow
  ↓ (Approve action → PO Issued state)
Workflow Side-Effect: sync_po_to_erp
  ↓
ZohoBooksAPIClient
  ↓ (OAuth 2.0 authentication)
Zoho Books API
  ↓ (Create purchase order)
Update Fabriq PO with Zoho IDs
```

## Components

### 1. ZohoBooksAPIClient (`zoho_api_client.ts`)

**Location**: `src/lib/integrations/zoho_api_client.ts`

**Responsibilities**:
- OAuth 2.0 token management (automatic refresh)
- API request handling with proper authentication headers
- Organization ID management
- Purchase order creation in Zoho

**Key Features**:
- Automatic token refresh (tokens expire in 1 hour)
- Support for multiple Zoho data centers
- Error handling with helpful messages

### 2. Sync Function (`zoho_sync.ts`)

**Location**: `src/lib/actions/zoho_sync.ts`

**Function**: `sync_po_to_erp`

**Responsibilities**:
- Fetch purchase order with all related data
- Map Fabriq PO fields to Zoho Books format
- Call Zoho API to create purchase order
- Update Fabriq PO with Zoho IDs and sync status

**Field Mapping**:

| Fabriq Field | Zoho Books Field | Notes |
|--------------|------------------|-------|
| `po_date` | `date` | Date format: YYYY-MM-DD |
| `supplier_details.source_record_id` | `vendor_id` | Must exist (supplier synced from Zoho) |
| `purchase_order_item[]` | `line_items[]` | Array of line items |
| `item_name` / `product.item_name` | `name` | Line item name |
| `item_description` | `description` | Line item description |
| `rate` | `rate` | Line item rate |
| `quantity` | `quantity` | Line item quantity |
| `uom` | `unit` | Unit of measure |
| `po_number` | `reference_number` | PO reference |
| `need_by_date` | `expected_date` | Expected delivery date |
| `delivery_address` | `delivery_address` | Delivery address |
| `shipping_cost` | `shipping_charge` | Shipping charges |
| `comment` | `notes` | Notes/comments |
| `supplier_details.payment_terms` | `terms` | Payment terms |

### 3. Database Schema Updates

**Prisma Model**: `purchase_order`

**New Fields**:
- `source_system_id`: FK to `datalake.source_system` (external system, e.g., Zoho Books)
- `source_record_id`: External system purchase order ID (used for DBT merge and reference)
- `source_updated_at`: Last updated timestamp in external system
- `ingest_batch_id`: FK to `datalake.sync_batch` (for future DBT sync)
- `sync_status`: Sync status ('pending' | 'synced' | 'failed') - status of sync to external system

**Indexes**:
- `[source_system_id, source_record_id]` - For DBT merge matching
- `[source_updated_at]` - For incremental sync

### 4. Workflow Integration

**Workflow**: Purchase Order Approval

**Action**: "Approve" (from "PO Pending Approval" → "PO Issued")

**Side Effect**: `sync_po_to_erp`

**Implementation**: Added to `prisma/setup-workflows.ts`

## Credentials Required

### Environment Variables

All credentials are stored in environment variables:

```bash
# Required
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token

# Optional
ZOHO_ORGANIZATION_ID=your_org_id  # Auto-fetched if not provided
ZOHO_API_DOMAIN=www.zohoapis.com  # Default: US data center
```

**Note**: The same OAuth credentials used for Airbyte can be reused here.

### Getting Credentials

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Create or select your application
3. Get `Client ID` and `Client Secret`
4. Generate `Refresh Token` (one-time setup)
5. Ensure your app has scope: `ZohoBooks.fullaccess.all` or `ZohoBooks.purchaseorders.CREATE`

## How It Works

### Flow

1. **User approves PO in Fabriq**
   - Workflow transitions to "PO Issued" state
   - Side-effect `sync_po_to_erp` is triggered

2. **Sync function executes**
   - Fetches PO with supplier, items, and related data
   - Validates supplier has `source_record_id` (Zoho vendor ID)
   - Maps Fabriq PO to Zoho format

3. **Zoho API call**
   - Refreshes access token if needed
   - Creates purchase order in Zoho Books
   - Returns Zoho PO ID and number

4. **Update Fabriq PO**
   - Sets `source_record_id` = External system purchase order ID (for DBT merge and reference)
   - Sets `source_system_id` = External source system ID
   - Sets `source_updated_at` = Current timestamp
   - Sets `sync_status` = 'synced'

5. **Future Airbyte sync**
   - When Airbyte syncs purchase orders from Zoho
   - DBT merge strategy matches on `source_record_id`
   - Updates existing Fabriq PO (no duplicate created)

### Error Handling

- **Missing supplier Zoho ID**: Error message guides user to sync supplier first
- **API authentication failure**: Automatic token refresh and retry
- **API errors**: Detailed error messages logged, PO marked as 'failed'
- **Network errors**: Retry logic (can be enhanced in Phase 2)

## Setup Instructions

### 1. Add Environment Variables

**For Local Development:**

Add the Zoho credentials to your **repo root `.env` file** (not in the integrations directory):

```bash
# In monorepo `backend/.env`
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token
ZOHO_ORGANIZATION_ID=your_org_id  # Optional
ZOHO_API_DOMAIN=www.zohoapis.com  # Optional
```

**For Production (Railway):**

Set these as environment variables in your Railway project settings. Railway environment variables take precedence over `.env` files.

**Note**: The same OAuth credentials used for Airbyte can be reused here.

### 2. Run Prisma Migration

Add the new fields to `purchase_order` table:

```bash
cd backend
npx prisma migrate dev --name add_zoho_sync_fields_to_purchase_order
```

### 3. Update Workflow (if needed)

If the workflow already exists, you may need to update it:

```bash
# Option 1: Re-run setup script (has guard to skip existing)
npm run setup:workflows

# Option 2: Manually update workflow action via API or database
```

### 4. Test

1. Create a purchase order in Fabriq
2. Ensure supplier has `source_record_id` (synced from Zoho)
3. Approve the purchase order
4. Check logs for sync status
5. Verify PO created in Zoho Books
6. Check `purchase_order` table for `source_record_id` and `sync_status`

## Troubleshooting

### "Supplier does not have a Zoho vendor_id"

**Solution**: Ensure the supplier was synced from Zoho first. The supplier must have `source_record_id` set.

### "Zoho authentication failed"

**Solution**: 
- Check `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN`
- Verify refresh token is still valid
- Check token hasn't been revoked in Zoho console

### "Zoho organization not found"

**Solution**:
- Set `ZOHO_ORGANIZATION_ID` explicitly
- Or ensure your Zoho account has at least one organization
- Check API domain matches your data center

### "Failed to sync purchase order to Zoho"

**Check logs for**:
- API error messages from Zoho
- Network connectivity issues
- Invalid field mappings (e.g., missing required fields)

## Future Enhancements (Phase 2)

1. **Asynchronous Processing**: Queue sync jobs instead of blocking workflow
2. **Retry Logic**: Automatic retry with exponential backoff
3. **Update Support**: Update existing Zoho POs when Fabriq PO changes
4. **Conflict Resolution**: Handle cases where PO is edited in both systems
5. **Field Mapping Configuration**: JSON-based field mapping (no code changes)
6. **Tax Mapping**: Map Fabriq tax rates to Zoho tax IDs
7. **Currency Support**: Multi-currency purchase orders
8. **Item Creation**: Auto-create items in Zoho if they don't exist

## Related Documentation

- [Zoho Books API Documentation](https://www.zoho.com/books/api/v3/)
- [Zoho OAuth 2.0 Guide](https://www.zoho.com/books/api/v3/oauth/)
- [Integration Architecture](../ARCHITECTURE.md)
- [Zoho Books Strategy](./ZOHO_BOOKS_STRATEGY.md)

