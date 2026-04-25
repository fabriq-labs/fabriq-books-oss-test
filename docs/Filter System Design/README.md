# Filter System — Design Notes

Hi-fi prototype for the **Flat AND/OR Filter** UX spec.
Spec: `uploads/FILTERS_FLAT_AND_OR_UX_SPEC.md`

---

## Implementation handoff notes

### Dropdown fields: display name vs. ID

Dropdown/select fields (e.g. Supplier, Status, Department) are backed by relation objects.
The chip in the multi-select input **must show the display name** (e.g. `supplier_name`, `label`, `name`),
but the value committed to the filter payload **must be the record ID** (e.g. `supplier_id` value).

This matches the existing behaviour in `FilterInputs.tsx` / `ModernDropDown` / `SearchDropDown` —
the `onSelectItem` handler already receives the full object and extracts `item.id` for the filter value,
while the rendered chip shows `instanceLabel`.

**No UX change needed here** — the coding agent should carry this forward using the same
`ModernDropDown` + `instanceLabel` / `instanceKey` pattern already in place.
The design prototype uses plain string arrays for demo purposes only.

---

## Components touched (per spec)

| File | Change |
|---|---|
| `FilterModal.tsx` | Allow same field in multiple rows; token-based multi-value RHS |
| `FilterInputs.tsx` | Token input for text/number; multi-select for select/lookup fields |
| `EnhancedFilterBadges.tsx` | Render OR-grouped badges: `Status: Draft OR Pending` |

## Boolean semantics

- Different fields → **AND**
- Multiple values for the same field → **OR**
- Effective expression: `(status = Draft OR Pending) AND (supplier_id = x OR y)`

## Payload shape

```json
// Single value
{ "status": { "eq": "Approved" } }

// Multiple values (OR)
{ "status": { "OR": [{ "eq": "Draft" }, { "eq": "Pending" }] } }

// Date range (unchanged)
{ "date": { "gte": "2024-04-01", "lte": "2024-04-30" } }
```

## Out of scope

- Nested boolean groups
- Per-field Match any / Match all toggle
- Backend changes
- Table pagination or record count changes
