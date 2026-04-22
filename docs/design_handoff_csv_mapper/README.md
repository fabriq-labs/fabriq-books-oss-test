# Handoff: CSV Column Mapper (Stage 2 — Import Flow)

## Overview

This is the redesigned **Stage 2 of the bank statement CSV import flow** in the Fabriq financial SaaS. After the user selects and uploads a CSV file, they land on this screen to map CSV columns to the required database schema fields before the import is submitted.

The primary design goal was to eliminate the scroll hell of the old Ant Design implementation (nested horizontal + vertical scrollbars, two-row header with mapping dropdowns) and replace it with a clean, viewport-fit layout with a clear mapping interaction.

---

## About the Design Files

The `Import Screen.html` file in this bundle is a **high-fidelity design reference built in HTML/React** — a prototype showing intended look, layout, and interactive behavior. It is **not production code** to copy directly.

The task is to **recreate this design in the Fabriq codebase** using its existing stack (React + shadcn/ui + Tailwind CSS v3). All colors, spacing, typography, and interactions should match the prototype exactly. Do not use Ant Design components for anything visible in this screen — the goal is 100% shadcn/Tailwind appearance.

**Fidelity: High-fidelity.** Colors, typography, spacing, and interactions are final. Recreate pixel-precisely.

---

## The Core Design Idea (Important)

The old design put CSV column names as table headers, with dropdowns above them to select which schema field each maps to. This caused:
- Wide tables (20-column CSVs = 20 columns = horizontal scroll)
- Two-row headers (ambiguous which dropdown belonged to which column)
- Nested scrollbars

**The new design flips this:**
- **Table headers = schema field names** (fixed, bounded set — typically 4 required fields)
- **Each header has a pill** showing which CSV column is mapped to it — clicking opens a popover to change it
- **Only required fields are shown by default** — user adds optional fields via an "+ Add column" button above the table
- **Column count is always controlled** — a 20-column CSV still shows only 4 columns by default

---

## Screen: CSV Mapper

### Layout

Full-page layout within the app shell (fixed topbar + fixed sidebar):
- **Topbar**: fixed, 52px tall, white, border-bottom
- **Sidebar**: fixed left, 196px wide, purple-tinted background
- **Main content area**: `margin-left: 196px`, `margin-top: 52px`, `padding: 20px 24px 72px`
- **Footer action bar**: fixed bottom, `left: 196px`, white with blur, border-top, 52px tall

### Page Header

Flex row, `justify-content: space-between`, `margin-bottom: 12px`.

**Left side:**
- `FileSpreadsheet` icon, 19px, `#7028a0`
- Title: `"Map CSV Columns"` — `font-size: 17px`, `font-weight: 700`, `color: #111827`
- Subtitle: filename · row count · required mapped count — `font-size: 12px`, `color: #64748b`

**Right side (action buttons, left to right):**
1. **AI Categorize** (optional, conditionally shown) — `variant="outline"`, `size="sm"`, sparkle icon, `color: #7028a0` on icon
2. **Discard** — `variant="outline"`, `size="sm"`, ChevronLeft icon
3. **Upload CSV** — `variant="default"` (primary purple), Upload icon, **disabled** until all required fields are mapped

### Progress Strip

Flex row between the page header and the table toolbar. `margin-bottom: 14px`, `gap: 10px`, `align-items: center`.

- **Progress bar**: `flex: 1`, `height: 4px`, `background: #dde3ed`, `border-radius: 9999px`. Fill: `background: #7028a0` normally, `#22c55e` when all required mapped. Animated width transition `0.35s ease`.
- **Count label**: `"{N}/{total} required"` — `font-size: 11px`, `color: #64748b`
- **Status chip**: pill shape `border-radius: 9999px`, `padding: 2px 9px`, `font-size: 11px`, `font-weight: 600`
  - Not ready: `background: #fef3c7`, `color: #92400e`, text: `"★ required fields needed"`
  - Ready: `background: #dcfce7`, `color: #166534`, text: `"✓ ready"`
- **Unused CSV note** (shown when CSV cols remain unmapped): `font-size: 11px`, `color: #64748b`, text: `"{N} CSV columns not mapped — that's OK"`

### Table Toolbar

Flex row, `justify-content: space-between`, `margin-bottom: 8px`.

**Left:**
- Row count label: `"{N} rows"` — `font-size: 12px`, `font-weight: 600`, `color: #64748b`
- **Errors-only toggle**: shown only when error rows exist. Toggle switch + label `"Errors only ({N})"`. When on: label color `#ef4444`.

**Right:**
- **+ Add column** button: `background: #f5ebf9`, `color: #7028a0`, `border: 1.5px dashed #e8d4f2`, `border-radius: 6px`, `font-size: 12px`, `font-weight: 600`, Plus icon. On hover: `background: #e8d4f2`, `border-color: #7028a0`. Opens a popover (see below).
- **Delete {N} rows** button: shown only when rows are selected. `variant="outline"`, destructive red, Trash icon.

### Table

`border: 1px solid #dde3ed`, `border-radius: 8px`, `overflow: hidden` on wrapper. `overflow-x: auto` on wrapper for overflow cases.

`table-layout: fixed`. Width computed as `max(100%, visibleColumnCount × 160 + 36 + 32 + extra)px`.

**Column widths:**
- Checkbox col: 36px
- Row # col: 32px
- Schema field cols: equal width, filling remaining space
- No "Add column" column — the button lives above the table

#### Column Header Cell (per schema field)

`background: #fafafa`, `border-bottom: 1px solid #dde3ed`, `padding: 10px 14px 9px`, `vertical-align: top`.

**Unmapped column**: striped background — `repeating-linear-gradient(135deg, #fafafa, #fafafa 6px, #f1f5f9 6px, #f1f5f9 12px)`

Contents (top to bottom):

1. **Field name row** — flex row, `justify-content: space-between`, `margin-bottom: 4px`:
   - Schema field label: `font-size: 12px`, `font-weight: 700`, `color: #1e293b`
   - Required star `★`: `color: #ef4444`, `font-size: 11px` (required fields only)
   - Lookup badge: `font-size: 9px`, `font-weight: 700`, `color: #0369a1`, `background: #e0f2fe`, `border-radius: 9999px`, `padding: 0 5px`, uppercase — for lookup/relational fields
   - **Remove button** (optional columns only): 16×16px circle, `background: #e2e8f0`, hidden by default, revealed on `th:hover`. On hover: `background: #fee2e2`. Contains an × icon at 9px.

2. **CSV mapping pill** — the clickable selector (see "CSV Mapping Pill" section below)

3. **Unmapped hint** (shown only when not mapped): `font-size: 10px`, `color: #64748b`, `font-style: italic`, `margin-top: 4px`
   - Required field: `"Required — select a CSV column"`
   - Optional field: `"Select a CSV column"`

#### CSV Mapping Pill

Inline-flex, `border-radius: 9999px`, `font-size: 11px`, `font-weight: 600`, `padding: 2px 8px 2px 7px`, `border: 1.5px solid`, cursor pointer.

**Unmapped state:**
- `background: #f1f5f9`, `color: #64748b`, `border-color: #dde3ed`
- Text: `"← Map…"` + ChevronDown icon
- Hover: `background: #f5ebf9`, `border-color: #e8d4f2`, `color: #7028a0`

**Mapped state:**
- `background: #f5ebf9`, `color: #7028a0`, `border-color: #e8d4f2`
- Content: `"←"` arrow (10px, muted) + CSV column name in monospace + ChevronDown icon
- Hover: `background: #e8d4f2`

**Open state (popover visible):** add `box-shadow: 0 0 0 2px rgba(112,40,160,0.22)`

Clicking the pill opens the **CSV Column Selector Popover** (see below).

#### Table Body Rows

`border-bottom: 1px solid #dde3ed`. Last row no border.

**Normal row:** hover `background: #fafafa`
**Error row:** `background: #fff8f8`, hover `#fff0f0`
**Selected row:** `background: #f5ebf9` on all cells (override)

Cells: `padding: 7px 14px` (default) or `5px 14px` (compact density). `font-size: 13px`.

**Unmapped column cells:** use same striped background as header. `color: #64748b`, `font-size: 11px`, `text-align: center`, `font-style: italic`, shows `—`.

**Data cells by type:**
- Debit amount: `color: #dc2626`, `text-align: right`
- Credit amount: `color: #16a34a`, `text-align: right`
- Balance: `color: #64748b`, `text-align: right`
- Description (error row): flex row with AlertTriangle icon (11px, `#ef4444`) + text + `"Not found"` badge (`background: #fee2e2`, `color: #b91c1c`)
- Empty value: `—` in `color: #64748b`, `font-size: 11px`

**Row # cell:** `font-size: 11px`, `color: #64748b`

**Status column (last):**
- OK: badge `background: #dcfce7`, `color: #166534`
- Error: badge `background: #fee2e2`, `color: #b91c1c`, with AlertTriangle icon

---

## Popovers

### CSV Column Selector Popover

Triggered by clicking a mapping pill. Positioned `top: calc(100% + 6px)`, `left: 0` relative to the pill. `width: 232px`.

Style: `background: #fff`, `border: 1px solid #dde3ed`, `border-radius: 10px`, `box-shadow: 0 8px 32px rgba(0,0,0,0.13)`. Entry animation: fade + translateY(-4px) → 0 + scale(0.97) → 1, 140ms ease.

**Header section** (`padding: 9px 12px 6px`, border-bottom):
- Label: `"Map to {Schema Field Name}"` — 10px, uppercase, muted
- Search input: full width, `height: 27px`, `border-radius: 6px`, `font-size: 12px`. Focus: `border-color: #7028a0`

**List section** (`max-height: 200px`, scrollable, `padding: 4px`):
- Section label: `"Available"` — 10px, uppercase, muted, `padding: 4px 10px 2px`
- Each CSV column item: `padding: 6px 10px`, `border-radius: 6px`, `font-size: 13px`, monospace font for the CSV column name. Hover: `background: #f5ebf9`. Selected: `background: #f5ebf9`, `color: #7028a0`, `font-weight: 600` + checkmark icon.
- Divider between Available / Already Used sections: `height: 1px`, `background: #dde3ed`, `margin: 4px 0`
- "Already used" items: `opacity: 0.6`, shows `"reassign"` label on right
- Divider before action items
- **Clear mapping** item: `color: #ef4444`, italic — clears the mapping for this field
- Already-used CSV cols that can be reassigned should be shown but visually dimmed

**Logic:**
- CSV columns already mapped to OTHER schema fields appear in "Already used" section (can still be reassigned — removes from other field)
- CSV columns not mapped anywhere appear in "Available"
- Selecting a CSV col that was used elsewhere automatically clears it from the previous field

### Add Column Popover

Triggered by the "+ Add column" button above the table. `width: 210px`. Same visual style as above.

**Header:** `"Optional schema fields"` label

**List:** Shows only schema fields that are:
- `required: false`
- Not already visible in the table

Each item shows the field label + optional `"lookup"` note for relational fields.

Clicking an item adds that column to the table (appended after required columns) and closes the popover.

If all optional fields are already added: show `"All optional fields added"` message.

---

## Interactions & Behavior

### Mapping State
- `mapping` object: `{ [schemaFieldId]: csvColumnId | "" }`
- When a CSV column is selected for a schema field: update mapping, re-render table data
- When "Clear mapping" is clicked: set `mapping[schemaFieldId] = ""`
- When a CSV col is reassigned from another field: `mapping[oldSchemaFieldId] = ""`, `mapping[thisSchemaFieldId] = csvColId`

### Adding / Removing Optional Columns
- `optionalIds`: array of optional schema field IDs currently visible
- Adding: append to `optionalIds`
- Removing (× button on header): remove from `optionalIds`, also delete `mapping[fieldId]`

### Row Selection
- Checkbox per row + "select all" in header (selects current page only)
- Selected rows: purple-tinted background
- When any rows selected: show "Delete {N} rows" button in toolbar and footer bar

### Errors-only Toggle
- Filter table to only rows where `hasError === true`
- Reset pagination to page 1 on toggle

### Upload CSV Button
- Disabled until all `required: true` schema fields have a non-empty mapping
- On click (when enabled): trigger import API call

### Pagination
- Page size options: 10 / 20 / 50
- Prev/Next buttons + page number buttons (show max 5 pages, sliding window)
- Changing page size resets to page 1
- Persist `page` and `pageSize` in localStorage

### Popover Dismissal
- Click outside → close popover, clear search
- Opening a new popover while another is open: close the previous

### Toast Notifications
- Use `sonner` (already wired in Fabriq): success on import start, on row delete, on AI categorize
- Position: bottom-center, above footer bar

### Persist State
- Store `{ mapping, page, pageSize, optionalIds }` in `localStorage` on every change
- Restore on mount — user can refresh without losing mapping progress

---

## State Variables

```ts
mapping: Record<string, string>       // schemaFieldId → csvColumnId
optionalIds: string[]                 // optional schema fields currently shown
rows: Row[]                           // all CSV rows (with selected, hasError flags)
page: number
pageSize: number                      // 10 | 20 | 50
onlyErrors: boolean
```

Derived:
```ts
requiredFields        = SCHEMA_FIELDS.filter(f => f.required)
mappedReqCount        = requiredFields.filter(f => mapping[f.id]).length
allReqMapped          = mappedReqCount === requiredFields.length
visibleFields         = [...requiredFields, ...optionalFields filtered to optionalIds]
filteredRows          = onlyErrors ? rows.filter(r => r.hasError) : rows
unusedCsvCount        = CSV_COLS.filter(c => !Object.values(mapping).includes(c.id)).length
```

---

## Design Tokens

| Token | Value |
|-------|-------|
| Primary | `#7028a0` |
| Primary hover | `#591e80` |
| Primary light | `#f5ebf9` |
| Primary 100 | `#e8d4f2` |
| Border | `#dde3ed` |
| Muted bg | `#f1f5f9` |
| Muted fg | `#64748b` |
| Foreground | `#0f172a` |
| Destructive | `#ef4444` |
| Success green | `#22c55e` |
| Border radius (card) | `8px` |
| Border radius (button/input) | `6px` |
| Border radius (pill) | `9999px` |
| Font (body) | Lato |
| Font (headings) | Poppins |
| Shadow (popover) | `0 8px 32px rgba(0,0,0,0.13)` |
| Shadow (card) | `0 1px 3px rgba(0,0,0,0.04)` |

---

## Footer Action Bar

Fixed bottom bar, `left: 196px` (sidebar width), `background: rgba(255,255,255,0.97)`, `backdrop-filter: blur(8px)`, `border-top: 1px solid #dde3ed`, `padding: 9px 24px`, flex row `space-between`.

**Left:** Status message
- All required mapped: `"✓ All required fields mapped — ready to import"` — `color: #16a34a`, `font-weight: 600`, with Check icon
- Not ready: `"{N} required field(s) unmapped — click the pills in the column headers"` — muted, with Info icon

**Right:** Same buttons as page header (Delete selected if applicable, Discard, Upload CSV)

---

## Files in This Bundle

| File | Description |
|------|-------------|
| `Import Screen.html` | Full hi-fi interactive prototype of the CSV mapper screen |
| `README.md` | This document |

The prototype uses inline React/Babel with no build step — open in a browser to interact with it. Use it as the visual and behavioral reference when implementing in the Fabriq codebase.
