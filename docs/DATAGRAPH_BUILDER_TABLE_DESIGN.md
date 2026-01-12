# Datagraph Builder - Table-Based Design

## Overview

A compact, table-based datagraph editor that shows all Prisma model fields in an editable table format. Fields can be included/excluded via a checkbox, and all properties are editable directly in table cells.

## Design Principles

1. **Show All Fields**: Display every field from the Prisma model schema
2. **Compact Layout**: Table format instead of cards for better space utilization
3. **Inclusion Toggle**: "Included in datagraph" checkbox enables/disables field editing
4. **Merge on Load**: Existing datagraph merges with Prisma schema to show all fields
5. **Inline Editing**: All properties editable directly in table cells

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  View Master - Edit View                                    [Back to list]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Basic Information                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Name: [supplier_view]                                                │  │
│  │ Model Name: [supplier]                                               │  │
│  │ Description: [Default view for supplier...]                         │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Datagraph Builder                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ [+ Add Relation]  [Import from View]  [Expand All] [Collapse All] │  │
│  │                                                                     │  │
│  │ Scalar Fields                                                       │  │
│  │ ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │ │ ✓ │ Field      │ Type   │ Perm │ Display    │ Req │ Show │ ... │ │  │
│  │ ├───┼────────────┼────────┼──────┼────────────┼─────┼──────┼─────┤ │  │
│  │ │ ☑ │ id         │ string │ read │ ID          │ ☐   │ ☐    │ ... │ │  │
│  │ │ ☑ │ supplier_  │ string │ upd  │ Supplier    │ ☑   │ ☑    │ ... │ │  │
│  │ │    │ name       │        │      │ Name        │     │      │     │ │  │
│  │ │ ☐ │ city       │ string │ -    │ -           │ -   │ -    │ ... │ │  │
│  │ │ ☑ │ primary_   │ string │ upd  │ Primary     │ ☑   │ ☑    │ ... │ │  │
│  │ │    │ email      │        │      │ Email       │     │      │     │ │  │
│  │ │ ☑ │ payment_   │ string │ upd  │ Payment     │ ☐   │ ☑    │ ... │ │  │
│  │ │    │ term_id    │        │      │ Terms       │     │      │     │ │  │
│  │ └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                     │  │
│  │ Relations                                                           │  │
│  │ ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │ │ ✓ │ Relation   │ Type   │ Nested Fields │ Display    │ Show │ ... │ │  │
│  │ ├───┼────────────┼────────┼───────────────┼────────────┼──────┼─────┤ │  │
│  │ │ ☑ │ payment_   │ table  │ [Configure]   │ Payment    │ ☐    │ ... │ │  │
│  │ │    │ terms      │        │               │ Terms      │      │     │ │  │
│  │ │ ☑ │ shipping_   │ table  │ [Configure]   │ Shipping   │ ☐    │ ... │ │  │
│  │ │    │ terms      │        │               │ Terms      │      │     │ │  │
│  │ │ ☐ │ supplier_  │ table  │ [Configure]   │ -          │ -    │ ... │ │  │
│  │ │    │ items      │        │               │            │      │     │ │  │
│  │ └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                     │  │
│  │ [Cancel]  [Preview JSON]  [Save]                                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Table Structure

### Scalar Fields Table

| Column | Type | Description | Editable When |
|--------|------|-------------|---------------|
| **Included** | Checkbox | Include field in datagraph | Always |
| **Field Name** | Text | Field name from schema | Never (read-only) |
| **Type** | Badge | Field type (string, number, date, boolean) | Never (read-only) |
| **Permission** | Dropdown | read / update | When included |
| **Display Name** | Text Input | Human-readable name | When included |
| **Required** | Checkbox | Field is required | When included |
| **Show in Table** | Checkbox | isColumnShow | When included |
| **Column Type** | Dropdown | text / select / checkbox / date / int | When included |
| **Search Enabled** | Checkbox | Enable search | When included |
| **Search Operation** | Dropdown | startswith / contains / equals | When included & search enabled |
| **Width** | Number | Column width (px) | When included |
| **Default Value** | Text | Default value | When included |
| **Actions** | Button | Expand for advanced options | When included |

### Relations Table

| Column | Type | Description | Editable When |
|--------|------|-------------|---------------|
| **Included** | Checkbox | Include relation in datagraph | Always |
| **Relation Name** | Text | Relation name from schema | Never (read-only) |
| **Type** | Badge | Always "table" | Never (read-only) |
| **Nested Fields** | Button | Configure nested select | When included |
| **Display Name** | Text Input | Human-readable name | When included |
| **Show in Table** | Checkbox | isColumnShow | When included |
| **Required** | Checkbox | Relation is required | When included |
| **Actions** | Button | Expand for advanced options | When included |

## Detailed Column Specifications

### Scalar Fields - Full Column Set

```
┌──────────┬──────────────┬────────┬──────────┬──────────────┬──────┬──────┬────────────┬──────────┬─────────────────┬───────┬──────────────┬─────────┬──────────┐
│ Included │ Field Name   │ Type   │ Permission│ Display Name │ Req  │ Show │ Column Type│ Search   │ Search Operation│ Width │ Default Value│ Order   │ Actions  │
├──────────┼──────────────┼────────┼──────────┼──────────────┼──────┼──────┼────────────┼──────────┼─────────────────┼───────┼──────────────┼─────────┼──────────┤
│ ☑        │ id           │ string │ read     │ ID           │ ☐    │ ☐    │ text       │ ☐        │ -               │ -     │ -            │ -       │ [⋮]      │
│ ☑        │ supplier_name │ string │ update   │ Supplier Name│ ☑    │ ☑    │ text       │ ☑        │ startswith      │ 500   │ ""           │ -       │ [⋮]      │
│ ☐        │ city         │ string │ -        │ -            │ -    │ -    │ -          │ -        │ -               │ -     │ -            │ -       │ -        │
└──────────┴──────────────┴────────┴──────────┴──────────────┴──────┴──────┴────────────┴──────────┴─────────────────┴───────┴──────────────┴─────────┴──────────┘
```

### Advanced Options Panel (Expandable)

When user clicks Actions (⋮) button, expand row to show:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Advanced Options for: supplier_name                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Select Props (for dropdown fields):                                    │
│   Instance Type:    [payment_terms]                                    │
│   Instance Key:     [id]                                                │
│   Instance Label:  [payment_terms]                                     │
│   Source Key:      [payment_term_id]                                   │
│   Search Params:   [payment_terms]                                      │
│   Limit:           [10]                                                 │
│                                                                         │
│ List Props:                                                             │
│   Type:             [badge]                                             │
│   Color:            [blue]                                              │
│                                                                         │
│ [Close]                                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Relation Configuration Modal

When user clicks "Configure" for a relation:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Configure Nested Fields: payment_terms                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Select fields from 'payment_terms' model:                               │
│                                                                         │
│ ┌───────────────────────────────────────────────────────────────────┐  │
│ │ ✓ │ Field Name    │ Type   │ Permission │ Display Name │ Show │  │  │
│ ├───┼───────────────┼────────┼────────────┼──────────────┼──────┤  │  │
│ │ ☑ │ id            │ string │ read       │ ID           │ ☐    │  │  │
│ │ ☑ │ payment_terms │ string │ update     │ Payment Terms│ ☑    │  │  │
│ │ ☐ │ description   │ string │ -          │ -            │ -    │  │  │
│ └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│ [Add Nested Relation]  [Cancel]  [Save]                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

For deeply nested relations, this modal can recursively show nested relation configuration.

## Data Flow

### Loading Existing Datagraph

```
1. User opens ViewForm for existing view
   ↓
2. Frontend fetches:
   - View data (including data_graph)
   - Model schema (GET /api/models/:modelName/schema)
   ↓
3. Merge Process:
   - Start with all fields from Prisma schema
   - For each field in existing data_graph:
     - Find matching field in schema
     - Merge properties (data_graph properties override defaults)
     - Mark as "included"
   - For fields not in data_graph:
     - Use schema defaults
     - Mark as "not included"
   ↓
4. Render table with merged data
```

### Saving Datagraph

```
1. User clicks Save
   ↓
2. Build datagraph object:
   - Iterate through table rows
   - For each included field:
     - Collect all non-empty properties
     - Build field object
   - For each included relation:
     - Collect nested select configuration
     - Build relation object
   ↓
3. Generate JSON
   ↓
4. Validate JSON structure
   ↓
5. Submit to backend
```

## Implementation Details

### Component Structure

```
DatagraphBuilder/
├── DatagraphBuilder.tsx          # Main component
├── ScalarFieldsTable.tsx         # Scalar fields table
├── RelationsTable.tsx             # Relations table
├── FieldRow.tsx                   # Individual field row
├── RelationRow.tsx                # Individual relation row
├── AdvancedOptionsPanel.tsx      # Expandable advanced options
├── RelationConfigModal.tsx       # Modal for nested relation config
└── types.ts                       # TypeScript types
```

### State Management

```typescript
interface DatagraphBuilderState {
  // Merged data: schema + existing datagraph
  fields: MergedField[];
  relations: MergedRelation[];
  
  // UI state
  expandedFields: Set<string>;      // Field names with expanded options
  openRelationModal: string | null; // Relation name being configured
  showPreview: boolean;
}

interface MergedField {
  // From schema
  name: string;
  type: string;
  isRequired: boolean;
  isId: boolean;
  
  // From datagraph (if exists)
  included: boolean;
  permission?: "read" | "update";
  displayName?: string;
  required?: boolean;
  isColumnShow?: boolean;
  tableProps?: TableProps;
  searchProps?: SearchProps;
  listProps?: ListProps;
  orderNo?: number;
}

interface MergedRelation {
  // From schema
  name: string;
  relationType: string;
  foreignKey?: string;
  relatedModel: string;
  
  // From datagraph (if exists)
  included: boolean;
  select?: Record<string, any>;
  displayName?: string;
  isColumnShow?: boolean;
  required?: boolean;
}
```

### Merge Logic

```typescript
function mergeSchemaWithDatagraph(
  schema: ModelSchema,
  datagraph: Record<string, any>
): MergedField[] {
  const merged: MergedField[] = [];
  
  // Start with all scalar fields from schema
  for (const field of schema.scalarFields) {
    const datagraphField = datagraph[field.name];
    
    merged.push({
      // Schema properties
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      isId: field.isId,
      
      // Datagraph properties (if exists)
      included: !!datagraphField,
      permission: datagraphField?.permission || datagraphField?.dataType ? "read" : undefined,
      displayName: datagraphField?.displayName,
      required: datagraphField?.required,
      isColumnShow: datagraphField?.isColumnShow,
      tableProps: datagraphField?.tableProps,
      searchProps: datagraphField?.searchProps,
      listProps: datagraphField?.listProps,
      orderNo: datagraphField?.orderNo,
    });
  }
  
  return merged;
}
```

### Generate Datagraph from Table

```typescript
function generateDatagraphFromTable(
  fields: MergedField[],
  relations: MergedRelation[]
): Record<string, any> {
  const datagraph: Record<string, any> = {};
  
  // Process scalar fields
  for (const field of fields) {
    if (!field.included) continue;
    
    const fieldConfig: any = {};
    
    // Add properties if they have values
    if (field.permission) fieldConfig.permission = field.permission;
    if (field.displayName) fieldConfig.displayName = field.displayName;
    if (field.required !== undefined) fieldConfig.required = field.required;
    if (field.isColumnShow !== undefined) fieldConfig.isColumnShow = field.isColumnShow;
    if (field.tableProps) fieldConfig.tableProps = field.tableProps;
    if (field.searchProps) fieldConfig.searchProps = field.searchProps;
    if (field.listProps) fieldConfig.listProps = field.listProps;
    if (field.orderNo) fieldConfig.orderNo = field.orderNo;
    
    // Add datatype if not a relation
    if (field.type) {
      fieldConfig.datatype = field.type.toLowerCase();
    }
    
    datagraph[field.name] = fieldConfig;
  }
  
  // Process relations
  for (const relation of relations) {
    if (!relation.included) continue;
    
    const relationConfig: any = {
      type: "table",
      dataType: "table",
    };
    
    if (relation.select) {
      relationConfig.select = relation.select;
    }
    if (relation.displayName) {
      relationConfig.displayName = relation.displayName;
    }
    if (relation.isColumnShow !== undefined) {
      relationConfig.isColumnShow = relation.isColumnShow;
    }
    if (relation.required !== undefined) {
      relationConfig.required = relation.required;
    }
    
    datagraph[relation.name] = relationConfig;
  }
  
  return datagraph;
}
```

## User Interactions

### Including/Excluding Fields

1. User toggles "Included" checkbox
2. If checked:
   - Enable all editable columns
   - Set default values if not present:
     - Permission: "read" (for id fields) or "update" (for others)
     - Display Name: Auto-generate from field name (e.g., "supplier_name" → "Supplier Name")
     - Show in Table: false (default)
     - Required: Use schema value
3. If unchecked:
   - Disable all editable columns
   - Clear values (but keep in state for undo)

### Editing Field Properties

- **Permission**: Dropdown with "read" and "update"
- **Display Name**: Text input with auto-suggestions
- **Required**: Checkbox (disabled for id fields)
- **Show in Table**: Checkbox
- **Column Type**: Dropdown (text, select, checkbox, date, int)
- **Search Enabled**: Checkbox
- **Search Operation**: Dropdown (enabled when search is on)
- **Width**: Number input
- **Default Value**: Text input

### Configuring Relations

1. User clicks "Configure" button in Relations table
2. Modal opens showing related model's fields
3. User selects fields to include in nested select
4. User can configure nested relations recursively
5. Save updates the relation's select object

## Responsive Design

### Desktop (> 1024px)
- Full table with all columns visible
- Horizontal scrolling if needed
- Side-by-side tables for scalar and relations

### Tablet (768px - 1024px)
- Hide less important columns (Width, Default Value, Order)
- Show in expandable panel
- Stack tables vertically

### Mobile (< 768px)
- Card view per field (fallback)
- Or horizontal scroll with sticky first column
- Modal for field configuration

## Validation

### Field Validation
- Display Name required when field is included
- Permission required when field is included
- Column Type required when Show in Table is true
- Search Operation required when Search Enabled is true
- Width must be positive number if provided

### Relation Validation
- Nested select must have at least one field when relation is included
- Display Name required when relation is included

### Datagraph Validation
- At least one field or relation must be included
- ID field should typically be included (warning, not error)

## Performance Considerations

1. **Virtual Scrolling**: For models with 50+ fields
2. **Lazy Loading**: Load relation schemas on-demand
3. **Debounced Updates**: Debounce JSON preview generation
4. **Memoization**: Memoize expensive computations

## Accessibility

- Keyboard navigation for all inputs
- Screen reader labels for all controls
- Focus management in modals
- ARIA labels for table headers
- Tooltips for column headers

## Example: Complete Table View

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Scalar Fields                                                                                                                              │
├──────┬──────────────┬────────┬──────────┬──────────────┬──────┬──────┬────────────┬──────────┬─────────────────┬───────┬──────────────┬─────────┬──────────┤
│ ✓    │ Field Name   │ Type   │ Permission│ Display Name │ Req  │ Show │ Column Type│ Search   │ Search Operation│ Width │ Default Value│ Order   │ Actions  │
├──────┼──────────────┼────────┼──────────┼──────────────┼──────┼──────┼────────────┼──────────┼─────────────────┼───────┼──────────────┼─────────┼──────────┤
│ ☑    │ id           │ string │ read     │ ID           │ ☐    │ ☐    │ text       │ ☐        │ -               │ -     │ -            │ -       │ [⋮]      │
│ ☑    │ supplier_name│ string │ update   │ Supplier Name│ ☑    │ ☑    │ text       │ ☑        │ startswith      │ 500   │ ""           │ -       │ [⋮]      │
│ ☑    │ primary_email│ string │ update   │ Primary Email│ ☑    │ ☑    │ text       │ ☐        │ -               │ 500   │ ""           │ -       │ [⋮]      │
│ ☑    │ primary_phone│ string │ update   │ Primary Phone│ ☑    │ ☑    │ text       │ ☐        │ -               │ 500   │ ""           │ -       │ [⋮]      │
│ ☑    │ payment_term_│ string │ update   │ Payment Terms│ ☐    │ ☑    │ select     │ ☐        │ -               │ -     │ ""           │ -       │ [⋮]      │
│      │ id           │        │          │              │      │      │            │          │                 │       │              │         │          │
│ ☐    │ city         │ string │ -        │ -            │ -    │ -    │ -          │ -        │ -               │ -     │ -            │ -       │ -        │
│ ☐    │ state        │ string │ -        │ -            │ -    │ -    │ -          │ -        │ -                │ -     │ -            │ -       │ -        │
│ ☑    │ onboarded_   │ date   │ update   │ Onboarded    │ ☐    │ ☑    │ date       │ ☐        │ -               │ 500   │ ""           │ -       │ [⋮]      │
│      │ date         │        │          │ Date         │      │      │            │          │                 │       │              │         │          │
└──────┴──────────────┴────────┴──────────┴──────────────┴──────┴──────┴────────────┴──────────┴─────────────────┴───────┴──────────────┴─────────┴──────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Relations                                                                                                    │
├──────┬──────────────┬────────┬──────────────────┬──────────────┬──────┬──────┬──────────┤
│ ✓    │ Relation     │ Type   │ Nested Fields    │ Display Name │ Req  │ Show │ Actions  │
├──────┼──────────────┼────────┼──────────────────┼──────────────┼──────┼──────┼──────────┤
│ ☑    │ payment_terms│ table  │ [2 fields]       │ Payment Terms│ ☐    │ ☐    │ [⋮]      │
│ ☑    │ shipping_    │ table  │ [2 fields]       │ Shipping     │ ☐    │ ☐    │ [⋮]      │
│      │ terms        │        │                  │ Terms        │      │      │          │
│ ☐    │ supplier_    │ table  │ [Configure]      │ -            │ -    │ -    │ -        │
│      │ items        │        │                  │              │      │      │          │
└──────┴──────────────┴────────┴──────────────────┴──────────────┴──────┴──────┴──────────┘
```

## Benefits of Table Design

1. **Compact**: See all fields at once
2. **Efficient**: Quick scanning and editing
3. **Complete**: All model fields visible
4. **Clear**: Inclusion status immediately visible
5. **Scalable**: Works for models with many fields
6. **Familiar**: Standard table UI pattern
