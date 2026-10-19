# DynamicPromptManager

The `DynamicPromptManager` is responsible for generating system prompts for AI agents. It supports two modes of operation: reading from JSON files (local metadata) or from the database, controlled by the `USE_LOCAL_PROMPT` environment variable.

## Overview

- **When `USE_LOCAL_PROMPT=true`**: Reads prompt files under `prisma/metadata/` if that directory is present. This branch does not include it.
- **When `USE_LOCAL_PROMPT=false` or unset**: Reads prompts from the `prompt_template` table. This is the path `setup:kernel` uses.

Both modes follow the same logic and flow - only the data source differs.

## Flow

### 1. generateDynamicPrompt()

Main entry point for generating prompts.

```
generateDynamicPrompt(permissions)
  ↓
getPromptTemplates()  // Chooses data source based on USE_LOCAL_PROMPT
  ↓
mergeTemplates()      // Merges multiple templates by priority
  ↓
Add model descriptions (if permissions provided)
  ↓
replacePlaceholders() // Replaces {{placeholders}} with actual values
  ↓
Returns final prompt string
```

### 2. getPromptTemplates()

Determines the data source and retrieves prompt templates.

```
getPromptTemplates()
  ├─ USE_LOCAL_PROMPT=true?
  │  ├─ YES → getPromptTemplatesFromFiles()
  │  └─ NO  → getPromptTemplatesFromDatabase()
  │
  └─ Returns: PromptTemplate[]
```

#### Local File Mode (`getPromptTemplatesFromFiles()`)

1. **Find View File**:
   - Searches `prisma/metadata/views/` for a JSON file matching `model_name` and `viewName`, when that directory exists
   - Extracts `view_id` from the view file

2. **Find Template Files**:
   - Looks for files matching pattern: `view_{view_id}_{prompt_type}.json`
   - Reads metadata from `.json` file
   - Reads prompt text from corresponding `.txt` file
   - Filters by `app_name` if `APP_NAME` env var is set

3. **Returns**: Array of `PromptTemplate` objects

#### Database Mode (`getPromptTemplatesFromDatabase()`)

1. **Query Database**:
   - Queries `prompt_template` table via Prisma
   - Filters by:
     - View relationship (`view.model_name` and `view.name`)
     - Prompt type (defaults to 'default' if not specified)
     - App name (if `APP_NAME` env var is set)
   - Orders by: `is_default DESC, priority ASC, version DESC`

2. **Returns**: Array of `PromptTemplate` objects

### 3. mergeTemplates()

Merges multiple templates into a single prompt string.

- Sorts templates by: `is_default` → `priority` → `version`
- Combines prompt text with `\n\n` separator
- Returns merged prompt string

### 4. replacePlaceholders()

Replaces template variables with actual values.

**Supported Placeholders:**

- `{{currentDate}}` → Current ISO timestamp (now; do not use alone for "today" day filters)
- `{{todayStart}}` / `{{todayEnd}}` → start/end of today in app TZ (default IST)
- `{{last7DaysStart}}` / `{{recentFromDate}}` → start of last 7 calendar days (recent listings)
- `{{weekStart}}` → Monday of current week (app TZ)
- `{{lastWeekStart}}` / `{{lastWeekEnd}}` → previous calendar week Mon–Sun (`gte` start, `lt weekStart` or `lte lastWeekEnd`)
- `{{monthStart}}` → first instant of current month (app TZ; may appear as prior UTC date)
- `{{nextMonthStart}}` → first instant of next month (app TZ) — use with `lt` as exclusive end for **this month**
- `{{monthEnd}}` → last instant of current month (app TZ) — alternative to `lt nextMonthStart`
- `{{lastMonthStart}}` / `{{lastMonthEnd}}` → previous calendar month (`gte` start, `lt monthStart`)
- `{{userId}}` → Current user ID
- `{{modelName}}` → Model name
- `{{viewName}}` → View name
- `{{promptType}}` → Prompt type(s)
- `{{context.recordId}}` → Record ID from context
- `{{context.stateId}}` → State ID from context
- `{{context.viewId}}` → View ID from context
- `{{accessibleModels}}` → Formatted model descriptions

**Conditional Blocks:**

- `{{#if context.recordId}}...{{else}}...{{/if}}` → Removes blocks based on context

## Metadata

Prompt text for this app is a `prompt_template` row. `setup:kernel` does not load a JSON catalog, and `npm run sync-metadata` is not a script on this branch.

## File Structure

File mode expects this layout. The directory is not in this branch.

```
prisma/metadata/
├── views/
│   └── {model_name}_{view_name}.json    # View definitions
└── prompt-templates/
    ├── view_{view_id}_{prompt_type}.json  # Template metadata
    └── view_{view_id}_{prompt_type}.txt   # Template text
```

### Database Tables

- `view`: Stores view definitions (links to `model_name`)
- `prompt_template`: Stores prompt templates (links to `view_id`)

## Example Usage

```typescript
const promptManager = new DynamicPromptManager(
  org_id,
  user_id,
  "invoice", // modelName
  "invoice_view", // viewName (optional)
  ["default"], // promptTypes (optional)
  { recordId: "123" } // context (optional)
);

const prompt = await promptManager.generateDynamicPrompt(permissions);
```
