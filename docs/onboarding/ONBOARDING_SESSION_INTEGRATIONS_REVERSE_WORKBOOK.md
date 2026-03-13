# Session: ERP Integrations — Reverse Sync (Zoho Books & Purchase Order Workflow)

**Duration**: 2.5 hours  
**Objective**: Understand how Fabriq pushes data to external ERPs via workflow side effects, trace the Purchase Order → Zoho Books sync path, and enable/verify the integration.

**Prerequisites**: Sessions 1–3 completed; completion of the [Forward Sync workbook](ONBOARDING_SESSION_INTEGRATIONS_WORKBOOK.md) is helpful but not required.

**📖 Learning Material**: [docs/INTEGRATIONS.md](../INTEGRATIONS.md) (Reverse Sync section), [docs/WORKFLOWS.md](../WORKFLOWS.md)

---

## Part 0: Prerequisites — Data Setup for PO → Zoho Sync (15 min)

Reverse sync sends the **Fabriq** PO to Zoho Books. Zoho’s API requires a **vendor ID** and, for each line, optionally an **item ID** and **account ID**. Those IDs must be the **Zoho** IDs. In Fabriq, they come from records that were **synced from Zoho (forward sync)** and therefore have `source_record_id` set to the Zoho ID.

### Why This Fails Otherwise

If you approve a PO whose **supplier** was created only in Fabriq (e.g. demo CSV) and never synced from Zoho, the connector has no Zoho vendor ID to send. It will throw:

```
Supplier does not have a Zoho vendor_id (source_record_id).
Please ensure the supplier is synced from Zoho first.
```

The same idea applies to **line item products** and **purchase accounts**: if they have `source_record_id` (from forward sync), the mapper sends proper Zoho `item_id` and `account_id`; otherwise it may use defaults or fail depending on configuration.

### What Must Be True

| Data | Requirement | Reason |
|------|-------------|--------|
| **Supplier** | The PO’s supplier must have `source_record_id` and `source_system_id` set. | Zoho API requires `vendor_id`; the mapper uses `supplier_details.source_record_id`. |
| **Line items** | At least one; product (item_master) and purchase account can optionally have `source_record_id`. | Zoho accepts line name/rate/quantity without item_id; with item_id/account_id the PO matches Zoho’s catalog. |

So: **the supplier on the PO must be one that came from Zoho (forward sync)** — i.e. from `datalake.zb_contacts` (vendor-type) → DBT → `public.supplier` with `source_record_id` = Zoho contact ID.

### How to Ensure Data Is Set Up

**Option A: Run forward sync first (recommended)**

1. Run the [Forward Sync workbook](ONBOARDING_SESSION_INTEGRATIONS_WORKBOOK.md) so that Zoho contacts (vendors), items, and accounts are synced into `public.supplier`, `public.item_master`, and `public.account`.
2. In Fabriq, create (or use) a **Purchase Order** whose **supplier** is one of those synced suppliers. Use synced items on the lines if you want full Zoho item/account mapping.
3. Then run the Approve action; the connector will find `supplier_details.source_record_id` and send it as `vendor_id`.

**Option B: Verify existing data**

Check that the PO’s supplier has a Zoho identity:

```sql
-- Suppliers that have been synced from Zoho (have Zoho contact ID)
SELECT id, supplier_name, source_record_id, source_system_id
FROM supplier
WHERE org_id = 'org_indian_demo'
  AND source_record_id IS NOT NULL
  AND source_system_id IS NOT NULL;
```

If the list is empty, run forward sync (Option A). If your PO uses a supplier not in this list, change the PO to use a synced supplier, or create a new PO with a synced supplier.

**Option C: Manual fix for testing only**

If you must use a supplier that was never synced (e.g. demo CSV), you can point it at an existing Zoho vendor by setting its Zoho identity in the database. In Zoho Books, get the vendor’s contact ID (e.g. from the Contacts/Vendors URL or API). Then:

```sql
-- Replace SUPPLIER_ID and ZOHO_CONTACT_ID with real values
UPDATE supplier
SET source_record_id = 'ZOHO_CONTACT_ID',
    source_system_id = (SELECT id FROM source_system WHERE system_type = 'zoho_books' AND is_active = true LIMIT 1)
WHERE id = 'SUPPLIER_ID' AND org_id = 'org_indian_demo';
```

Use this only for local/testing; in real setups suppliers should come from forward sync.

### Checklist Before Testing Approve

- [ ] Forward sync has been run so that `public.supplier` has at least one row with `source_record_id` and `source_system_id` set (for your org).
- [ ] The PO you will approve uses that supplier (or another supplier that has `source_record_id` set).
- [ ] (Optional) Line items use products from `public.item_master` with `source_record_id` if you want Zoho item/account mapping; otherwise the mapper can still send name/rate/quantity and use default account if configured.

---

## Part 1: Reverse Sync Architecture Overview (25 min)

### 1.1 Read Before You Start

Read these sections:

- **[INTEGRATIONS.md](../INTEGRATIONS.md)** — "Reverse Sync (Fabriq → ERP)": Overview, Architecture, Key Components, Directory Structure, Configuration
- **[WORKFLOWS.md](../WORKFLOWS.md)** — "Side Effects System", "Workflow Action Map (Available Methods)"

Key distinction:

| Direction   | Trigger              | Technology        | Location                        |
|------------|----------------------|-------------------|----------------------------------|
| **Forward**  | Scheduled / Airbyte  | Python + DBT      | `backend/integrations/`         |
| **Reverse**  | Workflow transition  | Node.js side-effect | `backend/src/lib/integrations/` |

This session focuses entirely on **Reverse Sync**, and specifically **syncing a Purchase Order to Zoho Books when the PO is approved**.

### 1.2 The Reverse Sync Data Flow (PO Example)

```
User clicks "Approve" on a PO (PO Pending Approval → PO Issued)
  ↓
WorkflowEngine.executeTransition(...)
  ↓
SideEffectExecutor runs action.side_effects
  ↓
workflowActionMap['sync_po_to_erp'] → sync_purchase_order(...)
  ↓
sync_purchase_order: load org.erp_system_type, find source_system, create connector
  ↓
createERPConnector(connectionId) → ZohoBooksConnector (or QuickBooksConnector)
  ↓
connector.createPurchaseOrder(fabriqPO, tx) → Zoho Books API
  ↓
Fabriq PO updated: source_record_id, source_system_id, sync_status = 'synced'
```

No Python, no DBT. The trigger is a **workflow action**; the implementation is **Node.js** using the same encrypted credentials in `public.source_system` that forward sync uses.

### 1.3 Configuration Prerequisites

For PO → Zoho sync to work, three things must be in place:

| Requirement | Where it's set | Purpose |
|-------------|----------------|--------|
| **Org ERP type** | `org.erp_system_type` (e.g. `zoho_books`) | Tells the action which ERP to use for that tenant |
| **ERP connection** | `public.source_system` (one row per org + system_type) | Encrypted OAuth credentials and connection metadata |
| **Workflow side effect** | `workflow_action.side_effects` for the "Approve" action | Registers `sync_po_to_erp` and must have `enabled: true` |

The Indian demo setup (`backend/prisma/setup-IN/setup-indian-demo.ts`) sets (1) and (2). The workflow setup (`backend/prisma/setup-workflows.ts`) sets (3), but the PO sync effect is **disabled by default** (`enabled: false`). You will see how to enable it in Part 4.

---

## Part 2: Explore the Reverse Integration Code (30 min)

### 2.1 Directory Structure

Open the **Node.js** integration directory (not the Python one):

```
backend/src/lib/integrations/
├── connectors/                      # Shared: interface + factory
│   ├── index.ts                    # createERPConnector(connectionId)
│   └── types.ts                    # ERPConnector interface
├── shared/                         # Shared utilities
│   ├── erp-connection-loader.ts   # Load/decrypt config from DB
│   └── encryption.ts               # AES-256-CBC (same as Python)
├── zoho_books/                     # Zoho Books implementation
│   ├── connectors/
│   │   └── purchase_order_connector.ts   # ZohoBooksConnector
│   ├── mappers/
│   │   └── purchase_order_mapper.ts      # Fabriq PO → Zoho JSON
│   └── zoho_api_client.ts          # OAuth refresh + HTTP calls
└── quickbooks/                     # QuickBooks (same pattern)
    └── connectors/
        └── purchase_order_connector.ts
```

**Exercise**: In Cursor, open each file below and answer the question.

| File | Question to answer |
|------|--------------------|
| `connectors/types.ts` | What methods does `ERPConnector` require? (e.g. `createPurchaseOrder`) |
| `connectors/index.ts` | Given a `connectionId`, how does the factory choose Zoho vs QuickBooks? |
| `zoho_books/connectors/purchase_order_connector.ts` | What does `createPurchaseOrder` return? (externalId, externalNumber, systemId) |
| `zoho_books/mappers/purchase_order_mapper.ts` | What Fabriq fields map to Zoho `vendor_id` and `line_items`? |

### 2.2 Where the Workflow Hooks In

The workflow engine does not know about Zoho or any ERP by name. It only knows **method names** from a registry.

Open `backend/src/lib/actions.ts` and find:

```typescript
export const workflowActionMap: Record<string, any> = {
  // ...
  sync_po_to_erp: sync_purchase_order
};
```

So when a workflow action has:

```json
{ "type": "database", "config": { "method": "sync_po_to_erp" } }
```

the engine calls `sync_purchase_order(context, model, instance_id, ...)`.

Open `backend/src/lib/actions/purchase_order.ts` and trace the flow:

1. How does it get `org.erp_system_type`?
2. How does it find the right `source_system` row?
3. How does it get a connector and call `createPurchaseOrder`?
4. What does it write back to the Fabriq `purchase_order` record after a successful sync?

- [ ] Located `workflowActionMap` and `sync_po_to_erp`
- [ ] Traced `sync_purchase_order` from org/connection lookup to connector call and PO update

---

## Part 3: Workflow Configuration (25 min)

### 3.1 PO Workflow Definition

The Purchase Order workflow is created by `backend/prisma/setup-workflows.ts` (run as part of `node setup-db.js` or manually).

Open `backend/prisma/setup-workflows.ts` and find the function `setupPurchaseOrderWorkflow`. Note:

- **States**: Pending PO Creation (initial) → PO Pending Approval → **PO Issued** (final), and PO Cancelled
- **Key transition**: "Approve" (PO Pending Approval → PO Issued)

### 3.2 Side Effects on "Approve"

In the same file, find the `workflow_action.create` call for the "Approve" action (source state = PO Pending Approval, target state = PO Issued). The `side_effects` payload looks like:

```javascript
side_effects: {
  effects: [
    { type: 'database', config: { method: 'sync_po_to_erp' }, enabled: false },
    { type: 'database', config: { method: 'send_workflow_notification_email' } },
    { type: 'database', config: { method: 'generate_invoice_from_po' } }
  ]
}
```

- **`sync_po_to_erp`** — Pushes the PO to Zoho Books (or other ERP). **Disabled by default** (`enabled: false`).
- **`send_workflow_notification_email`** — Optional notification.
- **`generate_invoice_from_po`** — Creates an invoice from the PO in Fabriq.

Per [WORKFLOWS.md](../WORKFLOWS.md), any effect with `enabled: false` is skipped. So out of the box, **approving a PO does not sync it to Zoho** until this effect is enabled.

### 3.3 Where Org and Connection Are Set (Indian Demo)

Open `backend/prisma/setup-IN/setup-indian-demo.ts`:

- **Section 1 (Org data)**: `org.csv` is loaded; each org has `erp_system_type` (e.g. `zoho_books`). Confirm in `backend/prisma/setup-IN/org.csv` that `erp_system_type` is set for your demo org.
- **Section 2.6 (Zoho Books ERP connection)**: Creates or updates a row in `public.source_system` for `org_indian_demo` with `system_type: 'zoho_books'` and encrypted `connection_config` (OAuth from env: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, etc.). Requires `ERP_CONFIG_ENCRYPTION_KEY` in env.

So for Indian demo:

- Org ERP type and Zoho connection are set by setup-indian-demo.
- The only missing piece for reverse sync is **enabling** the `sync_po_to_erp` side effect (see Part 4).

- [ ] Found the "Approve" action and its `side_effects` in `setup-workflows.ts`
- [ ] Confirmed `org.erp_system_type` and Zoho connection setup in `setup-indian-demo.ts`

---

## Part 4: Enabling PO → Zoho Sync (30 min)

### 4.1 Option A: Enable in Workflow Setup Script (Recommended for New Setups)

Edit `backend/prisma/setup-workflows.ts`. In the "Approve" action's `side_effects.effects`, change the first effect from:

```javascript
{ type: 'database', config: { method: 'sync_po_to_erp' }, enabled: false }
```

to:

```javascript
{ type: 'database', config: { method: 'sync_po_to_erp' }, enabled: true }
```

Then **re-create the PO workflow** (or only that action) so the DB gets the updated config. The script has a guard that skips creation if the flow already exists:

```javascript
const existingPOFlow = await prisma.workflow_flow.findFirst({
  where: { name: 'Purchase Order Approval' }
});
if (existingPOFlow) {
  console.log('  ⏭️  Purchase Order workflow already exists. Skipping.');
  return;
}
```

So if the workflow was already created earlier, this code change alone won’t update the existing row. Use Option B to enable it in an existing database.

### 4.2 Option B: Enable in Existing Database

If the Purchase Order workflow is already created and you don’t want to drop/recreate it, update the action’s `side_effects` in the database.

1. Find the workflow action ID for "Approve" (source = PO Pending Approval, target = PO Issued):

```sql
SELECT wa.id, wa.name, wa.side_effects
FROM workflow_action wa
JOIN workflow_state ss ON wa.source_state_id = ss.id
JOIN workflow_state ts ON wa.target_state_id = ts.id
JOIN workflow_flow f ON ss.flow_id = f.id
WHERE f.model_name = 'purchase_order'
  AND ss.name = 'PO Pending Approval'
  AND ts.name = 'PO Issued'
  AND wa.name = 'Approve';
```

2. Update that action’s `side_effects` so the `sync_po_to_erp` effect has `"enabled": true`. For example (replace `wact_xxx` with the actual `id`):

```sql
UPDATE workflow_action
SET side_effects = jsonb_set(
  side_effects,
  '{effects,0,enabled}',
  'true'::jsonb
)
WHERE id = 'wact_xxx';
```

(Exact path may vary depending on how the JSON is stored; adjust the index or key if your structure differs.)

### 4.3 Verify Configuration

Before testing end-to-end, confirm:

**Org has ERP type:**

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, name, erp_system_type FROM public.org WHERE id = 'org_indian_demo';"
```

Expected: `erp_system_type` = `zoho_books` (or your target ERP).

**Connection exists and is active:**

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, org_id, system_type, is_active FROM public.source_system WHERE system_type = 'zoho_books';"
```

Expected: At least one row with `is_active = true` for your org.

**Effect enabled (if you used Option B):**

```sql
SELECT side_effects->'effects'->0->'enabled' AS sync_po_enabled
FROM workflow_action wa
JOIN workflow_state ss ON wa.source_state_id = ss.id
JOIN workflow_flow f ON ss.flow_id = f.id
WHERE f.model_name = 'purchase_order' AND wa.name = 'Approve';
```

Expected: `true` (or the effect at index 0 is `sync_po_to_erp` with `enabled: true`).

- [ ] Enabled `sync_po_to_erp` (Option A or B)
- [ ] Verified org `erp_system_type` and active `source_system` row

---

## Part 5: End-to-End Test (25 min)

### 5.1 Prerequisites

- **Data setup (Part 0)**: The PO’s **supplier** must have `source_record_id` set (i.e. synced from Zoho). Otherwise you’ll get: *"Supplier does not have a Zoho vendor_id (source_record_id). Please ensure the supplier is synced from Zoho first."* Run forward sync and use a supplier from that sync, or follow Part 0 Option B/C.
- Backend and frontend running (`npm run dev` in `backend` and `frontend-1`).
- Logged in as a user with Buyer (or equivalent) role that can approve POs.
- At least one Purchase Order in state **PO Pending Approval** (create from a PR and submit the PO, or use existing demo data), and that PO uses a **synced supplier** (see above).
- Zoho Books connection configured and valid (so the API call can succeed).

### 5.2 Run the Test

1. Open the Purchase Order in the Fabriq UI (e.g. Procurement or approval dashboard).
2. Ensure the PO is in **PO Pending Approval**.
3. Click **Approve** (or the action that transitions to PO Issued).
4. Watch backend logs for:
   - Log lines from `sync_purchase_order` (e.g. "Syncing purchase order to external system (zoho_books)").
   - Success: "Successfully synced purchase order to zoho_books" with `externalPoId` and `externalPoNumber`.
   - On failure: Error message and stack; PO may be updated to `sync_status: 'failed'`.

### 5.3 Verify in Database

After a successful sync:

```sql
SELECT id, po_number, source_record_id, source_system_id, sync_status
FROM purchase_order
WHERE id = '<your_po_id>';
```

Expected: `source_record_id` = Zoho purchase order ID, `source_system_id` = your `source_system.id`, `sync_status` = `synced`.

Optional: In Zoho Books, open Purchase Orders and confirm the new PO exists (e.g. by number or date).

### 5.4 Idempotency

The action skips sync if the PO is already synced:

```typescript
if (purchaseOrder.source_record_id && purchaseOrder.sync_status === 'synced') {
  logger.info('Purchase order already synced to external system', ...);
  return;
}
```

So approving the same PO again (if the UI allows) should not create a duplicate in Zoho.

- [ ] Approved a PO and saw sync logs (and no errors)
- [ ] Confirmed `source_record_id`, `source_system_id`, and `sync_status` on the PO
- [ ] Optionally confirmed the PO in Zoho Books

---

## Part 6: Trace the Full Code Path (20 min)

### 6.1 From UI to Side Effect

1. **Frontend**: User clicks Approve → API `POST /api/workflow/instances/:instanceId/actions/:actionId`.
2. **Backend**: Workflow route calls `WorkflowEngine.executeTransition(context, action, authContext)`.
3. **WorkflowEngine**: In a transaction, creates history, updates instance state, then calls `SideEffectExecutor.execute(action.side_effects, context, authContext, tx)`.
4. **SideEffectExecutor**: For each effect with `enabled !== false`, resolves the method name (e.g. `sync_po_to_erp`) from `workflowActionMap` and invokes it with `(context, model_name, model_id, ...)`.

So the chain is: **API → WorkflowEngine → SideEffectExecutor → workflowActionMap['sync_po_to_erp']** → `sync_purchase_order`.

### 6.2 From sync_purchase_order to Zoho

In `backend/src/lib/actions/purchase_order.ts`, `sync_purchase_order`:

1. Reads `org.erp_system_type` for the user’s org.
2. Finds `source_system` by `org_id` and `system_type` (e.g. `zoho_books`).
3. Calls `createERPConnector(connection.id)` → returns `ZohoBooksConnector` (or QuickBooks).
4. Loads the full PO (supplier, items, product, location, etc.).
5. Calls `connector.createPurchaseOrder(purchaseOrder, tx)`.
6. Updates the PO with `source_record_id`, `source_system_id`, `sync_status: 'synced'`.

The **ZohoBooksConnector** (`zoho_books/connectors/purchase_order_connector.ts`):

- Uses `ZohoBooksAPIClient` (OAuth refresh + HTTP).
- Maps Fabriq PO to Zoho format via `mapPurchaseOrderToZoho`.
- Calls Zoho Books API to create the purchase order.
- Returns `{ externalId, externalNumber, systemId }` for the action to persist.

### 6.3 Optional: default_purchase_account_id

Zoho line items often need an expense/purchase account. The connector can use `default_purchase_account_id` on the `source_system` row (if your schema has it). Check `backend/src/lib/integrations/zoho_books/connectors/purchase_order_connector.ts` and the mapper for how that value is used; if you use a default account in Zoho, set it on the connection or in the mapper’s fallback.

- [ ] Traced the path from Approve click → WorkflowEngine → SideEffectExecutor → sync_purchase_order → createERPConnector → ZohoBooksConnector.createPurchaseOrder
- [ ] Understood where Fabriq PO is updated after a successful Zoho create

---

## Part 7: Common Issues & Troubleshooting (10 min)

| Issue | Cause | What to do |
|-------|--------|------------|
| **"Supplier does not have a Zoho vendor_id (source_record_id). Please ensure the supplier is synced from Zoho first."** | The PO’s supplier has no `source_record_id` (it was never synced from Zoho). Zoho API requires a vendor ID; the connector sends `supplier_details.source_record_id`. | Run **forward sync** so that Zoho contacts (vendors) populate `public.supplier` with `source_record_id`. Use one of those suppliers on the PO. Or see Part 0 Option B/C (verify synced suppliers, or manual fix for testing). |
| **PO approves but nothing happens in Zoho** | `sync_po_to_erp` is disabled (`enabled: false`). | Enable the effect (Part 4 Option A or B). |
| **"ERP system type is not configured for organization"** | `org.erp_system_type` is null or wrong. | Set `erp_system_type` (e.g. `zoho_books`) for that org (e.g. via setup-indian-demo or DB). |
| **"No active ERP connection found"** | No `source_system` row for that org + system_type, or `is_active = false`. | Run Zoho connection setup (e.g. setup-indian-demo §2.6 with env vars and `ERP_CONFIG_ENCRYPTION_KEY`), or add connection via UI/API. |
| **"Connection not found" / "Invalid connection_config"** | Wrong connection ID or decryption failure. | Ensure `ERP_CONFIG_ENCRYPTION_KEY` matches the key used when the connection was stored; verify `source_system` row exists and is active. |
| **Zoho API 401 / token errors** | Expired or invalid OAuth tokens. | Refresh or re-create the Zoho connection (same credentials as forward sync); ensure redirect URI and scopes in Zoho API Console are correct. |
| **Workflow transition fails with "sync_po_to_erp" error** | Sync runs inside the same transaction as the transition; any throw rolls back the transition. | Fix the underlying error (e.g. mapping, validation, or Zoho API); check backend logs and PO `sync_status: 'failed'` if the action updates it before rethrowing. |

---

## Part 8: Completion Checklist

### Concepts
- [ ] Can explain Forward vs Reverse sync and where each lives (Python/DBT vs Node/workflow).
- [ ] Can describe the Connector Factory pattern: generic action → org/connection → factory → Zoho/QuickBooks connector.
- [ ] Know the three configuration pieces: `org.erp_system_type`, `source_system` row, and workflow side effect `enabled: true`.

### Code
- [ ] Found `workflowActionMap.sync_po_to_erp` and `sync_purchase_order` in `actions.ts` / `actions/purchase_order.ts`.
- [ ] Found `createERPConnector` and the Zoho/QuickBooks switch in `integrations/connectors/index.ts`.
- [ ] Located the "Approve" action and its `side_effects` in `setup-workflows.ts`.

### Configuration
- [ ] Verified `org.erp_system_type` and active `source_system` for the demo org.
- [ ] Enabled `sync_po_to_erp` for the PO Approve action (script or DB).

### Data (Part 0)
- [ ] Confirmed at least one supplier has `source_record_id` and `source_system_id` (from forward sync), or applied manual fix for testing.
- [ ] PO used for the test has that supplier (or another synced supplier) assigned.

### Test
- [ ] Approved a PO and confirmed in logs and DB that it synced (`source_record_id`, `sync_status`).
- [ ] Optionally confirmed the PO in Zoho Books.

---

## Self-Reading Resources

### Workflows & Side Effects
- **[WORKFLOWS.md](../WORKFLOWS.md)** — Full workflow engine doc: states, actions, side effects, `workflowActionMap`, variable resolution.
- **Backend**: `backend/src/workflow-engine/core/SideEffectExecutor.ts` — How effects are executed and how `workflowActionMap` is used.

### Reverse Sync Architecture
- **[INTEGRATIONS.md](../INTEGRATIONS.md)** — Reverse Sync section, Credentials Management, Zoho Books implementation details.
- **Backend**: `backend/src/lib/actions/purchase_order.ts` — Full sync logic and error handling.
- **Backend**: `backend/src/lib/integrations/connectors/index.ts` — Factory and supported ERPs.

### Zoho Books
- **[Zoho Books API — Purchase Orders](https://www.zoho.com/books/api/v3/purchase-orders/)** — Create purchase order endpoint and payload.
- **Backend**: `backend/src/lib/integrations/zoho_books/mappers/purchase_order_mapper.ts` — Field mapping Fabriq → Zoho.
- **Backend**: `backend/src/lib/integrations/zoho_books/zoho_api_client.ts` — OAuth and HTTP.

### Setup Scripts
- **Indian demo**: `backend/prisma/setup-IN/setup-indian-demo.ts` — Org and Zoho connection setup.
- **Workflows**: `backend/prisma/setup-workflows.ts` — PO workflow and side effects definition.

---

**End of Reverse Integration Session Workbook**
