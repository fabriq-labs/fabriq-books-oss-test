# Plaid Bank Integration — Developer Guide

**Last Updated**: 2026-06-22

---

## What is Plaid?

[Plaid](https://plaid.com) is a financial data network that connects applications to users' bank accounts. It acts as a secure bridge between Fabriq and thousands of banks and credit unions, letting users authenticate with their bank once and then stream transactions automatically — no CSV exports, no PDF uploads, no manual data entry.

Plaid is used by Venmo, Robinhood, Coinbase, and thousands of other financial applications. It is the industry-standard approach for programmatic bank data access in the US, Canada, UK, and EU.

---

## Why Plaid Instead of CSV/PDF Import?

Fabriq already supports [CSV/PDF bank statement import](./IMPORT_FUNCTIONALITY.md). Plaid is a complementary (not replacement) channel that solves the pain points of manual import:

| Concern | CSV/PDF Import (current) | Plaid Integration |
|---------|--------------------------|-------------------|
| **Frequency** | Manual, per file | Automatic, near real-time |
| **Human effort** | Download → upload → map columns | One-time bank login |
| **Data freshness** | Days to weeks old | Minutes old |
| **Error surface** | Column mapping errors, encoding issues | Standardised schema from Plaid |
| **Coverage** | Whatever the bank exports | All transactions Plaid can fetch |
| **Reconciliation** | Manual match to GL | Can auto-post to `posting` model |

For a business posting dozens of bank transactions per day, Plaid eliminates a daily manual task and reduces reconciliation lag from days to minutes.

---

## How Plaid Works — Conceptual Flow

```
User                  Fabriq Frontend         Fabriq Backend          Plaid API
 |                         |                       |                      |
 |-- "Connect bank" -----> |                       |                      |
 |                         |-- POST /plaid/token -> |                      |
 |                         |                       |-- create_link_token ->|
 |                         |                       |<-- link_token --------|
 |                         |<-- link_token ---------|                      |
 |                         |                       |                      |
 |<-- Plaid Link popup ----|                       |                      |
 |-- (login to bank) ----> Plaid Link (iframe)     |                      |
 |                         |                       |                      |
 |                         |-- public_token ------->|                      |
 |                         |                       |-- exchange_token ---->|
 |                         |                       |<-- access_token ------|
 |                         |                       | (stored securely)    |
 |                         |                       |                      |
 |                    (background job)             |-- get_transactions -->|
 |                         |                       |<-- transactions ------|
 |                         |                       |                      |
 |                         |              map to `posting` rows            |
 |                         |              insert via Fabriq API            |
```

### Key Concepts

- **Plaid Link**: A prebuilt, Plaid-hosted UI widget (iframe) that handles the sensitive bank login. Fabriq never sees the user's bank credentials.
- **`link_token`**: A short-lived token your backend creates to initialise the Link widget for a specific user.
- **`public_token`**: Returned by Link after the user authenticates. It is single-use and expires in 30 minutes.
- **`access_token`**: Your backend exchanges the `public_token` for a permanent `access_token`. This is what you store (encrypted) to pull transactions later.
- **`item`**: Plaid's term for a single bank connection (one user + one institution).
- **Webhook**: Plaid calls your backend when new transactions are available, so you don't need to poll.

---

## Data Plaid Provides

Plaid's **Transactions** product returns:

```json
{
  "transaction_id": "abc123",
  "date": "2026-06-20",
  "name": "AMAZON.COM*1A2B3C",
  "merchant_name": "Amazon",
  "amount": 49.99,
  "iso_currency_code": "USD",
  "category": ["Shopping", "Online Marketplaces"],
  "account_id": "xyz789",
  "pending": false
}
```

Each transaction maps cleanly to the Fabriq `posting` model:

| Plaid field | `posting` field |
|-------------|-----------------|
| `date` | `date` |
| `name` / `merchant_name` | `description` |
| `amount` (positive = debit) | `amount` + `debit_credit` |
| `iso_currency_code` | `currency_id` |
| `account_id` | `account_id` (mapped via saved account lookup) |
| `category[0]` | `category_id` (mapped via category rules) |
| `transaction_id` | `external_ref` (for deduplication) |

---

## Integration Architecture for Fabriq

### Backend additions (Node.js/Express)

```
backend/
├── src/
│   ├── plaid/
│   │   ├── plaid.client.ts       # Plaid SDK initialisation
│   │   ├── plaid.routes.ts       # Express routes
│   │   ├── plaid.service.ts      # Business logic
│   │   ├── plaid.mapper.ts       # Plaid tx → posting row
│   │   └── plaid.webhook.ts      # Webhook handler
│   └── ...
├── prisma/schema/
│   └── plaid_item.prisma         # New model (see below)
```

**New Prisma model** (propose to user before running migration):

```prisma
model plaid_item {
  id               String    @id @default(cuid())
  org_id           String
  user_id          String
  institution_id   String?
  institution_name String?
  access_token     String    // store encrypted
  item_id          String    @unique
  cursor           String?   // for /transactions/sync pagination
  accounts         Json?     // Plaid sub-accounts + fabriq_account_id mapping (see below)
  last_synced_at   DateTime?
  created_at       DateTime  @default(now())
  updated_at       DateTime  @updatedAt
}
```

Each Plaid **item** (one bank login) can expose multiple sub-accounts (checking, savings, etc.). Those are stored in the `accounts` JSON column — no separate table needed:

```json
[
  {
    "plaid_account_id": "xyz789",
    "name": "Plaid Checking",
    "mask": "0000",
    "type": "depository",
    "subtype": "checking",
    "fabriq_account_id": "acco_abc123"
  }
]
```

The user maps each `plaid_account_id` to a Fabriq `account` (bank GL account) via the Bank Connections settings UI before syncing.

**New Express routes**:

```
POST /api/plaid/link-token          # Create link_token for frontend
POST /api/plaid/exchange-token      # Exchange public_token → access_token
POST /api/plaid/webhook             # Receive Plaid webhook events
GET  /api/plaid/items               # List connected bank accounts
DELETE /api/plaid/items/:id         # Disconnect a bank account
PUT  /api/plaid/items/:itemId/accounts/:plaidAccountId  # Map Plaid account → Fabriq account
POST /api/plaid/sync/:itemId        # Manual sync trigger
```

### Frontend additions (React/Vite)

```
frontend-1/src/
├── components/
│   └── plaid/
│       ├── PlaidLinkButton.tsx    # "Connect bank" button using react-plaid-link
│       └── ConnectedAccounts.tsx  # List of linked bank items
├── pages/
│   └── banking/
│       └── BankConnections.tsx    # Settings page for managing connections
```

---

## Implementation Steps (for the developer)

### 1. Create a Plaid account

- Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/signup)
- Start in **Sandbox** mode — it's free and uses test credentials
- Navigate to **Team Settings → Keys** to get:
  - `PLAID_CLIENT_ID`
  - `PLAID_SECRET` (use the Sandbox secret initially)
- Set `PLAID_ENV=sandbox` during development

Add to `backend/.env`:

```env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
```

### 2. Install dependencies

```bash
# Backend
cd backend && npm install plaid

# Frontend
cd frontend-1 && npm install react-plaid-link
```

### 3. Backend — initialise Plaid client

```typescript
// backend/src/plaid/plaid.client.ts
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV ?? 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(config);
```

### 4. Backend — link token endpoint

```typescript
// POST /api/plaid/link-token
app.post('/api/plaid/link-token', requireAuth, async (req, res) => {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: req.user.id },
    client_name: 'Fabriq',
    products: ['transactions'],
    country_codes: ['US'],   // adjust for your market
    language: 'en',
  });
  res.json({ link_token: response.data.link_token });
});
```

### 5. Frontend — Link button

```tsx
// frontend-1/src/components/plaid/PlaidLinkButton.tsx
import { usePlaidLink } from 'react-plaid-link';

export function PlaidLinkButton({ linkToken, onSuccess }) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      // send publicToken to your backend
      onSuccess(publicToken, metadata);
    },
  });

  return (
    <button onClick={() => open()} disabled={!ready}>
      Connect a bank account
    </button>
  );
}
```

### 6. Backend — transaction sync → posting rows

```typescript
// backend/src/plaid/plaid.mapper.ts
import { PlaidTransaction } from './types';
import { Posting } from '@prisma/client';

export function mapTransactionToPosting(
  tx: PlaidTransaction,
  orgId: string,
  accountId: string,
): Omit<Posting, 'id' | 'created_at' | 'updated_at'> {
  return {
    org_id: orgId,
    date: new Date(tx.date),
    description: tx.merchant_name ?? tx.name,
    amount: Math.abs(tx.amount),
    debit_credit: tx.amount > 0 ? 'debit' : 'credit',  // Plaid: positive = money leaving
    account_id: accountId,
    external_ref: tx.transaction_id,   // deduplicate on this
    currency_id: tx.iso_currency_code.toLowerCase(),
    status: 'pending_review',          // human review before confirming
  };
}
```

Use `external_ref` with a unique constraint or upsert to prevent duplicate postings if the webhook fires more than once.

### 7. Webhooks for real-time updates

Register a webhook URL in the Plaid Dashboard or in the `linkTokenCreate` call:

```typescript
webhook: 'https://your-fabriq-domain.com/api/plaid/webhook',
```

Handle the `SYNC_UPDATES_AVAILABLE` event:

```typescript
// backend/src/plaid/plaid.webhook.ts
app.post('/api/plaid/webhook', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;

  if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
    await syncTransactionsForItem(item_id);   // pull new txns, map to postings
  }

  res.sendStatus(200);
});
```

> **Webhook verification**: In production, verify the webhook signature using Plaid's JWT verification to prevent spoofed calls. See [Plaid webhook verification docs](https://plaid.com/docs/api/webhooks/webhook-verification/).

---

## Sandbox Testing

Plaid Sandbox provides test institutions and credentials. No real bank account needed:

- **Institution**: `First Platypus Bank`
- **Username**: `user_good`
- **Password**: `pass_good`
- **MFA code**: `1234`

Sandbox also lets you fire test webhook events:

```bash
curl -X POST https://sandbox.plaid.com/sandbox/item/fire_webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "secret": "YOUR_SANDBOX_SECRET",
    "access_token": "access-sandbox-xxx",
    "webhook_code": "SYNC_UPDATES_AVAILABLE"
  }'
```

---

## Security Checklist

- [ ] **Never log `access_token`** — treat it like a password
- [ ] Encrypt `access_token` at rest (AES-256 or use a secrets manager)
- [ ] Scope webhook endpoint: verify Plaid's JWT signature on every call
- [ ] Store `plaid_item` rows scoped to `org_id` — enforce in all queries
- [ ] Provide a UI for users to **disconnect** (revoke) a bank connection
- [ ] Rate-limit `/api/plaid/link-token` per user

---

## Relevant Fabriq Documentation

Before implementing, read these existing docs to understand where Plaid data lands:

| Document | Why it matters |
|----------|---------------|
| [docs/IMPORT_FUNCTIONALITY.md](./IMPORT_FUNCTIONALITY.md) | Existing CSV/PDF import — Plaid should mirror the same `posting` rows it produces |
| [docs/BACKEND.md](./BACKEND.md) | How to add new Express routes and Prisma models following Fabriq conventions |
| [docs/AUTHENTICATION.md](./AUTHENTICATION.md) | How `requireAuth` middleware works; Plaid routes must be protected |
| [docs/BUSINESS_DOMAIN.md](./BUSINESS_DOMAIN.md) | `posting`, `account`, `category` model semantics |
| [docs/ARCHITECTURE.md](./ARCHITECTURE.md) | Overall system design — where a new `plaid/` module fits |
| [CLAUDE.md](../CLAUDE.md) | Project conventions, org_id filtering rules, forbidden DDL commands |

---

## External Learning Resources

### Plaid Fundamentals
- [What is Plaid?](https://plaid.com/resources/banking/what-is-plaid/) — plain-English overview
- [Plaid Products overview](https://plaid.com/products/) — Transactions, Auth, Balance, Identity, etc.
- [How Plaid Link works](https://plaid.com/docs/link/) — the frontend widget explained

### Quickstart & Tutorials
- [Plaid Quickstart (GitHub)](https://github.com/plaid/quickstart) — official repo with Node.js + React example (mirrors this project's stack exactly)
- [Plaid Node.js SDK](https://github.com/plaid/plaid-node) — npm package `plaid`, TypeScript types included
- [react-plaid-link](https://github.com/plaid/react-plaid-link) — official React hook/component for the Link widget
- [Official Plaid API docs](https://plaid.com/docs/api/) — full reference

### Transactions Product (what Fabriq needs)
- [Transactions overview](https://plaid.com/docs/transactions/) — how `/transactions/sync` works
- [Transactions sync guide](https://plaid.com/docs/transactions/sync/) — the recommended cursor-based approach (replaces the older `/transactions/get`)
- [Transaction object reference](https://plaid.com/docs/api/products/transactions/#transaction-object) — all fields

### Webhooks
- [Webhooks overview](https://plaid.com/docs/api/webhooks/) — event types and payloads
- [Webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/) — JWT signature check

### Going to Production
- [Production checklist](https://plaid.com/docs/link/oauth/#production-oauth-checklist) — what Plaid requires before live launch
- [Pricing](https://plaid.com/pricing/) — Transactions product pricing

---

## Plaid vs Alternatives

| Provider | Notes |
|----------|-------|
| **Plaid** | Best US coverage, mature SDK, industry standard |
| [Teller](https://teller.io) | Simpler API, no Link widget needed for some banks |
| [MX](https://www.mx.com) | Enterprise-focused, strong data enrichment |
| [Finicity (Mastercard)](https://www.finicity.com) | Alternative for US open banking |
| [GoCardless / Nordigen](https://bankaccountdata.gocardless.com) | EU/UK banks (PSD2) |

For a Node.js + React stack targeting US/India markets, Plaid is the recommended starting point. For Indian bank accounts, evaluate [Setu AA](https://setu.co/data/account-aggregator) or [Finvu](https://finvu.in) (RBI Account Aggregator framework).

---

*This document is part of the Fabriq developer documentation. See [CLAUDE.md](../CLAUDE.md) for the full docs index.*
