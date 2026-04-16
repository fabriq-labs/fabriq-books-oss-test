# PDF + AI categorization test sample

This folder is meant to contain **only** the categorization sample PDF so `import-bank-statements.ts` does not also pick up the CSV in the parent directory.

## Generate / refresh the PDF

From `backend/`:

```bash
npm run generate:sample-bank-pdf
```

This writes `sample-bank-statement-categorization.pdf` (synthetic statement with three lines labeled **PDF CATEGORIZATION TEST - …**).

## Requirements

- Backend running (`npm run dev`) with working **LLM / Vertex** configuration (same as production PDF import).
- A bank account in **US/CA demo** with **`legal_entity_id`** set (e.g. `acco_org_techflow_us_1102` — the script reads `legal_entity_id` from `GET /api/account/:id/view/account_view`).
- Auth: `--api-key fabriq-us-ca-demo-user_daniel_lee` or email/password.

## Dry run (parse + categorization, no DB insert)

```bash
cd backend
npx ts-node --transpile-only scripts/import-bank-statements.ts \
  --api-key fabriq-us-ca-demo-user_daniel_lee \
  -u http://localhost:4000 \
  -f test-data/us-ca-bank-import/pdf-categorization-only \
  -a acco_org_techflow_us_1102 \
  --dry-run \
  --verbose
```

Inspect console output for `PDF PARSING RESPONSE` and `categorizations`.

## Full import

Omit `--dry-run` to upload postings after extraction.
