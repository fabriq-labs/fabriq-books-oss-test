# Session 4: Understanding Forms
## Junior Developer Onboarding Workbook

**Duration**: 3 hours  
**Objective**: Learn how forms work and how to create/edit them in the Fabriq framework.

---

## Prerequisites

Before starting, ensure you have:

- [ ] Completed Session 3 (Explore Existing Models)
- [ ] Backend server running
- [ ] Frontend server running
- [ ] Can login to the application
- [ ] Cursor IDE open with workspace

---

## Part 1: Form Architecture Overview

**Time**: 30 minutes

### What are Forms in Fabriq?

Forms are React components that allow users to create and edit records. They integrate with:
- **Views**: Control which fields are accessible
- **Permissions**: Control read/write access
- **API**: Handle data submission
- **Validation**: Ensure data quality

### Form Components Location

**Key Files**:
- `frontend-1/src/pages/Master.tsx` - Generic list page (links to forms)
- `frontend-1/src/components/forms/Masters/` - Master data forms
- `frontend-1/src/api/api.ts` - API client (`viewAPI`)

### Exercise 1: Locate Form Files

**Task**: Find form components in the codebase

1. **Open Cursor IDE**

2. **Navigate to forms directory**:
   - Path: `frontend-1/src/components/forms/Masters/`
   - List the form files you see

3. **Open `SupplierForm.tsx`**:
   - This will be our reference example
   - Don't edit it yet, just examine

**Expected Files**:
- `SupplierForm.tsx`
- `InvoiceForm.tsx`
- `PaymentTermsForm.tsx`
- (and others)

- [ ] Found forms directory
- [ ] Located SupplierForm.tsx
- [ ] Can navigate form files

---

## Part 2: Understanding Form Structure

**Time**: 45 minutes

### Standard Form Pattern

Every form in Fabriq follows this pattern:

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useNavigate } from 'react-router-dom';
import { viewAPI } from '@/api/api';

export const SupplierForm = () => {
  // 1. Get route parameters
  const { id, viewId } = useParams();
  const navigate = useNavigate();
  
  // 2. State for data and metadata
  const [initialValues, setInitialValues] = useState({});
  const [metadata, setMetadata] = useState({});
  const [loading, setLoading] = useState(false);
  
  // 3. Fetch data for edit mode
  useEffect(() => {
    if (id && viewId) {
      viewAPI.getById('supplier', id, viewId).then(res => {
        setInitialValues(res.data);
        setMetadata(res.metaData);
      });
    }
  }, [id, viewId]);
  
  // 4. React Hook Form setup
  const form = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: initialValues
  });
  
  // 5. Submit handler
  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (id) {
        // Update existing
        await viewAPI.update('supplier', id, viewId, data);
      } else {
        // Create new
        await viewAPI.create('supplier', viewId, data);
      }
      navigate(-1); // Go back
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 6. Render form
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Form fields */}
        <Button type="submit" disabled={loading}>
          {id ? 'Update' : 'Create'}
        </Button>
      </form>
    </Form>
  );
};
```

### Exercise 2: Examine SupplierForm

**Task**: Trace through SupplierForm to understand the pattern

1. **Open `frontend-1/src/components/forms/Masters/SupplierForm.tsx`**

2. **Identify each section**:
   - [ ] Route parameters (`useParams`)
   - [ ] State management (`useState`)
   - [ ] Data fetching (`useEffect`, `viewAPI.getById`)
   - [ ] Form setup (`useForm`, `zodResolver`)
   - [ ] Submit handler (`onSubmit`)
   - [ ] Form rendering (`return`)

3. **Understand create vs edit**:
   - How does the form know if it's create or edit?
   - What happens when `id` is present?
   - What happens when `id` is missing?

4. **Trace the API calls**:
   - What API is called for edit mode?
   - What API is called for create mode?
   - What API is called on submit?

**Key Insight**: The same form component handles both create and edit modes!

**Deliverable**:
- [ ] Can identify all form sections
- [ ] Understand create vs edit logic
- [ ] Know which APIs are called

---

## Part 3: View Configuration for Forms

**Time**: 45 minutes

### How Views Control Forms

Views determine:
- Which fields appear in the form
- Which fields are editable
- Which relations are available
- Field display properties

### Example: Supplier View

**View Definition** (in database):
```json
{
  "id": "supplier_view",
  "name": "supplier_view",
  "model_name": "supplier",
  "data_graph": {
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
}
```

**What this means for the form**:
- Form will show: `supplier_name`, `email`, `phone`, `address`
- Form will include: `payment_terms` dropdown
- Fields NOT in `data_graph` won't appear

### Exercise 3: Modify a View and See the Impact

**Task**: Change a view and observe form changes

1. **Open Prisma Studio**:
   ```bash
   cd backend
   npx prisma studio
   ```

2. **Find `supplier_view`**:
   - Navigate to `view` table
   - Find `supplier_view`
   - Click to edit

3. **Modify `data_graph`**:
   - Remove `"address": true` from the select
   - Save the change

4. **Refresh UI**:
   - Go to Suppliers page
   - Click "Create" or edit an existing supplier
   - **Observe**: Address field should be gone!

5. **Add it back**:
   - Go back to Prisma Studio
   - Add `"address": true` back
   - Save
   - Refresh UI - address field should reappear

**Key Insight**: Views control form fields dynamically!

**Deliverable**:
- [ ] Modified a view
- [ ] Observed form changes
- [ ] Understand view → form relationship

---

## Part 4: Permissions and Form Fields

**Time**: 45 minutes

### How Permissions Affect Forms

Permissions control:
- **Read**: Field is visible but read-only
- **Write**: Field is visible and editable
- **None**: Field is hidden

### Example: Permission Configuration

**Permission Setup**:
```sql
-- Read-only email
INSERT INTO permission (view_id, field_name, access)
VALUES ('supplier_view', 'email', 'read');

-- Writable name
INSERT INTO permission (view_id, field_name, access)
VALUES ('supplier_view', 'supplier_name', 'write');

-- Hidden field
INSERT INTO permission (view_id, field_name, access)
VALUES ('supplier_view', 'internal_notes', 'none');
```

**Form Behavior**:
- `email`: Shows but disabled (read-only)
- `supplier_name`: Shows and editable
- `internal_notes`: Hidden completely

### Exercise 4: Test Permissions

**Task**: Create a test view with different permissions

1. **Create Test View** (in Prisma Studio):
   ```sql
   INSERT INTO view (id, name, model_name, data_graph, description)
   VALUES (
     'supplier_test_view',
     'supplier_test_view',
     'supplier',
     '{"select": {"id": true, "supplier_name": true, "email": true, "phone": true}}',
     'Test view with limited fields'
   );
   ```

2. **Add Permissions**:
   ```sql
   -- Read-only email
   INSERT INTO permission (view_id, field_name, access)
   VALUES ('supplier_test_view', 'email', 'read');
   
   -- Writable name and phone
   INSERT INTO permission (view_id, field_name, access) VALUES
     ('supplier_test_view', 'supplier_name', 'write'),
     ('supplier_test_view', 'phone', 'write');
   ```

3. **Assign to Role**:
   ```sql
   INSERT INTO role_view (role_id, view_id)
   SELECT id, 'supplier_test_view' FROM role WHERE name = 'Administrator';
   ```

4. **Test in UI**:
   - Navigate to: `/supplier/view/supplier_test_view` (create mode)
   - Or: `/supplier/:id/view/supplier_test_view` (edit mode)
   - Observe:
     - `email` should be read-only (disabled)
     - `supplier_name` and `phone` should be editable
     - `address` should not appear (not in data_graph)

**Deliverable**:
- [ ] Created test view
- [ ] Configured permissions
- [ ] Tested in UI
- [ ] Understand permission impact

---

## Part 5: Form Validation with Zod

**Time**: 30 minutes

### What is Zod?

Zod is a TypeScript-first schema validation library. It ensures data quality before submission.

### Example: Supplier Schema

**Location**: Usually in the form file or a separate schema file

```typescript
import { z } from 'zod';

export const supplierSchema = z.object({
  supplier_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  payment_term_id: z.string().optional(),
});
```

**What this does**:
- `supplier_name`: Required, must be at least 1 character
- `email`: Optional, but if provided must be valid email
- `phone`: Optional
- `address`: Optional
- `payment_term_id`: Optional

### Exercise 5: Examine Validation

**Task**: Find and understand validation schemas

1. **Open SupplierForm.tsx**

2. **Find the schema**:
   - Look for `supplierSchema` or `z.object`
   - May be in the same file or imported

3. **Understand validation rules**:
   - Which fields are required?
   - Which fields have format validation?
   - What error messages are shown?

4. **Test validation**:
   - Open supplier form
   - Try submitting without required fields
   - See validation errors
   - Try invalid email format
   - See email validation error

**Key Insight**: Validation happens on the client before API call!

**Deliverable**:
- [ ] Found validation schema
- [ ] Understand validation rules
- [ ] Tested validation in UI

---

## Part 6: Form Field Types

**Time**: 30 minutes

### Common Form Field Types

Forms support different field types:

1. **Text Input**: Simple text fields
   ```tsx
   <FormField
     control={form.control}
     name="supplier_name"
     render={({ field }) => (
       <FormItem>
         <FormLabel>Supplier Name</FormLabel>
         <FormControl>
           <Input {...field} />
         </FormControl>
       </FormItem>
     )}
   />
   ```

2. **Email Input**: Email validation
   ```tsx
   <FormField
     control={form.control}
     name="email"
     render={({ field }) => (
       <FormItem>
         <FormLabel>Email</FormLabel>
         <FormControl>
           <Input type="email" {...field} />
         </FormControl>
       </FormItem>
     )}
   />
   ```

3. **Dropdown (Relation)**: Select from related model
   ```tsx
   <SearchDropDown
     instanceType="payment_terms"
     instanceSourceKey="payment_term_id"
     instanceValue={initialValues?.payment_terms}
     onSelectItem={(item) => form.setValue('payment_term_id', item.id)}
   />
   ```

4. **Date Picker**: Date selection
   ```tsx
   <FormField
     control={form.control}
     name="invoice_date"
     render={({ field }) => (
       <FormItem>
         <FormLabel>Invoice Date</FormLabel>
         <FormControl>
           <DatePicker {...field} />
         </FormControl>
       </FormItem>
     )}
   />
   ```

### Exercise 6: Identify Field Types

**Task**: Find different field types in forms

1. **Open SupplierForm.tsx**

2. **Identify field types**:
   - [ ] Text input fields
   - [ ] Email input
   - [ ] Dropdown/relation fields
   - [ ] Other types (if any)

3. **Open InvoiceForm.tsx** (if exists)

4. **Compare field types**:
   - What additional field types does InvoiceForm have?
   - Why might it be more complex?

**Deliverable**:
- [ ] Can identify common field types
- [ ] Understand when to use each type
- [ ] Know how relations work in forms

---

## Part 7: Form Submission Flow

**Time**: 15 minutes

### Complete Submission Flow

**Example: Creating a Supplier**

1. **User fills form**:
   - Enters supplier name, email, phone
   - Selects payment terms
   - Clicks "Create"

2. **Validation**:
   - Zod validates the data
   - If invalid, show errors
   - If valid, continue

3. **API Call**:
   ```typescript
   await viewAPI.create('supplier', viewId, {
     supplier_name: "Acme Corp",
     email: "contact@acme.com",
     phone: "123-456-7890",
     payment_term_id: "pt_123"
   });
   ```

4. **Backend Processing**:
   - Validates permissions
   - Adds `org_id` (multi-tenancy)
   - Adds `created_by` (audit)
   - Saves to database

5. **Response**:
   - Returns created record
   - Form navigates back to list

### Exercise 7: Trace Form Submission

**Task**: Watch form submission in action

1. **Open Browser DevTools**:
   - Press F12
   - Go to "Network" tab
   - Clear existing requests

2. **Open Supplier Form**:
   - Navigate to Suppliers page
   - Click "Create"

3. **Fill and Submit**:
   - Fill in the form
   - Click "Create" button
   - Watch Network tab

4. **Observe API Call**:
   - Find the `POST /api/supplier/view/supplier_view` call
   - Check Request payload
   - Check Response data

5. **Verify in Database**:
   - Open Prisma Studio
   - Check `supplier` table
   - Find your new record
   - Verify all fields

**Deliverable**:
- [ ] Traced form submission
- [ ] Saw API call in Network tab
- [ ] Verified data in database
- [ ] Understand complete flow

---

## Summary & Key Takeaways

### What You've Learned

1. **Form Architecture**:
   - Standard form pattern
   - Create vs edit mode
   - React Hook Form integration

2. **View Integration**:
   - Views control form fields
   - `data_graph` determines visible fields
   - Dynamic form generation

3. **Permissions**:
   - Read-only fields
   - Writable fields
   - Hidden fields

4. **Validation**:
   - Zod schemas
   - Client-side validation
   - Error handling

5. **Field Types**:
   - Text inputs
   - Relations (dropdowns)
   - Date pickers
   - Other types

6. **Submission Flow**:
   - Validation → API → Backend → Database → Response

### Key Files Reference

| File | Purpose |
|------|---------|
| `frontend-1/src/components/forms/Masters/SupplierForm.tsx` | Example form |
| `frontend-1/src/api/api.ts` | API client (`viewAPI`) |
| `frontend-1/src/pages/Master.tsx` | List page (links to forms) |

### Next Steps

- [ ] Read `docs/FRONTEND.md` for more details
- [ ] Practice modifying existing forms
- [ ] Prepare for Session 5: Create a Simple Form

---

## Session 4 Completion Checklist

Before moving to Session 5, ensure:

- [ ] Understand form architecture
- [ ] Can trace form data flow
- [ ] Understand how views control form fields
- [ ] Can configure view data_graph
- [ ] Understand permission impact on forms
- [ ] Know how validation works
- [ ] Can identify different field types
- [ ] Completed all exercises
- [ ] No blocking questions

**If all checkboxes are complete, you're ready for Session 5!**

---

**End of Session 4 Workbook**
