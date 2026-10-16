# Prompt Template Module

## Navigation

### How to Access

**Direct URL:**
```
/master/prompt-templates
```

**Routes:**
- List View: `/master/prompt-templates`
- Create New: `/prompt_template/view/:viewId`
- Edit Existing: `/prompt_template/:id/view/:viewId`

**Note:** Currently not visible in sidebar navigation. Access via direct URL.

## Schema Details

### Validation Schema (Zod)

```typescript
const promptTemplateSchema = z.object({
    view_id: z.string().min(1, { message: 'View/Model is required' }),
    prompt_type: z.string().min(1, { message: 'Prompt type is required' }),
    prompt_text: z.string().min(1, { message: 'Prompt text is required' }),
    is_default: z.boolean().default(false),
    version: z.number().min(1, { message: 'Version must be at least 1' }),
    priority: z.number().min(0, { message: 'Priority must be at least 0' }),
    context: z.string().optional(),
});
```

### Field Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `view_id` | string | Yes | View/Model ID associated with the template |
| `prompt_type` | string | Yes | Type/category (e.g., "Email", "Chat", "Analysis") |
| `prompt_text` | string | Yes | HTML-formatted prompt template with variables |
| `is_default` | boolean | No | Default: false. Marks as default template |
| `version` | number | Yes | Version number (min: 1) |
| `priority` | number | Yes | Priority level (min: 0) for template selection |
| `context` | string | No | Optional notes or usage instructions |

### Variables in Prompt Text

Use `{{variable_name}}` syntax for dynamic content:
```html
<h1>Welcome {{user_name}}!</h1>
<p>Order {{order_id}} processed.</p>
```

## What is the Use?

The Prompt Template module allows you to:

1. **Create reusable AI prompts** with HTML formatting and variable placeholders
2. **Manage prompt versions** with versioning control
3. **Set priorities** to control which template is selected when multiple templates match
4. **Mark default templates** for specific prompt types
5. **Store context/notes** for documentation and usage instructions

**Use Cases:**
- Email generation templates
- Chat response templates
- Data analysis prompts
- Report generation prompts
- Any AI-powered text generation with dynamic content

**Key Features:**
- Rich HTML editor with formatting tools
- Live preview of formatted prompts
- Variable support for dynamic content
- Version and priority management
- Default template selection
