# US/CA demo — bank statement import test data

Use this folder with [`scripts/import-bank-statements.ts`](../../scripts/import-bank-statements.ts) after loading the **US_CA** demo seed ([`prisma/setup-US_CA/setup-us-ca-demo.ts`](../../prisma/setup-US_CA/setup-us-ca-demo.ts)).

## Seed user (Daniel Lee)

| Field | Value |
|--------|--------|
| Email | `daniel.lee@techflowsolutions.com` |
| User id | `user_daniel_lee` |
| Org | `org_techflow_us` |
| Password (JWT login) | `Metalimits@123` (same for all US/CA demo users) |
| Stable `X-API-Key` | `fabriq-us-ca-demo-user_daniel_lee` |

See [`prisma/demo-stable-api-keys.ts`](../../prisma/demo-stable-api-keys.ts) and the mirrored helpers in [`src/lib/demoStableApiKeys.ts`](../../src/lib/demoStableApiKeys.ts) (`stableUsCaDemoApiKeyPlaintext`).

## Resolving `--account-id`

The import script maps all statement lines to a **bank/checking account** you pass as `--account-id`. That account must belong to **`org_techflow_us`** and, for **PDF** parsing with categorization, should have **`legal_entity_id`** set (the script loads it via `GET /api/account/:id/view/account_view`).

After seed:

- Query Prisma for a checking/bank account for this org, e.g. filter `account` where `org_id = 'org_techflow_us'` and the name/type matches your chart of accounts (e.g. “Checking Account”), or
- Use the API with the same auth as the script to list accounts.

## Files

- **`sample-bank-statement.csv`** — Synthetic rows for **CSV** import testing (no LLM). Use with `--dry-run` first.

## PDF + categorization (LLM)

- Generate the sample PDF: `npm run generate:sample-bank-pdf` (from `backend/`).
- Use folder **[`pdf-categorization-only/`](pdf-categorization-only/)** so only the PDF is processed (avoids mixing with this CSV). See that folder’s README for dry-run and full-import commands.

## Example (API key)

From the `backend` directory, after the server is running and the DB is seeded:

```bash
npx ts-node scripts/import-bank-statements.ts \
  --api-key fabriq-us-ca-demo-user_daniel_lee \
  --api-url http://localhost:4000 \
  --folder test-data/us-ca-bank-import \
  --account-id <checking_account_uuid_for_org_techflow_us> \
  --dry-run
```

Replace `<checking_account_uuid_for_org_techflow_us>` with a real account id from your database.

**Persisting rows:** omit `--dry-run` so the script calls the upload API. `--dry-run` only parses and validates; it does not insert postings.

**Mixed debit/credit CSVs:** each line may set either `account_id` or `credit_account_id` (plus amount). The import script builds the field mapping from **all** rows so both sides are sent to the server; using only the first row for mapping would drop fields on other rows.
