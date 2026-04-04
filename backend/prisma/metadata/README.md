# Metadata Management

This directory contains version-controlled metadata definitions for views, prompt templates, roles, and permissions.

## Structure

- `views/` - Individual JSON files for each view definition
  - File naming: `{model_name}_{view_name}.json`
  - Example: `account_accountFullAccess.json`
- `prompt-templates/` - Individual JSON files for each prompt template
  - File naming: `{view_id}_{prompt_type}.json`
  - Example: `view_35eca395-ee06-4448-97a7-ff7ca108f2e3_default.json`

## Usage

### Pulling Views from Production Database

To pull the latest views from your production database:

```bash
# Set your production database URL
export PROD_DATABASE_URL="postgresql://user:password@host:port/database"

# Run the pull script
npm run pull-metadata
```

This will:

1. Connect to the production database
2. Export all views to JSON files in `views/` directory
3. Overwrite existing files with latest data

### Syncing Views to Local Database

After editing JSON files or pulling from production, sync to your local database:

```bash
npm run sync-metadata
```

This will:

1. Read all JSON files from `views/` directory
2. Upsert views to your local database (matched by `name` + `model_name` + `org_id`)
3. Show summary of what was synced

### Pulling Prompt Templates from Production Database

To pull the latest prompt templates from your production database:

```bash
# Set your production database URL
export PROD_DATABASE_URL="postgresql://user:password@host:port/database"

# Run the pull script
npm run pull-prompt-templates
```

This will:

1. Connect to the production database
2. Export all prompt templates to JSON files in `prompt-templates/` directory
3. Overwrite existing files with latest data

### Syncing Prompt Templates to Local Database

After editing JSON files or pulling from production, sync to your local database:

```bash
npm run sync-prompt-templates
```

This will:

1. Read all JSON files from `prompt-templates/` directory
2. Upsert prompt templates to your local database (matched by `view_id` + `prompt_type` + `org_id`)
3. Show summary of what was synced

## Workflow

### For Views:
1. **Pull latest from production**: `npm run pull-metadata`
2. **Edit JSON files** in `views/` as needed
3. **Sync to local database**: `npm run sync-metadata`
4. **Commit and push** changes to Git
5. **Team members pull** and run `npm run sync-metadata`

### For Prompt Templates:
1. **Pull latest from production**: `npm run pull-prompt-templates`
2. **Edit JSON files** in `prompt-templates/` as needed
3. **Sync to local database**: `npm run sync-prompt-templates`
4. **Commit and push** changes to Git
5. **Team members pull** and run `npm run sync-prompt-templates`

## File Format

### View JSON File

Each view JSON file contains:

```json
{
  "id": "view_xxx",
  "name": "viewName",
  "model_name": "modelName",
  "description": "View description",
  "data_graph": { ... },
  "org_id": "52",
  "created_by": null,
  "modified_by": null
}
```

### Prompt Template JSON File

Each prompt template JSON file contains:

```json
{
  "id": "ptem_xxx",
  "view_id": "view_xxx",
  "prompt_type": "default",
  "prompt_text": "Template text...",
  "is_default": true,
  "version": 1,
  "priority": 0,
  "context": "Optional context",
  "org_id": "1",
  "app_name": null,
  "created_by": null,
  "modified_by": null
}
```

## Benefits

- ✅ Single source of truth in Git
- ✅ Easy to review changes via PRs
- ✅ No merge conflicts (one file per view)
- ✅ Easy to edit (JSON is human-readable)
- ✅ Fast sync to local database
