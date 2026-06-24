# Fabriq MCP Server

**Status**: Work in Progress
**Last Updated**: 2026-04-15
**Primary files**: `backend/src/mcp/`

---

## What This Is

Fabriq exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server so that AI clients (Cursor, Claude Desktop, custom agents) can call Fabriq tools directly — searching accounts, querying data, and eventually triggering actions — without going through the chat UI or the agent session system.

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
```

**Mount point**: `src/index.ts` → `app.use('/api/mcp', mcpRouter)`

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
| More account tools | `get_account`, `list_transactions`, etc. — straightforward to add |
| Write tools | `create_posting`, `update_record` — need careful permission scoping |
| Stateful SSE streaming | For long-running tools (e.g. batch imports) that need progress events |
| Claude Desktop config | Same pattern as Cursor — needs a `claude_desktop_config.json` entry |
| MCP auth via Bearer token | Currently API key only; JWT support would require extracting the token resolution logic from `authMiddleware` |
| Tool pagination | `list_accounts` is capped at 10; a `cursor`-based pagination param could be added |
