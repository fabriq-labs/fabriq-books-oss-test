# Session 5: Hands-On - Create a Simple Form
## Developer Onboarding Workbook

**Duration**: 2 hours  
**Objective**: Create a complete form for a new master data model from scratch.

---

## Prerequisites

Before starting, ensure you have:

- [ ] Completed Session 4 (Understanding Forms)
- [ ] Backend server running
- [ ] Frontend server running
- [ ] Prisma Studio accessible
- [ ] Can login to the application
- [ ] Cursor IDE open with workspace

---

## Part 1: Choose Your Model

**Time**: 10 minutes

### Task: Select a Model to Work With

For this exercise, we'll use the **Payment Terms** model as an example. If it doesn't exist, we'll work with another simple master data model.

### Exercise 1: Verify Model Exists

**Step 1: Check Prisma Schema**

1. **Open Prisma Schema**:
   - Navigate to: `backend/prisma/schema/data.prisma`
   - Search for: `model payment_terms`

2. **If model exists**, note its structure:
   ```prisma
   model payment_terms {
     id          String   @id @default(dbgenerated("'ptrm_' || gen_random_uuid()"))
     created_by  String?
     modified_by String?
     created_at  DateTime @default(now())
     modified_at DateTime @updatedAt
     org_id      String?
     
     payment_terms String  // e.g., "Net 30", "Due on Receipt"
     days          Int?    // Number of days
     description   String?
     
     @@map("payment_terms")
   }
   ```

3. **If model doesn't exist**, pick another simple master data model:
   - `currency_master`
   - `tax_master`
   - `shipping_method`
   - Or any other simple model

**Step 2: Document Model Fields**

Document the fields you'll need in your form:
- Required fields: `_________________`
- Optional fields: `_________________`
- Relations: `_________________`

- [ ] Model identified
- [ ] Fields documented
- [ ] Ready to create view

---

## Part 2: Create View and Permissions

**Time**: 20 minutes

### Exercise 2: Create View in Database

**Step 1: Open Prisma Studio**

```bash
cd backend
npx prisma studio
```

**Step 2: Create View**

1. **Navigate to `view` table**
2. **Click "Add record"**
3. **Fill in the form**:

   **For Payment Terms**:
   ```json
   {
     "id": "payment_terms_view",
     "name": "payment_terms_view",
     "model_name": "payment_terms",
     "description": "Default view for payment terms",
     "data_graph": {
       "select": {
         "id": true,
         "payment_terms": true,
         "days": true,
         "description": true
       }
     }
   }
   ```

   **Or use SQL** (in Prisma Studio SQL tab):
   ```sql
   INSERT INTO view (id, name, model_name, data_graph, description)
   VALUES (
     'payment_terms_view',
     'payment_terms_view',
     'payment_terms',
     '{"select": {"id": true, "payment_terms": true, "days": true, "description": true}}',
     'Default view for payment terms'
   );
   ```

4. **Save the view**

**Step 3: Create Permissions**

1. **Navigate to `permission` table**
2. **Add permissions**:

   **Option 1: Wildcard (all fields)**:
   ```sql
   INSERT INTO permission (view_id, field_name, access)
   VALUES ('payment_terms_view', '*', 'write');
   ```

   **Option 2: Specific fields**:
   ```sql
   INSERT INTO permission (view_id, field_name, access) VALUES
     ('payment_terms_view', 'payment_terms', 'write'),
     ('payment_terms_view', 'days', 'write'),
     ('payment_terms_view', 'description', 'write');
   ```

3. **Save permissions**

**Step 4: Assign View to Role**

1. **Navigate to `role_view` table**
2. **Add assignment**:
   ```sql
   INSERT INTO role_view (role_id, view_id)
   SELECT id, 'payment_terms_view' FROM role WHERE name = 'Administrator';
   ```

**Deliverable**:
- [ ] View created
- [ ] Permissions configured
- [ ] View assigned to role

---

## Part 3: Add Frontend Routes

**Time**: 15 minutes

### Exercise 3: Add Routes to App.tsx

**Step 1: Locate App.tsx**

1. **Open**: `frontend-1/src/App.tsx`
2. **Find the routes section** (look for `<Routes>` or `<Route>`)

**Step 2: Add List Route**

Find where other master data routes are defined and add:

```tsx
<Route 
  path="master/procurement/payment_terms" 
  element={
    <Master 
      type="payment_terms" 
      view="payment_terms_view" 
      displayName="Payment Terms" 
    />
  } 
/>
```

**Step 3: Add Form Routes**

Add routes for create and edit:

```tsx
<Route 
  path="payment_terms/:id/view/:viewId" 
  element={<PaymentTermsForm />} 
/>
<Route 
  path="payment_terms/view/:viewId" 
  element={<PaymentTermsForm />} 
/>
```

**Step 4: Import Form Component**

At the top of the file, add import (we'll create the component next):

```tsx
import { PaymentTermsForm } from '@/components/forms/Masters/PaymentTermsForm';
```

**Note**: We'll create the component in the next part, so you may see an error until then.

**Deliverable**:
- [ ] List route added
- [ ] Form routes added
- [ ] Import statement added

---

## Part 4: Create Form Component

**Time**: 45 minutes

### Exercise 4: Create PaymentTermsForm Component

**Step 1: Create File**

1. **Navigate to**: `frontend-1/src/components/forms/Masters/`
2. **Create new file**: `PaymentTermsForm.tsx`

**Step 2: Copy Template**

1. **Open**: `SupplierForm.tsx` (as a reference)
2. **Copy the structure** to your new file

**Step 3: Modify for Payment Terms**

**Basic Structure**:
```tsx
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { viewAPI } from '@/api/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Validation schema
const paymentTermsSchema = z.object({
  payment_terms: z.string().min(1, 'Payment terms is required'),
  days: z.number().int().positive().optional().or(z.literal('')),
  description: z.string().optional(),
});

export const PaymentTermsForm = () => {
  const { id, viewId } = useParams<{ id?: string; viewId: string }>();
  const navigate = useNavigate();
  const [initialValues, setInitialValues] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // Fetch data for edit mode
  useEffect(() => {
    if (id && viewId) {
      viewAPI.getById('payment_terms', id, viewId).then((res) => {
        setInitialValues(res.data);
      });
    }
  }, [id, viewId]);

  // Form setup
  const form = useForm({
    resolver: zodResolver(paymentTermsSchema),
    defaultValues: initialValues,
  });

  // Update form when initial values load
  useEffect(() => {
    if (Object.keys(initialValues).length > 0) {
      form.reset(initialValues);
    }
  }, [initialValues, form]);

  // Submit handler
  const onSubmit = async (data: z.infer<typeof paymentTermsSchema>) => {
    setLoading(true);
    try {
      if (id) {
        await viewAPI.update('payment_terms', id, viewId!, data);
      } else {
        await viewAPI.create('payment_terms', viewId!, data);
      }
      navigate(-1);
    } catch (error) {
      console.error('Error saving payment terms:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">
        {id ? 'Edit Payment Terms' : 'Create Payment Terms'}
      </h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Payment Terms Field */}
          <FormField
            control={form.control}
            name="payment_terms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Terms *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Net 30" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Days Field */}
          <FormField
            control={form.control}
            name="days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Days</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="e.g., 30" 
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value === '' ? '' : parseInt(value, 10));
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description Field */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input placeholder="Optional description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Submit Button */}
          <div className="flex gap-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : id ? 'Update' : 'Create'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
```

**Step 4: Save and Check for Errors**

1. **Save the file**
2. **Check Cursor for TypeScript errors**
3. **Fix any import issues**

**Deliverable**:
- [ ] Form component created
- [ ] Validation schema defined
- [ ] Form fields implemented
- [ ] No TypeScript errors

---

## Part 5: Add to Navigation

**Time**: 10 minutes

### Exercise 5: Add Navigation Link

**Step 1: Find Sidebar/Navigation Component**

1. **Locate sidebar file**:
   - Usually in: `frontend-1/src/components/layout/`
   - Look for: `Sidebar.tsx` or `Navigation.tsx`

2. **Find where master data links are defined**

**Step 2: Add Payment Terms Link**

Add to the appropriate section (e.g., Procurement):

```tsx
{
  title: "Payment Terms",
  path: "/master/procurement/payment_terms",
  icon: <CreditCardIcon />, // or appropriate icon
}
```

**Step 3: Import Icon** (if needed)

```tsx
import { CreditCardIcon } from '@heroicons/react/24/outline';
// or use your icon library
```

**Deliverable**:
- [ ] Navigation link added
- [ ] Icon added (if applicable)
- [ ] Link appears in sidebar

---

## Part 6: Test Your Form

**Time**: 20 minutes

### Exercise 6: Test CRUD Operations

**Step 1: Test List Page**

1. **Navigate to Payment Terms page**:
   - Click the link in sidebar
   - Or go to: `http://localhost:5173/master/procurement/payment_terms`

2. **Verify list loads**:
   - Should see empty list or existing records
   - Should see "Create" button

**Step 2: Test Create**

1. **Click "Create" button**

2. **Fill in the form**:
   - Payment Terms: "Net 30"
   - Days: 30
   - Description: "Payment due in 30 days"

3. **Submit**:
   - Click "Create" button
   - Should navigate back to list
   - New record should appear

4. **Verify in Database**:
   - Open Prisma Studio
   - Check `payment_terms` table
   - Find your new record
   - Verify all fields

**Step 3: Test Edit**

1. **Click on a payment term** in the list

2. **Modify fields**:
   - Change description
   - Update days

3. **Submit**:
   - Click "Update" button
   - Should navigate back to list
   - Changes should be visible

4. **Verify in Database**:
   - Check `modified_at` was updated
   - Check `modified_by` is your user ID

**Step 4: Test Delete** (if delete is enabled)

1. **Delete a test record**
2. **Verify it's removed from list**
3. **Verify in database it's deleted**

**Step 5: Test Validation**

1. **Try submitting without required fields**:
   - Should see validation errors
   - Form should not submit

2. **Try invalid data**:
   - Negative days (if validation prevents it)
   - See validation messages

**Deliverable**:
- [ ] List page works
- [ ] Create works
- [ ] Edit works
- [ ] Validation works
- [ ] Data persists in database

---

## Part 7: Troubleshooting

**Time**: 10 minutes

### Common Issues and Solutions

**Issue 1: Form doesn't load**

**Solution**:
- Check route is correct in App.tsx
- Check view exists in database
- Check permissions are set
- Check browser console for errors

**Issue 2: Can't see form fields**

**Solution**:
- Check view `data_graph` includes the fields
- Check permissions allow read access
- Refresh browser

**Issue 3: Can't save**

**Solution**:
- Check permissions allow write access
- Check validation schema matches fields
- Check browser console for API errors
- Check network tab for failed requests

**Issue 4: TypeScript errors**

**Solution**:
- Check all imports are correct
- Check types match Prisma model
- Restart TypeScript server in Cursor

**Issue 5: Navigation link doesn't work**

**Solution**:
- Check path matches route in App.tsx
- Check route is inside `<Routes>` component
- Check for typos in path

### Exercise 7: Debug Any Issues

**Task**: If you encounter issues, debug them

1. **Check browser console** for errors
2. **Check Network tab** for failed API calls
3. **Check Cursor** for TypeScript errors
4. **Check Prisma Studio** for data issues
5. **Ask for help** if stuck!

**Deliverable**:
- [ ] All issues resolved
- [ ] Form works completely
- [ ] Know how to debug common issues

---

## Summary & Key Takeaways

### What You've Accomplished

1. **Created View and Permissions**:
   - Defined which fields are accessible
   - Set up field-level permissions
   - Assigned view to role

2. **Added Frontend Routes**:
   - List page route
   - Create form route
   - Edit form route

3. **Built Form Component**:
   - React Hook Form integration
   - Zod validation
   - Create and edit modes
   - Proper error handling

4. **Integrated Navigation**:
   - Added to sidebar
   - Accessible from UI

5. **Tested Everything**:
   - Full CRUD operations
   - Validation
   - Data persistence

### Key Skills Learned

- Creating views in database
- Configuring permissions
- Adding React routes
- Building form components
- Form validation
- Testing forms

### Next Steps

- [ ] Try creating forms for other models
- [ ] Experiment with different field types
- [ ] Add more complex validation
- [ ] Prepare for Day 3: Workflows

---

## Session 5 Completion Checklist

Before moving to Day 3, ensure:

- [ ] Created view and permissions for model
- [ ] Added frontend routes
- [ ] Created form component
- [ ] Integrated with navigation
- [ ] Tested full CRUD operations
- [ ] All validation works
- [ ] No errors in console
- [ ] Data persists correctly

**If all checkboxes are complete, you're ready for Day 3: Workflows!**

---

**End of Session 5 Workbook**
