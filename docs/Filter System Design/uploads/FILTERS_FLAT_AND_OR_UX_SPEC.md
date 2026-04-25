# Filters UX Spec: Flat AND/OR (No Nesting)

## Status

Draft for high-fidelity design and implementation planning.

## Objective

Enable users to apply multiple RHS values for a single LHS field in the filter UI, while keeping logic flat (no nested groups).

The backend already supports AND/OR in the API contract. This spec focuses only on frontend UX and payload shaping.

## Scope

- Update filter modal UX to support:
  - Multiple free-form RHS values per field.
  - Multiple dropdown RHS values per field (searchable).
- Keep overall boolean logic simple:
  - Across different fields: `AND`
  - Within the same field (multiple RHS values): `OR`
- Update applied filter chips/badges so users can understand multi-value conditions.

## Out of Scope

- Nested boolean groups.
- Per-field `Match any` / `Match all` toggle.
- Backend changes.
- Changes to default/preset filter semantics in `Master`.

## Current Constraints (Observed)

- Filter row field selector prevents reusing the same field in multiple rows.
- RHS inputs are currently single-value controls (single text, single select).
- Badge rendering is optimized for one condition per field and does not clearly summarize multi-value OR conditions.

## UX Model

### Boolean Semantics

- `fieldA` + `fieldB` + `fieldC` are combined with `AND`.
- Multiple conditions for one field are combined with `OR`.

Example:

- `status = Open OR status = Pending`
- `AND vendor_id = v1 OR vendor_id = v2`
- Effective expression:
  - `(status = Open OR status = Pending) AND (vendor_id = v1 OR vendor_id = v2)`

### Filter Modal Structure

Each row remains:

- `Field` selector
- `Operator` selector
- `Value` input control
- Remove action

Rows can now reuse the same `Field`.

### RHS Control Behavior by Type

#### 1) Free-form fields (text/number as applicable)

- Use token/chip input interaction.
- User enters value and commits with `Enter` (and optionally comma).
- Each token becomes one OR condition for that field/operator.
- Tokens are removable inline.
- Empty tokens are ignored.

#### 2) Dropdown/search fields (lookup/select)

- Use searchable multi-select interaction.
- User can select multiple values in one session.
- Selected values are shown as tokens/chips in control.
- Deselecting a token removes that OR condition.
- Keep menu open during selection for efficiency.

### Operator Rules

- Existing operators remain supported.
- Null operators (`is_null`, `is_not_null`) continue to not require RHS value.
- Null operators should not accept multiple RHS values.

### Apply/Cancel

- Keep current explicit apply flow:
  - `Cancel` closes without applying modal edits.
  - `Apply Filters` commits to table query.

## Data Contract (Frontend Payload)

### Target Shape

For each field:

- Single condition:
  - `{ field: { eq: "value" } }`
- Multiple conditions (OR):
  - `{ field: { OR: [ { eq: "v1" }, { eq: "v2" } ] } }`

This matches existing frontend grouping logic and backend support path.

### Date Range

- Existing date range behavior stays unchanged:
  - `{ date_field: { gte: <date>, lte: <date> } }`

### Coexistence With Existing Special Keys

- Virtual keys like `fieldA_or_fieldB` in `presetFilters` remain unchanged.
- `Master.expandVirtualFilters` behavior remains unchanged.
- Modal may continue excluding virtual keys from editable rows.

## Applied Filter Chips / Badges

Badges should clearly represent grouped OR values for a field.

Recommended display:

- `Status: Open OR Pending`
- `Vendor: Apple OR Samsung`
- `Description contains: "abc" OR "xyz"`

Behavior:

- Remove one field chip clears all conditions for that field group.
- `Clear All` clears all user-applied filters.

## Validation and Edge Cases

- Ignore empty values for non-null operators.
- Deduplicate repeated RHS values per field/operator where practical.
- If user removes all RHS tokens for a row, treat row as inactive unless operator is null-based.
- Preserve current date range state sync behavior when clearing date chip.

## Accessibility & Usability Requirements

- Tokenized controls must be keyboard operable:
  - Add token with `Enter`.
  - Remove focused token with `Backspace/Delete`.
- Searchable dropdown supports keyboard navigation and selection.
- Visible summary of active filters must remain outside collapsed controls (badges).

## Analytics / Instrumentation (Optional but Recommended)

- Count number of applied filter fields.
- Count number of RHS values per field.
- Track apply/clear usage to validate discoverability and performance.

## Performance Considerations

- Keep current batch apply model to avoid re-querying on each token mutation.
- For large lookup sets, continue async search with pagination/limit.

## Acceptance Criteria

1. User can add multiple free-form RHS values for the same field in filter UI.
2. User can select multiple searchable dropdown RHS values for the same field.
3. Payload sent from frontend groups same-field values as OR conditions.
4. Different fields continue to combine with AND behavior as today.
5. Date range and null operators continue working as before.
6. Applied chips clearly communicate multi-value conditions.
7. Clearing field chip removes all its OR conditions; Clear All resets all applied filters.
8. No backend API changes required.

## Implementation Notes (For Engineering)

- Primary touchpoints:
  - `frontend-1/src/components/filter/FilterModal.tsx`
  - `frontend-1/src/components/filter/FilterInputs.tsx`
  - `frontend-1/src/components/filter/EnhancedFilterBadges.tsx`
  - `frontend-1/src/pages/Master.tsx` (no logic change expected, verify integration)
- Ensure backward compatibility for existing saved/preset/default filter formats.

