# Datagraph Builder - UI Mockup

## Visual Sample UI

### Main View - Scalar Fields Table

```
╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ View Master - Edit View                                                                                                    [← Back to list] ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                                                             ║
║ Basic Information                                                                                                                          ║
║ ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ ║
║ │ Name: [supplier_view                    ]  Model Name: [supplier                    ]                                                  │ ║
║ │ Description: [Default view for supplier master data                                                                                  ] │ ║
║ └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                                                                             ║
║ Datagraph Builder                                                                                                                          ║
║ ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ ║
║ │ [+ Add Relation]  [Import from View]  [Expand All] [Collapse All]  [Preview JSON]                                                   │ ║
║ │                                                                                                                                         │ ║
║ │ Scalar Fields (25 fields)                                                                                                              │ ║
║ │ ┌──────┬──────────────┬────────┬──────────┬──────────────────┬──────┬──────┬────────────┬──────────┬─────────────────┬───────┬──────┐ │ ║
║ │ │ ✓    │ Field Name   │ Type   │ Permission│ Display Name     │ Req  │ Show │ Column Type│ Search   │ Search Operation│ Width │ ⋮    │ │ ║
║ │ ├──────┼──────────────┼────────┼──────────┼──────────────────┼──────┼──────┼────────────┼──────────┼─────────────────┼───────┼──────┤ │ ║
║ │ │ ☑    │ id           │ string │ [read ▼] │ [ID            ] │ ☐    │ ☐    │ [text    ▼]│ ☐        │ -               │ -     │ [⋮]  │ │ ║
║ │ │ ☑    │ supplier_name│ string │ [update▼]│ [Supplier Name ] │ ☑    │ ☑    │ [text    ▼]│ ☑        │ [startswith  ▼] │ [500] │ [⋮]  │ │ ║
║ │ │ ☑    │ primary_email│ string │ [update▼]│ [Primary Email ] │ ☑    │ ☑    │ [text    ▼]│ ☐        │ -               │ [500] │ [⋮]  │ │ ║
║ │ │ ☑    │ primary_phone│ string │ [update▼]│ [Primary Phone ] │ ☑    │ ☑    │ [text    ▼]│ ☐        │ -               │ [500] │ [⋮]  │ │ ║
║ │ │ ☑    │ payment_term_│ string │ [update▼]│ [Payment Terms ] │ ☐    │ ☑    │ [select  ▼]│ ☐        │ -               │ -     │ [⋮]  │ │ ║
║ │ │      │ id           │        │          │                  │      │      │            │          │                 │       │      │ │ ║
║ │ │ ☐    │ city         │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │ ☐    │ state        │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │ ☐    │ country      │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │ ☑    │ onboarded_   │ date   │ [update▼]│ [Onboarded Date] │ ☐    │ ☑    │ [date    ▼]│ ☐        │ -               │ [500] │ [⋮]  │ │ ║
║ │ │      │ date         │        │          │                  │      │      │            │          │                 │       │      │ │ ║
║ │ │ ☐    │ website      │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │ ☐    │ industry     │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │ ☐    │ zip_code     │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │ ☐    │ legal_name   │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │ ☐    │ supplier_    │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │      │ address      │        │          │                  │      │      │            │          │                 │       │      │ │ ║
║ │ │ ☐    │ secondary_   │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │      │ email        │        │          │                  │      │      │            │          │                 │       │      │ │ ║
║ │ │ ☐    │ alternative_ │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │ │ ║
║ │ │      │ phone        │        │          │                  │      │      │            │          │                 │       │      │ │ ║
║ │ │ ... (more rows)                                                                                                                      │ ║
║ │ └──────┴──────────────┴────────┴──────────┴──────────────────┴──────┴──────┴────────────┴──────────┴─────────────────┴───────┴──────┘ │ ║
║ │                                                                                                                                         │ ║
║ │ Relations (3 relations)                                                                                                                 │ ║
║ │ ┌──────┬──────────────┬────────┬──────────────────┬──────────────────┬──────┬──────┬──────────┐                                      │ ║
║ │ │ ✓    │ Relation     │ Type   │ Nested Fields     │ Display Name     │ Req  │ Show │ Actions  │                                      │ ║
║ │ ├──────┼──────────────┼────────┼──────────────────┼──────────────────┼──────┼──────┼──────────┤                                      │ ║
║ │ │ ☑    │ payment_terms│ table  │ [2 fields]        │ [Payment Terms ] │ ☐    │ ☐    │ [⋮]      │                                      │ ║
║ │ │ ☑    │ shipping_    │ table  │ [2 fields]        │ [Shipping Terms] │ ☐    │ ☐    │ [⋮]      │                                      │ ║
║ │ │      │ terms        │        │                   │                  │      │      │          │                                      │ ║
║ │ │ ☐    │ supplier_    │ table  │ [Configure]       │ -                │ -    │ -    │ -        │                                      │ ║
║ │ │      │ items        │        │                   │                  │      │      │          │                                      │ ║
║ │ └──────┴──────────────┴────────┴──────────────────┴──────────────────┴──────┴──────┴──────────┘                                      │ ║
║ │                                                                                                                                         │ ║
║ │ [Cancel]                                                                                    [Preview JSON]  [Save]                      │ ║
║ └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
```

### Expanded Row - Advanced Options

When user clicks the Actions (⋮) button on a row:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Advanced Options: supplier_name                                                                         │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│ Select Props (shown when Column Type = "select"):                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│   │ Instance Type:    [payment_terms                    ▼]                                          │ │
│   │ Instance Key:     [id                               ▼]                                          │ │
│   │ Instance Label:   [payment_terms                    ▼]                                          │ │
│   │ Source Key:       [payment_term_id                  ▼]                                          │ │
│   │ Search Params:    [payment_terms                    ▼]                                          │ │
│   │ Limit:            [10                               ]                                          │ │
│   └─────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                         │
│ List Props:                                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│   │ Type:             [badge                            ▼]  (badge | text | icon)                 │ │
│   │ Color:            [blue                             ▼]  (blue | green | red | yellow | gray)   │ │
│   └─────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                         │
│ Default Value: [                                                                    ]                  │
│ Order:         [                                                                    ]                  │
│                                                                                                         │
│ [Close]                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Relation Configuration Modal

When user clicks "Configure" or "[2 fields]" in Relations table:

```
╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ Configure Nested Fields: payment_terms                                                      [× Close] ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                         ║
║ Select fields from 'payment_terms' model:                                                              ║
║                                                                                                         ║
║ ┌──────┬──────────────┬────────┬──────────┬──────────────────┬──────┬──────┬────────────┬──────────┐ ║
║ │ ✓    │ Field Name   │ Type   │ Permission│ Display Name     │ Req  │ Show │ Column Type│ Actions  │ ║
║ ├──────┼──────────────┼────────┼──────────┼──────────────────┼──────┼──────┼────────────┼──────────┤ ║
║ │ ☑    │ id           │ string │ [read ▼] │ [ID            ] │ ☐    │ ☐    │ [text    ▼]│ [⋮]      │ ║
║ │ ☑    │ payment_terms│ string │ [update▼]│ [Payment Terms ] │ ☐    │ ☑    │ [text    ▼]│ [⋮]      │ ║
║ │ ☐    │ description  │ string │ -        │ -                │ -    │ -    │ -          │ -        │ ║
║ │ ☐    │ days         │ number │ -        │ -                │ -    │ -    │ -          │ -        │ ║
║ │ ☐    │ is_active    │ boolean│ -        │ -                │ -    │ -    │ -          │ -        │ ║
║ └──────┴──────────────┴────────┴──────────┴──────────────────┴──────┴──────┴────────────┴──────────┘ ║
║                                                                                                         ║
║ [Add Nested Relation]                                                                   [Cancel] [Save] ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝
```

### Deeply Nested Relation Example

For a relation with nested relations (e.g., purchase_requisition → items → product → supplier):

```
╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ Configure Nested Fields: items                                                                 [× Close] ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                         ║
║ Select fields from 'item' model:                                                                       ║
║                                                                                                         ║
║ ┌──────┬──────────────┬────────┬──────────┬──────────────────┬──────┬──────┬────────────┬──────────┐ ║
║ │ ✓    │ Field Name   │ Type   │ Permission│ Display Name     │ Req  │ Show │ Column Type│ Actions  │ ║
║ ├──────┼──────────────┼────────┼──────────┼──────────────────┼──────┼──────┼────────────┼──────────┤ ║
║ │ ☑    │ id           │ string │ [read ▼] │ [ID            ] │ ☐    │ ☐    │ [text    ▼]│ [⋮]      │ ║
║ │ ☑    │ quantity     │ number │ [read ▼] │ [Quantity      ] │ ☐    │ ☑    │ [int     ▼]│ [⋮]      │ ║
║ │ ☑    │ rate         │ number │ [read ▼] │ [Rate          ] │ ☐    │ ☑    │ [int     ▼]│ [⋮]      │ ║
║ │ ☑    │ product      │ table  │ [Config ] │ [Product       ] │ ☐    │ ☐    │ -          │ [⋮]      │ ║
║ │ ☑    │ supplier     │ table  │ [Config ] │ [Supplier      ] │ ☐    │ ☐    │ -          │ [⋮]      │ ║
║ └──────┴──────────────┴────────┴──────────┴──────────────────┴──────┴──────┴────────────┴──────────┘ ║
║                                                                                                         ║
║ When user clicks [Config] on "product":                                                                 ║
║ ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐ ║
║ │ Configure Nested Fields: product                                                      [← Back]   │ ║
║ ├───────────────────────────────────────────────────────────────────────────────────────────────────┤ ║
║ │ Select fields from 'item_master' model:                                                             │ ║
║ │ ┌──────┬──────────────┬────────┬──────────┬──────────────────┬──────┬──────┬────────────┬──────┐ │ ║
║ │ │ ✓    │ Field Name   │ Type   │ Permission│ Display Name     │ Req  │ Show │ Column Type│ ⋮    │ │ ║
║ │ ├──────┼──────────────┼────────┼──────────┼──────────────────┼──────┼──────┼────────────┼──────┤ │ ║
║ │ │ ☑    │ id           │ string │ [read ▼] │ [ID            ] │ ☐    │ ☐    │ [text    ▼]│ [⋮]  │ │ ║
║ │ │ ☑    │ item_code    │ string │ [read ▼] │ [Item Code     ] │ ☐    │ ☑    │ [text    ▼]│ [⋮]  │ │ ║
║ │ │ ☑    │ item_name    │ string │ [read ▼] │ [Item Name     ] │ ☐    │ ☑    │ [text    ▼]│ [⋮]  │ │ ║
║ │ │ ☑    │ uom          │ table  │ [Config ] │ [UOM           ] │ ☐    │ ☐    │ -          │ [⋮]  │ │ ║
║ │ │ ☑    │ supplier     │ table  │ [Config ] │ [Supplier      ] │ ☐    │ ☐    │ -          │ [⋮]  │ │ ║
║ │ └──────┴──────────────┴────────┴──────────┴──────────────────┴──────┴──────┴────────────┴──────┘ │ ║
║ │                                                                                                     │ ║
║ │ [← Back]                                                                              [Cancel] [Save]│ ║
║ └───────────────────────────────────────────────────────────────────────────────────────────────────┘ ║
║                                                                                                         ║
║ [← Back]                                                                                    [Cancel] [Save] ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝
```

### JSON Preview Panel

When user clicks "Preview JSON":

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ JSON Preview                                                                              [× Close]     │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│ {                                                                                                       │
│   "id": {                                                                                               │
│     "datatype": "string",                                                                              │
│     "permission": "read"                                                                               │
│   },                                                                                                   │
│   "supplier_name": {                                                                                   │
│     "required": true,                                                                                  │
│     "permission": "update",                                                                            │
│     "tableProps": {                                                                                    │
│       "width": "500",                                                                                  │
│       "columnType": "text",                                                                            │
│       "defaultValue": ""                                                                               │
│     },                                                                                                 │
│     "displayName": "Supplier Name",                                                                    │
│     "searchProps": {                                                                                   │
│       "isSearch": true,                                                                                │
│       "operation": "startswith"                                                                        │
│     },                                                                                                 │
│     "isColumnShow": true                                                                               │
│   },                                                                                                   │
│   "primary_email": {                                                                                   │
│     "required": true,                                                                                  │
│     "permission": "update",                                                                            │
│     "tableProps": {                                                                                    │
│       "width": "500",                                                                                  │
│       "columnType": "text",                                                                            │
│       "defaultValue": ""                                                                               │
│     },                                                                                                 │
│     "displayName": "Primary Email",                                                                    │
│     "isColumnShow": true                                                                               │
│   },                                                                                                   │
│   "payment_terms": {                                                                                   │
│     "select": {                                                                                        │
│       "id": "read",                                                                                    │
│       "payment_terms": "update"                                                                       │
│     },                                                                                                 │
│     "dataType": "table",                                                                              │
│     "displayName": "Payment Terms",                                                                    │
│     "isColumnShow": false                                                                              │
│   }                                                                                                    │
│ }                                                                                                       │
│                                                                                                         │
│ [Copy to Clipboard]                                                                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Interaction States

### Disabled State (Field Not Included)

```
│ ☐    │ city         │ string │ -        │ -                │ -    │ -    │ -          │ -        │ -               │ -     │ -    │
```

All editable columns show "-" and are disabled (grayed out).

### Enabled State (Field Included)

```
│ ☑    │ supplier_name│ string │ [update▼]│ [Supplier Name ] │ ☑    │ ☑    │ [text    ▼]│ ☑        │ [startswith  ▼] │ [500] │ [⋮]  │
```

All columns are enabled and editable.

### Hover State

Row highlights on hover:
- Light blue background
- Cursor changes to pointer
- Actions button becomes more visible

### Focus State

When editing a cell:
- Cell gets blue border
- Dropdowns show options
- Text inputs show cursor

## Responsive Behavior

### Desktop (Full Width)
- All columns visible
- Horizontal scroll if needed
- Tables side by side or stacked

### Tablet (Medium Width)
- Hide less critical columns (Width, Default Value)
- Show in expandable panel
- Stack tables vertically

### Mobile (Narrow)
- First column (Included) sticky
- Horizontal scroll for other columns
- Or switch to card view per field

## Key Features Visualized

1. **Inclusion Toggle**: Checkbox in first column enables/disables all editing
2. **Inline Editing**: Click any enabled cell to edit
3. **Dropdowns**: Permission, Column Type, Search Operation
4. **Checkboxes**: Required, Show in Table, Search Enabled
5. **Text Inputs**: Display Name, Width, Default Value
6. **Actions Menu**: Expand for advanced options
7. **Relation Config**: Click to configure nested fields

## Color Coding

- **Included Field**: Normal text, enabled controls
- **Excluded Field**: Grayed out text, disabled controls, "-" placeholders
- **Required Field**: Red asterisk (*) next to field name
- **ID Field**: Special badge or icon
- **Relation Field**: Different background color or icon
