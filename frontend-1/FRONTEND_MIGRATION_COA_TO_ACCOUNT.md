# URGENT: Frontend Migration Required - COA to Account Model Change

The backend schema has been updated to consolidate the "coa" (Chart of Accounts) model into the unified "account" model. All frontend code referencing "coa" must be updated immediately.

## SCHEMA CHANGES SUMMARY

- The "coa" model has been **REMOVED** from `prisma/schema/zeiv.prisma`
- All references now use the "account" model from `prisma/schema/data.prisma`
- Field mappings have changed (see below)

## FIELD NAME MAPPINGS (Old → New)

- `coa_code` → `code` (or `account_id` for foreign keys)
- `coa_id` → `account_id`
- `chart_of_accounts` → `account_id`
- `coa` (relation) → `account` (relation)
- `sales_coa` → `sales_account`
- `purchase_coa` → `purchase_account`

## MODELS AFFECTED

1. **purchase_requisition**: `chart_of_accounts` → `account_id`
2. **purchase_order**: `chart_of_accounts` → `account_id`
3. **invoice**: `coa` → `account_id`
4. **budget_period**: `coa_code` → `account_id`
5. **general_ledger**: `coa_code` → `account_id`
6. **project_master**: `coa_id` → `account_id`
7. **item_master**: `sales_coa` → `sales_account`, `purchase_coa` → `purchase_account`

## FRONTEND CHANGES REQUIRED

### 1. VIEW METADATA UPDATES (`prisma/metadata-tables.sql`)

- Update all view `data_graph` JSON that references "coa"
- Change "coa" to "account" in all view definitions
- Update field references:
  - `"coa_code"` → `"code"`
  - `"coa"` (table relation) → `"account"` (table relation)
- **Affected views:**
  - `purchase_orderFullAccess`
  - `invoice_view` / `invoice_1`
  - `general_ledger_view`
  - `purchase_requisition` views (`view_1`, `purchase_requisition_view`, `view_4`)
  - `coa_view` (should be renamed to `account_view`)

### 2. API/QUERY CHANGES

- All GraphQL/API queries using "coa" must use "account" instead
- Field selections: `coa { coa_code }` → `account { code }`
- Model name: `"coa"` → `"account"`

### 3. FORM FIELDS & COMPONENTS

- Rename all form fields from "coa" to "account"
- Update dropdown/select components that reference coa
- Update field labels: "COA" → "Account", "Chart of Accounts" → "Account"
- Update validation schemas

### 4. DISPLAY NAMES & LABELS

- "COA Code" → "Account Code" or "Code"
- "Chart of Accounts" → "Account"
- Update all user-facing text

### 5. SEARCH & FILTERS

- Update search functionality from "coa" model to "account" model
- Update filter options

## SPECIFIC CODE LOCATIONS TO UPDATE

### Backend files (for reference - backend team will handle)

- `src/agent/AgentTools.ts`: `searchCOATool` → `searchAccountTool`
- `src/agent/prompt/prompts.ts`: Update model references
- `src/agent/GenericFunctions.ts`: Update coa field references
- `src/lib/integrations/zoho_books/mappers/purchase_order_mapper.ts`: `purchase_coa` → `purchase_account`
- `src/lib/actions/purchase_order.ts`: `purchase_coa` → `purchase_account`
- `src/lib/actions/zeiv.ts`: `coa` → `account`

### Frontend files to update

- All view metadata in database (via SQL migration)
- All API query files
- All form components
- All display components
- All search/filter components

## EXAMPLE MIGRATION

### Before:

```json
coa: {
  type: "table",
  select: {
    id: "read",
    coa_code: "update",
    account_name: "read"
  }
}
```

### After:

```json
account: {
  type: "table",
  select: {
    id: "read",
    code: "update",
    name: "read"
  }
}
```

### Before:

```graphql
query {
  purchase_requisition {
    id
    coa {
      coa_code
      account_name
    }
  }
}
```

### After:

```graphql
query {
  purchase_requisition {
    id
    account {
      code
      name
    }
  }
}
```

## TESTING CHECKLIST

- [ ] Purchase Requisition forms load and save correctly
- [ ] Purchase Order forms load and save correctly
- [ ] Invoice forms load and save correctly
- [ ] Budget Period forms load and save correctly
- [ ] General Ledger forms load and save correctly
- [ ] Project Master forms load and save correctly
- [ ] Item Master sales/purchase account selection works
- [ ] All account dropdowns/selectors work
- [ ] Search functionality works with account model
- [ ] View permissions and field access work correctly

## MIGRATION STATUS

**⚠️ MIGRATION NOT COMPLETE - The following files still need to be updated:**

### Files Requiring Updates:

1. **`src/components/forms/Masters/COAForm.tsx`**

   - Line 70: `viewAPI.getById("coa", id, viewId)` → should use `"account"`
   - Line 99: `viewAPI.create("coa", ...)` → should use `"account"`
   - Line 110: `viewAPI.update("coa", ...)` → should use `"account"`
   - Component name `COAForm` should be renamed to `AccountForm`
   - Route paths still reference "coa"

2. **`src/components/forms/Masters/ProjectMasterForm.tsx`**

   - Line 45: Schema field `coa_id` → should be `account_id`
   - Line 81: Default value `coa_id: ''` → should be `account_id: ''`
   - Line 105: `coa_id: res.data.coa_id` → should be `account_id: res.data.account_id`
   - Line 125: `coa_id: data.coa_id` → should be `account_id: data.account_id`
   - Line 196: `value.coa_code` → should be `value.code`
   - Line 403: Form field `name="coa_id"` → should be `name="account_id"`
   - Line 406: Label "COA" → should be "Account"
   - Line 409: `instanceType="coa"` → should be `instanceType="account"`
   - Line 410: `instanceSourceKey="coa_id"` → should be `instanceSourceKey="account_id"`
   - Line 412: `instanceLabel="coa_code"` → should be `instanceLabel="code"`
   - Line 413: `initialValues?.coa` → should be `initialValues?.account`
   - Line 417: `searchParams="coa_code"` → should be `searchParams="code"`
   - Line 419: `lookup_id_name="coa_id"` → should be `lookup_id_name="account_id"`

3. **`src/components/forms/Masters/GeneralLedger.tsx`**

   - Line 26: Schema field `coa_code` → should be `account_id`
   - Line 54: Default value `coa_code: ''` → should be `account_id: ''`
   - Line 75: `coa_code: res.data.coa_code` → should be `account_id: res.data.account_id`
   - Line 95: `coa_code: data.coa_code` → should be `account_id: data.account_id`
   - Line 139: Condition `sourceKey === 'coa_code'` → should be `sourceKey === 'account_id'`
   - Line 294: Form field `name="coa_code"` → should be `name="account_id"`
   - Line 297: Label "COA Code" → should be "Account"
   - Line 299: `instanceType="coa"` → should be `instanceType="account"`
   - Line 300: `instanceSourceKey="coa_code"` → should be `instanceSourceKey="account_id"`
   - Line 302: `instanceLabel="coa_code"` → should be `instanceLabel="code"`
   - Line 304: `initialValues?.coa` → should be `initialValues?.account`
   - Line 309: `searchParams="coa_code"` → should be `searchParams="code"`

4. **`src/components/forms/Masters/BudgetPeriodForm.tsx`**

   - Line 23: Schema field `coa_code` → should be `account_id`
   - Line 51: Default value `coa_code: ''` → should be `account_id: ''`
   - Line 73: `coa_code: res.data.coa_code` → should be `account_id: res.data.account_id`
   - Line 271: Form field `name="coa_code"` → should be `name="account_id"`
   - Line 274: Label "COA Code" → should be "Account"
   - Line 276: `instanceType="coa"` → should be `instanceType="account"`
   - Line 277: `instanceSourceKey="coa_code"` → should be `instanceSourceKey="account_id"`
   - Line 279: `instanceLabel="coa_code"` → should be `instanceLabel="code"`
   - Line 281: `initialValues?.coa` → should be `initialValues?.account`
   - Line 286: `searchParams="coa_code"` → should be `searchParams="code"`

5. **`src/components/filter/EnhancedFilterBadges.tsx`**

   - Line 27: Variable `coaCodeIds` → should be `accountIds`
   - Line 30: Variable `coaCodeIds` → should be `accountIds`
   - Line 53: Field check `field === "coa_code"` → should be `field === "account_id"`
   - Line 54-55: `coaCodeIds.add(...)` → should use `accountIds`
   - Line 63: Field check `field === "coa_id"` → should be `field === "account_id"`
   - Line 64-65: `coaIds.add(...)` → should use `accountIds`
   - Line 112: Return `coaCodeIds` → should be `accountIds`
   - Line 113: Return `coaIds` → should be `accountIds`
   - Line 163: `fetchEntity(coaCodeIds, "coa", "coa_code")` → should be `fetchEntity(accountIds, "account", "code")`
   - Line 164: `fetchEntity(coaIds, "coa", "coa_code")` → should be `fetchEntity(accountIds, "account", "code")`
   - Line 189: Dependency array includes `coaCodeIds, coaIds` → should be `accountIds`
   - Line 299: Field check `field === "coa_code"` → should be `field === "account_id"`
   - Line 301-306: Label "COA Code" → should be "Account"
   - Line 319: Field check `field === "coa_id"` → should be `field === "account_id"`
   - Line 321-326: Label "COA" → should be "Account"
   - Line 470: Loading check includes `coa_id` → should be `account_id`
   - Line 472: Loading check includes `coa_code` → should be `account_id`

6. **`src/App.tsx`**

   - Line 176: Route `type="coa"` → should be `type="account"`
   - Line 176: Route `view="coa_view"` → should be `view="account_view"`
   - Line 177-178: Route paths `/coa/...` → should be `/account/...`

7. **`src/components/layout/AppLayout.tsx`**

   - Line 76: Mapping `'coa': 'Charts of Accounts'` → should be `'account': 'Account'`

8. **`src/utils/routeUtils.ts`**

   - Line 51: Valid model `'coa'` → should be `'account'`
   - Line 117: Display name `'coa': 'Charts of Accounts'` → should be `'account': 'Account'`

9. **`src/pages/Invoice/InvoiceUpload.tsx`**
   - Line 56: Type definition `coa?: string;` → should be `account_id?: string;`

### Additional Files to Check:

- Search for any other files using `instanceType="coa"` or `instanceType="coa"`
- Check for any GraphQL queries or API calls referencing "coa"
- Update any TypeScript interfaces/types that reference COA fields
- Check for any test files that reference COA

## QUESTIONS OR ISSUES?

Contact the backend team for schema clarification or API changes.
