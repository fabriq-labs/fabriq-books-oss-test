# Investments Module — Fabriq Financial Suite

**When to read**: Understanding how investment portfolios, broker syncs, holdings, and option-chain analysis work  
**Related docs**: [BOOKKEEPING_DOMAIN.md](./BOOKKEEPING_DOMAIN.md), [REPORTS.md](../REPORTS.md), [../QUESTRADE_PRODUCTION_DEPLOYMENT.md](../QUESTRADE_PRODUCTION_DEPLOYMENT.md), [../agent/MCP.md](../agent/MCP.md)

---

## Overview

The Investments module tracks brokerage portfolios as first-class financial data. It supports:

- **Manual entry** — trades and holdings entered directly via the CRUD UI
- **Broker sync** — automated forward sync from Questrade (and future brokers) via a pluggable connector interface
- **Portfolio reporting** — real-time portfolio summary with FX conversion, equity/options/cash breakdown
- **Option chain analysis (MCP)** — live Questrade option chains + quotes for covered-call screening via AI clients (Cursor, etc.)

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

### 5. `option_chain_cache` — Option Chain Skeleton Cache

Caches Questrade option chain **structure** (expiries, strikes, call/put symbol IDs) to avoid repeated `GET /v1/symbols/:id/options` calls during the same calendar day. **Live option quotes are never cached.**

| Field | Type | Notes |
|---|---|---|
| `id` | `varchar(50)` | `optcache_` prefix |
| `org_id` | `varchar(50)` | Tenant |
| `connection_id` | FK → `source_system` | Which Questrade connection |
| `underlying_symbol` | `varchar(50)` | e.g. `VFV.TO` |
| `underlying_symbol_id` | `integer` | Questrade `symbolId` |
| `chain_json` | `jsonb` | Normalized skeleton (expiries → strikes → symbol IDs) |
| `expiry_count` | `integer` | Denormalized stats |
| `strike_count` | `integer` | Denormalized stats |
| `refreshed_at` | `timestamptz` | Last fetch from Questrade |

**Unique constraint**: `(connection_id, underlying_symbol_id)`

**Refresh policy**: lazy, same calendar day in **`America/Toronto`**. On cache miss or stale date, Fabriq calls Questrade once and upserts. Any symbol can be cached on first MCP request — not limited to portfolio holdings.

**DDL** (run manually if not using `prisma db push`):

```sql
CREATE TABLE option_chain_cache (
  id                   VARCHAR(50) PRIMARY KEY DEFAULT ('optcache_' || gen_random_uuid()::text),
  org_id               VARCHAR(50) NOT NULL,
  connection_id        VARCHAR(50) NOT NULL,
  underlying_symbol    VARCHAR(50) NOT NULL,
  underlying_symbol_id INTEGER NOT NULL,
  chain_json           JSONB NOT NULL,
  expiry_count         INTEGER NOT NULL DEFAULT 0,
  strike_count         INTEGER NOT NULL DEFAULT 0,
  refreshed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT option_chain_cache_connection_id_fkey
    FOREIGN KEY (connection_id) REFERENCES source_system (id) ON DELETE CASCADE,
  CONSTRAINT option_chain_cache_connection_id_underlying_symbol_id_key
    UNIQUE (connection_id, underlying_symbol_id)
);
CREATE INDEX option_chain_cache_org_id_idx ON option_chain_cache (org_id);
```

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

## Options Income Report (`/investments/options-income`)

**Backend**: `getOptionsIncome()` in `backend/src/lib/reports/investments.ts`  
**UI**: `frontend-1/src/pages/investments/OptionsIncomeReport.tsx` (desktop), `mobile/MobileOptionsIncome.tsx`

### What it shows

| Section | Source | Meaning |
|---|---|---|
| **Open** | Trade legs in the selected date range + active holdings | Period premium cash flows; unrealized marks on open legs |
| **Closed** | Completed trade round-trips | Realized P/L when opening and closing legs net position to zero |

Closed rows are built from **trade history only** (`splitRoundTrips()` over synced `BUY`/`SELL` activities). The UI displays `closed.transactions` (round-trip rows), not a separate positions list.

Open rows are suppressed when the holding is flat (`quantity ≈ 0`), even if trade history still shows an open leg.

Open transaction rows include **`holding_id`** (and `instrument_id`) so the UI and LLM traces can key off the holding. The instrument remains reachable via `holding.instrument_id`.

Open short-call rows also include **covered-call detection** (same brokerage account only):

| Field | Meaning |
|---|---|
| `is_covered_call` | `true` when long underlying qty ≥ `abs(position_qty) * 100` |
| `strategy` | `covered_call` / `naked_short_call` / `long_call` / `short_put` / `long_put` / `option` |
| `underlying_qty`, `shares_needed`, `underlying_average_cost`, `underlying_market_value`, `underlying_trades` | Coverage snapshot + FIFO remaining stock lots for LLM / UI |

This is an in-memory lookup against holdings already loaded for the report (no extra broker calls).

### Position detail LLM chat (Theta)

Clicking an **open** row opens `OptionPositionDetailModal`, which streams analysis through `/api/agent/chat/stream` with:

| Context field | Value |
|---|---|
| `modelName` | `holding` |
| `viewName` | `holding_view` |
| `recordId` | row `holding_id` |
| `promptTypes` | `['options_analysis']` |

Live Greeks are fetched once via `POST /api/investments/option-quote` **before** the first LLM turn (skeleton shown meanwhile). `modelContext` always includes option holding / instrument ids, open trade leg, strategy, and — when present — the same-account underlying stock leg (qty, average cost, market value, **FIFO remaining lots**) so assignment / called-away P&L can be computed without asking the user. The first user message names a **covered call** explicitly when `is_covered_call` is true (it must not say "short call", which made Theta analyse the row as naked). Tool: **`getOptionChain`** for rolls.

Resulting `llm_trace` rows use `model_name='holding'` and `record_id=<holding_id>`. Prompt file: `prisma/metadata/prompt-templates/view_d63012d4_*_options_analysis_fabriq.*` (applied by **Sync metadata**). Tool config: `prisma/seed-agent-model-tools.sql` (`amtc_holding` → `getOptionChain`).

### Report API

```
POST /api/report/options_income
Body: {
  "filters": {
    "from_date": "2026-01-01",
    "to_date": "2026-12-31",
    "report_currency": "USD",
    "legal_entity_id": "<optional>",
    "connection_id": "<optional>",
    "account_id": "<optional>"
  }
}
```

### Currency conversion (closed P/L stability)

Trade cash flows are converted to `report_currency` using **`instrument.price_currency_id` first**, falling back to a per-account currency guess from holdings only when that field is null.

Mixed-currency Questrade accounts (CAD cash + USD options) previously picked the account currency from an **unordered** holdings query, so closed P/L could drift between syncs even when trades were unchanged. Fixed in commit `509961e` (Aug 2026).

Ensure option instruments have `price_currency_id` set (e.g. backfill `USD` for US-listed options). Sync sets it via `updateInstrumentMarketData()` when a position is present; instruments that only appear in trade history may still have a null `price_currency_id` until backfilled.

### Known gap: closed position missing until activity syncs

**Symptom**: A buy-to-close (or expiry) removes the position from **Open** on the portfolio / options income report, but the round-trip does **not** appear under **Closed** until a later sync (or never, if the activity is filtered).

**Cause**: Questrade **positions** and **activities** are separate APIs. Sync order per account:

1. `getPositions()` → holding `quantity = 0`, `realized_pnl` updated
2. `getActivities()` → `trade` rows (may lag hours behind positions)

The report requires a **complete** open + close pair in `trade` to emit a closed row. If only the opening leg is synced, the bucket still has non-zero `position_qty` from trades while the holding is flat — so the position is excluded from both open and closed.

**Workaround**: Re-run **Sync & Refresh** after Questrade publishes the closing activity (usually within 24–48 hours). No data loss — the holding already records `realized_pnl`.

**Not implemented (by design, low priority)**: Synthesizing a closed round-trip from `holding.realized_pnl` when trade history is incomplete. Acceptable minor inconsistency; revisit if activity lag becomes frequent or activities are dropped by the mapper.

**Debug checklist**:

```sql
-- Trades for a symbol (expect BUY + SELL for a closed short)
SELECT t.type, t.quantity, t.net_amount, t.value_date::date, i.symbol
FROM trade t
JOIN instrument i ON i.id = t.instrument_id
WHERE i.symbol = '<OPTION_SYMBOL>'
ORDER BY t.value_date;

-- Holding should show qty 0 and realized_pnl after close
SELECT h.quantity, h.realized_pnl, h.last_updated, i.symbol
FROM holding h
JOIN instrument i ON i.id = h.instrument_id
WHERE i.symbol = '<OPTION_SYMBOL>';
```

---

## Option Chain Cache and MCP

Fabriq exposes investment data to AI clients via the MCP server at `POST /api/mcp` (see [MCP.md](../agent/MCP.md)).

### MCP tools (investments)

| Tool | Data source | Purpose |
|------|-------------|---------|
| `get_portfolio_summary` | DB holdings (optional live sync) | Equity, options, cash, totals |
| `get_options_income` | Trade ledger (+ holdings marks) | Open/closed options premium & period income |
| `get_option_chain` | Questrade live + same-day skeleton cache | Trimmed chain + live quotes/Greeks |

### Covered-call screening flow

1. **`get_portfolio_summary`** with `latest=true` — fresh holdings from Questrade sync
2. From `data.equity` — identify round lots (typically ≥ 100 shares per contract)
3. From `data.options` — detect existing option positions; check `instrument.underlying.symbol` for conflicts
4. **`get_option_chain`** per eligible underlying — default Call band ATM → +20% OTM, 4 expiries, 15 strikes/expiry
5. Rank by premium yield, delta, DTE, open interest (agent heuristics; not enforced in code)

MCP prompt **`covered_call_candidates`** orchestrates steps 1–4 with configurable risk level.

### Option chain defaults and limits

Applied server-side before returning data to the MCP client:

| Setting | Default | Max |
|---------|---------|-----|
| Strike band (calls) | Last price → +20% OTM | ±50% from last price |
| Expiries returned | 4 | 8 |
| Strikes per expiry | 15 | 25 |
| Quoted contracts | — | 100 |

Pagination: `expiry_offset`, `strike_offset` (Fabriq-side; Questrade has no chain pagination).

### Live smoke test

```bash
cd backend && npx ts-node --transpile-only scripts/test-option-chain-live.ts VFV.TO
```

Uses the org's active Questrade connection from `backend/.env`. Requires `option_chain_cache` table and valid OAuth token.

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
│   ├── types.ts                   # BrokerConnector interface + DTOs (incl. option chain)
│   └── questrade/
│       ├── questrade_auth.ts      # OAuth2 token rotation + AES-256 persistence
│       ├── questrade_connector.ts # HTTP calls to Questrade API
│       ├── questrade_mappers.ts   # Raw API responses → DTOs
│       └── questrade_option_mappers.ts  # optionChain → BrokerOptionChainDTO
├── option_chain/
│   ├── option_chain_cache_service.ts  # Same-day DB cache read/write/invalidate
│   └── option_chain_trim.ts           # Strike/expiry caps + truncation metadata
├── shared/
│   └── broker-connection-loader.ts  # persistBrokerOAuth()
└── sync/
    ├── broker_sync_service.ts     # runBrokerSync(), getPortfolio()
    └── upserts.ts                 # Idempotent upserts by natural key

backend/src/mcp/tools/
    getPortfolioSummary.ts         # MCP: get_portfolio_summary
    getOptionsIncome.ts            # MCP: get_options_income
    getOptionChain.ts              # MCP: get_option_chain orchestration
    brokerConnection.ts            # Shared connection resolver
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
  // Questrade market-data extensions (used by MCP get_option_chain):
  searchSymbol?(symbol: string): Promise<BrokerSymbolDTO | null>;
  getQuotes?(symbolIds: number[]): Promise<BrokerQuoteDTO[]>;
  getOptionChain?(underlyingSymbolId: number, underlyingSymbol?: string): Promise<BrokerOptionChainDTO>;
  getOptionQuotes?(request: BrokerOptionQuoteRequest): Promise<BrokerOptionQuoteDTO[]>;
}
```

Option chain methods are implemented on `QuestradeConnector` only. Other brokers would add their own implementations when supported.

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
- **Subsequent syncs**: from `last_sync_at` minus a **7-day overlap** forward (activities can lag positions on the same trading day; overlap is safe because trade upserts are idempotent)
- **Positions vs activities**: Closing a position often updates `holding` (qty → 0) before the matching `BUY`/`SELL` activity appears in `trade`. See [Options Income Report — known gap](#known-gap-closed-position-missing-until-activity-syncs).

### Deterministic trade ID

Questrade activities have no stable unique ID. Fabriq derives a deterministic ID:

```
trade_id = "qt_" + sha256(accountId | tradeDate | symbol | action | qty | netAmount)
```

Identical same-day fills at the same price could theoretically collide — acceptable risk.

### Positions vs. Balances vs. Option Chain

| API endpoint | What it returns | Used for |
|---|---|---|
| `GET v1/accounts/{id}/positions` | Open equity/ETF/option positions | Holdings (STOCK, ETF, OPTION, etc.) |
| `GET v1/symbols/:id` | Option contract metadata + underlying symbol/id | Link option → underlying instrument |
| `GET v1/symbols/:id/options` | Full option chain skeleton | MCP `get_option_chain` (cached same-day in `option_chain_cache`) |
| `POST v1/markets/quotes/options` | Level-1 quotes + Greeks for option IDs | MCP `get_option_chain` live quotes (batched `optionIds`) |
| `GET v1/markets/quotes?ids=…` | Level-1 quotes for symbol ids | Underlying spot price; equity quote refresh |
| `GET v1/accounts/{id}/balances` | Cash per currency + market totals | CASH-type holdings |
| `GET v1/accounts/{id}/activities` | Trade history | `trade` rows |
| `GET v1/accounts` | Account list | `account` rows |

**Option chain JSON**: Questrade returns `{ "optionChain": [ ... ] }` with `optionRoot` and `chainPerStrikePrice` per expiry. Official docs sometimes show `options`; Fabriq accepts both keys.

**Symbols without options**: Some holdings (e.g. `XEQT.TO`) have no listed option chain — MCP returns `NO_OPTIONS`. Others (e.g. `VFV.TO`, `RY.TO`, `AAPL`) do.

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

### MCP routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/mcp` | MCP JSON-RPC — tools include `get_portfolio_summary`, `get_options_income`, `get_option_chain` |
| `GET` | `/api/mcp` | Returns `405` (stateless; POST only) |

Auth: `X-API-Key` header (user API key). See [MCP.md](../agent/MCP.md).

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
| **MCP trade execution** | Option chain tools are read-only analysis; no order placement |
| **Option chain on all symbols** | Not every holding has Questrade-listed options — agent should handle `NO_OPTIONS` gracefully |
| **Options income — closed lag** | Closed round-trips need both legs in `trade`. Holdings can show flat + `realized_pnl` before the closing activity syncs; position disappears from Open but may not appear in Closed until the next activity import. See [Options Income Report](#options-income-report) |
| **Options income — currency backfill** | Closed P/L conversion uses `instrument.price_currency_id`; null values fall back to a non-deterministic per-account guess. Backfill USD (or correct currency) on option instruments when needed |
