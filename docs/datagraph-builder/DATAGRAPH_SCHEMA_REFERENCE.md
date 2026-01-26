# Datagraph Schema Reference

**Purpose**: Canonical reference for the view `data_graph` JSON schema. Use this when editing datagraphs (manually or via the visual builder), debugging list/form behavior, or building tools that consume view metadata.

**Related**: [Datagraph Builder Summary](./DATAGRAPH_BUILDER_SUMMARY.md) | [Table Design](./DATAGRAPH_BUILDER_TABLE_DESIGN.md) | [BACKEND.md](../BACKEND.md) (view-based access)

---

## Overview

- The **view** table stores a JSON column `data_graph` per view.
- The backend uses `data_graph` to build the Prisma `select` for list/search/get (which fields and relations are loaded).
- The same `data_graph` is returned to the frontend as **metaData** and drives:
  - **List (Master)**: column visibility, order, display names, and how relation values (e.g. category name) are shown.
  - **Forms**: which fields appear, types, dropdown config, validation.
  - **Filters**: which fields are filterable and how (e.g. search dropdown model).

Structure: `data_graph` is an object whose **keys** are model field names (scalars and relation names). Each value is a **field/relation config** object. Relation configs can contain a nested `select` object for the related model’s fields.

---

## Common properties (scalars and relations)

| Property      | Type    | Meaning |
|---------------|---------|--------|
| **displayName** | string  | Human-readable label (list headers, form labels). Omit to exclude the field from the generated list columns. |
| **permission**  | string  | Access hint: `"read"` or `"update"`. Used with view permissions; often aligned with field-level RBAC. |
| **required**    | boolean | Whether the field is required (forms, validation). |
| **isColumnShow**| boolean | If `true`, show this field as a column in the Master list. Default behavior when omitted varies (treat as optional). |
| **orderNo**     | number  | Sort order of columns in the list (lower first). Fields without `orderNo` sort after those with it. |
| **datatype** / **dataType** | string | Data type for display/validation: e.g. `string`, `int`, `float`, `date`, `datetime`, `number`, `decimal`, `currency`. For **relation** fields use `"table"` (or `type: "table"` in backend parser). |

**Note**: The codebase uses both `datatype` and `dataType`; list/forms accept either.

---

## Scalar-only: `tableProps`

Used for list column behavior and form controls. Only meaningful for scalar (and FK) fields.

| Property        | Type   | Meaning |
|-----------------|--------|--------|
| **columnType**  | string | How the list cell is rendered: `text`, `select`, `date`, `int`, `float`, `checkbox`. |
| **width**       | string | Column width (e.g. `"200"`, `"500"`) in the list. |
| **defaultValue**| string | Default value for forms / new rows. |
| **selectProps** | object | Config for relation-based dropdowns (see below). Used when `columnType === "select"`. |

---

## `selectProps` (for FK / relation dropdowns)

When a scalar is a **foreign key** (e.g. `account_id`, `legal_entity_id`) and `tableProps.columnType` is `"select"`, the list and forms use `selectProps` to:

1. **Load options**: which model/view to search or lookup.
2. **Display in list**: which nested relation key and label field to show (e.g. account name instead of ID).

| Property            | Type   | Meaning |
|---------------------|--------|--------|
| **type**            | string | **Model name** for the **lookup** API (`viewAPI.lookup(type, lookup_id_name)`). Should match the FK’s target model (e.g. `organization` for `legal_entity_id`). |
| **instanceType**    | string | **Model name** for the **search** API when loading dropdown options (`viewAPI.search(instanceType, instanceType + '_view', ...)`). Also used as fallback for the list cell’s nested object key when `relationName` is not set. |
| **instanceKey**     | string | Field on the related record used as **value** (e.g. `"id"`). |
| **instanceLabel**   | string | Field on the related record shown as **label** in dropdown and list (e.g. `"name"`, `"organization_name"`). |
| **instanceSubLabel**| string | Optional second field shown under the main label (e.g. code or subtitle). |
| **instanceSourceKey** | string | **FK field name** on the current model (e.g. `"account_id"`, `"legal_entity_id"`). The list cell derives the nested key by stripping `_id` (e.g. `account_id` → `account`) to read the related object. |
| **relationName**    | string | **Prisma relation name** on the current model when it differs from the FK-derived key. Example: `legal_entity_id` → derived key would be `legal_entity`, but the real relation is `organization`; set `relationName: "organization"` so the list shows `row.organization[instanceLabel]`. Omit for FKs whose relation name matches the derived key (e.g. `account_id` → `account`). |
| **searchParams**    | string | Field name on the **related** model used for search filter when the user types in the dropdown (e.g. `"name"`, `"organization_name"`). |
| **limit**           | string | Max number of options to fetch (e.g. `"10"`). |
| **lookup_id_name**  | string | Optional; used with `type` for lookup-based loading. |

**Example (posting – two account relations):**

- `account_id`: `instanceSourceKey: "account_id"` → list uses `row.account`; `instanceLabel: "name"`.
- `credit_account_id`: `instanceSourceKey: "credit_account_id"` → list uses `row.credit_account`; `instanceLabel: "name"`.

**Example (payment_terms – FK name ≠ relation name):**

- `legal_entity_id` points to `organization`. Relation name is `organization`, not `legal_entity`. Set `relationName: "organization"` and `type` / `instanceType` to `"organization"` so list and dropdowns both use the organization model.

---

## Scalar-only: `searchProps`

Configures list/search behavior for this field.

| Property   | Type    | Meaning |
|------------|---------|--------|
| **isSearch** | boolean | Whether this field is used for the list search (e.g. global search bar). |
| **operation**| string  | Filter operator when searching: e.g. `startswith`, `contains`, `equals`. |

---

## Scalar-only: `listProps`

Extra list-cell behavior (e.g. badges).

| Property | Type   | Meaning |
|----------|--------|--------|
| **type** | string | Render variant; e.g. `"badge"` for badge-style cells. |
| **key**  | string | Optional key for badge value. |
| **label**| string | Optional label for badge. |

---

## Relation fields (nested data)

Relation entries describe the **related object** to include in API responses. They drive the backend Prisma `select` and are not usually shown as their own column; the **FK column** (e.g. `account_id`) is shown and uses `selectProps` to display the related label.

| Property   | Type   | Meaning |
|------------|--------|--------|
| **type** / **dataType** | string | Use `"table"` so the backend treats this key as a relation and applies nested `select`. (Backend parser looks for `type === "table"`.) |
| **select** | object | Nested “select” for the related model: keys are field names, values are `"read"` or `"update"` (or another nested `select` for nested relations). The backend converts this to Prisma `select` (e.g. `select: { id: true, name: true }`). |
| **displayName** | string | Optional label (e.g. for builder UI). |
| **isColumnShow**| boolean | If `true`, the list can show the relation object in a column (e.g. via a custom render using `select` to pick a display field). Often `false` for the relation and `true` for the FK column. |
| **required**   | boolean | Whether the relation is required. |

**Nested `select` values:**

- `"read"` or `"update"`: include this scalar in the relation’s select (backend typically maps both to `true`).
- Object with `select`: nested relation; same structure recursively.

**Example:**

```json
"account": {
  "type": "table",
  "select": { "id": "read", "name": "update" },
  "dataType": "table",
  "displayName": "Account",
  "isColumnShow": false
},
"account_id": {
  "datatype": "string",
  "permission": "update",
  "tableProps": {
    "columnType": "select",
    "selectProps": {
      "instanceType": "account",
      "instanceLabel": "name",
      "instanceSourceKey": "account_id"
    }
  },
  "displayName": "Account",
  "isColumnShow": true
}
```

---

## How the backend uses `data_graph`

- **ModelService** (and similar paths) loads the view and reads `view.data_graph`.
- **Select**: If the view does not provide a prebuilt `data_graph.select`, the backend uses `LegacyDataGraphParser.parseToSelect(data_graph)`:
  - Keys with `type === "table"` and a `select` object → Prisma relation select (e.g. `account: { select: { id: true, name: true } }`).
  - All other keys → scalar or FK included in the top-level select (e.g. `account_id: true`).
- The same `data_graph` (or a view-shaped object containing it) is returned as **metaData** in list/search/get responses so the frontend can generate columns and form config.

---

## How the frontend uses `metaData` (list)

- **Master** page** calls view search, receives `{ data, total, metaData }` and passes `metaData` to the list.
- **DynamicTable** builds columns from `metaData` via **generateColumns** (see `table-columns/columnGenerator.tsx`):
  - Columns are generated from each key that has a **displayName**; **orderNo** and **isColumnShow** control order and visibility.
  - For keys with `meta.select` and `datatype`/`dataType` `"table"`, the list can use a **nested-object render** (display field from `select`).
  - For keys with `tableProps.columnType === "select"` and **selectProps**, the list uses **SelectCell**, which:
    - Uses **relationName** if present; otherwise derives the nested key from **instanceSourceKey** (strip `_id`).
    - Displays **instanceLabel** (and optional **instanceSubLabel**) from that nested object.
- So to show a relation’s label in the list you need:
  1. A **relation** entry in `data_graph` with `type: "table"` and `select` (so the API returns the nested object).
  2. The **FK** column with `tableProps.columnType: "select"` and **selectProps** (including **relationName** when the relation name ≠ FK-derived key).

---

## Quick reference: property by context

| Context           | Properties to set |
|-------------------|-------------------|
| List column shown | `displayName`, `isColumnShow: true`, optional `orderNo`, `tableProps` as needed. |
| List column = FK label | FK key: `tableProps.columnType: "select"`, `selectProps` with `instanceType`, `instanceLabel`, `instanceSourceKey`; add **relationName** if relation name ≠ derived key. Relation key: `type: "table"`, `select: { … }`. |
| Form field        | `displayName`, `permission`, `required`, `tableProps` (e.g. `columnType`, `defaultValue`, `selectProps` for dropdowns). |
| Search filter     | `searchProps: { isSearch: true, operation: "…" }`. |
| Badge in list     | `listProps: { type: "badge", … }`. |

---

## Related documentation

- [DATAGRAPH_BUILDER_SUMMARY.md](./DATAGRAPH_BUILDER_SUMMARY.md) – Visual datagraph builder and current state.
- [DATAGRAPH_BUILDER_TABLE_DESIGN.md](./DATAGRAPH_BUILDER_TABLE_DESIGN.md) – Table-based UI and column mapping.
- [BACKEND.md](../BACKEND.md) – View-based access and `data_graph` role.
- Example views: `backend/prisma/metadata/views/*.json`.
