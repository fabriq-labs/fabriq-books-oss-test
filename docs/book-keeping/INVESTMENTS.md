# Investments Module — Fabriq Financial Suite

**When to read**: Understanding how investment portfolios, broker syncs, and holdings work  
**Related docs**: [BOOKKEEPING_DOMAIN.md](./BOOKKEEPING_DOMAIN.md), [REPORTS.md](../REPORTS.md), [../QUESTRADE_PRODUCTION_DEPLOYMENT.md](../QUESTRADE_PRODUCTION_DEPLOYMENT.md)

---

## Overview

The Investments module tracks brokerage portfolios as first-class financial data. It supports:

- **Manual entry** — trades and holdings entered directly via the CRUD UI
- **Broker sync** — automated forward sync from Questrade (and future brokers) via a pluggable connector interface
- **Portfolio reporting** — real-time portfolio summary with FX conversion, equity/options/cash breakdown

Data flows **one way only**: broker → Fabriq. There is no write-back to the broker.

---

## Data Models

### 1. `instrument` — Global Master Data

Represents a tradable security. Instruments are **global** (no `org_id`) — two organisations holding the same stock share one instrument row. Isolation is at the `holding` level.

**Schema** (`data.prisma`):

| Field | Type | Notes |
|---|---|---|
| `id` | `varchar(50)` | `inst_` prefix |
| `symbol` | `text` | Exchange ticker, e.g. `AMZN`, `ENB.TO`, `CAD` |
| `name` | `text` | Human-readable name |
| `type` | `instrument_type` enum | `STOCK`, `ETF`, `OPTION`, `CASH`, etc. |
| `isin` | `text UNIQUE` | International Securities Identification Number (nullable) |
| `details` | `jsonb` | Free-form metadata |
| `current_price` | `numeric` | Last known quote in native trading currency (updated on broker sync for active holdings) |
| `price_updated_at` | `timestamptz` | When `current_price` was last set |
| `price_currency_id` | FK → `currency` | Trading currency of `current_price` |
| `external_symbol_id` | `integer` | Broker symbol id (Questrade `symbolId`) for quote refresh |
| `underlying_instrument_id` | FK → `instrument` | For `OPTION` rows — links to underlying stock instrument |

**Upsert strategy** (broker sync): match by `isin` first (precise), then fall back to `symbol` (approximate). If neither matches, create a new row.

Option contracts link to their underlying stock via `underlying_instrument_id`. Underlying instruments are created during sync from Questrade `GET /symbols/:id` (with regex fallback).

**Key rule**: Do not add `org_id` to instrument — it is intentionally global. Access control is via the holding.

---

### 2. `account` — Brokerage Account Container

The `account` model is shared with the bookkeeping chart of accounts but broker-synced accounts are identified by `source_system_id ≠ 'srcsys_fabriq'`.

Key fields for broker accounts:

| Field | Notes |
|---|---|
| `name` | Set by sync as `"{type} {number}"` e.g. `"TFSA 53859600"` |
| `inst_id` | The broker's external account number (`53859600`) |
| `source_system_id` | FK to `source_system` — which broker connection owns this account |
| `source_record_id` | Same as `inst_id` (used as the upsert key with `source_system_id + org_id`) |
| `legal_entity_id` | FK to `entity` — populated from the connection's `legal_entity_id` on each sync |
| `base_currency_id` | Set from the org's base currency at sync time |
| `org_id` | Tenant isolation |

**Upsert key**: `(source_record_id, source_system_id, org_id)` — unique constraint `account_source_record_uniq`. Multiple internal accounts (no `source_record_id`) are allowed because Postgres treats `NULL` values as distinct in unique indexes.

---

### 3. `holding` — Current Position Snapshot

One row per `(instrument, account)`. Always reflects the **latest** position; history is in `trade`.

| Field | Type | Notes |
|---|---|---|
| `account_id` | FK | Which brokerage account holds this position |
| `instrument_id` | FK | What is held |
| `quantity` | `Decimal(19,4)` | Shares / units held. Negative = short position |
| `average_cost` | `Decimal(19,4)` | Cost basis per unit in the holding's native currency |
| `current_price` | `Decimal(19,4)?` | Latest market price (updated on each sync) |
| `market_value` | `Decimal(19,4)?` | `quantity × current_price` |
| `unrealized_pnl` | `Decimal(19,4)?` | `market_value − (quantity × average_cost)` |
| `realized_pnl` | `Decimal(19,4)?` | Cumulative closed gains/losses |
| `currency_id` | FK to `currency` | Native trading currency of this holding |
| `is_active` | `boolean` | `false` when a position disappears from broker positions response |
| `source_system_id` | FK to `source_system` | Which broker sync created/owns this holding |
| `last_updated` | `timestamp` | When this holding was last touched by a sync |

**Unique constraint**: `(instrument_id, account_id)` — one holding per security per account.

**Stale deactivation**: on every sync, holdings present in the previous sync but absent in the new positions response are set `is_active = false` rather than deleted.

---

### 4. `trade` — Transaction History

One row per trade event (buy, sell, dividend, etc.).

| Field | Type | Notes |
|---|---|---|
| `instrument_id` | FK? | Nullable — some events (transfers, cash deposits) have no instrument |
| `account_id` | FK | Account the trade belongs to |
| `type` | `trade_type` enum | `BUY`, `SELL`, `DIVIDEND`, `INTEREST`, `SPLIT`, `TRANSFER` |
| `trade_id` | `text UNIQUE` | Deterministic external ID (see Questrade section) |
| `quantity` | `Decimal` | Units traded |
| `price` | `Decimal` | Price per unit |
| `brokerage` | `Decimal?` | Commission charged |
| `net_amount` | `Decimal?` | Net cash impact |
| `value_date` | `timestamp` | Settlement / trade date |
| `source_system_id` | FK to `source_system` | Which broker sync inserted this row |
| `posting_id` | FK UNIQUE | One-to-one link to an accounting `posting` (future: auto-reconciliation) |

---

## Holding Types

The `instrument_type` enum defines what a holding represents:

| Type | Description | Example symbols |
|---|---|---|
| `STOCK` | Publicly traded equity | `AMZN`, `ENB.TO`, `AAPL` |
| `ETF` | Exchange-traded fund | `VFV.TO`, `XEQT.TO` |
| `BOND` | Fixed income security | Government/corporate bonds |
| `MUTUAL_FUND` | Open-ended fund | Mutual fund units |
| `FOREX` | Foreign currency pairs | Currency trades |
| `CASH` | Cash balance in an account | `CAD`, `USD` — see below |

### CASH Holdings

Cash positions are a special case: each currency balance in a brokerage account is stored as a `CASH`-type holding.

- **Instrument**: global, one per currency code (`symbol = "CAD"`, `name = "CAD Cash"`, `type = CASH`)
- **Quantity / market_value**: the cash amount (e.g. `$27,693.76`)
- **average_cost / current_price**: always `1` (1 unit of a currency = 1 unit)
- **unrealized_pnl**: always `0`
- **Negative balance**: possible (e.g. FHSA account with debit balance), shown in red in the UI
- **Source**: populated from `GET v1/accounts/{id}/balances` during broker sync — a separate API call from positions

**Portfolio page behaviour**: Cash holdings are separated into a dedicated Cash section below Options. They are **excluded** from the equity Market Value total but **included** in the Total Equity figure:

```
Total Equity  =  Market Value (equity positions)  +  Cash
```

---

## Currency Handling

### Holding currency

Each holding has a `currency_id` pointing to the currency it trades in. For Questrade:
- Symbols ending in `.TO` or `.V` → `CAD` (inferred from exchange suffix at sync time)
- All other symbols → `USD`
- CASH holdings → the currency code from the balance response

### Portfolio FX conversion

The Portfolio report (`portfolio_summary`) converts all holding values to a single **report currency** (user-selected: CAD or USD) using the `exchange_rate` table.

- Lookup: `exchange_rate WHERE org_id = ? AND from_currency_id = ? AND to_currency_id = ?` — latest SPOT rate
- Fallback: if no rate exists, uses `1:1` (silently incorrect — ensure a rate exists for each org)
- Inverse rate: if only `USD→CAD` is stored, `CAD→USD` is computed as `1 / rate`

**What is converted** (in the report):
- `market_value`, `average_cost`, `current_price`, `unrealized_pnl` — all converted to report currency
- The **table rows display values in native currency** (computed by dividing back by the rate)
- The **total card** shows report currency

### Exchange rate requirements

Before going live, insert at minimum one `USD → CAD` SPOT rate per org:

```sql
INSERT INTO exchange_rate (id, org_id, from_currency_id, to_currency_id, rate, rate_type, effective_date, modified_at)
SELECT concat('exr_usd_cad_', replace(gen_random_uuid()::text, '-', '')),
       '<ORG_ID>',
       (SELECT id FROM currency WHERE code = 'USD'),
       (SELECT id FROM currency WHERE code = 'CAD'),
       1.36, 'SPOT', CURRENT_DATE, NOW();
```

---

## Portfolio UI (`/investments/portfolio`)

**File**: `frontend-1/src/pages/investments/InvestmentsPortfolio.tsx`

### Layout

```
┌─ Portfolio ──────────────────────────── [↻ Sync Now] ─┐
│  Last synced: Jun 18, 2026 3:18 PM                     │
│                                                          │
│  [All Accounts]  [TFSA ...]  [RRSP ...]  [Margin ...]  │ ← account cards
│                                                          │
│  Total Equity              [CAD] [USD]                  │ ← inline currency toggle
│  CA$246,347                                              │
│    Market value   CA$230,453                            │ ← breakdown
│    Cash            CA$15,893                            │
│                                                          │
│  Holdings                                               │
│  Symbol (currency · account)  Qty  Avg Cost  Price  MV  P&L │
│                                                          │
│  Options                                               │
│  (same columns as Holdings)                            │
│                                                          │
│  Cash                                                  │
│  ┌─ USD ──────────────────┐  ┌─ CAD ─────────────────┐ │
│  │ RRSP  $27,693          │  │ RRSP  CA$75            │ │
│  │ TFSA  $ 1,378          │  │ TFSA  CA$19            │ │
│  │ Total $29,572          │  │ FHSA  -CA$115          │ │
│  └────────────────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Account cards

- One card per brokerage account plus "All Accounts"
- Value shown: **Total Equity** (market value + cash) for that account
- Selecting a card filters all three sections (Holdings, Options, Cash) and updates the total card

### Holdings table

- Columns: Symbol, Qty, Avg Cost, Current Price, Market Value, Unrealized P&L
- All monetary values in **native currency** of the holding
- Currency code + account name shown in muted text below the symbol
- Green/red colouring for P&L

### Cash section

- Dedicated layout — not the same table as Holdings
- Groups by native currency (one card per currency)
- Shows account name + cash amount per row
- Subtotal per currency when multiple accounts hold the same currency
- Negative balances shown in red

### Report API

The portfolio page calls:
```
POST /api/report/portfolio_summary
Body: { "filters": { "report_currency": "CAD", "legal_entity_id": "<optional>", "connection_id": "<optional>" } }
```

When `legal_entity_id` is omitted (global entity selector set to **All Entities**), holdings for all brokerage accounts in the org are returned. When set, only accounts whose `account.legal_entity_id` matches are included.

Response shape:
```typescript
{
  report_currency: string;
  equity: PortfolioHoldingRow[];   // non-option, non-cash holdings
  options: PortfolioHoldingRow[];  // detected by option symbol regex
  cash: PortfolioHoldingRow[];     // instrument.type === 'CASH'
  accounts: AccountSummaryRow[];   // per-account totals
  total_market_value: number;      // equity long positions only
  total_cash: number;              // cash positions
  total_equity: number;            // = total_market_value + total_cash
  last_sync_at: string | null;
}
```

---

## Broker Integrations

### Architecture

```
BrokerConnector (interface)
    ↓
createBrokerConnector(connectionId)   ← factory, reads source_system from DB
    ↓
QuestradeConnector (implements BrokerConnector)
    ↓
broker_sync_service.runBrokerSync(connectionId, orgId)
    ↓
upserts.ts (upsertAccount, upsertInstrument, upsertHolding, upsertTrade, syncCashBalances)
```

**Files**:
```
backend/src/lib/integrations/broker/
├── connectors/
│   ├── index.ts                   # Factory: createBrokerConnector(connectionId)
│   ├── types.ts                   # BrokerConnector interface + DTOs
│   └── questrade/
│       ├── questrade_auth.ts      # OAuth2 token rotation + AES-256 persistence
│       ├── questrade_connector.ts # HTTP calls to Questrade API
│       └── questrade_mappers.ts   # Raw API responses → DTOs
├── shared/
│   └── broker-connection-loader.ts  # persistBrokerOAuth()
└── sync/
    ├── broker_sync_service.ts     # runBrokerSync(), getPortfolio()
    └── upserts.ts                 # Idempotent upserts by natural key
```

### `BrokerConnector` interface

```typescript
interface BrokerConnector {
  getSystemType(): string;
  ensureAuth(): Promise<void>;
  getAccounts(): Promise<BrokerAccountDTO[]>;
  getBalances(accountExternalId: string): Promise<BrokerBalanceDTO[]>;
  getPositions(accountExternalId: string): Promise<BrokerPositionDTO[]>;
  getActivities(accountExternalId: string, startTime: Date, endTime: Date): Promise<BrokerTradeDTO[]>;
}
```

### Sync sequence (per account)

```
runBrokerSync(connectionId, orgId)
  │
  ├─ findFirst source_system → connection (org_id, legal_entity_id, last_sync_at)
  ├─ getAccounts() → upsertAccount() × N
  │
  └─ for each account:
       ├─ getPositions()  → upsertInstrument() + upsertHolding()
       │                    update instrument.current_price from position
       ├─ getBalances()   → syncCashBalances()  (adds CASH-type holdings)
       ├─ deactivateStaleHoldings()  (sets is_active=false for sold positions)
       └─ getActivities() → upsertTrade()
  ├─ enrichOptionUnderlyings()  (GET /symbols/:id; always backfills underlying external_symbol_id)
  └─ refreshUnderlyingQuotes()  (batched GET /markets/quotes for underlyings not directly held)
```

### Adding a second broker

Implement `BrokerConnector` and register it in `connectors/index.ts`:
```typescript
case 'wealthsimple':
  return new WealthsimpleConnector(connectionId, config.oauth);
```
All upsert logic is shared — only the API client changes.

---

## Questrade Specifics

### Authentication

Questrade uses a **rotating refresh token** model. The "Personal Access Token" (PAT) a user generates is a one-time-use refresh token:

1. User generates PAT at questrade.com → App Hub
2. PAT is submitted via the Connections UI
3. On first use (Test Connection or first sync), PAT is exchanged for `access_token + new_refresh_token`
4. The original PAT is **immediately invalidated**
5. New `refresh_token` is stored encrypted (AES-256-CBC) in `source_system.connection_config`

**Token rotation**: every sync call exchanges the current refresh token for a new one. If a sync is missed for too long (exact expiry varies — verify against Questrade docs), the token expires and the user must paste a new PAT.

**Re-auth flow**: sync returns `status: 'reauth_required'` → user goes to Settings → Connections → Edit → pastes new PAT → Test Connection → Save.

### Token storage

`source_system.connection_config` stores:
```json
{
  "oauth": {
    "refresh_token": "<AES-256-CBC encrypted>",
    "api_server": "https://api06.iq.questrade.com/",
    "token_endpoint": "https://login.questrade.com/oauth2/token"
  }
}
```

The `api_server` is returned by Questrade per-token and can change between sessions. It must be stored and used alongside the token.

### Activity API constraints

- `GET v1/accounts/{id}/activities` has a **30-day maximum window** per request
- The sync chunks date ranges into ≤30-day windows automatically (`chunkWindows()` in `questrade_connector.ts`)
- **First sync**: 90-day backfill (3 windows × N accounts)
- **Subsequent syncs**: from `last_sync_at` forward

### Deterministic trade ID

Questrade activities have no stable unique ID. Fabriq derives a deterministic ID:

```
trade_id = "qt_" + sha256(accountId | tradeDate | symbol | action | qty | netAmount)
```

Identical same-day fills at the same price could theoretically collide — acceptable risk.

### Positions vs. Balances

| API endpoint | What it returns | Used for |
|---|---|---|
| `GET v1/accounts/{id}/positions` | Open equity/ETF/option positions | Holdings (STOCK, ETF, OPTION, etc.) |
| `GET v1/symbols/:id` | Option contract metadata + underlying symbol/id | Link option → underlying instrument |
| `GET v1/markets/quotes?ids=…` | Level-1 quotes for symbol ids | Underlying spot price when not directly held |
| `GET v1/accounts/{id}/balances` | Cash per currency + market totals | CASH-type holdings |
| `GET v1/accounts/{id}/activities` | Trade history | `trade` rows |
| `GET v1/accounts` | Account list | `account` rows |

### Currency inference

Questrade positions do not include a currency field. Currency is inferred from the exchange suffix:
- `.TO` or `.V` suffix → `CAD` (TSX / TSX Venture Exchange)
- No suffix → `USD` (US exchanges)

This covers the vast majority of retail accounts. Edge cases (e.g. `DLR.TO` which trades in both CAD and USD) may show incorrectly.

### Connection constraints

- **One Questrade connection per org** — enforced by `UNIQUE (org_id, system_type)` on `source_system`
- All four accounts (TFSA, RRSP, Margin, FHSA) sync from the single connection
- The connection can be assigned to a **Legal Entity** so all synced accounts inherit it

---

## `source_system` — Broker Connection Record

| Field | Notes |
|---|---|
| `id` | `srcsys_` prefix, generated |
| `org_id` | Tenant |
| `system_type` | `'questrade'` (or future: `'wealthsimple'`, `'ibkr'`) |
| `name` | User-assigned label e.g. `"My Questrade"` |
| `connection_config` | `jsonb` — AES-256-CBC encrypted OAuth credentials |
| `legal_entity_id` | FK to `entity` — propagated to all accounts on sync |
| `is_active` | Soft-disable a connection |
| `last_sync_at` | Timestamp of last successful sync |
| `last_sync_status` | `jsonb` — full `SyncReport` from last run |

---

## REST Endpoints

### Broker sync routes (`/api/broker-sync/`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/connections` | Register a new broker connection (validate PAT, save encrypted) |
| `DELETE` | `/connections/:id` | Deactivate a connection |
| `POST` | `/run` | Trigger a manual sync for the org's active connection |
| `GET` | `/status` | Last sync status for all broker connections |

### Report routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/report/portfolio_summary` | Holdings + cash + totals with FX conversion |
| `POST` | `/api/report/investment_trades` | Trade history with date range filter |

### Connection test

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/source_system/test-connection` | Validates credentials; for Questrade, exchanges PAT and calls `v1/accounts` |

---

## Known Limitations and Future Work

| Item | Notes |
|---|---|
| **Posting linkage** | `trade.posting_id` exists but broker trades are not yet auto-posted to the accounting ledger |
| **Historical prices** | `current_price` / `market_value` only reflects the most recent sync — no price history stored |
| **Exchange rate staleness** | The `exchange_rate` table is manually maintained. Portfolio totals drift as rates move |
| **Second broker** | Architecture supports it; no second connector implemented yet |
| **Option type detection** | Uses symbol regex (`\d{1,2}[A-Z][a-z]{2}\d{2}[CP]...`), not an API-provided type field |
| **CAD/.V suffix inference** | Currency inferred from symbol — edge cases like dual-listed stocks may be wrong |
| **Re-auth UX** | Portfolio page does not surface a visible warning when `last_sync_status.status === 'reauth_required'` |
