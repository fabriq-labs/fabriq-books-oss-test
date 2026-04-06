# Quick Start Guide

## Initial Setup: Pull from Production Database

1. **Set your production database URL:**

   ```bash
   export PROD_DATABASE_URL="postgresql://user:password@host:port/database"
   ```

2. **Pull views from production:**

   ```bash
   npm run pull-metadata
   ```

   This will:
   - Connect to your production database
   - Export all views to JSON files in `prisma/metadata/views/`
   - Create one JSON file per view

3. **Pull prompt templates from production:**

   ```bash
   npm run pull-prompt-templates
   ```

   This will:
   - Connect to your production database
   - Export all prompt templates to JSON files in `prisma/metadata/prompt-templates/`
   - Create one JSON file per template

4. **Sync to your local database:**

   ```bash
   # Sync views
   npm run sync-metadata
   
   # Sync prompt templates
   npm run sync-prompt-templates
   ```

   This will:
   - Read all JSON files from respective directories
   - Upsert to your local database
   - Show summary of what was synced

## Daily Workflow

### For Views:

1. **Edit a view JSON file:**

   ```bash
   # Edit any file in prisma/metadata/views/
   # Example: prisma/metadata/views/account_accountFullAccess.json
   ```

2. **Sync changes to local database:**

   ```bash
   npm run sync-metadata
   ```

3. **Test your changes locally**

4. **Commit and push:**

   ```bash
   git add prisma/metadata/views/
   git commit -m "Update account view metadata"
   git push
   ```

5. **Team members pull and sync:**
   ```bash
   git pull
   npm run sync-metadata
   ```

### For Prompt Templates:

1. **Edit a prompt template JSON file:**

   ```bash
   # Edit any file in prisma/metadata/prompt-templates/
   # Example: prisma/metadata/prompt-templates/view_xxx_default.json
   ```

2. **Sync changes to local database:**

   ```bash
   npm run sync-prompt-templates
   ```

3. **Test your changes locally**

4. **Commit and push:**

   ```bash
   git add prisma/metadata/prompt-templates/
   git commit -m "Update prompt template"
   git push
   ```

5. **Team members pull and sync:**
   ```bash
   git pull
   npm run sync-prompt-templates
   ```

## Available Commands

### Views:
- `npm run pull-metadata` - Pull latest views from production database
- `npm run sync-metadata` - Sync JSON files to local database

### Prompt Templates:
- `npm run pull-prompt-templates` - Pull latest prompt templates from production database
- `npm run sync-prompt-templates` - Sync JSON files to local database

## File Structure

```
prisma/metadata/
├── views/
│   ├── account_accountFullAccess.json
│   ├── user_userFullAccess.json
│   ├── invoice_invoice_view.json
│   └── ...
└── prompt-templates/
    ├── view_xxx_default.json
    ├── view_xxx_edit.json
    └── ...
```

### View JSON File contains:
- `id` - View ID
- `name` - View name
- `model_name` - Model name
- `description` - View description
- `data_graph` - The metadata configuration (JSON object)
- `org_id` - Organization ID (if applicable)
- `created_by` - Creator user ID (if applicable)
- `modified_by` - Last modifier user ID (if applicable)

### Prompt Template JSON File contains:
- `id` - Prompt template ID
- `view_id` - Associated view ID
- `prompt_type` - Type of prompt (e.g., 'default', 'edit', 'basicinfo')
- `prompt_text` - The actual template text
- `is_default` - Whether this is the default template
- `version` - Version number
- `priority` - Priority for merge/display order
- `context` - Optional context/notes
- `org_id` - Organization ID (if applicable)
- `app_name` - Application name (if applicable)
- `created_by` - Creator user ID (if applicable)
- `modified_by` - Last modifier user ID (if applicable)

## Troubleshooting

**Error: PROD_DATABASE_URL not set**

- Make sure you've exported the environment variable before running `npm run pull-metadata`

**Error: Views directory not found**

- Run `npm run pull-metadata` first to create the directory and files

**Error: Prompt templates directory not found**

- Run `npm run pull-prompt-templates` first to create the directory and files

**Views not syncing**

- Check that JSON files are valid JSON
- Verify `name`, `model_name`, and `org_id` fields are present
- Check database connection in `.env` file

**Prompt templates not syncing**

- Check that JSON files are valid JSON
- Verify `view_id`, `prompt_type`, and `org_id` fields are present
- Check database connection in `.env` file
