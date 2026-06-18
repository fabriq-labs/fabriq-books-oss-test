# Questrade Feature — Production Deployment Guide

**Branch to deploy:** `claude/sharp-ritchie-ra7mb0`  
**Merge target:** `demo`  
**Date prepared:** 2026-06-18

---

## Pre-flight checklist

- [ ] Production DB backup taken
- [ ] Deployment window confirmed (low-traffic period recommended — DDL takes locks)
- [ ] You have psql access to the production database

---

## Step 1 — Apply DDL to production database

Run each statement individually so you can verify each one succeeds before continuing.

```sql
-- 1. Add broker lineage column to holding
ALTER TABLE public.holding
  ADD COLUMN IF NOT EXISTS source_system_id varchar(50);

-- 2. Add broker lineage column to trade
ALTER TABLE public.trade
  ADD COLUMN IF NOT EXISTS source_system_id varchar(50);

-- 3. FK: holding → source_system
ALTER TABLE public.holding
  ADD CONSTRAINT holding_source_system_fk
  FOREIGN KEY (source_system_id) REFERENCES public.source_system(id);

-- 4. FK: trade → source_system
ALTER TABLE public.trade
  ADD CONSTRAINT trade_source_system_fk
  FOREIGN KEY (source_system_id) REFERENCES public.source_system(id);

-- 5. Unique constraint on holding (required for broker sync upsert key)
ALTER TABLE public.holding
  ADD CONSTRAINT holding_account_instrument_uniq
  UNIQUE (account_id, instrument_id);

-- 6. Unique constraint on account
--    Broker sync looks up accounts by (source_record_id, source_system_id, org_id).
--    NULL source_record_id rows (internal accounts) are exempt — Postgres treats NULLs
--    as distinct in unique indexes so multiple internal accounts are allowed.
ALTER TABLE public.account
  ADD CONSTRAINT account_source_record_uniq
  UNIQUE (source_record_id, source_system_id, org_id);

-- 7. Legal entity on source_system (optional — broker sync uses this to tag created accounts)
ALTER TABLE public.source_system
  ADD COLUMN legal_entity_id text
  REFERENCES public.entity(id) ON UPDATE CASCADE ON DELETE SET NULL;
```

**Verification:**
```sql
SELECT conname, contype
FROM pg_constraint
WHERE conrelid IN ('public.holding'::regclass, 'public.trade'::regclass, 'public.account'::regclass)
  AND conname IN (
    'holding_source_system_fk',
    'trade_source_system_fk',
    'holding_account_instrument_uniq',
    'account_source_record_uniq'
  )
ORDER BY conname;

-- Verify source_system column
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'source_system' AND column_name = 'legal_entity_id';
```
Expected: 4 constraint rows + 1 column row.

---

## Step 2 — Deploy application code

1. Merge `claude/sharp-ritchie-ra7mb0` → `demo`
2. Deploy backend and frontend via your normal deployment pipeline
3. After backend deploy, regenerate the Prisma client:
   ```bash
   cd backend && npx prisma generate
   ```

---

## Step 3 — Add USD → CAD exchange rate for each production org that will use Questrade

The portfolio page converts USD holdings to CAD (or vice versa) using the `exchange_rate` table. Without a rate, the total card silently uses 1:1 — giving a wrong total.

Run this for each org that will use Questrade, replacing `<ORG_ID>` and `<RATE>` with the current spot rate:

```sql
INSERT INTO exchange_rate (
  id, org_id, from_currency_id, to_currency_id,
  rate, rate_type, effective_date, modified_at
)
SELECT
  concat('exr_usd_cad_', replace(gen_random_uuid()::text, '-', '')),
  '<ORG_ID>',
  (SELECT id FROM currency WHERE code = 'USD'),
  (SELECT id FROM currency WHERE code = 'CAD'),
  <RATE>,        -- e.g. 1.36
  'SPOT',
  CURRENT_DATE,
  NOW()
ON CONFLICT DO NOTHING;
```

> **Note:** The portfolio page also needs the inverse rate if users select USD as their display currency and hold CAD assets. The code will invert the USD→CAD rate automatically, so only one direction is needed.

---

## Step 4 — First-time user setup (Questrade)

This is what the end user does — no developer action needed.

1. Log in to Fabriq
2. Go to **Settings → Connections → Create Connection**
3. Select **Questrade**
4. Enter a connection name (e.g. "My Questrade")
5. Select the **Legal Entity** this Questrade account belongs to (optional — if set, synced accounts will be tagged with that entity)
6. Go to [questrade.com](https://www.questrade.com) → App Hub → Generate a Personal Access Token
7. Paste the token into the **Personal Access Token** field
8. Click **Test Connection**
   - The token will be exchanged with Questrade. A success message confirms connectivity and lists your accounts
   - The form field is automatically updated with the refreshed token (Questrade rotates tokens on every use)
   - The message will say: *"The token in this form has been updated with the refreshed value — click Save to store it."*
9. Click **Save Connection**
10. Navigate to **Investments → Portfolio**
11. Click **Sync Now** — all accounts, holdings, and 90 days of trades will be pulled from Questrade
12. The portfolio page populates with live data

---

## Step 5 — Verify the deployment

After the first user sync, run these queries to confirm data landed correctly:

```sql
-- Confirm accounts created
SELECT name, inst_id, is_active
FROM account
WHERE source_system_id IN (
  SELECT id FROM source_system WHERE system_type = 'questrade'
);

-- Confirm holdings
SELECT count(*), sum(market_value)
FROM holding h
JOIN account a ON a.id = h.account_id
WHERE a.source_system_id IN (
  SELECT id FROM source_system WHERE system_type = 'questrade'
)
AND h.is_active = true;

-- Confirm trades (90-day backfill)
SELECT type, count(*)
FROM trade
WHERE source_system_id IN (
  SELECT id FROM source_system WHERE system_type = 'questrade'
)
GROUP BY type;
```

---

## Known limitations and follow-up items

| Item | Detail | Priority |
|---|---|---|
| Questrade token expiry | Refresh tokens expire after a period of inactivity. User must paste a new PAT via Settings → Connections → Edit. The portfolio page does not yet surface a re-auth warning. | Medium |
| Exchange rate staleness | The USD/CAD rate in `exchange_rate` is static. Portfolio totals will drift as the real rate moves. Consider a daily rate update job. | Low |
| Second Questrade account | Only one Questrade connection per org (unique constraint). UI shows a generic error if user tries to add a second. | Low |
| `client_id`/`client_secret` now optional in `ConnectionConfig` | Made optional to support Questrade (no OAuth app credentials needed). This loosens type safety for Zoho/QB — tighten with a discriminated union in a future refactor. | Low |
