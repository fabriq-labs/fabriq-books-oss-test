# Questrade Broker Sync — Handoff

**Branch:** `claude/sharp-ritchie-ra7mb0`
**Repo:** `fabriq-labs/fabriq-ws-setup`

---

## What was built

A read-only forward sync system pulling Questrade investment data into the existing Fabriq `account` / `instrument` / `holding` / `trade` models. No frontend yet — that's the next piece.

**New files:**
```
backend/src/lib/integrations/broker/
├── connectors/index.ts                        # factory: createBrokerConnector(connectionId)
├── connectors/types.ts                        # BrokerConnector interface + DTOs
├── connectors/questrade/questrade_auth.ts     # OAuth2 with rotating token persistence
├── connectors/questrade/questrade_connector.ts
├── connectors/questrade/questrade_mappers.ts  # deterministic tradeId via sha256 hash
├── shared/broker-connection-loader.ts
├── sync/broker_sync_service.ts                # runBrokerSync(), getPortfolio()
└── sync/upserts.ts                            # idempotent upserts by natural key

backend/src/routes/broker-sync.ts              # mounted at /api/broker-sync
backend/src/__tests__/broker/                  # full test suite (see README.md inside)
```

**Modified files:**
- `backend/prisma/schema/data.prisma` — `source_system_id` on `holding` + `trade`; `@@unique([inst_id, org_id])` on `account`
- `backend/prisma/schema/metadata.prisma` — back-relations on `source_system`
- `backend/src/index.ts` — broker-sync router mounted

---

## Before you can run it — DDL required

The schema changes are in Prisma but **not yet applied to the DB**. Run this (per project rules, Claude doesn't run DDL):

```sql
ALTER TABLE public.holding ADD COLUMN source_system_id varchar(50);
ALTER TABLE public.trade   ADD COLUMN source_system_id varchar(50);

ALTER TABLE public.holding
  ADD CONSTRAINT holding_source_system_fk
  FOREIGN KEY (source_system_id) REFERENCES public.source_system(id);
ALTER TABLE public.trade
  ADD CONSTRAINT trade_source_system_fk
  FOREIGN KEY (source_system_id) REFERENCES public.source_system(id);

ALTER TABLE public.holding
  ADD CONSTRAINT holding_account_instrument_uniq UNIQUE (account_id, instrument_id);

ALTER TABLE public.account
  ADD CONSTRAINT account_inst_org_uniq UNIQUE (inst_id, org_id);
```

Then regenerate the Prisma client:
```bash
cd backend && npx prisma generate
```

---

## Connecting your Questrade account

1. Go to [Questrade App Hub](https://www.questrade.com/self-directed-investing/tools/questrade-api) → generate a Personal Access Token (PAT)
2. `POST /api/broker-sync/connections` with body:
   ```json
   { "name": "My Questrade", "personalAccessToken": "<your PAT>" }
   ```
   This validates the token and stores it encrypted in `source_system`.
3. Trigger a sync:
   ```
   POST /api/broker-sync/run
   ```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/broker-sync/connections` | Register Questrade PAT |
| `DELETE` | `/api/broker-sync/connections/:id` | Deactivate connection |
| `POST` | `/api/broker-sync/run` | Trigger sync for org |
| `GET` | `/api/broker-sync/status` | Connection + last sync metadata |
| `GET` | `/api/broker-sync/portfolio` | Net worth, accounts, holdings |

All endpoints require JWT auth. `org_id` is always taken from the token.

---

## Running tests

```bash
cd backend

# Unit tests (no DB needed)
npm test -- --testPathPattern="broker/questrade-auth|broker/questrade-mappers"

# Integration tests (DB + seed required)
psql $DATABASE_URL -f src/__tests__/broker/fixtures/seed.sql
npm test -- --testPathPattern="broker/broker-sync-service"

# Live Questrade API (replace TEST_REFRESH_TOKEN_REPLACE_ME in seed.sql first)
QUESTRADE_USE_LIVE=true \
QUESTRADE_CONNECTION_ID=srcsys_qt_test \
QUESTRADE_ORG_ID=org_broker_test \
npm test -- --testPathPattern="broker/broker-sync-service"
```

---

## Known issues / notes

1. **`account.source_system_id`** — this column pre-existed this work (points at `datalake.source_system`). The broker sync writes to it as a plain string only — no FK relation was added to avoid breaking existing rows. Lineage on `holding` and `trade` does have proper FK relations.

2. **Instrument dedup** — instruments are global master data (no `org_id`). Upsert matches by `isin` first, then `symbol`. Two orgs holding the same stock share one `instrument` row; isolation is at the `holding` level.

3. **Questrade activity tradeId** — Questrade has no stable per-activity unique ID. The system uses a deterministic `sha256(accountId|tradeDate|symbol|action|qty|netAmount)` hash prefixed `qt_`. Identical same-day fills at the same price could theoretically collide — acceptable risk for now.

4. **Refresh token expiry** — Questrade refresh tokens expire after ~3 days. Manual sync keeps them alive. If a user goes >3 days without syncing they'll get `REAUTH_REQUIRED` and must paste a fresh PAT via `POST /connections`.

---

## What's next (deferred)

- **Frontend dashboard** — `/investments` page: net worth card, holdings table, account breakdown, "Sync Now" button
- **Scheduled sync** — add `node-cron` daily job once the service is validated with live data
- **Posting linkage** — auto-create accounting postings from synced trades
- **Second broker** — add Wealthsimple/IBKR by implementing `BrokerConnector` interface and registering in `connectors/index.ts`
