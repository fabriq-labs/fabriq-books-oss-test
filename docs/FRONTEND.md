# Fabriq Frontend Development Guide

**When to read**: Frontend development, adding pages, forms, components
**Related docs**: [ARCHITECTURE.md](./ARCHITECTURE.md), [BACKEND.md](./BACKEND.md)

---

## Overview

**frontend-1** is a React/TypeScript frontend for the Fabriq financial management platform. It provides a modern, metadata-driven UI that dynamically renders forms and tables based on backend view configurations. The application is a **unified platform** that includes Procurement, Sales, Accounting, and Investment modules.

### Key Features

- **Dynamic UI from Metadata**: Tables and forms auto-generate from backend view definitions
- **Workflow Support**: State-based routing and approval actions
- **AI Chat Integration**: Context-aware chat assistant for all business tasks
- **Multi-role Dashboards**: Different views for Requesters, Approvers, and Admins
- **Unified Modules**: Procurement, Sales, Accounting, and Investments in one application

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5.x
- **Styling**: Tailwind CSS 3.x
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: TanStack React Query + Context API
- **Routing**: React Router DOM 6.x
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts
- **PDF**: @react-pdf/renderer

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit with VITE_API_BASE_URL=http://localhost:4000

# Start development server (port 5173) — pick a brand when prompted (TTY)
npm run dev
```

## Multi-brand (app) configuration

The same codebase can ship **multiple white-label apps** (e.g. Fabriq vs Zeiv). Per-app copy, logos, and metadata live under `frontend-1/config/<brand>/`. Before `vite` runs, `config/scripts/select-brand.js` copies the chosen folder into `src/config/` (including `config.json`, `favicon.*`, `logo.*`).

**How the brand is chosen**

| Situation | Behavior |
| --------- | -------- |
| **CLI** | `node config/scripts/select-brand.js <brand> && vite` — brand is explicit |
| **`npm run dev` / `start`** | Passes `--interactive`: numbered menu when stdin is a TTY; otherwise default **`fabriq`** |
| **`npm run build`** | No prompt — always default **`fabriq`** unless you use `build:zeiv` etc. or pass a brand on the CLI |
| **Any run without `--interactive` and without a CLI brand** | Default **`fabriq`** if `config/fabriq/` exists |

Runtime code reads branding from `src/config/config.json` and assets via `src/config/brand.ts`. `vite.config.ts` replaces `__APP_NAME__` / `__APP_TAGLINE__` in `index.html` from that JSON.

**npm scripts**

```bash
npm run dev              # --interactive: prompt (TTY) or default fabriq; Vite dev :5173
npm run start            # same as dev
npm run build            # default fabriq, no prompt; use build:zeiv for another brand
npm run dev:fabriq       # dev with fabriq (no prompt)
npm run dev:zeiv         # dev with zeiv (no prompt)
npm run build:fabriq     # production build, fabriq
npm run build:zeiv       # production build, zeiv
npm run preview          # serve existing dist/ (after a build)
```

**Adding a new app / brand**

1. Create a directory: `frontend-1/config/<brand>/` (lowercase slug, e.g. `acme`).
2. Add **`config.json`** — copy an existing brand and adjust fields:

   | Field                 | Purpose                                                                               |
   | --------------------- | ------------------------------------------------------------------------------------- |
   | `appName`             | Product name (browser title, UI)                                                      |
   | `appTagline`          | Short subtitle                                                                        |
   | `sidebarFallbackName` | Sidebar label when needed                                                             |
   | `copyright`           | Footer / legal line                                                                   |
   | `appId`               | Stable id (analytics, backend prompts, etc.) — keep unique per deployment if required |

3. Optionally add **`favicon.svg`**, **`favicon.ico`**, **`logo.svg`** (or other extensions); the script copies files whose basename is `favicon` or `logo`.
4. Register **npm scripts** in `frontend-1/package.json` for non-interactive use, mirroring existing ones:

   `"dev:<brand>": "node config/scripts/select-brand.js <brand> && vite"`  
   `"build:<brand>": "node config/scripts/select-brand.js <brand> && vite build"`

5. Run `npm run dev:<brand>` or pick the new row in the interactive menu after a TTY `npm run dev`.

**Docker / CI:** `npm run build` uses **`fabriq`** without prompting. To build another brand in the image, use `npm run build:zeiv` (or add a `build:<brand>` script) in the Dockerfile instead of plain `npm run build`.

## Directory Structure

```
frontend-1/
├── config/
│   ├── fabriq/                 # Example brand: config.json, favicon, logo
│   ├── zeiv/
│   └── scripts/
│       └── select-brand.js     # Copies config/<brand>/ → src/config/ before Vite
├── src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Route definitions
│   ├── index.css                   # Global styles + Tailwind
│   │
│   ├── api/
│   │   ├── api.ts                  # Barrel re-export — preserves all existing imports
│   │   ├── apiClient.ts            # Shared fetch helpers + API_URL constant
│   │   ├── metadataApi.ts          # viewAPI, workflowAPI, userAPI, attachmentAPI, erpConnectionsAPI, …
│   │   ├── agentApi.ts             # sessionAPI, agentTemplateAPI, pendingActionAPI, agentAPI
│   │   ├── postingApi.ts           # invoiceAPI, importAPI, reportAPI
│   │   └── superAdminApi.ts        # adminAPI (onboard tenant, COA setup, sync metadata, DB reset)
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx         # Authentication state
│   │   ├── ChatContext.tsx         # AI chat state
│   │   └── PaginationContext.tsx   # Table pagination
│   │
│   ├── pages/
│   │   ├── Master.tsx              # Generic list page (KEY)
│   │   ├── Dashboard.tsx           # Main dashboard
│   │   └── sign-in.tsx             # Login page
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── layout/                 # AppLayout, Sidebar
│   │   ├── masters/                # Dynamic table components
│   │   │   ├── DynamicTable.tsx
│   │   │   └── table-columns/
│   │   │       └── columnGenerator.tsx
│   │   ├── forms/
│   │   │   ├── Masters/            # Master data forms
│   │   │   ├── sales/              # Sales workflow forms
│   │   │   └── purchase-requisition/
│   │   ├── chat/                   # AI Chat system
│   │   │   └── ChatUI.tsx
│   │   └── filter/                 # Search & filter
│   │
│   └── lib/
│       └── utils.ts                # Utility functions
│
├── tailwind.config.ts
├── vite.config.ts
└── tsconfig.json
```

## Key Commands

```bash
npm run dev          # Vite dev (:5173); prompt for brand when TTY, else default fabriq
npm run build        # Production build; default fabriq (no prompt)
npm run preview      # Preview last build (dist/)
npm run lint         # Run ESLint
```

See [Multi-brand (app) configuration](#multi-brand-app-configuration) for `dev:fabriq`, `build:zeiv`, and adding a new brand.

## Core Concepts

### 1. The Master Component Pattern

The `Master.tsx` component is the heart of the UI - a **completely generic list page**:

```tsx
// Usage in App.tsx
<Route
  path="master/procurement/supplier"
  element={
    <Master
      type="supplier" // Prisma model name
      view="supplier_view" // Backend view name
      displayName="Suppliers" // Human-readable name
      filterConfig={{ enableFilters: true, enableSearch: true }}
      defaultSortOption={{ field: "name", direction: "asc" }}
    />
  }
/>
```

**What it does:**

1. Fetches data + metadata from `/api/${type}/view/${view}/search`
2. Passes metadata to `DynamicTable` for auto-column generation
3. Handles pagination, filtering, search, sort
4. Manages create/edit navigation
5. Provides bulk operations (Edit, Delete, and custom actions via `bulkActions`)

#### Custom Bulk Actions

The `Master` component supports custom bulk actions through the `bulkActions` prop. This allows model-specific bulk operations (like AI categorization) while keeping the component generic and reusable.

**Type Definition** (`src/types/bulkActions.ts`):

```typescript
interface BulkAction {
  id: string; // Unique identifier
  label: string; // Button label
  icon?: React.ReactNode; // Optional icon
  variant?: "default" | "outline" | "destructive" | "secondary";

  // Handler function
  onClick: (
    selectedRows: any[],
    context: { type: string; view: string },
  ) => Promise<void>;

  // Optional visibility control
  isVisible?: (selectedRows: any[]) => boolean;

  // Optional disabled state
  isDisabled?: (selectedRows: any[]) => boolean;

  // Optional confirmation dialog
  confirmation?: {
    title: string;
    content: string | ((selectedRows: any[]) => string);
    okText?: string;
    cancelText?: string;
  };
}
```

**Usage Example** (from `Transactions.tsx`):

```tsx
import { BulkAction } from "@/types/bulkActions";
import { Sparkles } from "lucide-react";
import { agentAPI } from "@/api/api";

const bulkActions: BulkAction[] = [
  {
    id: 'categorize',
    label: 'Categorize',
    icon: <Sparkles size={16} />,
    variant: 'outline',
    onClick: async (selectedRows, context) => {
      // Validation
      if (hasAnyFullyCategorized(selectedRows)) {
        toast({ title: "Cannot categorize", ... });
        return;
      }

      // API call
      const result = await agentAPI.categorizeTransactionBatch({
        posting_ids: selectedRows.map(row => row.id),
        options: { ... }
      });

      // Show success toast
      toast({ title: "Bulk categorization completed", ... });
    },
    isVisible: (rows) => !hasAnyFullyCategorized(rows),
    confirmation: {
      title: 'Bulk Categorize Transactions',
      content: (rows) => `This will categorize ${rows.length} transaction(s) using AI. Continue?`,
      okText: 'Yes, Categorize',
      cancelText: 'Cancel',
    },
  },
];

<Master
  type="posting"
  view="posting_view"
  displayName="Transactions"
  bulkActions={bulkActions}  // Custom actions appear between Edit and Delete
/>
```

**Behavior:**

- Custom bulk actions appear in the bulk action panel when 2+ rows are selected
- Actions are rendered between the default "Edit" button and "Delete" button
- Each action can control its own visibility and disabled state based on selected rows
- Confirmation modals are shown before execution if configured
- Master component automatically:
  - Shows loading state during action execution
  - Refreshes data after successful completion
  - Clears selection after successful completion
  - Handles errors (action handler should show error toasts)

**Backward Compatibility:**

- Routes without `bulkActions` prop continue to work normally
- Default Edit and Delete buttons are always available (unless disabled via `listConfig`)

#### Custom Row Renderer

The `Master` component supports a `customRowRenderer` prop that replaces the metadata-generated column layout with a fully custom row design — while keeping all Master features (pagination, filters, search, bulk actions, sorting) untouched.

**When to use:** when a model needs a richer row layout than columns allow — e.g. stacking fields, inline badges, or row-level colour coding.

**Type Definition** (`src/types/customRowRenderer.ts`):

```typescript
interface CustomColumnDef {
  key: string;
  title: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sortKey?: string; // actual record field to sort by; omit to disable sort for this column
}

interface RowRenderContext {
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  actions: React.ReactNode; // Edit/Delete + any injectRowActions output
}

interface CustomRowRenderer {
  columns: CustomColumnDef[];
  renderCells: (record: any, ctx: RowRenderContext) => React.ReactNode; // returns <td> elements
  rowClassName?: (record: any) => string | undefined;
}
```

**Usage pattern — factory function memoized on reactive state:**

```tsx
import { createPostingRowRenderer } from '@/components/masters/posting/PostingListRow';

const customRowRenderer = useMemo(
  () => createPostingRowRenderer(predictedFields),
  [predictedFields]
);

<Master
  type="posting"
  view="posting_view"
  displayName="Transactions"
  customRowRenderer={customRowRenderer}
  // all other Master props still work normally
  bulkActions={bulkActions}
  injectRowActions={injectRowActions}
  renderRowExtra={renderRowExtra}
/>
```

**How it works:**

- `columns` replaces the metadata-generated headers. `sortKey` maps the display column to the real record field for sorting — e.g. `{ key: 'transaction', title: 'Transaction', sortKey: 'description' }`. Columns without `sortKey` are non-sortable (header click is a no-op).
- `renderCells` receives each record and a context object. It must return one `<td>` per column (as `<TableCell>` elements). The select-all checkbox header is rendered automatically by `DynamicTable` — do **not** include a select column in `columns`.
- `rowClassName` applies Tailwind classes to each `<tr>` based on record data — used for row-level highlights (e.g. reconciliation status, IN/OUT direction).
- `renderRowExtra` still works — extra content renders in a full-width row below the custom row.
- `injectRowActions` still works — its output is passed through `ctx.actions`.

**Existing row renderers** (`src/components/masters/posting/`):

| File | Factory | Used by |
|------|---------|---------|
| `PostingListRow.tsx` | `createPostingRowRenderer(predictedFields)` | `Transactions.tsx` |
| `SimpleTransactionRow.tsx` | `createSimpleTransactionRowRenderer(accountId, currency)` | `SimpleTransactionList.tsx` |
| `ReconciliationStatusBadge.tsx` | `<ReconciliationStatusBadge status={...} />` | Shared — used in forms and list rows |

**Posting row design:**
- Columns: Transaction (description + notes + legal entity badge) | Debit Account | Credit Account | Amount (currency prefix) | Date
- `rowClassName`: green left border + tint for `CONFIRMED`, amber for `MATCHED`, transparent otherwise
- Currency prefix: `record.account?.currency?.code ?? record.credit_account?.currency?.code`
- `posting_view` data_graph must include `currency: { select: { id, code } }` nested under both `account` and `credit_account` — this is already in the committed JSON file

**Simple transaction row design (bank statement perspective):**
- Columns: Date | Description | Category (counter-account badge) | Amount (signed, coloured)
- `rowClassName`: green left border for money IN, red for money OUT — replaces a status column
- Factory takes `selectedAccountId` to compute direction inline per row
- `displayCurrency` should come from `account?.currency?.code` (selected account), not the legal entity's base currency

### 2. Routing Patterns

**A. View-Based Routes** (master data):

```
/master/{category}/{type}              → List page (Master component)
/{type}/view/{viewId}                  → Create form
/{type}/{id}/view/{viewId}             → Edit form
```

**B. State-Based Routes** (workflow entities):

```
/{type}/state/{stateId}                → List by workflow state
/{type}/{id}/state/{stateId}           → Detail page with actions
```

**C. Super Admin Routes** (wrapped in `<SuperAdminGuard>`):

```
/settings/tenant-admin     → TenantAdministrationPage (COA setup, metadata sync, onboard tenant, DB reset)
/settings/demo-data        → DemoDataManagementPage (indian-demo recon reset, drop legal entity)
/settings/workflows        → WorkflowManagementPage
/settings/views            → Views master
/settings/permissions      → Permissions master
/settings/roles            → Roles master
/settings/ai-templates     → AI Templates (prompt + agent templates)
/settings/llm-traces       → LLM trace viewer
/accounting/currency       → Currency master (global — accessible via Super Admin sidebar)
```

Old routes redirect to the unified page:
- `/settings/tenant-onboarding` → `/settings/tenant-admin`
- `/settings/dev-options` → `/settings/tenant-admin`
- `/settings/demo-database-reset` → `/settings/tenant-admin`

### 3. API Integration

The API layer is split into focused modules under `src/api/`. Import directly from the module or from the barrel:

```typescript
// Preferred — import from the focused module
import { viewAPI } from '@/api/metadataApi';
import { agentAPI } from '@/api/agentApi';
import { adminAPI } from '@/api/superAdminApi';

// Also works — barrel re-export keeps all existing imports working
import { viewAPI, agentAPI, adminAPI } from '@/api/api';
```

| Module | Exports |
|--------|---------|
| `apiClient.ts` | `API_URL`, `fetchAPI`, `uploadAPI`, `fetchBinaryAPI` |
| `metadataApi.ts` | `viewAPI`, `workflowAPI`, `workflowManagementAPI`, `bulkEditAPI`, `modelSchemaAPI`, `datagraphAPI`, `userAPI`, `erpConnectionsAPI`, `attachmentAPI` |
| `agentApi.ts` | `sessionAPI`, `agentTemplateAPI`, `pendingActionAPI`, `agentAPI` |
| `postingApi.ts` | `invoiceAPI`, `importAPI`, `reportAPI` |
| `superAdminApi.ts` | `adminAPI` |

```typescript
// View/Search
viewAPI.search(type, view, page, pageSize, searchTerm, filters, sortOption);

// CRUD
viewAPI.getById(type, id, view);
viewAPI.create(type, view, data);
viewAPI.update(type, id, view, data);
viewAPI.delete(type, id, view);

// Child relations
viewAPI.addChild(type, id, view, childRelation, childData);
viewAPI.deleteChild(type, id, view, childRelation, childId);

// Workflow
workflowAPI.update(workflowInstanceId, actionId, { comment });
workflowAPI.getHistory(type, instanceId);

// Super Admin
adminAPI.setupChartOfAccounts({ entityId, coaTemplate });
adminAPI.devOptionsSyncMetadata();
adminAPI.demoDatabaseReset({ demoData, demoDataOnly });
adminAPI.onboardTenant({ tenant, adminUsers });
```

### 4. Authentication Flow

```typescript
// AuthContext manages:
// 1. Login → POST /api/auth/login → Store JWT in cookie
// 2. Token injection → All fetchAPI calls include Authorization header
// 3. User state → Cached in sessionStorage
// 4. Protected routes → ProtectedRouteWithLoading wrapper

// Cookie name: __session
Cookies.get("__session"); // Retrieved in api.ts
```

### 5. Dynamic Table Generation

`columnGenerator.tsx` creates columns from backend metadata:

```typescript
// Metadata from backend
{
  "status": {
    "displayName": "Status",
    "datatype": "string",
    "isColumnShow": true,
    "listProps": { "type": "badge", "color": "blue" }
  },
  "vendor": {
    "displayName": "Vendor",
    "datatype": "table",  // Relation
    "isColumnShow": true,
    "select": { "name": true }
  }
}

// Renders as:
// - Badge for status field
// - Nested vendor.name for relations
```

### 6. Chat Context Integration

Pages send context to the AI chat:

```tsx
const { setPageContext } = useChatContext();

useEffect(() => {
  setPageContext({
    modelName: "supplier",
    viewName: "supplier_view",
    recordId: id,
    modelDisplayName: "Supplier",
    currentPath: location.pathname,
  });
}, [id]);
```

## Environment Variables

```bash
# Required
VITE_API_BASE_URL=http://localhost:4000   # Backend URL

# Optional
VITE_CLERK_PUBLISHABLE_KEY=pk_...         # If using Clerk auth
```

## Form Development Pattern

```tsx
export const SupplierForm = () => {
  const { id, viewId } = useParams();
  const navigate = useNavigate();
  const [initialValues, setInitialValues] = useState({});
  const [metadata, setMetadata] = useState({});

  // 1. Fetch data + metadata
  useEffect(() => {
    if (id) {
      viewAPI.getById("supplier", id, viewId).then((res) => {
        setInitialValues(res.data);
        setMetadata(res.metaData);
      });
    }
  }, [id, viewId]);

  // 2. React Hook Form + Zod
  const form = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: initialValues,
  });

  // 3. Submit handler
  const onSubmit = async (data) => {
    if (id) {
      await viewAPI.update("supplier", id, viewId, data);
    } else {
      await viewAPI.create("supplier", viewId, data);
    }
    navigate(-1);
  };

  // 4. Form fields
  return (
    <Form {...form}>
      <FormField name="name" label="Name" />
      <FormField name="email" label="Email" type="email" />

      {/* Relation lookup */}
      <SearchDropDown
        instanceType="payment_terms"
        instanceSourceKey="payment_term_id"
        instanceValue={initialValues?.payment_terms}
        onSelectItem={(item) => form.setValue("payment_term_id", item.id)}
      />

      <Button type="submit">Save</Button>
    </Form>
  );
};
```

## Key Components Reference

| Component                   | Purpose                      | Location                              |
| --------------------------- | ---------------------------- | ------------------------------------- |
| `Master`                    | Generic list page            | `pages/Master.tsx`                    |
| `DynamicTable`              | Metadata-driven table        | `components/masters/DynamicTable.tsx` |
| `columnGenerator`           | Create columns from metadata | `components/masters/table-columns/`   |
| `SearchDropDown`            | Relation lookup              | `components/search_dropdown/`         |
| `ChatUI`                    | AI chat interface            | `components/chat/ChatUI.tsx`          |
| `AppLayout`                 | Main app layout              | `components/layout/AppLayout.tsx`     |
| `ProtectedRouteWithLoading` | Auth guard                   | `components/layout/`                  |
| `FilterModal`               | Advanced filters             | `components/filter/FilterModal.tsx`   |

### Known Technical Debt

**`EnhancedFilterBadges` (`components/filter/EnhancedFilterBadges.tsx`)** contains hardcoded domain knowledge — it has explicit `if (field === "known_field_name")` cases for ~15 fields (`legal_entity_id`, `supplier_id`, `account_id_or_credit_account_id`, etc.) each with model-specific API lookups and label strings. This works but means every new field that needs a resolved label requires editing this generic component.

The right fix is a caller-provided `labelConfig` prop so each `Master` consumer describes its own field labels and lookups, and `EnhancedFilterBadges` becomes truly generic. This refactor has been deferred — see `docs/FILTER_SYSTEM.md` for the full filter architecture.

## Adding a New Master Data Type

1. **Add route in `App.tsx`**:

```tsx
<Route path="master/category/mymodel" element={
  <Master type="my_model" view="my_model_view" displayName="My Model" />
} />
<Route path="my_model/:id/view/:viewId" element={<MyModelForm />} />
<Route path="my_model/view/:viewId" element={<MyModelForm />} />
```

2. **Create form component** (`components/forms/Masters/MyModelForm.tsx`)

3. **Add to sidebar** (update `Sidebar.tsx`):

```tsx
{
  title: "My Model",
  path: "/master/category/mymodel",
  icon: <SomeIcon />
}
```

4. **Ensure backend has**:
   - View definition (`my_model_view`)
   - Permissions for the view
   - Model registered

## Common Tasks

### Filter Syntax

```typescript
// POST body for search
{
  filters: [
    { field: "status", operator: "eq", value: "active" },
    { field: "amount", operator: "gte", value: 1000 },
    { field: "vendor.name", operator: "contains", value: "tech" }
  ],
  page: 1,
  pageSize: 20,
  sortOption: { field: "created_at", direction: "desc" }
}
```

### Workflow Actions

```typescript
// Execute workflow action
await workflowAPI.update(workflowInstanceId, actionId, {
  comment: "Approved - within budget",
});

// Get workflow history
const history = await workflowAPI.getHistory(type, instanceId);
```

### File Uploads

```typescript
const formData = new FormData();
formData.append("file", file);
await attachmentAPI.create(type, recordId, formData);
```

## Styling Conventions

- **Tailwind classes** for layout and spacing
- **shadcn/ui** for consistent component styling
- **CSS variables** for theming (see `index.css`)

```tsx
// Common patterns
<div className="p-4 space-y-4">           {/* Spacing */}
<Card className="shadow-sm">               {/* Cards */}
<Button variant="outline" size="sm">       {/* Buttons */}
<Badge variant="secondary">                {/* Badges */}
```

## Debugging Tips

- **Data not loading**: Check Network tab for API errors, verify view name
- **Table columns wrong**: Check `isColumnShow` in metadata
- **Form not submitting**: Check Zod validation errors in console
- **Auth issues**: Check `__session` cookie exists, verify token validity
- **Chat not working**: Verify `ChatContext` wrapper, check page context

---

**Related Documentation:**

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [BACKEND.md](./BACKEND.md) - Backend development
