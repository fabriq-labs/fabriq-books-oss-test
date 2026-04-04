# Zoho Books Purchase Order Requirements Analysis

## Overview

This document analyzes the requirements for creating purchase orders in Zoho Books and whether they can be fulfilled with the current Fabriq purchase order structure.

## Zoho Books Required Fields

Based on the actual Zoho API payload, here are the key requirements:

### Line Items (Required)

1. **`item_id`** (Conditionally Required)
   - **Status**: ✅ **Supported**
   - **Current Implementation**: We check for `item.product?.source_record_id` and use it as `item_id`
   - **Requirement**: Products must be synced from Zoho Books first to have `source_record_id`
   - **Fallback**: If `item_id` is not provided, Zoho will create a new item (may not be desired)

2. **`account_id`** (REQUIRED)
   - **Status**: ❌ **NOT SUPPORTED - BLOCKER**
   - **What it is**: Expense account ID in Zoho Books (e.g., "2280971000000083049")
   - **Current State**: Fabriq doesn't have expense account mapping
   - **Options**:
     a. **Sync accounts from Zoho** (recommended for Phase 2)
     b. **Use a default account ID** (quick fix, requires configuration)
     c. **Map by account name** (requires account sync)
   - **Impact**: **CRITICAL** - Purchase orders will fail without this

3. **`name`** (Required)
   - **Status**: ✅ **Supported**
   - **Current Implementation**: Uses `item.item_name || item.product?.item_name`

4. **`rate`** (Required)
   - **Status**: ✅ **Supported**
   - **Current Implementation**: Uses `item.rate || 0`

5. **`quantity`** (Required)
   - **Status**: ✅ **Supported**
   - **Current Implementation**: Uses `item.quantity || 0`

6. **`unit`** (Optional but Recommended)
   - **Status**: ✅ **Supported**
   - **Current Implementation**: Uses `item.uom || item.product?.uom?.name`

7. **`tax_id`** (Optional)
   - **Status**: ⚠️ **PARTIALLY SUPPORTED**
   - **Current State**: Not mapped (marked as Phase 2)
   - **Requirement**: Tax ID from Zoho Books
   - **Options**:
     a. Sync tax rates from Zoho
     b. Use default tax ID
     c. Map by tax name/rate

### Purchase Order Level Fields

1. **`vendor_id`** (Required)
   - **Status**: ✅ **Supported**
   - **Current Implementation**: Uses `supplier_details.source_record_id`
   - **Requirement**: Supplier must be synced from Zoho first

2. **`date`** (Required)
   - **Status**: ✅ **Supported**
   - **Current Implementation**: Uses `po.po_date` formatted as YYYY-MM-DD

3. **`billing_address_id`** (Optional)
   - **Status**: ❌ **NOT SUPPORTED**
   - **Current State**: We send `delivery_address` as a string
   - **Requirement**: Zoho expects an address ID, not a string
   - **Options**:
     a. Sync addresses from Zoho
     b. Create address in Zoho first, then use ID
     c. Use organization default address ID

4. **`shipping_address_id`** (Optional)
   - **Status**: ❌ **NOT SUPPORTED**
   - **Same as billing_address_id**

5. **`payment_terms`** (Optional)
   - **Status**: ⚠️ **PARTIALLY SUPPORTED**
   - **Current State**: We have `payment_terms_id` in Fabriq but need to map to Zoho format
   - **Requirement**: Zoho expects payment terms as a number (days) or label
   - **Options**: Map Fabriq payment terms to Zoho format

6. **`template_id`** (Optional)
   - **Status**: ❌ **NOT SUPPORTED**
   - **Requirement**: PO template ID from Zoho
   - **Impact**: Low - optional field

## Feasibility Assessment

### ✅ **What Works Now**

1. Basic PO creation with:
   - Vendor ID (if supplier synced from Zoho)
   - Item name, rate, quantity, unit
   - Item ID (if product synced from Zoho)
   - Date, reference number, notes

### ❌ **Critical Blockers**

1. **`account_id` (REQUIRED)**
   - **Impact**: Purchase orders will fail without this
   - **Solution Options**:
     - **Quick Fix**: Add environment variable `ZOHO_DEFAULT_EXPENSE_ACCOUNT_ID` and use it for all line items
     - **Proper Fix**: Sync accounts from Zoho Books and map them

### ⚠️ **Recommended Enhancements**

1. **`tax_id`** - For proper tax calculation
2. **`billing_address_id` / `shipping_address_id`** - For proper address handling
3. **`payment_terms`** - For proper payment terms mapping

## Recommended Implementation Strategy

### Phase 1 (Current - Minimal Viable)

**Goal**: Get basic PO creation working

**Required Changes**:
1. Add `account_id` to line items (use default or configuration)
2. Ensure products have `source_record_id` (synced from Zoho)
3. Ensure suppliers have `source_record_id` (synced from Zoho)

**Limitations**:
- Uses default expense account for all items
- No tax mapping
- Addresses sent as strings (may not work properly)
- Payment terms not mapped

### Phase 2 (Enhanced)

**Goal**: Full feature parity

**Required Changes**:
1. Sync accounts from Zoho Books
2. Map expense accounts to line items (by category or default)
3. Sync tax rates from Zoho
4. Map tax IDs to line items
5. Sync/create addresses in Zoho
6. Map payment terms properly

## Conclusion

**Is it possible with current Fabriq PO structure?**

**Yes, with limitations:**

1. ✅ **Basic PO creation is possible** if:
   - Suppliers are synced from Zoho (have `source_record_id`)
   - Products are synced from Zoho (have `source_record_id`)
   - A default expense account ID is configured

2. ❌ **Full feature parity requires**:
   - Account sync from Zoho
   - Tax rate sync from Zoho
   - Address management in Zoho
   - Payment terms mapping

**Recommendation**: 
- **Phase 1**: Add default `account_id` configuration to unblock PO creation
- **Phase 2**: Implement full account, tax, and address sync for complete functionality

