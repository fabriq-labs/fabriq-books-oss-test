# Invoice document UI (Books)

Design notes for the sales invoice create/edit screen in `frontend-0`. Kernel nested-write behavior is in [docs/kernel/metadata.md](../kernel/metadata.md).

## Intent

Accounting users need to **see how money rolls up**, not four equal cards. Prod’s sales invoice already does that: header fields, then an item table whose footer stacks Subtotal → Tax → adjustable rows → Grand Total.

## Decisions

| Choice | Why |
|---|---|
| One document card | Reads as a single invoice, not a dashboard of panels |
| Two-pane header, uppercase micro-labels | Matches prod density and scan path (party/terms left; number/dates right) |
| Totals in the table footer | Rollup sits under the lines that produce it; shipping/adjustment edit in place |
| Server totals only | Amounts come from `calculate_invoice_total` after blur PUT — no client money truth |
| Tax % on the line | Rate the user edits; group expansion stays a server concern until they override |

## Out of scope (for now)

Relation-level field ACL on `updateChild` (filter child payload from parent `data_graph`). Nested writes use parent-model write only; see kernel metadata.
