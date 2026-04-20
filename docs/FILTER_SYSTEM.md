# Filter System — Master Component

**Last Updated**: 2026-04-20

---

## Overview

The `Master` component (`src/pages/Master.tsx`) manages two parallel filter mechanisms. Understanding the distinction is critical before adding or modifying filter behaviour.

| Mechanism | Prop | State | Visible to user | Clearable |
|---|---|---|---|---|
| Permanent filters | `defaultFilters` | External (prop) | No | No |
| User-controlled filters | — | `appliedFilters` | Yes (badge chips) | Yes |
| Drill-through preset filters | `presetFilters` | Seeds `appliedFilters` | Yes (badge chips) | Yes |

---

## `defaultFilters`

Merged into every API call unconditionally via `mergeFiltersWithAnd`. The user never sees them and cannot clear them. Use for:

- Tenant isolation (`legal_entity_id`)
- Workflow state filters
- Segment toggles (e.g. "unreconciled only")

---

## `appliedFilters`

User-controlled state managed inside Master. Populated by:

1. The filter modal (`FilterModal`) — user picks fields and operators
2. `presetFilters` prop — seeded on mount for drill-through scenarios

Rendered as removable badge chips by `EnhancedFilterBadges`. Each chip has an individual × button. A "Clear All" button clears the entire set.

---

## `presetFilters`

Seeded into `appliedFilters` **once on mount**. After that they behave identically to user-applied filters — they appear as chips and can be individually cleared.

### Use case

Drill-through navigation: a report row opens a new tab with URL params (`?account_id=X&from_date=Y&to_date=Z`). The target page reads the params and passes them as `presetFilters`. The user arrives with filters pre-applied and clearly visible, and can remove them without navigating away.

### Example (Transactions.tsx)

```tsx
const presetFilters = useMemo(() => {
  const preset: Record<string, any> = {};
  if (urlAccountId) {
    preset.account_id_or_credit_account_id = { eq: urlAccountId };
  }
  if (urlFromDate && urlToDate) {
    preset.value_date = {
      gte: new Date(urlFromDate).toISOString(),
      lte: new Date(urlToDate + 'T23:59:59').toISOString(),
    };
  }
  return Object.keys(preset).length > 0 ? preset : undefined;
}, [urlAccountId, urlFromDate, urlToDate]);

<Master presetFilters={presetFilters} ... />
```

---

## Virtual Composite Keys (OR filters)

Some drill-through filters need to match a value across two fields (e.g. an account that can appear on either the debit or credit side of a posting). A simple `{ account_id: { eq: X } }` would miss one side.

### The pattern

Use a key of the form `"fieldA_or_fieldB"` in `presetFilters`. The value is a normal single-field operator object.

```ts
preset.account_id_or_credit_account_id = { eq: "acc_abc123" };
```

### How it works

1. **Badge display** — `EnhancedFilterBadges` recognises `account_id_or_credit_account_id` and renders a single "Account: {name}" chip. The account name is resolved via the `account` model API.

2. **Query expansion** — `expandVirtualFilters` in Master runs before `mergeFiltersWithAnd`. It detects any `*_or_*` key and rewrites it to a Prisma OR clause:

   ```ts
   // Input
   { account_id_or_credit_account_id: { eq: "acc_abc123" } }

   // Output
   { OR: [{ account_id: { eq: "acc_abc123" } }, { credit_account_id: { eq: "acc_abc123" } }] }
   ```

   Any pre-existing `OR` array in the filters is preserved and merged.

3. **Clear** — clearing the badge removes `account_id_or_credit_account_id` from `appliedFilters`. Both sides of the OR disappear from the query automatically.

### Adding a new virtual key

1. Use `fieldA_or_fieldB` as the key in `presetFilters` (the regex `^(.+?)_or_(.+)$` handles any pair automatically — no code change needed in `expandVirtualFilters`).

2. Add a label case in `EnhancedFilterBadges.getFilterLabel` so the chip shows a human-readable name instead of the raw ID.

3. If the value is a foreign key ID, add a lookup set in the `useMemo` inside `EnhancedFilterBadges` and a `fetchEntity` call in the `useEffect`.

---

## Data flow

```
URL params
    │
    ▼
presetFilters (Transactions.tsx useMemo)
    │
    ▼
Master appliedFilters state (seeded on mount)
    │
    ├──► EnhancedFilterBadges (renders chips, handles clear)
    │
    ▼
filterOutput (JSON string, triggers fetchModelData)
    │
    ▼
expandVirtualFilters   ◄── expands fieldA_or_fieldB → OR clause
    │
    ▼
mergeFiltersWithAnd(userFilters, defaultFilters)
    │
    ▼
viewAPI.search(...)
```
