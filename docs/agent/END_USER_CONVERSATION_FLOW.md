# End-User AI Agent Conversation Flow

**Audience:** Engineers extending or debugging the Fabriq AI agent.
**Scope:** How end-user conversations with the AI agent are handled at runtime -- from HTTP request to LLM response.
**See also:** `docs/AI_AGENT.md` (coding-agent-focused behavior), `backend/src/agent/AGENT_SERVICE_ARCHITECTURE.md` (bottom-up component reference), `backend/src/agent/prompt/README.md` (prompt template mechanics).

---

## Request Lifecycle (Overview)

```
1.  HTTP POST /api/agent/chat/stream
2.  authMiddleware  →  verify token, load user + permissions → attach AuthContext
3.  Route handler   →  extract messages[], context from body
4.  AgentService.handleRequest / handleStreamingRequest
    a.  extractQuestionText(message)
    b.  classifyQuestion(text)  →  { type } (for observability only)
    c.  prepareRequestSetup    →  accessibleModels, processedMessages, systemPrompt
    d.  ToolManager.getUnifiedTools  →  model-specific + analytics tools
    e.  Vercel AI SDK  generateText / streamText  (unified tools, maxSteps from env)
5.  LLM ↔ Tool execution loop (up to AGENT_MAX_STEPS iterations, default 5)
6.  Response streamed (SSE) or returned (JSON) to client
```

---

## 1. Security and User Context

### 1.1 How the Logged-In User Is Established

Every agent endpoint is protected by `authMiddleware` (`backend/src/auth/middleware.ts`).
The middleware:

1. Extracts the bearer token from the `Authorization` header (or `__session` cookie).
2. Verifies the token through the configured **auth adapter** (`AuthAdapterFactory` in `backend/src/auth/adapters/factory.ts`). Supported providers: `local` (JWT), `clerk`. Auth0 and Cognito are stubbed.
3. Looks up the internal user record by `external_id` to obtain `user.id` and `user.org_id`.
4. Loads permissions via `PermissionService.getUserPermissions(userId)` (`backend/src/services/permissions/PermissionService.ts:32`).
5. Attaches the resulting `AuthContext` to `req.context.auth`.

The `AuthContext` interface (`backend/src/auth/types.ts`):

```typescript
interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string | null;
    org_id: string;          // multi-tenancy key
  };
  permissions?: {
    [model: string]: {
      [field: string]: 'read' | 'write' | 'none';
    };
  };
}
```

The route handlers in `backend/src/agent/routes.ts` additionally guard with an explicit check:

```typescript
if (!req.context?.auth?.user) {
  return res.status(401).json({ error: "Unauthorized: Missing auth context" });
}
```

### 1.2 How Permissions and Accessible Models Are Loaded

| Step | Where | What happens |
|------|-------|--------------|
| Permissions fetched | `PermissionService.getUserPermissions()` (`backend/src/services/permissions/PermissionService.ts:32`) | Joins `role_user` -> `role_view` -> `view` -> `permission` to build a map of `{ model: { field: access } }`. Supports wildcard (`*` = all fields). |
| Accessible models derived | `ModelRegistry.getAccessibleModels(auth.permissions)` (`backend/src/services/registry/ModelRegistry.ts:109`) | Filters the in-memory model registry to models where the user has at least `read` or `write` on `*`. |
| Injected into prompt | `DynamicPromptManager.generateDynamicPrompt()` (`backend/src/agent/prompt/DynamicPromptManager.ts:94`) | If the prompt contains `{{accessibleModels}}`, that placeholder is replaced. Otherwise a section titled "AVAILABLE MODELS FOR CONTEXT" is appended with model names, field lists, examples, and synonyms. |
| Used by tools | `ToolManager.getToolsForModel()` (`backend/src/agent/ToolManager.ts:47`) | Auth is passed to every tool factory (`createRecordTool(auth, toolContext)`, etc.) so each tool can delegate to `ModelService` with the same `AuthContext`. |

### 1.3 What Is Guaranteed per Request

- **org_id filtering**: `DataAccessLayer.addOrgFilter()` (`backend/src/services/dal/DataAccessLayer.ts:140`) automatically appends `WHERE org_id = context.user.org_id` to every query on business tables. Metadata tables (`view`, `role`, `workflow_flow`, `workflow_state`, `permission`, `prompt_template`) are exempt.
- **Model-level access**: `PermissionService.validatePermissions(context, modelName, operation)` is called by `ModelService` before any CRUD operation.
- **Field-level filtering**: `PermissionService.filterFieldsByPermission()` removes unauthorized fields from query results before they reach the LLM.
- **SQL safety**: The `analyticsQuery` tool validates that only `SELECT` statements are executed and warns (but does not block) when business tables lack an `org_id` filter. Write keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`) and transaction commands (`BEGIN`, `COMMIT`, `ROLLBACK`) are blocked outright.
- **Single-resolution permissions**: Permissions are resolved once in the auth middleware and threaded through every subsequent call. Individual tools do **not** re-fetch permissions; they rely on the `AuthContext` already attached to the request.

---

## 2. Tool Setup

### 2.1 Where and When Tools Are Registered

Tools are **not** globally registered at startup. They are assembled per-request in `AgentService`:

1. `handleRequest()` / `handleStreamingRequest()` (`backend/src/agent/AgentService.ts`) extracts the question text.
2. Calls `ToolManager.getUnifiedTools(modelName, auth, context)` (`ToolManager.ts`) to get all available tools.
3. The unified approach provides **both** model-specific tools (CRUD, search) **and** analytics tools (getAnalyticsContext, analyticsQuery) in every request.
4. The LLM decides which tools to use based on the question -- no pre-classification routing.

**Why unified tools?** The previous classification-based routing caused issues where analytical questions (e.g., "give me the spend on coffee by description") were misclassified as transactional, resulting in wrong tools and insufficient steps. The unified approach lets the LLM make tool choices naturally.

### 2.2 Inputs That Decide Tool Availability

| Input | Source | Effect |
|-------|--------|--------|
| `modelName` | `context.modelName` from request body (set by frontend based on current page), defaults to `'default'` | Determines the model-specific tools in `getUnifiedTools`. |
| `auth` | `AuthContext` from middleware | Passed into every tool factory so `ModelService` can enforce permissions. |
| `context` | Full request context (`recordId`, `stateId`, `viewId`, `promptTypes`, `modelContext`) | Some tools receive a `toolContext` (e.g., `createRecordTool(auth, { modelName })`) that tightens the Zod schema to the specific model's fields. |

**Note:** Question classification (`classifyQuestion()`) is still called but only for **observability/logging**. It no longer affects tool selection or `maxSteps`.

### 2.3 Unified Tool Bundles

All requests now use `ToolManager.getUnifiedTools()` which combines model-specific tools with analytics tools:

| modelName | Model-specific tools | + Analytics tools (always included) |
|-----------|---------------------|-------------------------------------|
| `default` | `searchRecords`, `createRecord`, `advancedSqlQuery`, `extractInvoiceFromFile` | `getAnalyticsContext`, `analyticsQuery` |
| `purchase_requisition` | `searchRecords`, `createRecord`, `updateRecord`, `createChildItem`, `updateChildItem`, `advancedSqlQuery`, `erpConnector`, + 11 model-specific search tools | `getAnalyticsContext`, `analyticsQuery` |
| `invoice` | `searchRecords`, `createRecord`, `updateRecord`, `processInvoiceFromPdf`, `extractInvoiceFromFile`, `advancedSqlQuery`, `erpConnector` | `getAnalyticsContext`, `analyticsQuery` |
| `purchase_order` | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, `erpConnector` | `getAnalyticsContext`, `analyticsQuery` |
| `posting` | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery` | `getAnalyticsContext`, `analyticsQuery` |

The LLM chooses the appropriate tools based on the question context. For simple lookups, it uses `searchRecords`. For aggregations and analytics, it uses `getAnalyticsContext` + `analyticsQuery`.

---

## 3. Metadata-Driven Tools

### 3.1 How Tool Schemas Are Derived from Metadata

The system uses Zod schemas that are **dynamically generated from the model registry** at request time:

- `getCreateRecordSchema(toolContext?)` and `getUpdateRecordSchema(toolContext?)` in `backend/src/agent/GenericFunctions.ts` call `generateModelDataSchema(modelName, options)` from `backend/src/agent/schema/SchemaGenerator.ts`.
- `SchemaGenerator` reads `ModelRegistry.getInstance().getModelMetadata(modelName)` to obtain the field list, types, and required flags.
- System fields (`id`, `created_at`, `created_by`, `modified_at`, `modified_by`, `org_id`, `assigned_to`, etc.) are excluded automatically.
- For `updateRecord`, all fields become optional (partial update semantics).

The `searchRecordsSchema` (`GenericFunctions.ts`) is **static** -- it accepts a `modelName` plus a generic `search` array of `{ field, operator, value }` objects. Operators include `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `contains`, `icontains`, `startsWith`, `endsWith`.

`ModelService` (`backend/src/services/core/ModelService.ts`) is called from tools and:
- Uses `PermissionService.getView()` to look up the view for the model.
- Reads `view.data_graph` for select/include configuration.
- Delegates to `DataAccessLayer` which enforces org_id filtering.
- For workflow-enabled models, auto-creates a `workflow_instance` on record creation.

### 3.2 Metadata-Driven vs. Special-Cased Tools

**Fully metadata-driven** (work with any model that has a view):
- `searchRecords` -- generic search across any accessible model
- `createRecord` / `updateRecord` -- schema generated from model registry
- `createChildItem` / `updateChildItem` -- parent-child relationships

**Special-cased** (hardcoded behavior for specific domains):
- `advancedSqlQuery` -- executes arbitrary SQL with validation (`AgentTools.ts`)
- `getAnalyticsContext` / `analyticsQuery` -- analytics pipeline (`backend/src/agent/tools/`)
- `processInvoiceFromPdf` / `extractInvoiceFromFile` -- invoice-specific extraction
- `erpConnector` -- calls ERP methods via the handler registry (`backend/src/agent/handlers/erp/`)
- 11 named search tools (`searchItems`, `searchSuppliers`, etc.) -- thin wrappers that fix `modelName` to a specific value

---

## 4. When SQL Agent Tools Are Used

### 4.1 Tools That Execute SQL

| Tool | File | Description |
|------|------|-------------|
| `advancedSqlQuery` | `backend/src/agent/AgentTools.ts` | General-purpose SQL tool available in most model bundles. Executes via `ModelService.executeSqlQuery()`. |
| `analyticsQuery` | `backend/src/agent/tools/analyticsQuery.ts` | Analytics-specific SQL tool with stricter validation, multi-step support, and structured column metadata. |

### 4.2 When Each SQL Tool Is Available

- **`advancedSqlQuery`**: Included in the tool bundle for `default`, `purchase_requisition`, `invoice`, and `purchase_order` model contexts. Available for **transactional** classified questions.
- **`analyticsQuery`**: Available only when the question is classified as `analytical` by `classifyQuestion()`. Returned by `ToolManager.getToolsForClassification()` alongside `getAnalyticsContext` and `searchRecords`.

### 4.3 How SQL Execution Is Constrained

Both tools ultimately call `ModelService.executeSqlQuery(query, auth)`, which:

1. Receives the `AuthContext` (org_id, user identity).
2. Executes via Prisma `$queryRawUnsafe`.

Additional checks in `analyticsQuery`:
- **Write-operation blocking**: Regex check for `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE` -- returns an error if found.
- **Transaction blocking**: Blocks `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`.
- **Business-table org_id check**: Heuristic check that business tables (defined in a `BUSINESS_TABLES` set) have `org_id` in the WHERE clause. Issues a warning (not a hard block) if missing.

`advancedSqlQuery` has lighter validation (delegates to `ModelService.executeSqlQuery` directly) and supports `uiHint` for response formatting (`table`, `metrics`, `chart`, `card`).

### 4.4 Analytics vs. advancedSqlQuery -- Tool Guidance

Both SQL tools are now available in every request. The LLM chooses based on the question:

| Scenario | Recommended tool | Why |
|----------|------------------|-----|
| Aggregation, counts, averages, trends, multi-table joins, workflow analysis | `getAnalyticsContext` + `analyticsQuery` | The analytics flow first calls `getAnalyticsContext` to get schema context, actual workflow state names, and multi-tenancy rules. Then `analyticsQuery` executes with stricter validation. |
| Ad-hoc SQL from a record context, simple lookups | `advancedSqlQuery` | Direct SQL execution with `uiHint` support for response formatting. |

The LLM typically learns to use `analyticsQuery` for questions that need schema understanding (spending, breakdowns, trends) and `advancedSqlQuery` for ad-hoc queries.

**Max steps:** All requests use `AGENT_MAX_STEPS` (default: 5). The LLM naturally stops early for simple queries (1-2 steps) and uses more steps for complex analytics (3-5 steps).

Question classification (`backend/src/agent/utils/questionClassifier.ts`) is still run but only for **observability**:
- Analytical patterns: "how many", "count", "total", "average", "spending", "report", "statistics", "grouped by"
- Cross-module patterns: "PR to PO", "workflow history", "end-to-end"
- Classification is logged to `llm_trace` for analysis but does not affect routing or step limits.

---

## 5. Prompts: Construction and User Context

### 5.1 How the System Prompt Is Chosen and Built

The flow from request to final system prompt:

1. **Route handler** passes `context` (from `req.body.context`) to `AgentService`.
2. **`AgentService.handleRequest()`** enhances context if the question is analytical: sets `context.promptTypes = ['analytics', 'default']`.
3. **`AgentService.prepareRequestSetup()`** calls **`createSystemPrompt(userId, accessibleModels, context)`** (`AgentService.ts:211`).
4. `createSystemPrompt()` instantiates `DynamicPromptManager`:

```typescript
new DynamicPromptManager(
  context?.orgId || 'default',   // org_id
  userId,                        // user_id
  modelName,                     // from context.modelName or 'default'
  context?.viewName,             // optional
  context?.promptTypes,          // e.g., ['analytics', 'default']
  { recordId, stateId, viewId }  // context details
)
```

5. Calls `generateDynamicPromptWithMetadata(permissions)` which returns `{ prompt, metadata }`.

### 5.2 How Prompt Templates Are Loaded and Merged

**Loading** (`DynamicPromptManager.getPromptTemplates()` in `backend/src/agent/prompt/DynamicPromptManager.ts`):

| Condition | Source | Method |
|-----------|--------|--------|
| `process.env.USE_LOCAL_PROMPT === 'true'` | JSON + TXT files in `backend/prisma/metadata/prompt-templates/` | `getPromptTemplatesFromFiles()` |
| Otherwise (default, production) | `prompt_template` table | `getPromptTemplatesFromDatabase()` |

**Database query** (`getPromptTemplatesFromDatabase()`):

```
WHERE
  view.model_name = this.modelName
  AND view.name = this.viewName (defaults to "{modelName}_views")
  AND prompt_type IN (this.promptTypes || ['default'])
  AND app_name = process.env.APP_NAME (if set)
ORDER BY
  is_default DESC, priority ASC, version DESC
```

**File-based loading** (`getPromptTemplatesFromFiles()`):
1. Finds the view JSON file in `prisma/metadata/views/` matching `model_name` and view `name`.
2. Extracts the `view_id`, normalizes it (removes `view_` prefix, replaces `-` with `_`).
3. Matches files in `prisma/metadata/prompt-templates/` with pattern `view_{normalizedViewId}_{promptType}[_{appName}].json`.
4. Reads the corresponding `.txt` file for prompt text.

**Merging** (`mergeTemplates()`):
- Sorts by: `is_default` DESC, `priority` DESC, `version` DESC.
- Joins all non-empty `prompt_text` values with `\n\n`.

### 5.3 How User Context Is Folded into the Prompt

**Accessible models injection** (in `generateDynamicPrompt()`):
- If the merged prompt contains `{{accessibleModels}}`, the placeholder is replaced with a formatted list of accessible model descriptions (name, fields, required fields, examples, synonyms).
- If the placeholder is absent, a section `"AVAILABLE MODELS FOR CONTEXT"` is appended.

**Placeholder replacement** (`replacePlaceholders()` in `DynamicPromptManager.ts:454`):

| Placeholder | Value |
|-------------|-------|
| `{{currentDate}}` | `new Date().toISOString()` |
| `{{userId}}` | User ID from constructor |
| `{{modelName}}` | Model name from constructor |
| `{{viewName}}` | View name (or `{modelName}_views`) |
| `{{promptType}}` | Comma-separated prompt types |
| `{{context.recordId}}` | Record ID if provided |
| `{{context.stateId}}` | Workflow state ID if provided |
| `{{context.viewId}}` | View ID if provided |

**Conditional blocks**:
```handlebars
{{#if context.recordId}}
You are working with record {{context.recordId}}.
{{else}}
No specific record is selected.
{{/if}}
```
If `context.recordId` is set, the block before `{{else}}` is kept; otherwise the block after `{{else}}` is kept.

**Tool response guideline** (`TOOL_RESPONSE_HANDLING_GUIDELINE` from `backend/src/agent/prompt/constants.ts`):
- Always appended unless already present.
- Instructs the LLM to: not repeat structured data, never show IDs, never include system fields in CRUD calls.

### 5.4 How Route Context Changes the Prompt

The frontend sends `PageContext` (`frontend-1/src/contexts/ChatContext.tsx`):

```typescript
interface PageContext {
  modelName: string;
  viewName: string;
  recordId?: string | null;
  stateId?: string | null;
  viewId?: string | null;
  modelDisplayName?: string | null;
  currentPath?: string;
  promptTypes?: string[];
}
```

| Frontend page | context.modelName | context.recordId | Effect on prompt |
|---------------|-------------------|------------------|------------------|
| Default chat | `'default'` (or absent) | absent | Default prompt loaded; no record-specific instructions. |
| Model list page | e.g., `'purchase_requisition'` | absent | Model-specific prompt loaded; `{{#if context.recordId}}` block resolves to the "else" branch. |
| Record detail page | e.g., `'invoice'` | set | Model-specific prompt loaded with record context; conditional block includes record-specific instructions. |

### 5.5 Unified Prompt Loading (Analytics Always Included)

The system now **always** loads both analytics and default prompts, regardless of question type:

1. `AgentService` always sets `context.promptTypes = ['analytics', 'default']`.
2. `DynamicPromptManager` queries for templates where `prompt_type IN ('analytics', 'default')`.
3. Both templates are merged by priority -- analytics guidance is always available.
4. The analytics template includes: multi-step analysis instructions, schema context references, org_id enforcement reminders, SQL examples, and double-entry accounting guidance (for posting model).

**Why always include analytics?** This eliminates misclassification issues. The analytics prompt sections don't interfere with transactional queries -- the LLM simply ignores irrelevant guidance. But when a user asks an analytical question, the guidance is already present.

---

## 6. Design and Approach: Adding a New Model-Specific Prompt

This section provides a prescriptive checklist for adding a new model-specific prompt so the agent uses it when users converse about that model.

### Existing Prompt Templates (Reference)

Before writing a new prompt, study the existing templates in `backend/prisma/metadata/prompt-templates/` to understand the established patterns, tone, and structure. Each template is a `.txt` file (prompt text) paired with a `.json` file (metadata).

| File | Model | prompt_type | App | Description |
|------|-------|-------------|-----|-------------|
| `view_0e6394e6_..._default_zeiv.txt` | invoice | `default` | zeiv | General invoice CRUD and search prompt. Good starting reference for any new model. |
| `view_0e6394e6_..._invoice_extractor_zeiv.txt` | invoice | `invoice_extractor` | zeiv | Specialized prompt for PDF invoice extraction. Example of a task-specific prompt type. |
| `view_6ece8634_..._default_zeiv.txt` | default | `default` | zeiv | Catch-all prompt when no model-specific template exists. Shows the baseline structure. |
| `view_6ece8634_..._analytics_zeiv.txt` | default | `analytics` | zeiv | Analytics prompt with multi-step SQL guidance. Reference for adding analytics support. |
| `view_35eca395_..._default_zeiv.txt` | (line items parent) | `default` | zeiv | Parent model prompt with child-item handling. |
| `view_35eca395_..._line_item_zeiv.txt` | (line items parent) | `line_item` | zeiv | Supplementary prompt for line-item operations, merged with the default via priority. |
| `view_bf8e7aac_..._default_zeiv.txt` | (model-specific) | `default` | zeiv | Another model-specific default prompt. |
| `view_e110af2c_..._default_zeiv.txt` | (model-specific) | `default` | zeiv | Another model-specific default prompt. |
| `view_9fd968e6_..._default_perfin.txt` | (model-specific) | `default` | perfin | Example of an app-specific prompt (perfin app vs zeiv). |

**Key patterns to observe when reading these files:**
- How `{{currentDate}}`, `{{userId}}`, `{{modelName}}`, and `{{accessibleModels}}` placeholders are used.
- How `{{#if context.recordId}}...{{else}}...{{/if}}` conditional blocks switch between record-specific and general instructions.
- The level of domain-specific guidance given to the LLM (field names, business rules, expected workflows).
- How analytics prompts differ from default prompts (multi-step instructions, SQL patterns, org_id reminders).

### 6.1 Checklist of Implementation Steps

1. **Read existing prompt templates for reference.**
   - Open 2-3 `.txt` files from `backend/prisma/metadata/prompt-templates/` listed in the table above.
   - The `invoice` default prompt (`view_0e6394e6_..._default_zeiv.txt`) is the best starting point -- it demonstrates placeholder usage, conditional blocks, domain instructions, and tool guidance.
   - If adding an analytics prompt, also read the analytics template (`view_6ece8634_..._analytics_zeiv.txt`) for the multi-step SQL pattern.
   - Use the same structural conventions (sections, placeholder positions, tone) in your new template.

2. **Ensure a view exists for the model.**
   - The `view` table (`backend/prisma/schema/metadata.prisma:68`) must have a row with:
     - `model_name` = the Prisma model name in snake_case (e.g., `posting`)
     - `name` = a view name (convention: `{model_name}_view`, e.g., `posting_view`)
   - If no view exists, create one (via admin UI, SQL, or add a JSON file in `backend/prisma/metadata/views/` and run `npm run sync-metadata`).
   - Note the view's `id` (e.g., `view_abc123-...`) -- you will need it for the prompt template row.

3. **Insert prompt content in the database.**
   - Table: `prompt_template` (schema at `backend/prisma/schema/metadata.prisma:282`).
   - Required columns:

     | Column | Value | Notes |
     |--------|-------|-------|
     | `view_id` | The view's `id` from step 2 | Foreign key to `view.id` |
     | `prompt_type` | `'default'` (or `'record'`, `'analytics'`, etc.) | Determines when the template is loaded |
     | `prompt_text` | The actual prompt text | May contain `{{placeholders}}` |
     | `is_default` | `true` for the primary template | Controls merge ordering |
     | `priority` | `0` (or higher for supplementary templates) | Higher priority sorts first in merge |
     | `version` | `1` | Increment on revisions |
     | `app_name` | `process.env.APP_NAME` value (e.g., `'zeiv'`) or `NULL` | If set, template only loads when APP_NAME matches |

   - Insert via SQL:
     ```sql
     INSERT INTO prompt_template (view_id, prompt_type, prompt_text, is_default, priority, version, app_name)
     VALUES (
       'view_YOUR_VIEW_ID',
       'default',
       'You are an assistant specialized in the posting model. ...{{currentDate}}...',
       true,
       0,
       1,
       'zeiv'  -- or NULL for all apps
     );
     ```

4. **Verify runtime resolution.**
   - When the frontend sends `context.modelName = 'posting'` (and optionally `context.viewName = 'posting_view'`), the agent will:
     1. Instantiate `DynamicPromptManager('org_id', 'user_id', 'posting', 'posting_view', ['default'], context)`.
     2. Call `getPromptTemplatesFromDatabase()` which queries:
        ```sql
        SELECT * FROM prompt_template pt
        JOIN view v ON pt.view_id = v.id
        WHERE v.model_name = 'posting'
          AND v.name = 'posting_view'
          AND pt.prompt_type = 'default'
        ORDER BY pt.is_default DESC, pt.priority ASC, pt.version DESC;
        ```
     3. Merge the matched templates and replace placeholders.

5. **ToolManager / route / context changes (if needed).**
   - If `posting` requires a custom tool bundle, add a case in `ToolManager.getToolsForModel()` (`backend/src/agent/ToolManager.ts`):
     ```typescript
     case 'posting':
       return { searchRecords: searchRecordsTool(auth), /* ... */ };
     ```
   - If no custom bundle is needed, the `default` bundle applies automatically.
   - Ensure the frontend sets `pageContext.modelName = 'posting'` when the user navigates to posting pages (in the React `ChatContext`).

6. **Optional: use local files for development.**
   - Set `USE_LOCAL_PROMPT=true` in `backend/.env`.
   - Create files in `backend/prisma/metadata/prompt-templates/`:
     - `view_{normalizedViewId}_{promptType}[_{appName}].json` (metadata)
     - `view_{normalizedViewId}_{promptType}[_{appName}].txt` (prompt text)
   - The normalized view ID replaces `-` with `_` and strips the `view_` prefix. Example: view `view_abc12345-def6-7890-...` becomes `abc12345_def6_7890_...`.
   - To sync local files to the database: `npm run sync-metadata` (`backend/prisma/sync-metadata.ts`).

### 6.2 Where the DynamicPromptManager Loads From

- **Database** (default, when `USE_LOCAL_PROMPT !== 'true'`): `getPromptTemplatesFromDatabase()` in `DynamicPromptManager.ts`.
  - Prisma `findMany` on `prompt_template` with `include: { view: true }`.
  - Filters: `view.model_name`, `view.name`, `prompt_type` (IN clause), `app_name` (if `APP_NAME` env is set).
  - Sort: `is_default DESC`, `priority ASC`, `version DESC`.
  - See schema: `backend/prisma/schema/metadata.prisma` for `prompt_template` and `view` models.

- **Local files** (when `USE_LOCAL_PROMPT === 'true'`): `getPromptTemplatesFromFiles()` in `DynamicPromptManager.ts`.
  - Reads view metadata from `backend/prisma/metadata/views/{model_name}_{view_name}.json`.
  - Matches prompt template files by normalized view ID pattern.
  - Reads `.txt` companion file for prompt text.

### 6.3 Concrete Example: Posting Model

**Naming conventions:**
- View name: `posting_view`
- `model_name`: `posting`
- View ID: obtained from the `view` table or created via metadata sync.

**Step 1: Ensure the view exists.**

Check:
```sql
SELECT id, name, model_name FROM view WHERE model_name = 'posting';
```

If no row exists, create one (or add `backend/prisma/metadata/views/posting_posting_view.json`):
```json
{
  "name": "posting_view",
  "model_name": "posting",
  "description": "Posting (journal entries)",
  "data_graph": null
}
```
Then run `npm run sync-metadata`.

**Step 2: Insert the prompt template.**

Assuming the view ID is `view_aaaa-bbbb-cccc-dddd`:

```sql
INSERT INTO prompt_template (view_id, prompt_type, prompt_text, is_default, priority, version, app_name)
VALUES (
  'view_aaaa-bbbb-cccc-dddd',
  'default',
  E'You are a financial assistant specializing in journal postings (the "posting" model).\n\nCurrent date: {{currentDate}}\nUser: {{userId}}\n\n{{#if context.recordId}}\nYou are working with posting record {{context.recordId}}.\n{{else}}\nNo specific posting is selected. Help the user search, create, or analyze postings.\n{{/if}}\n\nAVAILABLE MODELS:\n{{accessibleModels}}',
  true,
  0,
  1,
  NULL
);
```

**Step 3: When this prompt is used.**

When the user opens a posting page and the frontend sends `context.modelName = 'posting'`, the agent loads this template. The `DynamicPromptManager` matches it via `view.model_name = 'posting'` and `prompt_type = 'default'`.

**Comparison with existing models:**

This follows the same pattern as `purchase_requisition` and `invoice`. The only differences are:
- `model_name` and `view.name` values.
- The prompt text content (domain-specific instructions).
- The tool bundle (posting can use the `default` bundle unless custom tools are needed).

If an analytics prompt is also desired, add a second row with `prompt_type = 'analytics'` and `priority = 10`. When the user asks an analytical question about postings, `AgentService` will set `promptTypes = ['analytics', 'default']` and both templates will be loaded and merged.

---

## 7. Frontend: Conversation Management and Context Assembly

This section covers how the React frontend manages chat state, builds page context, and sends it to the backend.

### 7.1 Component Tree and Providers

The `ChatProvider` is mounted near the top of the React tree in `frontend-1/src/App.tsx`:

```
QueryClientProvider
  └─ ConfigProvider (Ant Design theme)
       └─ TooltipProvider
            └─ ChatProvider            ← chat state lives here
                 └─ ToolProvider       ← stores tool invocation results
                      └─ AppRoutes    ← all routed pages
```

Because `ChatProvider` wraps all routes, every page can call `useChat()` to read or update chat state.

### 7.2 ChatContext -- State Shape

`frontend-1/src/contexts/ChatContext.tsx` exports the `ChatProvider` and the `useChat` hook.

**PageContext interface** (the object sent to the backend as `context`):

```typescript
interface PageContext {
  modelName: string;              // Prisma model name, e.g. 'purchase_order'
  viewName: string;               // View name, e.g. 'purchase_order_view'
  recordId?: string | null;       // Set when on a record detail page
  stateId?: string | null;        // Workflow state (e.g. 'Draft')
  viewId?: string | null;         // View configuration ID
  modelDisplayName?: string | null; // Human label, e.g. 'Purchase Orders'
  currentPath?: string;           // Current URL pathname
  promptTypes?: string[];         // e.g. ['default', 'line_item']
}
```

**ChatContext state:**

| State | Type | Initial | Purpose |
|-------|------|---------|---------|
| `isChatOpen` | `boolean` | `false` | Whether the chat sidebar is visible |
| `pageContext` | `PageContext \| null` | `null` | Current page/record context -- drives prompt selection and suggestions |
| `messagesAi` | `any[]` | `[]` | Conversation messages kept in React state across navigations |

**Exposed functions:**

| Function | Effect |
|----------|--------|
| `toggleChat()` | Flips `isChatOpen` |
| `setPageContext(ctx)` | Replaces page context (called by page components on mount) |
| `setMessagesAi(msgs)` | Syncs AI SDK messages into context for cross-navigation persistence |
| `clearMessages()` | Empties `messagesAi` (triggered by "New Chat" button) |

### 7.3 How Pages Set Context

Every page that supports chat calls `setPageContext()` inside a `useEffect` that depends on route params:

**List page** (`frontend-1/src/pages/Master.tsx:149`):
```typescript
useEffect(() => {
  setPageContext({
    modelName: type,                    // e.g. 'supplier'
    viewName: view,                     // e.g. 'supplier_view'
    recordId: null,                     // no record on list pages
    stateId: null,
    modelDisplayName: getModelDisplayName(type),
    currentPath: location.pathname,
  });
  return () => setPageContext(null);     // cleanup on unmount
}, [type, view, location.pathname, setPageContext]);
```

**Detail page** (`frontend-1/src/pages/PurchaseOrderDetails.tsx:13`):
```typescript
useEffect(() => {
  if (id) {
    setPageContext({
      modelName: 'purchase_order',
      viewName: getViewName('purchase_order'),
      recordId: id,                     // specific record
      stateId: stateId || null,         // workflow state
      viewId: viewId || null,
      modelDisplayName: getModelDisplayName('purchase_order'),
      currentPath: location.pathname,
    });
  }
  return () => setPageContext(null);
}, [id, stateId, viewId, location.pathname, setPageContext]);
```

**Detail page with custom prompt types** (`frontend-1/src/pages/PurchaseRequisitionDetail.tsx:13`):
```typescript
setPageContext({
  modelName: 'purchase_requisition',
  viewName: getViewName('purchase_requisition'),
  recordId: id,
  promptTypes: ['default', 'line_item'],   // requests line_item prompt in addition to default
});
```

The cleanup function (`return () => setPageContext(null)`) ensures context is cleared when the user navigates away.

### 7.4 Conversation Threads and Persistence

There is **no multi-thread system** and **no server-side conversation storage**:

| Aspect | Behavior |
|--------|----------|
| **Storage** | React state only (`messagesAi` in `ChatContext`). No localStorage, no database table. |
| **Lifetime** | Messages survive React navigation (because `ChatContext` wraps all routes) but are lost on browser refresh. |
| **New thread** | User clicks "New Chat" in the chat header, which calls `clearMessages()` and `setMessages([])`. |
| **Thread switching** | Not supported. There is a single conversation at any time. |
| **Context changes** | When the user navigates to a different page, `pageContext` updates but the message history is **not** cleared. The next user message is sent with the new context. |

**Two-way sync between AI SDK and ChatContext** (`frontend-1/src/components/chat/ChatUI.tsx:123-132`):

```typescript
// On mount, restore messages from context (survives navigation)
useEffect(() => {
  if (messagesAi.length > 0 && messages.length === 0) {
    setMessages(messagesAi);
  }
}, [messagesAi, messages.length, setMessages]);

// On every message change, persist to context
useEffect(() => {
  setMessagesAi(messages);
}, [messages, setMessagesAi]);
```

### 7.5 ChatUI -- Request Assembly

`frontend-1/src/components/chat/ChatUI.tsx` uses Vercel AI SDK's `useChat` hook configured as follows:

```typescript
const { messages, setMessages, input, append, isLoading, status, error } = useChat({
  api: `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/agent/chat/stream`,
  headers: {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`,
  },
  body: {
    stream: true,
    context: pageContext || undefined,
  },
  experimental_prepareRequestBody: ({ id, messages }) => {
    const transformedMessages = messages.map(msg =>
      msg.role === 'user' ? transformUserMessage(msg) : msg
    );
    const body: any = { id, stream: true, messages: transformedMessages };
    if (pageContext) body.context = pageContext;
    return body;
  },
  onFinish: (message) => {
    // Extract completed tool invocations and store in ToolContext
    if (message.toolInvocations) {
      message.toolInvocations
        .filter(t => t.state === 'result')
        .forEach(t => addToolData({ toolName: t.toolName, ...t.result }));
    }
  },
});
```

**Key points:**
- `experimental_prepareRequestBody` transforms user messages (converts file attachments to base64 parts) and attaches `pageContext`.
- `onFinish` stores completed tool results in `ToolContext` so `ToolResponseRenderer` can display them.
- The `Authorization` header carries a bearer token obtained from `AuthContext`.

### 7.6 File Attachments

Users can attach files via a file-picker button or drag-and-drop onto the chat area.

**Processing** (`frontend-1/src/components/chat/chatUtils.ts`):

1. `readFileAsDataURL(file)` -- reads a `File` as a base64 data URL.
2. `buildFileParts(files)` -- converts `File[]` into `MessagePart[]`:
   ```typescript
   { type: 'file', data: dataUrl, mimeType: file.type, mediaType: file.type, name: file.name }
   ```
3. Parts are concatenated with the text part and passed to `append()`.

The backend receives files inline in the `messages[].content` array as base64-encoded data URL strings. File upload via the `/api/agent/extract` endpoint (multer, 10MB limit, memory storage) is a separate path used for invoice extraction.

### 7.7 Chat Panel Layout

The chat panel renders in two modes depending on where the user is:

**Sidebar mode** (non-dashboard pages -- `frontend-1/src/components/layout/AppLayout.tsx:181`):
```
┌──────────────────────────────────────────────────────────────┐
│  TopBar (z-50, fixed)         [Notifications] [Chat] [User] │
├──────────┬───────────────────────────────────┬───────────────┤
│ Sidebar  │  Main content area                │  Chat panel   │
│ (nav)    │  (shrinks when chat open)         │  (20.666%     │
│          │                                    │   of viewport,│
│          │                                    │   z-40,       │
│          │                                    │   fixed right) │
└──────────┴───────────────────────────────────┴───────────────┘
```

- The main `<main>` element shifts left via `right-[20.666%]` when `isChatOpen` is true.
- The chat `<aside>` is fixed to the right edge, full height below the top bar.
- Transition: `duration-500 ease-in-out`.

**Full page mode** (dashboard -- `frontend-1/src/pages/Dashboard.tsx`):
- When `isChatOpen` on the dashboard, `ChatUI` replaces the dashboard content entirely (no sidebar layout).

**Toggle** (`frontend-1/src/components/layout/TopBar.tsx:82`):
- A `MessageSquare` icon button in the top bar calls `toggleChat()`.
- The button only renders if `VITE_ENABLE_AI === 'true'`.

### 7.8 Context-Aware Suggestions

`frontend-1/src/components/chat/chatUtils.ts:94` generates suggestion chips shown when the conversation is empty:

```typescript
function getContextSuggestions(context: PageContext | null): string[] {
  if (context?.modelDisplayName) {
    const name = context.modelDisplayName.toLowerCase();
    return [
      `Show details for this ${name}`,
      `What actions can I take on this ${name}?`,
      `Explain the current status`,
      `Show related records`,
    ];
  }
  return DEFAULT_SUGGESTIONS;  // generic prompts when no model context
}
```

The input placeholder also changes: `"Ask about this purchase order"` vs `"Ask anything"`.

### 7.9 Tool Response Rendering and Context Updates

When the LLM invokes tools, their results are rendered by `ToolResponseRenderer` (`frontend-1/src/components/chat/tool-responses/ToolResponseRenderer.tsx`):

| Tool result type | Rendered as |
|------------------|-------------|
| `searchRecords` / any `*search*` tool | `SearchResultsTable` -- clickable rows navigate to record pages |
| `uiHint: 'table'` + `resultType: 'sql_result'` | `SqlResultsTable` -- formatted table with status badges, date formatting |
| `uiHint: 'metrics'` | `MetricsDisplay` -- cards with large values, currency formatting |
| `uiHint: 'invoice map'` | `InvoiceMapPreview` -- extracted invoice summary with "Map to Bill" button |
| `createRecord` / `updateRecord` | Success message with "View" button navigating to the new record |

**Automatic context update on record creation** (`ToolResponseRenderer.tsx:34`):

When `createRecord` succeeds, a `useEffect` automatically calls:
```typescript
setPageContext({
  modelName: result.model,
  viewName: getViewName(result.model),
  recordId: String(result.data.id),
});
```

This means subsequent messages in the same conversation will have the newly created record's context without the user navigating away.

### 7.10 Frontend File Map

| File | Purpose |
|------|---------|
| `frontend-1/src/contexts/ChatContext.tsx` | `ChatProvider`, `useChat` hook, `PageContext` interface |
| `frontend-1/src/contexts/ToolContext.tsx` | `ToolProvider`, stores tool invocation results |
| `frontend-1/src/components/chat/ChatUI.tsx` | Main chat component -- `useChat` (AI SDK), message rendering, file handling |
| `frontend-1/src/components/chat/chatUtils.ts` | Message transformation, file-to-base64, context-aware suggestions |
| `frontend-1/src/components/chat/ChatDrawer.tsx` | Drawer wrapper (alternative to sidebar, not currently mounted) |
| `frontend-1/src/components/chat/FileAttachment.tsx` | Renders file attachments in message bubbles |
| `frontend-1/src/components/chat/FileInputDisplay.tsx` | Renders selected files above the input before sending |
| `frontend-1/src/components/chat/LoadingIndicator.tsx` | Animated "Thinking..." / "Querying {tool}..." indicator |
| `frontend-1/src/components/chat/tool-responses/ToolResponseRenderer.tsx` | Dispatches tool results to specialized renderers |
| `frontend-1/src/components/chat/tool-responses/SqlResultsTable.tsx` | Renders SQL query results as a table |
| `frontend-1/src/components/chat/tool-responses/MetricsDisplay.tsx` | Renders aggregation metrics as cards |
| `frontend-1/src/components/chat/tool-responses/InvoiceMapPreview.tsx` | Renders extracted invoice data with mapping action |
| `frontend-1/src/components/chat/SearchResultsTable.tsx` | Renders search results with clickable rows |
| `frontend-1/src/components/layout/AppLayout.tsx` | Main layout -- sidebar chat panel rendering |
| `frontend-1/src/components/layout/TopBar.tsx` | Chat toggle button |
| `frontend-1/src/components/utils/helper.ts` | `handleToolResponse()` -- navigation after tool execution |
| `frontend-1/src/utils/modelDisplayNames.ts` | `getModelDisplayName()`, `getViewName()` utilities |

---

## Glossary

| Term | Meaning |
|------|---------|
| **view** | A metadata record that defines which fields of a Prisma model are accessible (and with what permissions) for a given role. Views also serve as the anchor for prompt templates. Not a database view -- a row in the `view` table. |
| **model** (data model) | A Prisma model (e.g., `purchase_requisition`, `posting`). Represented in `ModelRegistry` with metadata (fields, types, synonyms, examples). Not an LLM model. |
| **ModelRegistry** | An in-memory registry of all Prisma models, populated at server startup from `PrismaSchemaParser`. Provides `getAccessibleModels(permissions)` and `getModelMetadata(modelName)`. Has nothing to do with LLM model selection. |
| **ModelService** | Singleton (`backend/src/services/core/ModelService.ts`) that provides authenticated CRUD, search, and SQL execution. All agent tools delegate to it. |
| **context** | The `PageContext` object sent by the frontend, containing `modelName`, `viewName`, `recordId`, `stateId`, `viewId`, `promptTypes`. Determines prompt selection and tool bundle. |
| **accessible models** | The subset of `ModelRegistry` models that the current user has permission to access, as determined by `ModelRegistry.getAccessibleModels(auth.permissions)`. |
| **question classification** | A regex-based classifier (`questionClassifier.ts`) that labels questions as `transactional` or `analytical`. Used for **observability only** -- does not affect tool selection or maxSteps. Logged to `llm_trace` for analysis. |
| **prompt_type** | A string (e.g., `'default'`, `'analytics'`, `'invoice_extractor'`, `'line_item'`) stored in `prompt_template.prompt_type`. Multiple types can be requested per conversation turn. |
| **tool bundle** | The set of tools passed to the LLM for a given request, assembled by `ToolManager` based on `modelName` and question classification. |
| **DynamicPromptManager** | Class (`backend/src/agent/prompt/DynamicPromptManager.ts`) responsible for loading, merging, and interpolating prompt templates into the final system prompt. |
| **TOOL_RESPONSE_HANDLING_GUIDELINE** | A constant (`backend/src/agent/prompt/constants.ts`) appended to all system prompts. Instructs the LLM not to echo structured data, not to show IDs, and not to include system fields in CRUD calls. |
| **ChatContext** | React context (`frontend-1/src/contexts/ChatContext.tsx`) that holds `isChatOpen`, `pageContext`, and `messagesAi`. Wraps the entire app via `ChatProvider`. |
| **PageContext** | An object built by each page component describing the current model, view, record, and workflow state. Sent to the backend as `context` in every chat request. |
| **ToolContext** | React context (`frontend-1/src/contexts/ToolContext.tsx`) that accumulates tool invocation results from the LLM response. Used by `ToolResponseRenderer` to display structured results. |
| **useChat (AI SDK)** | The `useChat` hook from `@ai-sdk/react` used in `ChatUI.tsx`. Manages the message array, streaming, and request assembly. Not the same as `useChat` from `ChatContext`. |

---

## Appendix A: Agent HTTP Endpoints

All endpoints are mounted at `/api/agent` (registered in `backend/src/index.ts:67`).

| Method | Path | Purpose | Auth | Response |
|--------|------|---------|------|----------|
| POST | `/chat` | Non-streaming chat | `authMiddleware` | JSON `{ choices: [{ message }], steps }` |
| POST | `/chat/stream` | Streaming chat (SSE) | `authMiddleware` | `text/event-stream` |
| POST | `/request` | Legacy request format | `authMiddleware` | JSON |
| POST | `/extract` | File upload + AI extraction | `authMiddleware` + multer (10MB, memory) | JSON `{ content, toolResults, fileInfo }` |
| POST | `/erp/categorize-transaction` | Single transaction categorization | `authMiddleware` | JSON `{ success, prediction, confidence_score }` |
| POST | `/erp/categorize-transaction-batch` | Batch categorization | `authMiddleware` | JSON array |
| GET | `/health` | Health check | None | JSON `{ status }` |

## Appendix B: Frontend Request Shape

The frontend (`frontend-1/src/components/chat/ChatUI.tsx`) uses Vercel AI SDK's `useChat` hook, posting to `/api/agent/chat/stream`:

```typescript
{
  id: string;
  stream: true;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<
      | { type: 'text'; text: string }
      | { type: 'file'; data: string /* base64 */; mimeType: string }
    >;
  }>;
  context?: PageContext;  // set when user is on a model page
}
```

The `Authorization` header carries a bearer token read from the `__session` cookie. Messages are persisted only in React state (via `ChatContext`) -- there is no server-side conversation storage. The `ai_activity_log` table tracks AI operations for audit purposes but does not store conversation history.

## Appendix C: Environment Variables Referenced by the Agent

| Variable | Default | Effect |
|----------|---------|--------|
| `LLM_PROVIDER` | `'vertex'` | LLM provider selection (currently Google Vertex AI) |
| `LLM_MODEL` | `'gemini-2.0-flash-001'` | Model identifier passed to Vercel AI SDK |
| `AGENT_MAX_STEPS` | `5` | Maximum steps in the LLM tool execution loop. Increase for complex multi-step analytics (e.g., 8), decrease for simpler use cases (e.g., 3). |
| `USE_LOCAL_PROMPT` | `undefined` | If `'true'`, prompts load from local JSON/TXT files instead of the database |
| `APP_NAME` | `undefined` | Filters prompt templates by `app_name` column (e.g., `'zeiv'`, `'perfin'`) |
| `NODE_ENV` | `undefined` | If `'development'`, error stack traces are included in responses |
| `SKIP_PERMISSION_CHECKS` | `undefined` | If `'true'`, bypasses permission validation (development only) |
| **Frontend (Vite)** | | |
| `VITE_API_BASE_URL` | `'http://localhost:4000'` | Backend API base URL used by `useChat` and all API calls |
| `VITE_ENABLE_AI` | `undefined` | If `'true'`, the chat toggle button appears in the TopBar |
