# Datagraph Builder

> Visual editor for configuring view `data_graph` without writing JSON

**Status**: Implemented (Phase 1-4 complete)
**Location**: `frontend-1/src/components/forms/Masters/DatagraphBuilder/`

---

## Overview

The Datagraph Builder provides a visual interface for admin users to configure which fields and relations are exposed in a view's datagraph. Instead of manually writing JSON, users can:

- Select fields from the Prisma model schema
- Configure field properties (permission, display name, column type, etc.)
- Configure nested relation select fields
- Preview the generated JSON in real-time

---

## Architecture

### Backend

**Endpoint**: `GET /api/models/:modelName/schema`

Returns the Prisma model schema including scalar fields and relations.

```typescript
// Response shape
{
  success: true,
  data: {
    modelName: "supplier",
    scalarFields: [
      { name: "id", type: "String", isRequired: true, isId: true, ... },
      { name: "name", type: "String", isRequired: true, ... },
      ...
    ],
    relations: [
      { name: "contacts", type: "Contact", relationType: "oneToMany", isList: true, ... },
      ...
    ]
  }
}
```

**Implementation Files**:
- `backend/src/services/core/ModelService.ts` - `getModelSchema()` method
- `backend/src/rest/RestService.ts` - `getModelSchemaEndpoint()`
- `backend/src/rest/routes.ts` - Route registration

### Frontend

**Component Hierarchy**:
```
DatagraphBuilder
├── Tabs (Fields | Relations)
├── IncludedFieldsTable (compact view of included fields)
├── IncludedRelationsTable (compact view of included relations)
├── AddFieldModal (multi-select unincluded fields)
├── AddRelationModal (multi-select unincluded relations)
├── RelationConfigModal (configure nested select)
└── JsonPreviewPanel (collapsible JSON preview)
```

**Key Files**:
| File | Purpose |
|------|---------|
| `DatagraphBuilder.tsx` | Main component with tabs and modals |
| `IncludedFieldsTable.tsx` | Table showing only included scalar fields |
| `IncludedRelationsTable.tsx` | Table showing only included relations |
| `AddFieldModal.tsx` | Modal for adding unincluded fields |
| `AddRelationModal.tsx` | Modal for adding unincluded relations |
| `RelationConfigModal.tsx` | Modal for configuring relation select fields |
| `JsonPreviewPanel.tsx` | Collapsible JSON preview with copy |
| `hooks.ts` | `useModelSchema` and `useDatagraphBuilder` hooks |
| `types.ts` | TypeScript interfaces |
| `utils.ts` | Merge/generate utility functions |

---

## Usage

### In ViewForm

The DatagraphBuilder is integrated into the View form with dual editor modes:

```tsx
// ViewForm.tsx
<Tabs defaultValue="visual">
  <TabsList>
    <TabsTrigger value="visual">Visual Editor</TabsTrigger>
    <TabsTrigger value="json">JSON Editor</TabsTrigger>
  </TabsList>

  <TabsContent value="visual">
    <DatagraphBuilder
      modelName={watchedModelName}
      value={field.value || {}}
      onChange={field.onChange}
      disabled={isSubmitting}
    />
  </TabsContent>

  <TabsContent value="json">
    <JsonEditor ... />
  </TabsContent>
</Tabs>
```

### Standalone Usage

```tsx
import { DatagraphBuilder } from '@/components/forms/Masters/DatagraphBuilder';

<DatagraphBuilder
  modelName="supplier"
  value={existingDatagraph}
  onChange={(newDatagraph) => handleChange(newDatagraph)}
  disabled={false}
/>
```

---

## UI Features

### Tabbed Interface
- **Fields tab**: Shows included scalar fields with count badge
- **Relations tab**: Shows included relations with count badge

### Compact Tables
- Only shows included items (not all model fields)
- Inline editing for display name, permission, column type
- Checkboxes for required, show column, searchable
- Remove button (X) to exclude items

### Add Modals
- Searchable list of unincluded fields/relations
- Multi-select with Select All/Clear buttons
- Batch add selected items

### Relation Configuration
- Click "Config" to open nested field selector
- Select which fields from related model to include
- Set permission per nested field
- Max nesting depth: 2 levels

### JSON Preview
- Toggle "Preview JSON" button
- Shows generated datagraph in formatted JSON
- Copy to clipboard button

---

## Data Flow

```
1. User selects model name in View form
2. DatagraphBuilder fetches model schema from backend
3. Schema merged with existing datagraph (if editing)
4. User adds/removes/configures fields and relations
5. On each change, generateDatagraphFromMerged() creates JSON
6. onChange callback updates form state
7. Form submits datagraph as part of view record
```

---

## Field Configuration Options

| Property | Type | Description |
|----------|------|-------------|
| `permission` | `'read' \| 'update'` | Field access level |
| `displayName` | `string` | UI label for the field |
| `required` | `boolean` | Form validation required |
| `isColumnShow` | `boolean` | Show in table columns |
| `tableProps.columnType` | `ColumnType` | Table column renderer type |
| `searchProps.isSearch` | `boolean` | Include in search |

### Column Types
- `text` - Plain text
- `int` - Integer number
- `number` - Decimal number
- `currency` - Currency formatted
- `date` - Date picker
- `checkbox` - Boolean checkbox
- `select` - Dropdown select

---

## Pending / Future Enhancements

The following features from the original specification are not yet implemented:

### 1. Undo/Redo Support
- Track state history for undo/redo operations
- Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)
- Visual indicator of undo stack depth

### 2. Dirty State Tracking
- Track unsaved changes
- Warn user before navigating away with unsaved changes
- Visual indicator of modified state

### 3. Drag-and-Drop Reordering
- Allow reordering fields via drag-and-drop
- Persist field order in datagraph
- Visual feedback during drag

### 4. Field Templates/Presets
- Common field configurations as templates
- Quick apply "Audit Fields" (createdAt, updatedAt, createdBy)
- Quick apply "Standard Fields" (id, name, description)

### 5. Validation Feedback
- Real-time validation of datagraph structure
- Warning for missing required fields
- Error highlighting for invalid configurations

### 6. Bulk Operations
- Bulk permission change for selected fields
- Bulk column type assignment
- Bulk show/hide in columns

### 7. Search/Filter in Tables
- Search within included fields table
- Filter by type, permission, etc.

### 8. Import/Export
- Export datagraph configuration
- Import from another view
- Copy configuration between views

---

## Technical Debt

1. **Legacy Components**: `ScalarFieldsTable.tsx`, `RelationsTable.tsx`, and `FieldRow.tsx` are no longer used by the main component but kept for backward compatibility. Consider removing in future cleanup.

2. **State Management**: Current implementation uses local state with useCallback. For complex undo/redo, consider using useReducer or a state management library.

3. **Performance**: Large models with many fields may benefit from virtualization in the tables and modals.

---

## Testing

### Manual Testing Checklist

- [ ] Create new view, add fields via modal
- [ ] Edit existing view, verify fields load correctly
- [ ] Remove fields using X button
- [ ] Configure relation nested fields
- [ ] Switch between Visual/JSON editor tabs
- [ ] Verify JSON preview matches configuration
- [ ] Save view and verify datagraph persists
- [ ] Test with models having many fields (performance)

### Automated Tests (TODO)

- Unit tests for `utils.ts` merge/generate functions
- Unit tests for hooks
- Integration tests for DatagraphBuilder component
- E2E tests for full view creation flow

---

## Related Documentation

- [Frontend Development Guide](./FRONTEND.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [View System](./BACKEND.md#views)
