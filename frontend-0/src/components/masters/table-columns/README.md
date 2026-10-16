# Table Columns Module

This module provides a modular approach to handling dynamic table column generation and rendering.

## Structure

```
table-columns/
├── index.ts              # Main exports
├── columnGenerator.tsx   # Column generation logic
├── renderBadges.tsx      # Badge rendering component
├── renderNestedObject.tsx # Nested object rendering
└── README.md            # This file
```

## Components

### `generateColumns(metaData, renderActions)`
Main function that generates table columns from metadata.

**Parameters:**
- `metaData`: Object containing field definitions
- `renderActions`: Function to render action buttons

**Returns:** Array of `TableColumn` objects

### `renderBadges(items, listProps)`
Renders array items as badges.

**Parameters:**
- `items`: Array of objects to render as badges
- `listProps`: Configuration object with `key` and `label` properties

**Features:**
- Supports nested property access (e.g., `"role.name"`)
- Handles missing data gracefully
- Responsive badge layout

### `renderNestedObject(record, key, select)`
Renders nested objects based on select configuration.

**Parameters:**
- `record`: The data record
- `key`: Field key
- `select`: Select configuration object

## Usage

```typescript
import { generateColumns } from './table-columns';

const columns = generateColumns(metaData, (record) => (
    <Button onClick={() => handleEdit(record)}>Edit</Button>
));
```

## Metadata Structure

```typescript
{
  "fieldName": {
    "displayName": "Field Display Name",
    "datatype": "string|number|date|table",
    "isColumnShow": true,
    "listProps": {
      "type": "badge",
      "key": "id",
      "label": "role.name"
    },
    "select": {
      "id": "read",
      "name": "update"
    }
  }
}
```

## Benefits

1. **Modularity**: Each rendering type is in its own file
2. **Maintainability**: Easy to add new column types
3. **Reusability**: Render functions can be used elsewhere
4. **Type Safety**: Full TypeScript support
5. **Clean Code**: Main component is much simpler 