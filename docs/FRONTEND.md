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
│   │   └── api.ts                  # Unified API client
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

### 3. API Integration

All API calls go through `src/api/api.ts`:

```typescript
// List/Search
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
