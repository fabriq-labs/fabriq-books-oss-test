# Plaid Integration — Code Review

**Commit reviewed**: `9038673` ("Plaid Experimental WIP #1")
**Review date**: 2026-06-24
**Last updated**: 2026-06-25 (post-implementation pass)
**Scope**: Data models, migration SQL, backend service/mapper/routes, frontend account matching

---

## Overview

Single commit adding ~3,500 lines across:
- `backend/prisma/schema/plaid.prisma` — `plaid_item` + `plaid_transaction` tables
- `backend/prisma/schema/data.prisma` — extensions to `account` and `posting`
- `backend/prisma/migration/` — `add_plaid_tables.sql`, `add_plaid_transaction.sql`
- `backend/src/plaid/` — 5-file backend module (client, types, mapper, service, routes)
- `frontend-1/src/components/plaid/` — ConnectBankDialog, ConnectedAccounts, PlaidAccountMappingStep, PlaidAccountSelectPanel, PlaidLinkButton, plaidAccountMatch, plaidUi
- `frontend-1/src/pages/banking/BankConnections.tsx`

---

## Data Models

### `plaid_item`

One row per Plaid "item" (bank connection).

```
plaid_item
  id               VARCHAR(50)  PK  'plaid_' || gen_random_uuid()
  org_id           VARCHAR(50)  NOT NULL   ← multi-tenant scope
  user_id          VARCHAR(50)  NOT NULL   ← who connected (no FK to user table; intentional per JWT auth pattern)
  legal_entity_id  VARCHAR(50)  FK → entity (ON DELETE SET NULL)
  institution_id   VARCHAR(255)
  institution_name VARCHAR(255)
  access_token     TEXT         ← AES-encrypted via ERP_CONFIG_ENCRYPTION_KEY
  item_id          VARCHAR(255) UNIQUE     ← Plaid's own item identifier
  cursor           TEXT                   ← incremental sync cursor (transactionsSync API)
  last_synced_at   TIMESTAMP(3)
  created_at / modified_at / created_by / modified_by / assigned_to
```

### `plaid_transaction` ✅ added

One row per Plaid transaction. Acts as both a raw store and the dedup key, replacing the old `posting.notes = 'plaid_tx:<id>'` pattern.

```
plaid_transaction
  id                      VARCHAR(50)   PK  'plaidtx_' || gen_random_uuid()
  org_id                  VARCHAR(50)   NOT NULL
  plaid_item_id           VARCHAR(50)   FK → plaid_item (ON DELETE CASCADE)
  transaction_id          VARCHAR(255)  UNIQUE        ← Plaid's stable ID — dedup key
  plaid_account_id        VARCHAR(255)                ← Plaid sub-account ID
  posting_id              VARCHAR(50)   FK → posting (ON DELETE SET NULL, nullable)
  pending                 BOOLEAN       NOT NULL DEFAULT false
  pending_transaction_id  VARCHAR(255)                ← links pending → posted version
  raw                     JSONB         NOT NULL      ← full Plaid Transaction object
  synced_at               TIMESTAMP(3)
  created_at / modified_at
```

### `account` table extensions

```
account (additions)
  plaid_item_id  VARCHAR(50)  FK → plaid_item (ON DELETE SET NULL)
  inst_id        TEXT                  ← Plaid sub-account ID (dual-use: also used by broker feeds)
  last_sync_at   TIMESTAMP(3)          ← per-account last transaction sync timestamp
```

**Note on `inst_id`**: shared column between Plaid and broker feeds. Querying Plaid-only accounts requires `plaid_item_id IS NOT NULL`. The dual-use has no type enforcement but is acknowledged in code comments.

### Migration SQL

| File | Purpose |
|------|---------|
| `add_plaid_tables.sql` | Creates `plaid_item`, extends `account`, migrates legacy JSON `accounts` column. Idempotent. |
| `add_plaid_transaction.sql` | Creates `plaid_transaction` with FK constraints and indexes. Idempotent. |

Both files are standalone migration scripts for upgrading **existing** databases in place. A fresh setup gets these tables via `prisma db push` automatically.

---

## Backend Module Structure

```
backend/src/plaid/
  plaid.client.ts   — PlaidApi singleton, env/config guards, product constants
  plaid.types.ts    — StoredPlaidAccount, PlaidItemSummary, PlaidSyncResult, etc.
  plaid.mapper.ts   — mapPlaidTransactionToPosting, mapPlaidAccountToCoa, formatPlaidAccountName
  plaid.service.ts  — PlaidService (singleton), all business logic
  plaid.routes.ts   — Express router, auth middleware, delegates to PlaidService
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plaid/config` | Returns env + skip_link_ui flag |
| GET | `/api/plaid/institutions/search?q=` | Institution search |
| POST | `/api/plaid/sandbox/connect` | Sandbox-only direct connect (no Link UI) |
| POST | `/api/plaid/link-token` | Create Plaid Link token |
| POST | `/api/plaid/exchange-token` | Exchange public token → store item |
| GET | `/api/plaid/items` | List all items for org |
| GET | `/api/plaid/items/:id` | Get item summary + accounts |
| DELETE | `/api/plaid/items/:id` | Disconnect bank |
| POST | `/api/plaid/sync/:itemId` | Sync all mapped accounts for item |
| POST | `/api/plaid/items/:itemId/accounts/:plaidAccountId/sync` | Per-account sync |
| POST | `/api/plaid/items/:itemId/import-accounts` | Create new CoA accounts from Plaid |
| PUT | `/api/plaid/items/:itemId/accounts/:plaidAccountId/link` | Link Plaid account to existing CoA account |
| POST | `/api/plaid/webhook` | Returns 404 — push sync not used; reserved for future |

### Transaction Mapping (`plaid.mapper.ts`)

Plaid sign convention: positive `amount` = money out (debit), negative = money in (credit).

```typescript
isDebit = tx.amount > 0
amount  = Math.abs(tx.amount)

account_id:        isDebit ? null          : bankAccountId   // debit side of double-entry
credit_account_id: isDebit ? bankAccountId : null            // credit side of double-entry
```

Postings are one-sided — only the bank account leg is populated. The counterpart account is left null for categorisation/reconciliation.

### Sync Flow (current)

```
transactionsSync (cursor-based, item-level)
  for each added tx:
    upsert plaid_transaction on transaction_id
    if no posting_id → create posting → write back posting_id FK
    else → skip (already synced)

  for each modified tx:
    upsert plaid_transaction (refreshes raw)
    if posting_id exists → update posting (amount, description, status, category, dates)
    else → create posting → write back posting_id FK

  for each removed tx:
    find plaid_transaction by transaction_id
    if posting_id → set posting.status = 'VOIDED', clear posting_id FK
```

### Account Import Flow

1. User selects Plaid sub-accounts to import.
2. `importAccounts` fetches live accounts from Plaid, filters to selection.
3. For each new account: `mapPlaidAccountToCoa` determines `classification` (Assets/Liabilities) and `type[]` from Plaid type/subtype.
4. `generatePlaidAccountCode` assigns next numeric code in the 11xx (Assets) or 21xx (Liabilities) series.
5. Currency: reads `acct.balances.iso_currency_code`, looks up in `currency` table, falls back to entity base currency.
6. `account` row created with `plaid_item_id` + `inst_id` + `base_currency_id` wired up.

### Account Linking Flow

Alternatively, a Plaid sub-account can be linked to an existing CoA account (no new account created):

1. `linkPlaidAccount` validates item ownership and that the Plaid account isn't already linked.
2. Sets `plaid_item_id` + `inst_id` on the existing account row.
3. Inherits `legal_entity_id` from the item if the account doesn't already have one.

---

## What's Working Well

- **Encrypted tokens at rest** using existing `encryptConfig`/`decryptConfig` ERP pattern.
- **Upsert on re-link**: `exchangePublicToken` updates an existing `plaid_item` row rather than creating a duplicate.
- **Graceful disconnect**: `deleteItem` calls Plaid `itemRemove` but degrades gracefully, then cleans up locally and NULLs FKs on accounts.
- **Legal entity resolution**: sensible fallback chain — preferred → HQ entity → oldest entity.
- **Incremental sync**: cursor stored on `plaid_item`, advanced after each full sync.
- **Clean module boundaries**: client/mapper/types/service/routes each have a single responsibility.
- **Frontend account matching**: `suggestFabriqAccount` auto-suggests existing CoA accounts by fuzzy name + mask.
- **`plaid_transaction` table**: raw store + typed FK dedup replaces string-based `notes` matching.
- **Removed + modified transactions handled**: voiding and field-update logic now in sync loop.
- **Plaid category pre-populated**: `category_name`, `ai_cat_score`, `ai_categorized_at` set from `personal_finance_category` on every sync.

---

## Issues

### ✅ RESOLVED — Webhook

**Decision**: On-demand sync only. Webhook returns 404. `getWebhookUrl()` removed; `webhook:` parameter stripped from `createLinkToken` and `sandboxConnect`. Route is reserved (not deleted) for future push-sync implementation.

---

### ✅ RESOLVED — Removed transactions not acted on

Removed transactions now look up the linked `plaid_transaction` row, set `posting.status = 'VOIDED'`, and clear `posting_id` on the `plaid_transaction` row.

---

### ✅ RESOLVED — Modified transactions not updated

Modified transactions now upsert the `plaid_transaction` raw data and, if a linked posting exists, update `amount`, `description`, `status`, `posting_date`, `value_date`, `category_name`, and `ai_cat_score`.

---

### ✅ RESOLVED — N+1 deduplication queries

Replaced by `prisma.plaid_transaction.upsert` on `transaction_id` (UNIQUE). The DB enforces dedup atomically. No pre-loading, no per-transaction query against `posting`.

---

### ✅ RESOLVED — Currency on postings

Determined that `posting`-level currency is not needed — currency flows via `posting.account_id → account.base_currency_id`. The underlying bug (entity currency stamped on all accounts regardless of actual account currency) is fixed: `importAccounts` now reads `acct.balances.iso_currency_code`, looks it up in the `currency` table, and falls back to entity base currency.

---

### ✅ RESOLVED — Enhanced posting field mapping

`mapPlaidTransactionToPosting` now sets:

| `posting` field | Plaid source |
|----------------|-------------|
| `category_name` | `personal_finance_category.detailed ?? primary` |
| `ai_cat_score` | `confidence_level` → `VERY_HIGH=0.95, HIGH=0.80, MEDIUM=0.60, LOW=0.30` |
| `ai_categorized_at` | sync timestamp (when category is present) |
| `posting_date` | `tx.date` (posted date) — previously incorrectly same as `value_date` |
| `value_date` | `authorized_date ?? tx.date` |

---

### OPEN — LOW: Account code generation race condition

`generatePlaidAccountCode` scans for the max existing code in the series then increments. The check and insert are not in a transaction. Two concurrent imports could generate the same code.

**Fix**: Wrap `generatePlaidAccountCode` + `account.create` in a `prisma.$transaction`, or use a DB sequence.

---

### OPEN — LOW: Per-account sync uses deprecated `transactionsGet`

- Item-level sync (`syncItemById`): uses `transactionsSync` — the modern cursor-based API ✅
- Per-account sync (`syncItemAccount` → `syncSingleAccountTransactions`): uses `transactionsGet` — date-range endpoint that Plaid is deprecating.

**Fix**: Refactor `syncSingleAccountTransactions` to use `transactionsSync` filtered to the single `account_id`, advancing a per-account cursor rather than the item cursor.

---

### OPEN — LOW: Account type mapping duplicated frontend/backend

`mapPlaidAccountToCoa` (`plaid.mapper.ts`) and `mapPlaidAccountToCoaDisplay` (`plaidAccountMatch.ts`) contain identical logic. A change to one requires updating the other.

**Fix**: Cross-reference them with a comment, or share the mapping via a shared package.

---

## Issue Summary

| # | Description | Severity | Status |
|---|-------------|----------|--------|
| 1 | Webhook — no signature verification | High (security) | ✅ Resolved — returns 404, push sync deferred |
| 2 | Removed transactions not voided | High (data integrity) | ✅ Resolved |
| 3 | Modified transactions not updated | Medium (data integrity) | ✅ Resolved |
| 4 | N+1 dedup queries in sync loop | Medium (performance) | ✅ Resolved — upsert on UNIQUE constraint |
| 5 | Currency not set on bank-feed postings | Medium (feature gap) | ✅ Resolved — currency on account, not posting |
| 9 | Account `base_currency_id` sourced from entity, not Plaid | Medium (multi-currency) | ✅ Resolved |
| 6 | Account code generation race condition | Low | 🔲 Open |
| 7 | Per-account sync uses deprecated `transactionsGet` | Low | 🔲 Open |
| 8 | Account type mapping duplicated frontend/backend | Low | 🔲 Open |

---

## Transaction Field Mapping

### Plaid `Transaction` object — full field inventory

#### Top-level fields

| Plaid field | Type | Notes |
|-------------|------|-------|
| `transaction_id` | string | Stable unique ID |
| `account_id` | string | Which sub-account |
| `amount` | number | **Positive = money out (debit), negative = money in (credit)** |
| `iso_currency_code` | string \| null | ISO-4217 (e.g. `"USD"`) |
| `unofficial_currency_code` | string \| null | Crypto / non-standard |
| `date` | string (date) | Posted date (`YYYY-MM-DD`) |
| `datetime` | string \| null | Posted datetime (ISO 8601, when available) |
| `authorized_date` | string \| null | Authorization date (`YYYY-MM-DD`) |
| `authorized_datetime` | string \| null | Authorization datetime (ISO 8601, when available) |
| `name` | string | Raw bank description (**deprecated** — prefer `merchant_name`) |
| `merchant_name` | string \| null | Cleaned merchant name |
| `merchant_entity_id` | string \| null | Plaid-internal merchant ID (stable across transactions) |
| `pending` | boolean | `true` = pending / unsettled |
| `pending_transaction_id` | string \| null | Links posted tx back to its pending counterpart |
| `payment_channel` | string | `"online"`, `"in store"`, `"other"` |
| `check_number` | string \| null | Check number (check transactions only) |
| `account_owner` | string \| null | For multi-owner accounts |
| `logo_url` | string \| null | Merchant logo (100×100 PNG) |
| `website` | string \| null | Merchant website |
| `transaction_code` | string \| null | European / select US classification |

#### Nested: `personal_finance_category`

| Field | Type |
|-------|------|
| `primary` | string (e.g. `"FOOD_AND_DRINK"`) |
| `detailed` | string (e.g. `"FOOD_AND_DRINK_FAST_FOOD"`) |
| `confidence_level` | string \| null (`VERY_HIGH` / `HIGH` / `MEDIUM` / `LOW` / `UNKNOWN`) |
| `personal_finance_category_icon_url` | string |

#### Nested: `payment_meta`

| Field | Type |
|-------|------|
| `reference_number` | string \| null |
| `ppd_id` | string \| null (ACH PPD ID) |
| `payee` / `payer` | string \| null |
| `payment_method` / `payment_processor` | string \| null |
| `reason` / `by_order_of` | string \| null |

#### Nested: `counterparties[]`

| Field | Type |
|-------|------|
| `name` | string |
| `type` | `merchant`, `financial_institution`, `payment_app`, `marketplace`, `payment_terminal`, `income_source` |
| `counterparty_id` / `website` / `logo_url` / `confidence_level` | string \| null |

#### `removed[]` array

| Field | Type |
|-------|------|
| `transaction_id` | string |
| `account_id` | string |

---

### Current mapping: Plaid `Transaction` → Fabriq `posting`

| `posting` field | Plaid source | Status |
|----------------|-------------|--------|
| `org_id` | item context | ✅ mapped |
| `value_date` | `authorized_date ?? tx.date` | ✅ mapped |
| `posting_date` | `tx.date` | ✅ fixed (was same as `value_date`) |
| `description` | `merchant_name ?? name` | ✅ mapped |
| `amount` | `Math.abs(amount)` | ✅ mapped |
| `account_id` / `credit_account_id` | sign-driven direction | ✅ mapped |
| `status` | `pending ? "PENDING" : "ACTIVE"` | ✅ mapped |
| `posting_type` | `"bank_feed"` | ✅ mapped |
| `reconciliation_status` | `"UNMATCHED"` | ✅ mapped |
| `legal_entity_id` | item / account | ✅ mapped |
| `category_name` | `personal_finance_category.detailed ?? primary` | ✅ mapped |
| `ai_cat_score` | `confidence_level` → numeric | ✅ mapped |
| `ai_categorized_at` | sync timestamp | ✅ mapped |
| `notes` | ~~`"plaid_tx:" + transaction_id`~~ | ✅ removed — dedup now via `plaid_transaction.posting_id` FK |
| `currency_id` | — | N/A — currency on `account.base_currency_id` |
| `income_type` / `income_source` | — | Skip — enum values are investment-domain, not bank-feed |

### Fields stored in `plaid_transaction.raw` JSONB

All remaining Plaid fields are queryable from `raw` on demand — no extra columns needed:

| Field | How to query |
|-------|-------------|
| `payment_meta.reference_number` | `raw->'payment_meta'->>'reference_number'` |
| `merchant_entity_id` | `raw->>'merchant_entity_id'` |
| `logo_url` / `website` | `raw->>'logo_url'` |
| `location.*` | `raw->'location'` |
| `counterparties[]` | `raw->'counterparties'` |
| `check_number` | `raw->>'check_number'` |
| `payment_channel` | `raw->>'payment_channel'` |
| `authorized_datetime` / `datetime` | `raw->>'authorized_datetime'` |
| `pending_transaction_id` | dedicated column on `plaid_transaction` |

---

*This document is updated as the review discussion continues.*
