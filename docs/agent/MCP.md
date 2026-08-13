# Fabriq MCP Server

**Status**: Active (investment tools complete for read-only portfolio + option chain analysis)
**Last Updated**: 2026-06-28
**Primary files**: `backend/src/mcp/`

---

## What This Is

Fabriq exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server so that AI clients (Cursor, Claude Desktop, custom agents) can call Fabriq tools directly — searching accounts, trial balance, investment portfolio, and Questrade option chains — without going through the chat UI or the agent session system.

MCP sits alongside the existing agent system, not inside it. It is a separate HTTP endpoint that speaks the MCP JSON-RPC wire format.

---

## Architecture

### Transport

**`StreamableHTTPServerTransport`** (MCP SDK 1.29.0), stateless mode.

- Every request is a self-contained `POST /api/mcp` with a JSON-RPC body.
- No session IDs are issued. No in-memory state between requests.
- The server does **not** maintain a persistent SSE stream for server-initiated messages (`GET /api/mcp` returns `405`).
- MCP clients that probe `GET` (e.g. Cursor) receive a 405 and fall back to POST-only mode.

This is appropriate for the current tool set (read queries, short operations). Stateful streaming can be added later if long-running tools need progress events.

### Per-Request Server Creation

```
POST /api/mcp
  → McpRouter: extract X-API-Key header
  → resolveApiKey() → AuthContext  (same bcrypt + PermissionService logic as authMiddleware)
  → if invalid → 401 JSON  (before any MCP framing)
  → createMcpServer(authContext) → fresh McpServer with tools registered
  → new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  → server.connect(transport)
  → transport.handleRequest(req, res, req.body)
  → res.on('finish') → transport.close() + server.close()
```

A **new `McpServer` is created per request** so that the `AuthContext` (including `org_id`) is safely captured in each tool handler's closure. There is no shared mutable server state across requests.

### Auth

API key only (`X-API-Key` header). JWT/session tokens are not supported on the MCP endpoint. If the header is missing or the key does not match any user, the handler returns `401 JSON` before any MCP framing starts — the client sees a clean HTTP error, not a JSON-RPC error.

---

## File Map

```
backend/src/mcp/
  McpRouter.ts              Express Router — auth extraction, transport lifecycle
  createMcpServer.ts        Factory: given AuthContext, registers all tools on a McpServer
  tools/
    listAccounts.ts         list_accounts tool — DB query, pure function
    getTrialBalance.ts      get_trial_balance tool — canonical trial balance report
    getPortfolioSummary.ts  get_portfolio_summary tool — investment holdings report
    getOptionsIncome.ts     get_options_income tool — open/closed options premium report
    getOptionChain.ts       get_option_chain orchestration (cache, trim, quotes)
    getOptionChainTool.ts   MCP schema + handler wiring for get_option_chain
    brokerConnection.ts     Shared Questrade connection resolver

backend/src/lib/integrations/broker/
  option_chain/
    option_chain_cache_service.ts   Same-day skeleton cache (option_chain_cache table)
    option_chain_trim.ts            Strike/expiry caps + truncation metadata
  connectors/questrade/
    questrade_option_mappers.ts     Maps Questrade optionChain JSON → DTOs
```

**Mount point**: `src/index.ts` → `app.use('/api/mcp', mcpRouter)`

**Database**: `option_chain_cache` — lazy same-day cache of chain skeletons (see [INVESTMENTS.md](../book-keeping/INVESTMENTS.md#option-chain-cache-and-mcp)).

---

## Current Tools

### `list_accounts`

Search accounts in the chart of accounts.

| Parameter | Type | Behaviour |
|-----------|------|-----------|
| `name` | `string` (optional) | Case-insensitive **contains** search on `account.name` |
| `code` | `string` (optional) | Case-insensitive **equals** search on `account.code` |

Both params are optional and combinable. At least one should be provided for useful results; with neither, it returns the first 10 accounts ordered by code then name.

**Returns** (as JSON string in `content[0].text`):
```json
{
  "accounts": [
    {
      "id": "acco_org_techflow_us_1102",
      "code": "1102",
      "name": "Checking Account",
      "type": ["BANK", "CHECKING"],
      "sub_type": null,
      "classification": "Assets",
      "currency": "USD",
      "legal_entity_id": "org_techflow_us",
      "legal_entity_name": "TechFlow Solutions Inc.",
      "is_active": true
    }
  ],
  "total": 1
}
```

**Limits**: Maximum 10 results per call. Results are ordered by `code ASC, name ASC`.

**Scope**: Results are filtered to the authenticated user's `org_id` — cross-org leakage is not possible.

### `get_trial_balance`

Generate a canonical trial balance report for a date range. This tool wraps the same `run_report(auth, 'trial_balance', filters)` path used by the in-app financial report tool; it does not reimplement report SQL.

| Parameter | Type | Behaviour |
|-----------|------|-----------|
| `start_date` | `string` (optional) | Period start in `YYYY-MM-DD`. If omitted, current financial year start is used. |
| `end_date` | `string` (optional) | Period end in `YYYY-MM-DD`. If omitted, current financial year end/today is used. |
| `account_id` | `string` (optional) | Scope to one account. Use `list_accounts` first when the user gives a name like "ICICI". |
| `currency_id` | `string` (optional) | Reporting currency id or ISO code override. If omitted, org base currency is used. |
| `legal_entity_id` | `string` (optional) | Scope org-wide reports to one legal entity. When `account_id` is supplied, the account's legal entity is used for FY defaults and the account id scopes the report. |

**Date defaults**:
- If both dates are provided, the tool uses them as-is.
- If either date is omitted, the tool resolves the current financial year from the account's legal entity, explicit `legal_entity_id`, or the org headquarters entity.

**Account-name flow**:
1. User asks "trial balance for ICICI".
2. Client calls `list_accounts({ "name": "ICICI" })`.
3. Client passes the returned `account_id` to `get_trial_balance`.

**Returns** (as JSON string in `content[0].text`):
```json
{
  "tool": "get_trial_balance",
  "success": true,
  "periodSource": "explicit",
  "filters": {
    "from_date": "2026-04-01",
    "to_date": "2026-04-30",
    "account_id": "acco_ent_f687b778_cfdf_4a7f_9883_c3a1217bb3e2_1101",
    "currency_id": "INR"
  },
  "account": {
    "id": "acco_ent_f687b778_cfdf_4a7f_9883_c3a1217bb3e2_1101",
    "code": "1101",
    "name": "ICICI Savings Account - IN",
    "legal_entity_id": "ent_f687b778_cfdf_4a7f_9883_c3a1217bb3e2"
  },
  "rowCount": 1,
  "data": [
    {
      "account_id": "acco_ent_f687b778_cfdf_4a7f_9883_c3a1217bb3e2_1101",
      "account_name": "ICICI Savings Account - IN",
      "total_debits": 1000,
      "total_credits": 500,
      "opening_balance": 2500,
      "total_balance": 3000
    }
  ]
}
```

### `get_portfolio_summary`

Return the investment portfolio — same `run_report(auth, 'portfolio_summary', filters)` path as the in-app Portfolio page. Optionally syncs from Questrade first when `latest=true`.

| Parameter | Type | Behaviour |
|-----------|------|-----------|
| `latest` | `boolean` (optional) | When `true`, runs broker sync before returning portfolio data. Defaults to **`false`** (cached holdings from last sync). |
| `report_currency` | `string` (optional) | ISO code or currency id for FX conversion. Defaults to **CAD**. |
| `connection_id` | `string` (optional) | Scope to one broker `source_system` when the org has multiple connections. Also selects which connection to sync when `latest=true`. |

**Returns** (as JSON string in `content[0].text`):
```json
{
  "tool": "get_portfolio_summary",
  "success": true,
  "synced": false,
  "sync": null,
  "filters": { "latest": false, "report_currency": "CAD", "connection_id": null },
  "equityCount": 12,
  "optionsCount": 2,
  "cashCount": 3,
  "summary": {
    "report_currency": "CAD",
    "total_market_value": 125000,
    "total_cash": 8500,
    "total_equity": 133500,
    "last_sync_at": "2026-06-25T18:30:00.000Z",
    "accounts": []
  },
  "data": {
    "report_currency": "CAD",
    "equity": [
      {
        "symbol": "VFV.TO",
        "current_price": 128.4,
        "instrument": {
          "id": "inst_…",
          "symbol": "VFV.TO",
          "type": "ETF",
          "current_price": 128.4,
          "native_currency_code": "CAD"
        }
      }
    ],
    "options": [
      {
        "symbol": "NVDA10Jul26P175.00",
        "instrument": {
          "type": "OPTION",
          "current_price": 3.15,
          "native_currency_code": "USD",
          "underlying": {
            "symbol": "NVDA",
            "type": "STOCK",
            "current_price": 142.5,
            "native_currency_code": "USD"
          }
        }
      }
    ],
    "cash": [],
    "accounts": [],
    "total_market_value": 125000,
    "total_cash": 8500,
    "total_equity": 133500,
    "last_sync_at": "2026-06-25T18:30:00.000Z"
  }
}
```

`data.equity` is sorted by market value descending. Options use `instrument.type === 'OPTION'` (regex fallback for legacy rows). Cash rows have `instrument_type === 'CASH'`.

Each holding row includes flat fields (`symbol`, `current_price`, …) for backward compatibility plus a nested `instrument` object with native-currency `current_price`. Option rows may include `instrument.underlying` with the underlying stock quote.

When `latest=true`, `sync` contains the broker sync report (`status`, `accountsOk`, `holdingsUpserted`, etc.). `success` is `false` if sync status is `failed` or `reauth_required` (portfolio data is still returned from the last successful sync).

**Scope**: Holdings are filtered to the authenticated user's `org_id`.

### `get_option_chain`

Return a **trimmed** Questrade option chain for an underlying symbol with **live** option quotes (bid/ask, Greeks, open interest). Chain skeleton is cached **once per calendar day** (`America/Toronto`) per `(connection_id, underlying_symbol_id)`; quotes are never cached.

Use after `get_portfolio_summary` for covered-call screening.

| Parameter | Type | Behaviour |
|-----------|------|-----------|
| `symbol` | `string` | **Required.** Underlying ticker, e.g. `VFV.TO`, `AAPL`. |
| `option_type` | `"Call"` \| `"Put"` | Default **`Call`**. |
| `expiry_date` | `string` (optional) | Pin to one expiry (`YYYY-MM-DD`). Overrides expiry paging. |
| `min_strike` | `number` (optional) | Default **ATM** for calls (= underlying last price). |
| `max_strike` | `number` (optional) | Default **+20% OTM** for calls. User values are clamped to ±50% from last price. |
| `expiry_offset` | `integer` (optional) | Fabriq pagination: skip first N expiries. Default `0`. |
| `expiry_limit` | `integer` (optional) | Max expiries returned. Default **`4`**, hard max **`8`**. |
| `strike_offset` | `integer` (optional) | Skip first N strikes in band. Default `0`. |
| `strike_limit` | `integer` (optional) | Max strikes per expiry. Default **`15`**, hard max **`25`**. |
| `include_quotes` | `boolean` (optional) | Default **`true`**. Set `false` for structure-only (no quote POST). |
| `connection_id` | `string` (optional) | Scope to one Questrade `source_system`. |

**Questrade APIs used** (live HTTP via org's `source_system` OAuth — not mocked):

| Step | Endpoint | Cached? |
|------|----------|---------|
| Symbol lookup | `GET /v1/symbols?names=` | No |
| Underlying price | `GET /v1/markets/quotes?ids=` | No |
| Chain skeleton | `GET /v1/symbols/:id/options` | Yes — same calendar day (`America/Toronto`) in `option_chain_cache` |
| Option quotes | `POST /v1/markets/quotes/options` `{ optionIds: [...] }` | No — always live; batched 50 IDs per request |

**Questrade response shape**: the live API returns `optionChain` (not `options`). Fabriq maps both keys. Each root uses `optionRoot` (e.g. `"VFV"`).

**Default caps** (always applied; broad user filters are clamped):

| Dimension | Default | Hard max |
|-----------|---------|----------|
| Option type | `Call` | — |
| Strike band (calls) | ATM → +20% OTM | ±50% from last price |
| Expiries | Next 4 | 8 |
| Strikes per expiry | 15 | 25 |
| Quoted contracts | — | 100 total |

Use `expiry_offset` / `strike_offset` for Fabriq-level pagination (Questrade has no chain pagination).

**Returns** (as JSON string in `content[0].text`):
```json
{
  "tool": "get_option_chain",
  "success": true,
  "underlying": {
    "symbol": "VFV.TO",
    "symbolId": 1001,
    "lastPrice": 128.4,
    "currency": "CAD"
  },
  "cache": {
    "hit": true,
    "refreshedAt": "2026-06-28T08:15:00.000Z",
    "source": "db"
  },
  "filters": {
    "optionType": "Call",
    "minStrike": 128.4,
    "maxStrike": 154.08,
    "expiryOffset": 0,
    "expiryLimit": 4,
    "strikeOffset": 0,
    "strikeLimit": 15,
    "includeQuotes": true
  },
  "truncation": {
    "applied": true,
    "reasons": ["expiries_limited_to_4", "strikes_limited_to_15_per_expiry"],
    "chainStats": {
      "totalExpiriesAvailable": 12,
      "totalStrikesInBand": 48,
      "expiriesReturned": 4,
      "strikesReturned": 52,
      "quotesReturned": 52
    },
    "moreAvailable": true,
    "pagination": {
      "nextExpiryOffset": 4,
      "hint": "Call again with expiry_offset or expiry_date for the next slice"
    }
  },
  "chain": []
}
```

**Errors:**

| Code | Meaning |
|------|---------|
| `NO_BROKER_CONNECTION` | No active Questrade `source_system` for the org |
| `SYMBOL_NOT_FOUND` | Ticker not resolved via Questrade symbol search |
| `UNDERLYING_PRICE_UNAVAILABLE` | No quote for underlying (cannot compute default strike band) |
| `NO_OPTIONS` | Questrade returned an empty chain (symbol has no listed options, e.g. some ETFs) |
| `REAUTH_REQUIRED` | Refresh token invalid — reconnect in Settings → Connections |

**Scope:** Broker connection and cache rows are scoped to the authenticated user's `org_id`.

**Smoke test** (uses `backend/.env`, real Questrade):

```bash
cd backend && npx ts-node --transpile-only scripts/test-option-chain-live.ts VFV.TO
```

Requires the `option_chain_cache` table (see INVESTMENTS.md).

### `get_options_income`

Options income from trade history — same `run_report(auth, 'options_income', …)` path as the in-app Options Income page. Defaults to **open positions only** for agent analysis of period premium cash flows and marks.

Prefer this for premium / open-options income analysis. Use `get_portfolio_summary.data.options` for a point-in-time holdings snapshot (qty / avg cost / MTM only). Use `get_option_chain` for screening *new* contracts.

| Parameter | Type | Behaviour |
|-----------|------|-----------|
| `from_date` | `string` (optional) | Period start (`YYYY-MM-DD`). With `to_date` omitted pair, uses current financial year. |
| `to_date` | `string` (optional) | Period end (`YYYY-MM-DD`). |
| `report_currency` | `string` (optional) | ISO code or currency id. Defaults to **USD**. |
| `section` | `"open"` \| `"closed"` \| `"all"` | Defaults to **`open`**. |
| `account_id` | `string` (optional) | Scope to one investment/broker account. |
| `connection_id` | `string` (optional) | Scope to one broker `source_system`. |
| `legal_entity_id` | `string` (optional) | Entity filter when `account_id` is not supplied. |

**Returns** (as JSON string in `content[0].text`):
```json
{
  "tool": "get_options_income",
  "success": true,
  "periodSource": "current_financial_year",
  "filters": {
    "from_date": "2026-01-01",
    "to_date": "2026-12-31",
    "report_currency": "USD",
    "section": "open",
    "account_id": null,
    "connection_id": null,
    "legal_entity_id": null
  },
  "summary": {
    "report_currency": "USD",
    "open_transaction_count": 4,
    "open_position_count": 3,
    "open_proceeds": { "inflow": 1200, "outflow": 100, "net": 1100 },
    "open_market_value": 850,
    "open_unrealized_pnl": 350,
    "open_priced_row_count": 4,
    "closed_transaction_count": 12,
    "closed_profit_loss": 2400
  },
  "notes": ["…"],
  "data": {
    "report_currency": "USD",
    "from_date": "2026-01-01",
    "to_date": "2026-12-31",
    "open": {
      "transactions": [
        {
          "symbol": "AMZN31Jul26C290.00",
          "position_qty": -2,
          "open_leg": { "type": "SELL", "quantity": 2, "price": 0.95, "amount": 190, "value_date": "2026-06-01" },
          "option_current_price": 0.85,
          "underlying_current_price": 245.34,
          "strike_price": 290,
          "option_type": "C",
          "market_value": 170,
          "mark_to_market_unrealized_pnl": 20
        }
      ],
      "positions": [],
      "total_profit_loss": 0
    }
  }
}
```

**Notes for agents:**

- Open may have **multiple transaction rows per instrument** (one per unmatched period leg). Group by `holding_id` / `instrument_id` / `symbol` when counting positions. Open rows include `holding_id` when an active holding exists.
- `summary.open_unrealized_pnl` and per-row `mark_to_market_unrealized_pnl` use option mark × qty × 100 vs premium (same as the UI). Holding `unrealized_pnl` on rows may differ slightly.
- `summary` always includes open/closed counts even when `section=open` (closed detail omitted from `data`).

**Scope**: Trades and holdings filtered to the authenticated user's `org_id`.

---

## Covered-call workflow (recommended agent flow)

Typical analysis combines portfolio holdings with option chain data:

```
1. get_portfolio_summary({ latest: true, report_currency: "CAD" })
     → data.equity     round lots (quantity >= 100)
     → data.options    existing option positions (check instrument.underlying)

2. For each eligible equity symbol with NO conflicting short call:
     get_option_chain({ symbol: "VFV.TO" })   // defaults: Call, ATM→+20% OTM

3. Rank strikes by premium yield, delta ~0.20–0.35, DTE ~30–45, open interest
```

Symbols with listed options on Questrade include many TSX names (e.g. `VFV.TO`, `RY.TO`) and US equities (e.g. `AAPL`). Some holdings (e.g. `XEQT.TO`) may return `NO_OPTIONS`.

### MCP prompt: `covered_call_candidates`

Built-in orchestration prompt (not a tool). In Cursor, list prompts via MCP or invoke by name. It instructs the client to:

1. Call `get_portfolio_summary` with `latest=true`
2. Filter equity holdings to round lots without existing short calls
3. Call `get_option_chain` per eligible symbol
4. Rank by premium yield, DTE (~30–45), delta (risk-dependent), and open interest

Optional args: `report_currency`, `connection_id`, `risk_level` (`conservative` | `moderate` | `aggressive`).

For finer control (e.g. skip symbols that already have covered calls), use explicit tool calls instead of the prompt alone.

---

## Adding a New Tool

1. Create `backend/src/mcp/tools/myTool.ts` — export a handler factory `myToolHandler(auth: AuthContext)` that returns an async function
2. Register it in `createMcpServer.ts`:

```typescript
server.registerTool(
  'my_tool',
  {
    description: 'What this tool does...',
    inputSchema: {
      param_name: z.string().describe('...'),
    },
  },
  async (params: { param_name: string }) => {
    const result = await myToolHandler(auth)(params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
);
```

**Note on TypeScript**: The MCP SDK's generic inference can hit TypeScript 5.3 depth limits when using `registerTool` with complex Zod schemas. The current workaround is to cast the server as `any` for the `registerTool` call and explicitly type the callback params. This does not affect runtime behaviour.

---

## Connecting to Cursor

1. Start the backend: `cd backend && npm run dev`
2. Create `.cursor/mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "fabriq": {
      "url": "http://localhost:4000/api/mcp",
      "headers": {
        "X-API-Key": "your-api-key-here"
      }
    }
  }
}
```

3. In Cursor: **Settings → Features → MCP** — the `fabriq` server should appear with a green dot.
4. In Agent mode, Cursor will offer `list_accounts` (and any future tools) automatically.

**Known behaviour**: Cursor probes `GET /api/mcp` on startup to open an SSE stream. The server returns `405` (stateless mode does not support persistent streams). Cursor recovers and uses POST for all subsequent calls. The initial error in the Cursor log is expected and harmless.

---

## Manual Testing with curl

All requests require:
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream` ← required by the transport
- `X-API-Key: <key>`

**List tools:**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: fabriq-us-ca-demo-user_daniel_lee" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Call `list_accounts` (name search):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: fabriq-us-ca-demo-user_daniel_lee" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_accounts","arguments":{"name":"bank"}}}'
```

**Call `list_accounts` (code exact match):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: fabriq-us-ca-demo-user_daniel_lee" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_accounts","arguments":{"code":"1102"}}}'
```

**Call `get_trial_balance` (account-specific):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_trial_balance","arguments":{"start_date":"2026-04-01","end_date":"2026-04-30","account_id":"acco_ent_f687b778_cfdf_4a7f_9883_c3a1217bb3e2_1101"}}}'
```

**Call `get_portfolio_summary` (cached):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_portfolio_summary","arguments":{}}}'
```

**Call `get_portfolio_summary` (sync then return):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_portfolio_summary","arguments":{"latest":true}}}'
```

**Call `get_option_chain` (default covered-call band):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_option_chain","arguments":{"symbol":"VFV.TO"}}}'
```

**Call `get_option_chain` (structure only, no live quotes):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"get_option_chain","arguments":{"symbol":"VFV.TO","include_quotes":false}}}'
```

**Call `get_options_income` (open positions, current FY, USD):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_options_income","arguments":{}}}'
```

**Call `get_options_income` (closed + open):**
```bash
curl -s -X POST http://localhost:4000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"get_options_income","arguments":{"section":"all","report_currency":"USD"}}}'
```

The response is an SSE-framed event even for simple queries:
```
event: message
data: {"result":{"content":[{"type":"text","text":"{...}"}]},"jsonrpc":"2.0","id":3}
```

---

## What Is Not Implemented Yet

| Feature | Notes |
|---------|-------|
| `import_bank_statement` tool | Deferred — requires document storage design (file-as-base64 in JSON is not a good pattern for large files) |
| Order placement | MCP is read-only; no trade execution via Questrade |
| More account tools | `get_account`, `list_transactions`, etc. — straightforward to add |
| Write tools | `create_posting`, `update_record` — need careful permission scoping |
| Stateful SSE streaming | For long-running tools (e.g. batch imports) that need progress events |
| Claude Desktop config | Same pattern as Cursor — needs a `claude_desktop_config.json` entry |
| MCP auth via Bearer token | Currently API key only; JWT support would require extracting the token resolution logic from `authMiddleware` |
| Tool pagination | `list_accounts` is capped at 10; a `cursor`-based pagination param could be added |
