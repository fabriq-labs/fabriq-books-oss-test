# Datagraph Builder - Complete Technical Specification

## Document Purpose

This specification defines the complete design and implementation requirements for a table-based datagraph builder feature that allows admin users to visually create and update datagraphs for models without writing JSON. This document consolidates all design decisions, frontend and backend changes, and technical implementation details.

**Target Platform**: Desktop only (no mobile/tablet responsive design required)

---

## 1. Overview

### 1.1 Problem Statement

Currently, datagraphs are edited using a raw JSON code editor, which is:
- Error-prone (syntax errors, invalid field names)
- Not user-friendly (requires JSON knowledge)
- Lacks validation against actual model schema
- Difficult to understand nested relation structures
- No field discovery or autocomplete

### 1.2 Solution

A table-based visual editor that:
- Shows all Prisma model fields in editable tables
- Merges existing datagraph with model schema on load
- Allows inclusion/exclusion of fields via checkbox
- Enables inline editing of all datagraph properties
- Supports nested relation configuration through modals
- Generates valid JSON automatically

### 1.3 Success Criteria

- ✅ Users can create datagraphs without writing JSON
- ✅ Field names validated against model schema
- ✅ Nested relations supported (multi-level)
- ✅ Intuitive, user-friendly interface
- ✅ Generated JSON is valid and follows schema
- ✅ Works for both create and edit flows
- ✅ Handles existing datagraph inconsistencies gracefully

---

## 2. Current State

### 2.1 Existing Components

- **ViewForm**: `frontend-1/src/components/forms/Masters/ViewForm.tsx`
  - Basic form with JSON code editor for `data_graph` field
  - Access via `/view/:id/view/:viewId` route
  - List page at `/settings/views`

### 2.2 Existing Backend

- **Endpoint**: `GET /api/datagraph/:model/:view`
  - Returns datagraph structure
  - Located in `backend/src/rest/RestService.ts`

### 2.3 Database Schema

**View Model** (from `backend/prisma/schema/metadata.prisma`):
```prisma
model view {
  id              String   @id @default(dbgenerated("'view_' || gen_random_uuid()"))
  name            String
  model_name      String
  description     String?
  data_graph      Json?    // The datagraph JSON
  org_id          String?
  created_by      String?
  modified_by     String?
  // ... relations
}
```

---

## 3. Datagraph Structure

### 3.1 Scalar Fields

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

**Note**: Codebase uses both `datatype` and `dataType` (inconsistency to handle).

### 3.2 Relation Fields

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

**Note**: Relations can use either `type: "table"` or `dataType: "table"`.

### 3.3 Deeply Nested Relations

**Multi-Level Nesting Example**:
```json
{
  "items": {
    "type": "table",
    "select": {
      "id": "read",
      "quantity": "read",
      "product": {
        "type": "table",
        "select": {
          "id": "read",
          "item_code": "read",
          "item_name": "read",
          "supplier": {
            "select": {
              "id": "read",
              "supplier_name": "read"
            }
          },
          "uom": {
            "select": {
              "id": "read",
              "name": "read"
            }
          }
        }
      }
    }
  }
}
```

### 3.4 Field Properties Summary

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `datatype` / `dataType` | string | Field type (string, number, date, boolean) | For scalars |
| `permission` | string | "read" or "update" | Yes (when included) |
| `displayName` | string | Human-readable name | Yes (when included) |
| `required` | boolean | Field is required | No |
| `isColumnShow` | boolean | Show in table | No |
| `tableProps` | object | Table rendering props | No |
| `searchProps` | object | Search configuration | No |
| `listProps` | object | List rendering props | No |
| `orderNo` | number | Display order | No |
| `select` | object | Nested fields (for relations) | For relations |

---

## 4. UI Design

### 4.1 Layout Structure

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
│  │ └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                     │  │
│  │ Relations                                                           │  │
│  │ ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │ │ ✓ │ Relation   │ Type   │ Nested Fields │ Display    │ Show │ ... │ │  │
│  │ ├───┼────────────┼────────┼───────────────┼────────────┼──────┼─────┤ │  │
│  │ │ ☑ │ payment_   │ table  │ [Configure]   │ Payment    │ ☐    │ ... │ │  │
│  │ │    │ terms      │        │               │ Terms      │      │     │ │  │
│  │ └─────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                     │  │
│  │ [Cancel]  [Preview JSON]  [Save]                                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Scalar Fields Table Columns

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

### 4.3 Relations Table Columns

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

### 4.4 Advanced Options Panel

When user clicks Actions (⋮) button, expand row to show:

- **Select Props** (for dropdown fields):
  - Instance Type
  - Instance Key
  - Instance Label
  - Source Key
  - Search Params
  - Limit

- **List Props**:
  - Type (badge | text | icon)
  - Color (blue | green | red | yellow | gray)

- **Default Value**: Text input
- **Order**: Number input

### 4.5 Relation Configuration Modal

Modal opens when clicking "Configure" on a relation:
- Shows table of fields from related model
- Same table structure as main scalar fields table
- Supports recursive nesting (click "Configure" on nested relations)
- Breadcrumb navigation for deep nesting

### 4.6 JSON Preview Panel

Collapsible panel showing generated JSON:
- Syntax highlighting
- Copy to clipboard functionality
- Read-only view

---

## 5. Backend Implementation

### 5.1 New Endpoint: Model Schema Discovery

**Endpoint**: `GET /api/models/:modelName/schema`

**Purpose**: Return available fields and relations for a Prisma model

**Request**:
```
GET /api/models/supplier/schema
```

**Response**:
```json
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
        "isRequired": true,
        "isId": false
      },
      {
        "name": "primary_email",
        "type": "String",
        "isRequired": false,
        "isId": false
      }
    ],
    "relations": [
      {
        "name": "payment_terms",
        "type": "payment_terms",
        "relationType": "manyToOne",
        "foreignKey": "payment_term_id"
      },
      {
        "name": "supplier_items",
        "type": "supplier_item",
        "relationType": "oneToMany",
        "foreignKey": null
      }
    ]
  }
}
```

### 5.2 Implementation Location

**File**: `backend/src/rest/RestService.ts`

**Method**: `getModelSchema`

```typescript
public async getModelSchema(req: AuthRequest, res: Response) {
  try {
    const modelName = req.params.modelName;
    
    // Use Prisma introspection to get model schema
    const schema = await this.introspectModel(modelName);
    
    res.json({
      success: true,
      data: schema
    });
  } catch (error: any) {
    logger.error('Error in getModelSchema', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch model schema' });
  }
}
```

### 5.3 Prisma Introspection

**File**: `backend/src/services/core/ModelService.ts` (or new service)

**Method**: `introspectModel`

```typescript
async introspectModel(modelName: string): Promise<ModelSchema> {
  // Get Prisma model metadata
  const model = prisma._dmmf.datamodel.models.find(m => m.name === modelName);
  
  if (!model) {
    throw new NotFoundError(`Model '${modelName}' not found`);
  }
  
  const scalarFields = model.fields
    .filter(f => !f.relationName) // Exclude relations
    .map(f => ({
      name: f.name,
      type: f.type,
      isRequired: f.isRequired,
      isId: f.isId || false
    }));
  
  const relations = model.fields
    .filter(f => f.relationName) // Only relations
    .map(f => ({
      name: f.name,
      type: f.type,
      relationType: this.getRelationType(f),
      foreignKey: f.relationFromFields?.[0] || null
    }));
  
  return {
    modelName,
    scalarFields,
    relations
  };
}
```

### 5.4 Route Registration

**File**: `backend/src/rest/routes.ts`

```typescript
// Add new route
router.get('/models/:modelName/schema', authMiddleware, restService.getModelSchema.bind(restService));
```

### 5.5 Validation

**File**: `backend/src/services/core/ModelService.ts`

Add validation method:

```typescript
async validateDatagraph(modelName: string, datagraph: Record<string, any>): Promise<ValidationResult> {
  const schema = await this.introspectModel(modelName);
  const errors: string[] = [];
  
  // Validate field names exist in schema
  for (const fieldName of Object.keys(datagraph)) {
    const field = schema.scalarFields.find(f => f.name === fieldName);
    const relation = schema.relations.find(r => r.name === fieldName);
    
    if (!field && !relation) {
      errors.push(`Field '${fieldName}' does not exist in model '${modelName}'`);
    }
  }
  
  // Validate relation structures
  for (const [fieldName, config] of Object.entries(datagraph)) {
    const relation = schema.relations.find(r => r.name === fieldName);
    if (relation && config.select) {
      // Validate nested select structure
      // Recursively validate nested relations
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

## 6. Frontend Implementation

### 6.1 Component Structure

```
frontend-1/src/components/forms/Masters/DatagraphBuilder/
├── DatagraphBuilder.tsx          # Main component
├── ScalarFieldsTable.tsx         # Scalar fields table
├── RelationsTable.tsx            # Relations table
├── FieldRow.tsx                  # Individual field row
├── RelationRow.tsx               # Individual relation row
├── AdvancedOptionsPanel.tsx      # Expandable advanced options
├── RelationConfigModal.tsx       # Modal for nested relation config
├── JsonPreviewPanel.tsx          # JSON preview panel
└── types.ts                      # TypeScript types
```

### 6.2 TypeScript Types

**File**: `frontend-1/src/components/forms/Masters/DatagraphBuilder/types.ts`

```typescript
// Model schema from backend
export interface ModelSchema {
  modelName: string;
  scalarFields: ScalarFieldSchema[];
  relations: RelationSchema[];
}

export interface ScalarFieldSchema {
  name: string;
  type: string;
  isRequired: boolean;
  isId: boolean;
}

export interface RelationSchema {
  name: string;
  type: string;
  relationType: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
  foreignKey: string | null;
}

// Merged field (schema + datagraph)
export interface MergedField {
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

export interface MergedRelation {
  // From schema
  name: string;
  type: string;
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

export interface TableProps {
  width?: string;
  columnType?: "text" | "select" | "checkbox" | "date" | "int";
  defaultValue?: string;
  selectProps?: SelectProps;
}

export interface SelectProps {
  type: string;
  instanceType: string;
  instanceKey: string;
  instanceLabel: string;
  instanceSourceKey: string;
  searchParams: string;
  limit: string;
}

export interface SearchProps {
  isSearch: boolean;
  operation?: "startswith" | "contains" | "equals";
}

export interface ListProps {
  type?: "badge" | "text" | "icon";
  color?: "blue" | "green" | "red" | "yellow" | "gray";
}
```

### 6.3 Main Component

**File**: `frontend-1/src/components/forms/Masters/DatagraphBuilder/DatagraphBuilder.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { ScalarFieldsTable } from './ScalarFieldsTable';
import { RelationsTable } from './RelationsTable';
import { JsonPreviewPanel } from './JsonPreviewPanel';
import { ModelSchema, MergedField, MergedRelation } from './types';
import { fetchModelSchema, mergeSchemaWithDatagraph, generateDatagraphFromTable } from './utils';

interface DatagraphBuilderProps {
  modelName: string;
  value: Record<string, any>; // Existing datagraph
  onChange: (datagraph: Record<string, any>) => void;
}

export const DatagraphBuilder: React.FC<DatagraphBuilderProps> = ({
  modelName,
  value,
  onChange
}) => {
  const [schema, setSchema] = useState<ModelSchema | null>(null);
  const [fields, setFields] = useState<MergedField[]>([]);
  const [relations, setRelations] = useState<MergedRelation[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSchemaAndMerge();
  }, [modelName, value]);

  const loadSchemaAndMerge = async () => {
    setLoading(true);
    try {
      const modelSchema = await fetchModelSchema(modelName);
      setSchema(modelSchema);
      
      const mergedFields = mergeSchemaWithDatagraph(
        modelSchema.scalarFields,
        value
      );
      const mergedRelations = mergeSchemaWithDatagraph(
        modelSchema.relations,
        value
      );
      
      setFields(mergedFields);
      setRelations(mergedRelations);
    } catch (error) {
      console.error('Failed to load schema:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldName: string, updates: Partial<MergedField>) => {
    setFields(prev => prev.map(f => 
      f.name === fieldName ? { ...f, ...updates } : f
    ));
    updateDatagraph();
  };

  const handleRelationChange = (relationName: string, updates: Partial<MergedRelation>) => {
    setRelations(prev => prev.map(r => 
      r.name === relationName ? { ...r, ...updates } : r
    ));
    updateDatagraph();
  };

  const updateDatagraph = () => {
    const newDatagraph = generateDatagraphFromTable(fields, relations);
    onChange(newDatagraph);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="datagraph-builder">
      <div className="builder-actions">
        <button onClick={() => setShowPreview(!showPreview)}>
          Preview JSON
        </button>
      </div>
      
      <ScalarFieldsTable
        fields={fields}
        onChange={handleFieldChange}
      />
      
      <RelationsTable
        relations={relations}
        onChange={handleRelationChange}
        modelName={modelName}
      />
      
      {showPreview && (
        <JsonPreviewPanel
          datagraph={generateDatagraphFromTable(fields, relations)}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
};
```

### 6.4 Utility Functions

**File**: `frontend-1/src/components/forms/Masters/DatagraphBuilder/utils.ts`

```typescript
import { ModelSchema, MergedField, MergedRelation, ScalarFieldSchema, RelationSchema } from './types';
import { api } from '@/api/api';

export async function fetchModelSchema(modelName: string): Promise<ModelSchema> {
  const response = await api.get(`/api/models/${modelName}/schema`);
  return response.data.data;
}

export function mergeSchemaWithDatagraph(
  schemaFields: ScalarFieldSchema[] | RelationSchema[],
  datagraph: Record<string, any>
): MergedField[] | MergedRelation[] {
  return schemaFields.map(field => {
    const datagraphField = datagraph[field.name];
    
    return {
      // Schema properties
      ...field,
      
      // Datagraph properties (if exists)
      included: !!datagraphField,
      permission: datagraphField?.permission,
      displayName: datagraphField?.displayName,
      required: datagraphField?.required,
      isColumnShow: datagraphField?.isColumnShow,
      tableProps: datagraphField?.tableProps,
      searchProps: datagraphField?.searchProps,
      listProps: datagraphField?.listProps,
      orderNo: datagraphField?.orderNo,
      select: datagraphField?.select, // For relations
    };
  });
}

export function generateDatagraphFromTable(
  fields: MergedField[],
  relations: MergedRelation[]
): Record<string, any> {
  const datagraph: Record<string, any> = {};
  
  // Process scalar fields
  for (const field of fields) {
    if (!field.included) continue;
    
    const fieldConfig: any = {};
    
    if (field.permission) fieldConfig.permission = field.permission;
    if (field.displayName) fieldConfig.displayName = field.displayName;
    if (field.required !== undefined) fieldConfig.required = field.required;
    if (field.isColumnShow !== undefined) fieldConfig.isColumnShow = field.isColumnShow;
    if (field.tableProps) fieldConfig.tableProps = field.tableProps;
    if (field.searchProps) fieldConfig.searchProps = field.searchProps;
    if (field.listProps) fieldConfig.listProps = field.listProps;
    if (field.orderNo) fieldConfig.orderNo = field.orderNo;
    
    // Add datatype (handle both datatype and dataType)
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
      dataType: "table", // Support both
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

### 6.5 Integration with ViewForm

**File**: `frontend-1/src/components/forms/Masters/ViewForm.tsx`

Replace JSON editor with DatagraphBuilder:

```typescript
import { DatagraphBuilder } from './DatagraphBuilder/DatagraphBuilder';

// In the form:
<FormField
  control={form.control}
  name="data_graph"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Data Graph</FormLabel>
      <FormControl>
        <DatagraphBuilder
          modelName={form.watch("model_name") || ""}
          value={field.value || {}}
          onChange={(datagraph) => {
            field.onChange(datagraph);
          }}
        />
      </FormControl>
    </FormItem>
  )}
/>
```

---

## 7. Data Flow

### 7.1 Loading Existing Datagraph

```
1. User opens ViewForm for existing view
   ↓
2. Frontend fetches:
   - View data (GET /api/view/:id/view/:viewId)
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

### 7.2 Saving Datagraph

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
4. Validate JSON structure (optional)
   ↓
5. Submit to backend (PUT /api/view/:id/view/:viewId)
```

### 7.3 Including/Excluding Fields

```
1. User toggles "Included" checkbox
   ↓
2. If checked:
   - Enable all editable columns
   - Set default values if not present:
     - Permission: "read" (for id fields) or "update" (for others)
     - Display Name: Auto-generate from field name
     - Show in Table: false (default)
     - Required: Use schema value
   ↓
3. If unchecked:
   - Disable all editable columns
   - Clear values (but keep in state for undo)
   ↓
4. Update datagraph immediately
```

---

## 8. Validation

### 8.1 Field Validation

- Display Name: Required when field is included
- Permission: Required when field is included
- Column Type: Required when Show in Table is true
- Search Operation: Required when Search Enabled is true
- Width: Must be positive number if provided

### 8.2 Relation Validation

- Nested select: Must have at least one field when relation is included
- Display Name: Required when relation is included

### 8.3 Datagraph Validation

- At least one field or relation must be included
- ID field should typically be included (warning, not error)
- Field names must exist in model schema
- Relation names must exist in model schema

### 8.4 Backend Validation

Backend should validate datagraph on save:
- Field names exist in model
- Relation names exist in model
- Nested select structures are valid
- No circular references in nested relations

---

## 9. Error Handling

### 9.1 Frontend Errors

- **Schema fetch failure**: Show error message, disable builder
- **Invalid model name**: Show validation error
- **Merge errors**: Log error, show partial data with warning
- **Save errors**: Show error toast, keep form data

### 9.2 Backend Errors

- **Model not found**: Return 404 with clear message
- **Invalid datagraph**: Return 400 with validation errors
- **Permission denied**: Return 403
- **Server error**: Return 500 with generic message

---

## 10. Performance Considerations

### 10.1 Frontend

- **Virtual Scrolling**: For models with 50+ fields (use react-window)
- **Lazy Loading**: Load relation schemas on-demand when configuring
- **Debounced Updates**: Debounce JSON preview generation (500ms)
- **Memoization**: Memoize expensive computations (useMemo, useCallback)
- **Code Splitting**: Lazy load DatagraphBuilder component

### 10.2 Backend

- **Caching**: Cache model schema introspection results (5 minutes)
- **Efficient Queries**: Use Prisma DMMF directly, avoid database queries
- **Validation**: Validate only on save, not on every change

---

## 11. Testing Requirements

### 11.1 Unit Tests

**Frontend**:
- Merge logic (mergeSchemaWithDatagraph)
- Datagraph generation (generateDatagraphFromTable)
- Field inclusion/exclusion
- Default value generation

**Backend**:
- Model introspection
- Schema endpoint
- Datagraph validation

### 11.2 Integration Tests

- Load existing datagraph and merge with schema
- Save datagraph and verify JSON structure
- Configure nested relations
- Handle missing fields gracefully

### 11.3 E2E Tests

- Create new view with datagraph
- Edit existing view datagraph
- Configure nested relations
- Preview JSON
- Save and verify

---

## 12. Migration Strategy

### 12.1 Backward Compatibility

- Support both `datatype` and `dataType` in generated JSON
- Support both `type: "table"` and `dataType: "table"` for relations
- Handle missing properties gracefully
- Preserve existing datagraph structure when possible

### 12.2 Rollout Plan

1. **Phase 1**: Implement backend schema endpoint
2. **Phase 2**: Build basic table UI (scalar fields only)
3. **Phase 3**: Add relation support
4. **Phase 4**: Add advanced options and validation
5. **Phase 5**: Replace JSON editor in ViewForm
6. **Phase 6**: Test with real use cases
7. **Phase 7**: Deploy to production

---

## 13. Accessibility

- Keyboard navigation for all inputs
- Screen reader labels for all controls
- Focus management in modals
- ARIA labels for table headers
- Tooltips for column headers
- Color contrast meets WCAG AA standards

---

## 14. Security Considerations

- Only admin users can access datagraph builder
- Validate model name to prevent path traversal
- Sanitize user input before generating JSON
- Rate limit schema endpoint to prevent abuse
- Log all datagraph modifications for audit

---

## 15. Future Enhancements

1. **Template System**: Pre-built datagraph templates for common patterns
2. **Field Suggestions**: AI-powered suggestions based on model type
3. **Bulk Operations**: Add multiple fields at once
4. **Field Groups**: Organize fields into logical groups
5. **Validation Rules**: Define custom validation rules per field
6. **Export/Import**: Export datagraphs as JSON files
7. **Version History**: Track changes to datagraphs
8. **Visual Graph**: Visual representation of field relationships

---

## 16. Open Questions

1. Should we standardize on `datatype` or `dataType`? (Currently support both)
2. Should field ordering (`orderNo`) be supported in the UI?
3. Do we need to support importing datagraphs from existing views?
4. Should we validate datagraphs against actual Prisma schema on save?
5. Do we need a visual graph representation of field relationships?
6. Should we support custom field types beyond Prisma types?

---

## 17. Appendix

### 17.1 Example Datagraphs

See `backend/prisma/metadata/views/*.json` for real examples.

### 17.2 Related Documentation

- Datagraph system: `backend/docs/RBAC_DATAGRAPH_SYSTEM.md`
- Prisma schema: `backend/prisma/schema/`
- View model: `backend/prisma/schema/metadata.prisma`

### 17.3 API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/models/:modelName/schema` | Get model schema (NEW) |
| GET | `/api/datagraph/:model/:view` | Get datagraph (existing) |
| GET | `/api/view/:id/view/:viewId` | Get view (existing) |
| PUT | `/api/view/:id/view/:viewId` | Update view (existing) |
| POST | `/api/view/view/:viewId` | Create view (existing) |

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-06  
**Author**: AI Assistant  
**Status**: Ready for Review
