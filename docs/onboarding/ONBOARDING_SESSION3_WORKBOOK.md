# Session 3: Hands-On Exercise - Explore Existing Models
## Developer Onboarding Workbook

**Duration**: 1 hour  
**Objective**: Get familiar with existing models and their structure through hands-on exploration.

---

## Prerequisites

Before starting, ensure you have:

- [ ] Completed Session 2 (Understanding Metadata-Driven Framework)
- [ ] Backend server running
- [ ] Frontend server running
- [ ] Prisma Studio accessible (`cd backend && npx prisma studio`)
- [ ] Can login to the application

---

## Part 1: Understanding Model Types

**Time**: 10 minutes

### Model Categories

In Fabriq, models fall into different categories:

1. **Master Data Models**: Reference data that doesn't change often
   - Examples: `supplier`, `customer`, `item_master`, `payment_terms`
   - Characteristics: Simple structure, no workflow, used by other models

2. **Transactional Models**: Business transactions with workflow
   - Examples: `purchase_requisition`, `purchase_order`, `invoice`, `sales_order`
   - Characteristics: Have `wf_instance_id`, workflow-enabled, complex relationships

3. **Line Item Models**: Detail records for transactions
   - Examples: `purchase_order_item`, `invoice_line_item`, `sales_order_item`
   - Characteristics: Belong to a parent transaction, many-to-one relationship

### Exercise 1: Identify Model Types

**Task**: Categorize models you've seen

1. **Open Prisma Schema**:
   ```bash
   cd backend
   # Open in Cursor: backend/prisma/schema/data.prisma
   ```

2. **Find and categorize**:
   - List 3 master data models
   - List 3 transactional models
   - List 2 line item models

**Example Answer**:
- Master Data: `supplier`, `customer`, `item_master`
- Transactional: `purchase_requisition`, `invoice`, `sales_order`
- Line Items: `purchase_order_item`, `invoice_line_item`

- [ ] Can identify master data models
- [ ] Can identify transactional models
- [ ] Can identify line item models

---

## Part 2: Explore Supplier Model (Master Data)

**Time**: 15 minutes

### Exercise 2: Examine Supplier Model Structure

**Step 1: Find the Model**

1. **Open Prisma Schema**:
   - Navigate to: `backend/prisma/schema/data.prisma`
   - Search for: `model supplier`

2. **Examine the Model**:
   ```prisma
   model supplier {
     id          String   @id @default(dbgenerated("'supp_' || gen_random_uuid()"))
     created_by  String?
     modified_by String?
     created_at  DateTime @default(now())
     modified_at DateTime @updatedAt
     org_id      String?
     
     supplier_name String
     email         String?  @unique
     phone         String?
     address       String?
     
     // Relations
     payment_term_id String?
     payment_terms   payment_terms? @relation(...)
     
     @@map("supplier")
   }
   ```

3. **Document Your Findings**:
   - Standard fields: `id`, `created_by`, `modified_by`, `created_at`, `modified_at`, `org_id`
   - Business fields: `supplier_name`, `email`, `phone`, `address`
   - Relations: `payment_terms` (many-to-one)
   - Constraints: `email` is unique

**Step 2: Check the View**

1. **Open Prisma Studio**:
   ```bash
   cd backend
   npx prisma studio
   ```

2. **Navigate to `view` table**:
   - Find `supplier_view`
   - Click to view details

3. **Examine `data_graph`**:
   ```json
   {
     "select": {
       "id": true,
       "supplier_name": true,
       "email": true,
       "phone": true,
       "address": true,
       "payment_terms": {
         "select": {
           "id": true,
           "payment_terms": true
         }
       }
     }
   }
   ```

4. **Compare with Model**:
   - Which model fields are included in the view?
   - Which fields are NOT included?
   - What relations are included?

**Step 3: Check Permissions**

1. **In Prisma Studio, navigate to `permission` table**

2. **Filter by view**:
   - Filter: `view_id = 'supplier_view'`
   - See all permissions

3. **Document permissions**:
   - Is there a wildcard permission (`*`)?
   - Are there specific field permissions?
   - What access level (read/write)?

**Step 4: Test in UI**

1. **Navigate to Suppliers page** in the application
2. **View the list**:
   - What columns are shown?
   - Do they match the view's `data_graph`?

3. **Create a new supplier**:
   - Click "Create" button
   - Fill in the form
   - Submit

4. **Verify in Database**:
   - Go back to Prisma Studio
   - Navigate to `supplier` table
   - Find your new record
   - Verify:
     - `org_id` is set (matches your user's org)
     - `created_by` is set (your user ID)
     - All fields match what you entered

**Deliverable**:
- [ ] Documented supplier model structure
- [ ] Examined supplier_view
- [ ] Checked permissions
- [ ] Created a supplier via UI
- [ ] Verified record in database

---

## Part 3: Explore Invoice Model (Transactional)

**Time**: 15 minutes

### Exercise 3: Examine Invoice Model

**Step 1: Find the Model**

1. **Open Prisma Schema**:
   - Search for: `model invoice`

2. **Examine the Model**:
   ```prisma
   model invoice {
     id          String   @id @default(dbgenerated("'invc_' || gen_random_uuid()"))
     created_by  String?
     modified_by String?
     created_at  DateTime @default(now())
     modified_at DateTime @updatedAt
     org_id      String?
     
     // Workflow integration (note: workflows covered in Day 3)
     wf_instance_id String?
     workflow_instance workflow_instance? @relation(...)
     
     // Business fields
     invoice_number String
     invoice_date   DateTime
     amount         Decimal
     status         String
     
     // Relations
     supplier_id    String?
     supplier       supplier? @relation(...)
     purchase_order_id String?
     purchase_order purchase_order? @relation(...)
     
     // Line items
     invoice_line_items invoice_line_item[]
     
     @@map("invoice")
   }
   ```

3. **Key Observations**:
   - Has `wf_instance_id` (workflow-enabled - we'll learn about this in Day 3)
   - Relates to `supplier` (many-to-one)
   - Relates to `purchase_order` (many-to-one)
   - Has line items (one-to-many)

**Step 2: Check the View**

1. **In Prisma Studio, find `invoice_view`**

2. **Examine `data_graph`**:
   - Which fields are included?
   - Which relations are included?
   - Are line items included?

3. **Compare complexity**:
   - How does this compare to `supplier_view`?
   - Why might it be more complex?

**Step 3: Check Relations**

1. **Navigate to `invoice` table in Prisma Studio**

2. **Find an invoice record**

3. **Examine relations**:
   - Click on `supplier_id` to see related supplier
   - Click on `purchase_order_id` to see related PO
   - Check `invoice_line_items` relation

4. **Understand the relationships**:
   - Invoice belongs to one Supplier
   - Invoice can belong to one Purchase Order
   - Invoice has many Line Items

**Step 4: Test in UI**

1. **Navigate to Invoices page** in the application

2. **View the list**:
   - What columns are shown?
   - Can you see supplier information?

3. **Open an invoice**:
   - Click on an invoice
   - See the detail view
   - Check if line items are shown

**Deliverable**:
- [ ] Documented invoice model structure
- [ ] Examined invoice_view
- [ ] Understood invoice relationships
- [ ] Explored invoice in UI

---

## Part 4: Explore Model Relationships

**Time**: 15 minutes

### Exercise 4: Understand Relationships

**Task**: Trace relationships between models

**Example: Purchase Order Flow**

1. **Find `purchase_order` model**:
   - Open Prisma schema
   - Search for `model purchase_order`

2. **Examine relationships**:
   ```prisma
   model purchase_order {
     // ... fields
     
     // Relations
     supplier_id String?
     supplier    supplier? @relation(...)
     
     purchase_order_items purchase_order_item[]
     
     invoices invoice[]
   }
   ```

3. **Trace the relationships**:
   - Purchase Order → Supplier (many-to-one)
   - Purchase Order → Purchase Order Items (one-to-many)
   - Purchase Order → Invoices (one-to-many)

4. **Visualize the flow**:
   ```
   Supplier
     ↓ (has many)
   Purchase Order
     ↓ (has many)        ↓ (generates)
   Purchase Order Items    Invoice
                            ↓ (has many)
                         Invoice Line Items
   ```

**Exercise: Find Another Relationship Chain**

1. **Pick a model** (e.g., `sales_order`)

2. **Trace its relationships**:
   - What does it relate to?
   - What relates to it?

3. **Document the chain**:
   - Draw a simple diagram
   - List the relationships

**Deliverable**:
- [ ] Understood purchase order relationships
- [ ] Traced another relationship chain
- [ ] Can explain model relationships

---

## Part 5: Compare Views and Permissions

**Time**: 10 minutes

### Exercise 5: Compare Different Views

**Task**: Compare views for different models

1. **Compare `supplier_view` and `invoice_view`**:
   - Open both in Prisma Studio
   - Compare `data_graph` structures
   - Note differences in complexity

2. **Check permissions for both**:
   - Compare permission structures
   - Are they similar or different?

3. **Understand why**:
   - Why might invoice_view be more complex?
   - Why might permissions differ?

**Key Insights**:
- Master data views are usually simpler
- Transactional views include more relations
- Permissions may vary by business need

**Deliverable**:
- [ ] Compared two different views
- [ ] Understood complexity differences
- [ ] Can explain view variations

---

## Part 6: End-to-End Trace

**Time**: 10 minutes

### Exercise 6: Complete Data Flow Trace

**Task**: Trace data from database to UI and back

**Steps**:

1. **Start in Database**:
   - Open Prisma Studio
   - Navigate to `supplier` table
   - Pick a supplier record
   - Note the `id` and key fields

2. **Check the View**:
   - Find `supplier_view`
   - Verify the supplier's fields are in `data_graph`

3. **Check Permissions**:
   - Verify you have permissions to view this supplier
   - Check your user's roles

4. **View in UI**:
   - Navigate to Suppliers page
   - Find the same supplier
   - Verify the data matches

5. **Edit in UI**:
   - Click on the supplier
   - Make a small change (e.g., update phone)
   - Save

6. **Verify in Database**:
   - Go back to Prisma Studio
   - Find the same supplier
   - Verify the change was saved
   - Check `modified_at` was updated
   - Check `modified_by` is your user ID

**Deliverable**:
- [ ] Successfully traced data flow
- [ ] Verified data consistency
- [ ] Understood the complete cycle

---

## Summary & Key Takeaways

### What You've Learned

1. **Model Types**:
   - Master data vs transactional models
   - Line item models
   - How to identify each type

2. **Model Structure**:
   - Standard fields in every model
   - Business fields
   - Relationships

3. **Views**:
   - How views control data access
   - Complexity varies by model type
   - Relations in views

4. **Permissions**:
   - Field-level access control
   - Wildcard vs specific permissions

5. **Data Flow**:
   - Database → View → Permissions → API → UI
   - Complete traceability

### Key Files Reference

| File | Purpose |
|------|---------|
| `backend/prisma/schema/data.prisma` | All model definitions |
| Prisma Studio | Visual database exploration |
| Application UI | See models in action |

### Next Steps

- [ ] Read `docs/ARCHITECTURE.md` for deeper understanding
- [ ] Explore more models on your own
- [ ] Prepare for Session 4: Understanding Forms

---

## Session 3 Completion Checklist

Before moving to Session 4, ensure:

- [ ] Explored at least 3 different models
- [ ] Understand model relationships
- [ ] Can identify views and permissions for models
- [ ] Can trace data from database to UI
- [ ] Understand the difference between model types
- [ ] Completed all exercises
- [ ] No blocking questions

**If all checkboxes are complete, you're ready for Session 4!**

---

**End of Session 3 Workbook**
