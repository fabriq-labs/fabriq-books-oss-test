# Datagraph Builder Feature - Summary

## Overview

This document summarizes the findings and proposed design for building a visual datagraph editor feature.

## Current State Analysis

### ✅ What Exists
- **ViewForm Component**: Basic form with JSON code editor (`frontend-1/src/components/forms/Masters/ViewForm.tsx`)
- **Backend Endpoint**: `/api/datagraph/:model/:view` returns datagraph structure
- **Access Pattern**: Views accessed via `/view/:id/view/:viewId` route
- **List Page**: `/settings/views` shows all views

### ❌ Current Limitations
- Raw JSON editing is error-prone and not user-friendly
- No validation of field names against actual model schema
- No visual representation of nested relations
- Difficult to understand datagraph structure
- No field discovery/autocomplete

## Datagraph Structure - Key Findings

For a full property-by-property reference, see **[Datagraph Schema Reference](./DATAGRAPH_SCHEMA_REFERENCE.md)**.

### Field Types Supported

1. **Scalar Fields** (String, Number, Date, Boolean)
   - Basic properties: `datatype`, `permission`, `displayName`, `isColumnShow`, `required`
   - Table properties: `tableProps` (width, columnType, selectProps for dropdowns)
   - Search properties: `searchProps` (isSearch, operation)
   - List properties: `listProps` (type, color for badges)

2. **Relation Fields**
   - Can use `type: "table"` or `dataType: "table"` (inconsistency in codebase)
   - Nested `select` object defines which fields from related model to include
   - Supports deeply nested relations (3+ levels observed)

3. **Foreign Key Fields**
   - Separate from relation fields (e.g., `payment_term_id` vs `payment_terms`)
   - Can have `selectProps` for dropdown configuration (including `relationName` when the Prisma relation name differs from the FK-derived key)
   - Used for form inputs and list display (via SelectCell); relation fields define what the API includes

### Patterns Observed

- **Simple Scalar**: `{ "id": { "datatype": "string", "permission": "read" } }`
- **Full Scalar**: Includes tableProps, searchProps, displayName, etc.
- **Simple Relation**: `{ "payment_terms": { "select": { "id": "read", "payment_terms": "update" }, "dataType": "table" } }`
- **Nested Relation**: Multi-level nesting with mixed patterns (full objects and permission strings)

## Proposed Solution

### UI Design

**Main Components**:
1. **Field List View**: Card-based layout showing all configured fields
2. **Add Field Dialog**: Searchable dropdown to select from available model fields
3. **Field Configuration Panel**: Expandable cards for each field's properties
4. **Relation Builder**: Recursive UI for nested relations
5. **JSON Preview**: Collapsible panel showing generated JSON

**Key Features**:
- Visual field management (add/remove/reorder)
- Field type detection and validation
- Support for all datagraph properties
- Nested relation builder with visual tree
- Real-time JSON preview
- Import from existing view

### Backend Requirements

**New Endpoint Needed**: `GET /api/models/:modelName/schema`

Returns:
- Available scalar fields (name, type, isRequired, isId)
- Available relations (name, type, relationType, foreignKey)
- Field descriptions (if available)

**Implementation**: Use Prisma introspection to discover model schema.

## Implementation Phases

### Phase 1: Backend Schema Discovery ✅ (First Step)
- Implement model schema endpoint
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

## Design Decisions

### 1. Field Discovery
- **Decision**: Use Prisma introspection via backend endpoint
- **Rationale**: Ensures field names are validated, supports all models dynamically

### 2. UI Pattern
- **Decision**: Card-based expandable fields
- **Rationale**: Clean, organized, scalable for many fields

### 3. Nested Relations
- **Decision**: Recursive component with visual indentation
- **Rationale**: Matches data structure, intuitive for users

### 4. JSON Preview
- **Decision**: Collapsible panel, not primary interface
- **Rationale**: Visual builder is primary, JSON is for verification

### 5. Backward Compatibility
- **Decision**: Support both `datatype` and `dataType`, `type` and `dataType` for relations
- **Rationale**: Existing views use both patterns

## Success Criteria

- ✅ Users can create datagraphs without writing JSON
- ✅ Field names are validated against model schema
- ✅ Nested relations are supported
- ✅ UI is intuitive and user-friendly
- ✅ Generated JSON is valid and follows schema
- ✅ Works for both create and edit flows
- ✅ Handles existing datagraph inconsistencies gracefully

## Next Steps

1. **Review this design** with stakeholders
2. **Confirm approach** for model schema discovery
3. **Prioritize phases** based on business needs
4. **Begin implementation** starting with Phase 1

## Questions for Review

1. Should we support both `datatype`/`dataType` patterns, or standardize on one?
2. Should field ordering (`orderNo`) be supported in the UI?
3. Do we need to support importing datagraphs from existing views?
4. Should we validate datagraphs against actual Prisma schema on save?
5. Do we need a visual graph representation of field relationships?

## Related Documentation

- **[Datagraph Schema Reference](./DATAGRAPH_SCHEMA_REFERENCE.md)** – Canonical reference for every `data_graph` property (displayName, tableProps, selectProps, relationName, relation select, etc.) and how they drive list/form/backend.
- Full design document: [DATAGRAPH_BUILDER_DESIGN.md](./DATAGRAPH_BUILDER_DESIGN.md)
- Table-based UI design: [DATAGRAPH_BUILDER_TABLE_DESIGN.md](./DATAGRAPH_BUILDER_TABLE_DESIGN.md)
- Example views: `backend/prisma/metadata/views/*.json`
