# Invoice PO matching feature review
_Exported on 2/23/2026 at 10:00:20 GMT+5:30 from Cursor (2.5.20)_

---

**User**

@fabriq (Workspace Config)/docs/BUSINESS_DOMAIN.md @fabriq (Workspace Config)/docs/CLAUDE.md 

I want to review the invoice PO matching feature in this app.  Review the frontend flows, @backend/prisma/schema prisma schemas for purchase order and invoice.  There is upload pdf button in the invoice list view which triggers the whole process. 

Review and functionality. I want to brainstorm with you and implement it in the right way. 

---

**Cursor**

I'll start by reviewing the business domain docs, Prisma schemas, and frontend code related to invoice/PO matching. Let me gather all the context first.

Now let me find the Prisma schema files and the frontend code for invoice/PO.

Now let me find the invoice and purchase order schemas, and the frontend components.

Now let me read the key implementation files to understand the full flow in detail.

Now let me read the agent-side PO matching logic and the invoice form components.

Now I have a thorough understanding of the entire flow. Let me present my review.

---

## Invoice PO Matching - Full Review

### End-to-End Flow (Current State)

Here's how the feature works today:

**Step 1: Invoice List** (`Invoice.tsx`)
- "Upload PDF" button navigates to `/purchases/bills/upload`

**Step 2: PDF Upload & Extraction** (`InvoiceUpload.tsx`)
- User uploads PDF via drag-and-drop
- Calls `agentAPI.extract()` with `promptTypes: ['invoice_extractor']`
- This routes through the **AI Agent** backend (`AgentTools.ts` -> `processInvoiceFromPdfTool`)

**Step 3: Backend Processing** (`AgentTools.ts`, lines 1093-1291)
1. `InvoiceExtractor` (LLM-based) extracts invoice header + line items from PDF
2. If a `po_number` is found, searches for a matching `purchase_order` in the DB
3. If PO found, retrieves `purchase_order_item` records
4. Runs `findBestPOMatch()` to score-match invoice line items to PO line items (name: 50pts, partial name: 30pts, rate: 20pts, quantity: 15pts)
5. Returns structured data with `aiMapping` suggestions per line item

**Step 4: Review & Create** (`InvoiceUpload.tsx`)
- Shows extracted invoice header (number, date, supplier, PO number, totals)
- Shows line items in a read-only table
- If PO was found, shows a "Create with PO" checkbox
- "Create Invoice" button creates the invoice + line items via API
- Uploads original PDF as attachment
- Redirects to invoice form at `/purchases/bills/{id}/state/Draft`

**Step 5: Post-Creation PO Matching** (`InvoiceLineItems.tsx` + `InvoiceLineItemRow.tsx`)
- Each line item shows a dropdown to map to PO line items
- Unmapped items show "Map to PO item" in amber
- On selection, shows `InvoiceLineItemComparisonDialog` comparing rate, tax rate, line total between invoice and PO
- User can choose "Use Invoice Values" or "Use PO Item Values"
- Quantity validation against PO available quantity (prevents over-invoicing)

### Prisma Schema Relationships

```
purchase_order (1) ──> (N) purchase_order_item
       │                        │
       │ purchase_order_id      │ purchase_order_item_id
       ▼                        ▼
    invoice (1) ──────> (N) invoice_line_item
```

Key fields on `invoice`: `purchase_order_id`, `purchase_order_item_id`, `po_number`
Key fields on `invoice_line_item`: `purchase_order_item_id` (maps to PO line item)

---

### Issues & Gaps I've Identified

**1. AI matching suggestions are generated but never used**
The backend's `findBestPOMatch()` returns `aiMapping` with `suggestedPoItemId`, `matchConfidence`, and `matchReason` per line item. But `InvoiceUpload.tsx` ignores these completely -- it creates line items without any PO mapping, leaving all mapping to manual post-creation work.

**2. The "Create with PO" flow doesn't pass line-item-level PO mappings**
When `createWithPO` is true, `handleCreateInvoice` only sets `purchase_order_id` and `po_number` on the invoice header. Individual line items are created without `purchase_order_item_id`, so users must manually map every single line item after creation.

**3. Line items are created sequentially (one API call per item)**
`handleCreateInvoice` loops through line items with `await viewAPI.addChild()` for each one. For invoices with many line items, this is slow and error-prone (partial creation on failure).

**4. No edit capability on the upload preview**
The extraction preview is read-only. Users can't correct OCR mistakes in the extracted data before creating the invoice. They must create it first, then navigate to the form to fix things.

**5. No supplier resolution**
`supplier_name` is extracted as a string but never resolved to a `supplier` record. The invoice is created without a supplier FK link.

**6. `invoice_type` is hardcoded to `'With PO'`**
Line 353 of `InvoiceUpload.tsx` always sets `invoice_type: 'With PO'` regardless of whether a PO was found or the user opted out.

**7. Duplicate PO line item matching has redundant checks**
`handlePOItemSelection` and `handleItemSelection` in `InvoiceLineItemRow.tsx` both independently check for duplicates, and `handleItemChange` in `InvoiceLineItems.tsx` also checks. This triple-check is defensive but adds complexity.

---

### What's Working Well

- The **comparison dialog** is excellent -- it visually shows rate/tax/total differences and lets users choose invoice vs PO values
- **Quantity validation** properly handles draft vs non-draft states and prevents over-invoicing
- The **PDF preview dialog** is a nice touch for verifying extraction
- **Agent-based extraction** is flexible and allows both direct upload and chat-initiated flows
- The `findBestPOMatch` scoring algorithm is reasonable for fuzzy matching

---

I'd suggest switching to Plan mode so we can brainstorm the right approach before implementing changes. The main question is: what's the highest-priority improvement you want to tackle? Some options:

1. **Auto-apply AI PO mappings during creation** -- Use the `aiMapping` suggestions to create line items already linked to PO items
2. **Editable extraction preview** -- Let users correct extracted data before creating
3. **Batch line item creation** -- Single API call instead of sequential
4. **Supplier resolution** -- Match extracted supplier name to existing supplier records
5. **Better upload-to-form handoff** -- Navigate to form with pre-filled data instead of creating immediately

What's your priority, or shall we discuss the approach for the whole feature?

