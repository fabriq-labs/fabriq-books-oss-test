# Datagraph Builder Feature Design

## Overview

This document outlines the design for a visual datagraph builder feature that allows admin users to create and update datagraphs for models through a user-friendly UI, replacing the current raw JSON editor.

## Current State

### Existing Implementation
- **ViewForm Component**: Located at `frontend-1/src/components/forms/Masters/ViewForm.tsx`
- **Current UI**: Basic form with JSON code editor for `data_graph` field
- **Access Pattern**: Views accessed via `/view/:id/view/:viewId` route
- **Backend Endpoint**: `/api/datagraph/:model/:view` returns datagraph structure

### Limitations
- Raw JSON editing is error-prone
- No validation of field names against actual model schema
- No visual representation of nested relations
- Difficult to understand datagraph structure
- No field discovery/autocomplete

## Datagraph Schema Structure

Based on actual examples from the codebase, here are the patterns observed:

### 1. Scalar Fields

**Basic Scalar Field**:
```json
{
  "id": {
    "datatype": "string",
    "permission": "read"
  }
}
```

**Full-Featured Scalar Field**:
```json
{
  "supplier_name": {
    "required": true,
    "permission": "update",
    "tableProps": {
      "width": "500",
      "columnType": "text",
      "defaultValue": ""
    },
    "displayName": "SupplierName",
    "searchProps": {
      "isSearch": true,
      "operation": "startswith"
    },
    "isColumnShow": true
  }
}
```

**Foreign Key Field with Select Dropdown**:
```json
{
  "payment_term_id": {
    "datatype": "string",
    "required": false,
    "permission": "update",
    "tableProps": {
      "columnType": "select",
      "selectProps": {
        "type": "payment_terms",
        "limit": "10",
        "instanceKey": "id",
        "instanceType": "payment_terms",
        "searchParams": "payment_terms",
        "instanceLabel": "payment_terms",
        "instanceSourceKey": "payment_term_id"
      },
      "defaultValue": ""
    },
    "displayName": "Payment Terms",
    "isColumnShow": true
  }
}
```

**Note**: Both `datatype` and `dataType` are used in examples (inconsistency to handle).

### 2. Relation Fields

**Simple Relation**:
```json
{
  "payment_terms": {
    "select": {
      "id": "read",
      "payment_terms": "update"
    },
    "dataType": "table",
    "required": false,
    "displayName": "payment_terms",
    "isColumnShow": false
  }
}
```

**Relation with type property**:
```json
{
  "supplier_items": {
    "type": "table",
    "select": {
      "id": "read",
      "item_id": "read"       
    }
  }
}
```

**Note**: Relations can use either `type: "table"` or `dataType: "table"` (inconsistency to handle).

### 3. Deeply Nested Relations

**Multi-Level Nesting Example** (from purchase_requisition):
```json
{
  "items": {
    "type": "table",
    "select": {
      "id": "read",
      "rate": "read",
      "product": {
        "type": "table",
        "select": {
          "id": "read",
          "uom": {
            "select": {
              "id": "read",
              "name": "read"
            }
          },
          "uom_id": "update",
          "supplier": {
            "select": {
              "id": "read",
              "supplier_name": "read"
            }
          },
          "item_code": "read",
          "item_name": "read"
        }
      },
      "quantity": "read",
      "supplier": {
        "type": "table",
        "select": {
          "id": "read",
          "primary_email": "read",
          "supplier_name": "update"
        }
      }
    }
  }
}
```

**Nested Relations with Mixed Patterns**:
- Some nested fields use full datagraph structure
- Some nested fields use simple permission strings ("read" | "update")
- Can mix both patterns in same relation

### 4. Field Ordering

Some views use `orderNo` property:
```json
{
  "item_code": {
    "orderNo": 1,
    "displayName": "Item Code",
    "isColumnShow": true
  },
  "item_name": {
    "orderNo": 2,
    "displayName": "Item Name",
    "isColumnShow": true
  }
}
```

## Proposed UI Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  View Master - Edit View                                    │
│  [Back to list]                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Basic Information                                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Name: [supplier_view]                                │  │
│  │ Model Name: [supplier]                               │  │
│  │ Description: [Default view for supplier...]         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Datagraph Builder                                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ [+ Add Field]  [Import from Existing View]          │  │
│  │                                                       │  │
│  │ Fields:                                               │  │
│  │ ┌─────────────────────────────────────────────────┐ │  │
│  │ │ ✓ id (string) - Read                            │ │  │
│  │ │   Display Name: ID                              │ │  │
│  │ │   Show in Table: No                              │ │  │
│  │ └─────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  │ ┌─────────────────────────────────────────────────┐ │  │
│  │ │ ✓ supplier_name (string) - Update              │ │  │
│  │ │   Display Name: Supplier Name                  │ │  │
│  │ │   Show in Table: Yes                            │ │  │
│  │ │   Required: Yes                                  │ │  │
│  │ │   Search: Enabled (starts with)                  │ │  │
│  │ │   [Advanced Options ▼]                          │ │  │
│  │ └─────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  │ ┌─────────────────────────────────────────────────┐ │  │
│  │ │ ✓ payment_terms (relation)                     │ │  │
│  │ │   Display Name: Payment Terms                   │ │  │
│  │ │   Show in Table: No                              │ │  │
│  │ │   [Configure Nested Fields...]                   │ │  │
│  │ └─────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  [Cancel]  [Preview JSON]  [Save]                          │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Field List View
- **Card-based layout** for each field
- **Expandable cards** for advanced options
- **Visual indicators**:
  - ✓ Checkbox for field inclusion
  - Field type badge (string, number, date, boolean, relation)
  - Permission badge (read, update)
  - Required indicator
  - Table visibility indicator

#### 2. Add Field Dialog
- **Field Selection**:
  - Dropdown/searchable list of available model fields
  - Grouped by: Scalar Fields, Relations
  - Shows field type and description
- **Quick Configuration**:
  - Permission (read/update)
  - Display Name (auto-filled from field name)
  - Required checkbox
  - Show in Table checkbox

#### 3. Field Configuration Panel
- **Basic Settings**:
  - Display Name
  - Permission (read/update)
  - Required
  - Show in Table (isColumnShow)
  
- **Table Properties** (tableProps):
  - Column Width
  - Column Type (text, select, checkbox, date, int)
  - Default Value
  - Select Props (for dropdowns):
    - Instance Type
    - Instance Key
    - Instance Label
    - Instance Source Key
    - Search Params
    - Limit

- **Search Properties** (searchProps):
  - Enable Search
  - Operation (startswith, contains, equals)

- **List Properties** (listProps):
  - Type (badge)
  - Color (blue, green, red)

#### 4. Relation Configuration
- **Nested Field Builder**:
  - Recursive UI for nested relations
  - Shows relation model name
  - Allows selecting fields from related model
  - Supports multi-level nesting
  - Visual tree structure

#### 5. JSON Preview Panel
- **Collapsible panel** showing generated JSON
- **Syntax highlighting**
- **Validation errors** display
- **Copy to clipboard** functionality

## Technical Implementation

### Backend Requirements

#### 1. Model Schema Discovery Endpoint

**New Endpoint**: `GET /api/models/:modelName/schema`

Returns available fields and relations for a model:

```typescript
{
  "success": true,
  "data": {
    "modelName": "supplier",
    "scalarFields": [
      {
        "name": "id",
        "type": "String",
        "isRequired": true,
        "isId": true
      },
      {
        "name": "supplier_name",
        "type": "String",
        "isRequired": true
      },
      {
        "name": "primary_email",
        "type": "String",
        "isRequired": false
      },
      // ... more fields
    ],
    "relations": [
      {
        "name": "payment_terms",
        "type": "payment_terms",
        "relationType": "manyToOne", // or "oneToMany", "oneToOne", "manyToMany"
        "foreignKey": "payment_term_id"
      },
      // ... more relations
    ]
  }
}
```

**Implementation**: Use Prisma introspection to get model schema.

#### 2. Enhanced Datagraph Validation

- Validate field names exist in model
- Validate relation names
- Validate nested structure
- Check for circular references
- Validate permission values

### Frontend Components

#### 1. DatagraphBuilder Component

**Location**: `frontend-1/src/components/forms/Masters/DatagraphBuilder.tsx`

**Props**:
```typescript
interface DatagraphBuilderProps {
  modelName: string;
  value: Record<string, any>; // Current datagraph
  onChange: (datagraph: Record<string, any>) => void;
  availableFields?: ModelField[]; // From schema endpoint
}
```

**Features**:
- Field list management
- Add/remove fields
- Field configuration
- Nested relation builder
- JSON preview

#### 2. FieldConfigCard Component

**Location**: `frontend-1/src/components/forms/Masters/FieldConfigCard.tsx`

**Props**:
```typescript
interface FieldConfigCardProps {
  field: DatagraphField;
  fieldDefinition: ModelField; // From schema
  onChange: (field: DatagraphField) => void;
  onRemove: () => void;
  onConfigureNested?: () => void; // For relations
}
```

#### 3. AddFieldDialog Component

**Location**: `frontend-1/src/components/forms/Masters/AddFieldDialog.tsx`

**Features**:
- Searchable field list
- Field type filtering
- Quick configuration
- Add to datagraph

#### 4. RelationBuilder Component

**Location**: `frontend-1/src/components/forms/Masters/RelationBuilder.tsx`

**Features**:
- Recursive nested field selection
- Visual tree structure
- Relation model selection
- Nested field configuration

### Data Flow

```
1. User opens ViewForm for a model
   ↓
2. Frontend fetches model schema: GET /api/models/:modelName/schema
   ↓
3. Frontend loads existing datagraph (if editing)
   ↓
4. DatagraphBuilder renders fields with FieldConfigCard components
   ↓
5. User adds/removes/configures fields
   ↓
6. Changes update local state
   ↓
7. User clicks Save
   ↓
8. DatagraphBuilder generates JSON from state
   ↓
9. ViewForm submits to backend
   ↓
10. Backend validates and saves
```

## User Experience Flow

### Creating a New Datagraph

1. **Select Model**: User selects model name in ViewForm
2. **Load Schema**: System fetches available fields for model
3. **Add Fields**: User clicks "Add Field" and selects fields
4. **Configure Fields**: User configures each field's properties
5. **Add Relations**: User adds relation fields and configures nested fields
6. **Preview**: User previews generated JSON
7. **Save**: User saves the view

### Editing Existing Datagraph

1. **Load View**: System loads existing view and datagraph
2. **Parse Datagraph**: System parses JSON into structured form
3. **Render Fields**: System renders all configured fields
4. **Edit**: User modifies field configurations
5. **Add/Remove**: User adds new fields or removes existing ones
6. **Save**: User saves changes

## Validation Rules

### Field Validation
- Field name must exist in model schema
- Permission must be "read" or "update"
- Display name is required
- For relations, nested select must be defined

### Datagraph Validation
- At least one field must be included
- ID field should typically be included
- No circular references in nested relations
- Valid JSON structure

## Migration Strategy

### Phase 1: Backend Schema Endpoint
- Implement model schema discovery
- Add validation utilities
- Test with existing models

### Phase 2: Basic UI Components
- Create DatagraphBuilder component
- Implement field list and basic configuration
- Support scalar fields only

### Phase 3: Relation Support
- Add relation field support
- Implement nested field builder
- Support multi-level nesting

### Phase 4: Advanced Features
- Add JSON preview
- Implement import from existing view
- Add validation and error handling

### Phase 5: Integration
- Replace JSON editor in ViewForm
- Add to create and edit flows
- Test with real use cases

## Future Enhancements

1. **Template System**: Pre-built datagraph templates for common patterns
2. **Field Suggestions**: AI-powered suggestions based on model type
3. **Bulk Operations**: Add multiple fields at once
4. **Field Groups**: Organize fields into logical groups
5. **Validation Rules**: Define custom validation rules per field
6. **Export/Import**: Export datagraphs as JSON files
7. **Version History**: Track changes to datagraphs
8. **Visual Graph**: Visual representation of field relationships

## Success Criteria

- ✅ Users can create datagraphs without writing JSON
- ✅ Field names are validated against model schema
- ✅ Nested relations are supported
- ✅ UI is intuitive and user-friendly
- ✅ Generated JSON is valid and follows schema
- ✅ Performance is acceptable for large models
- ✅ Works for both create and edit flows
