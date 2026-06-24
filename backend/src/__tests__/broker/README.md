# Broker Sync Tests

## Running tests

### Mock mode (default — no real API calls, no DB required for unit tests)

```bash
cd backend
npm test -- --testPathPattern="broker/"
```

Unit tests (auth, mappers) run entirely with mocked axios — no database needed.

Integration tests (sync service, portfolio) require a database. Set up the seed first:

```bash
psql $DATABASE_URL -f src/__tests__/broker/fixtures/seed.sql
npm test -- --testPathPattern="broker/broker-sync-service"
```

### Live Questrade API mode

Runs the full sync against your real Questrade account. Requires:
1. A running database with the seed applied
2. A `source_system` row with your real refresh token (replace `TEST_REFRESH_TOKEN_REPLACE_ME` in `seed.sql` with your Personal Access Token from Questrade App Hub)

```bash
QUESTRADE_USE_LIVE=true \
QUESTRADE_CONNECTION_ID=srcsys_qt_test \
QUESTRADE_ORG_ID=org_broker_test \
npm test -- --testPathPattern="broker/broker-sync-service"
```

To use a different connection:
```bash
QUESTRADE_USE_LIVE=true \
QUESTRADE_CONNECTION_ID=<your_source_system_id> \
QUESTRADE_ORG_ID=<your_org_id> \
npm test -- --testPathPattern="broker/broker-sync-service"
```

## Test files

| File | What it tests |
|---|---|
| `questrade-auth.test.ts` | Token refresh, rotation persistence, REAUTH_REQUIRED, caching |
| `questrade-mappers.test.ts` | Field mapping, trade_id stability, type normalization |
| `broker-sync-service.test.ts` | Full sync, idempotency, stale holding deactivation, partial failure |
| `broker-api.test.ts` | HTTP routes: auth, request validation, response shape |

## Fixtures

- `fixtures/questrade-responses.ts` — raw Questrade API response shapes (3 accounts, positions, activities)
- `fixtures/seed.sql` — org, currencies, exchange rates, source_system row
- `mock-questrade-server.ts` — axios spy that intercepts all Questrade HTTP calls
