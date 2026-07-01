# Business Test Suite

Runnable Jest suite for **core business logic** — masters, procurement, sales, invoices, reports, permissions, and setup verification.

**Excluded** (run separately or not in CI by default):

| Category | Path / pattern | Why excluded |
|----------|----------------|--------------|
| Agent core | `src/agent/__tests__/` | LLM sessions, prompts, E2E agent flows |
| Agent HTTP | `src/__tests__/agent/` | Agent routes, email, analytics |
| Prompt harness | `posting-prompt`, `posting-sample-questions` | Real LLM calls; manual tuning |
| Zoho Books | `integrations/zoho_books/`, `purchase-order-zoho.test.ts` | External ERP integration |
| QuickBooks | `purchase-order-quickbooks.test.ts` | External ERP integration |
| Import | `src/__tests__/import/` | Bank statement import pipelines |
| Broker | `src/__tests__/broker/` | Questrade / broker sync |

---

## Run the suite

```bash
cd backend
npm run test:suite
```

With demo config:

```bash
TEST_CONFIG=indian-demo npm run test:suite
TEST_CONFIG=us-ca-demo npm run test:suite
```

Single file:

```bash
npm run test:suite -- src/__tests__/customers/customers.test.ts
```

---

## Included test files

| Module | File |
|--------|------|
| **Customers** | `customers/customers.test.ts` |
| **Supplier** | `supplier/supplier.test.ts` |
| **Item master** | `item-master/item-master.test.ts` |
| **Location** | `location/location.test.ts` |
| **Purchase requisition** | `purchase-requisition/purchase-requisition.test.ts` |
| **Purchase order** | `purchase-order/purchase-order-creation.test.ts` |
| | `purchase-order/purchase-order-workflow.test.ts` |
| | `purchase-order/purchase-order-from-requisition.test.ts` |
| **Purchase invoice (bills)** | `invoice/purchase-invoice-workflow.test.ts` |
| | `invoice/purchase-invoice-workflow-transitions.test.ts` |
| **Sales order** | `sales-order/sales-order.test.ts` |
| **Sales invoice** | `sales-invoice/direct-invoice.test.ts` |
| **Quote** | `quote/quote.test.ts` |
| **Delivery challan** | `delivery-challan/delivery-challan.test.ts` |
| **Credit note** | `credit-note/credit-note.test.ts` |
| **Payment receipt** | `payment-receipt/payment-receipt.test.ts` |
| **Reports** | `reports/income-statement.test.ts` |
| | `reports/cash-flow.test.ts` |
| **Permissions** | `permissions/PermissionService.test.ts` |
| **Email** | `email/sendEmail.test.ts` |
| **Setup / migration** | `setup/verification-suite.test.ts` |
| | `setup/migration-journal.test.ts` |

---

## Excluded — how to run manually

```bash
# Agent tests
npm test -- --testPathPattern=src/agent/__tests__

# Prompt harness (real LLM)
npm run test:posting-prompt
npm run test:posting-sample-questions

# Zoho / QuickBooks
npm test -- src/__tests__/integrations/zoho_books/zoho_books.test.ts
npm test -- src/__tests__/purchase-order/purchase-order-zoho.test.ts
npm test -- src/__tests__/purchase-order/purchase-order-quickbooks.test.ts

# Import
npm test -- src/__tests__/import/
npm run test:import-api-key

# Broker
npm test -- src/__tests__/broker/
```

---

## Configuration

- Jest config: [`backend/jest.config.suite.js`](../../../jest.config.suite.js)
- Default Jest config: [`backend/jest.config.js`](../../../jest.config.js)
- Env: `backend/src/__tests__/env-setup.ts` loads `.env.test` then `.env`
- Test data: `backend/src/__tests__/test-configs/*.json` via `TEST_CONFIG`
