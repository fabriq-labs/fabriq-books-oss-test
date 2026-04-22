# Fabriq Design System

> Reference document for Claude Design (and any designer/developer) to understand the visual language of the Fabriq Financial Suite frontend. Use this when designing new screens so they feel native to the app.

---

## 1. Foundation

### Technology Stack
- **UI Library**: shadcn/ui (Radix UI primitives + CVA)
- **Styling**: Tailwind CSS v3 with CSS custom properties
- **Component library**: Mix of shadcn/ui components AND Ant Design (legacy areas still use `antd`)
- **Icons**: Lucide React (primary), Ant Design icons (in legacy areas)
- **Fonts**: Lato (primary body font), Poppins (secondary, headings in some places)
- **Animation**: tailwindcss-animate

---

## 2. Color Palette

### Primary Brand Color — Purple
The brand identity is built around a rich purple. All interactive primary actions use this.

| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `primary-600` (default) | `#7028a0` | `273 60% 39%` | Primary buttons, active states, links |
| `primary-500` | `#8c2abc` | — | Hover tints |
| `primary-400` | `#a354c9` | — | Light interactive |
| `primary-300` | `#ba7fd6` | — | Decorative accents |
| `primary-200` | `#d1a9e4` | — | Light fills |
| `primary-100` | `#e8d4f2` | — | Very light backgrounds |
| `primary-50` | `#f5ebf9` | — | Subtle tint |
| `primary-700` | `#591e80` | — | Pressed/darker states |

**In code**: always use `bg-primary`, `text-primary`, `border-primary` — do not hardcode hex in new components.

### CSS Variable Tokens (Light Mode)
```css
--background: 0 0% 100%         /* Pure white page background */
--foreground: 222.2 84% 4.9%    /* Near-black text */
--card: 0 0% 100%               /* White card surface */
--card-foreground: 222.2 84% 4.9%
--popover: 0 0% 100%
--primary: 273 60% 39%          /* #7028a0 purple */
--primary-foreground: 0 0% 100% /* White on purple */
--secondary: 210 40% 96.1%      /* Light blue-grey fill */
--secondary-foreground: 222.2 47.4% 11.2%
--muted: 210 40% 96.1%          /* Same as secondary — disabled / subtle */
--muted-foreground: 215.4 16.3% 46.9%  /* Medium grey text */
--accent: 273 60% 96%           /* Very pale purple — hover bg for ghost items */
--accent-foreground: 222.2 47.4% 11.2%
--destructive: 0 84.2% 60.2%   /* Red */
--destructive-foreground: 210 40% 98%
--border: 214.3 31.8% 91.4%    /* Light blue-grey border */
--input: 214.3 31.8% 91.4%     /* Same — input borders */
--ring: 273 60% 39%             /* Purple focus ring */
--radius: 0.5rem                /* 8px — default border radius */
```

### Sidebar Colors
The sidebar uses purple-tinted variants — creating a cohesive branded panel:
```css
--sidebar-background: 273 60% 98%   /* Near-white with purple tint */
--sidebar-foreground: 273 30% 25%   /* Dark purple-grey text */
--sidebar-primary: 273 60% 39%      /* Active item — full purple */
--sidebar-accent: 273 30% 95%       /* Hover item background */
--sidebar-border: 273 30% 90%       /* Sidebar divider lines */
```

### Semantic Status Colors (Tailwind utilities — used directly)
| State | Background | Text | Usage |
|-------|-----------|------|-------|
| Success / Positive | `bg-green-100` | `text-green-800` | Approved, Paid, Active badges |
| Warning / Pending | `bg-yellow-100` | `text-yellow-800` | Draft, Pending, In-review badges |
| Error / Negative | `bg-red-100` | `text-red-800` | Rejected, Overdue, Failed badges |
| Info | `bg-blue-100` | `text-blue-800` | Informational states |
| Neutral | `bg-gray-100` | `text-gray-600` | Inactive, Archived |

Status badges are always `px-2 py-1 rounded-full text-xs font-medium`.

---

## 3. Typography

### Font Families
- **Body**: `font-lato` / `font-sans` → Lato (loaded from Google Fonts: weights 300, 400, 700, 900)
- **Headings (some contexts)**: `font-poppins` → Poppins (weights 300, 400, 500, 600, 700)
- The `<body>` element uses `font-lato` by default.

### Type Scale (Tailwind)
| Class | Size | Weight | Usage |
|-------|------|--------|-------|
| `text-3xl font-bold` | 30px | 700 | Page-level headings (import screens, major titles) |
| `text-2xl font-bold text-gray-900` | 24px | 700 | Section titles, list-page headings |
| `text-xl font-semibold text-gray-800` | 20px | 600 | Card titles, dialog titles, topbar title |
| `text-lg font-semibold` | 18px | 600 | Dialog/modal headings, group labels |
| `text-sm font-semibold text-gray-700` | 14px | 600 | Form section labels, column headers |
| `text-sm font-medium` | 14px | 500 | Button labels, strong body text |
| `text-sm text-muted-foreground` | 14px | 400 | Secondary descriptions, helper text |
| `text-xs font-medium` | 12px | 500 | Badges, chips, table meta |
| `text-xs font-bold text-gray-600 uppercase tracking-wide` | 12px | 700 | Section group headers in forms |

---

## 4. Spacing

Tailwind's default scale is used consistently. Common patterns:

| Context | Class |
|---------|-------|
| Page content padding | `p-4 md:p-6` |
| Card internal padding | `p-6` |
| Card section padding (no top) | `p-6 pt-0` |
| Form field vertical stack | `space-y-6` |
| Form field group | `space-y-4` |
| Form field label-to-input | `space-y-2` |
| Action button row gap | `gap-2` or `space-x-2` |
| Grid layout gap | `gap-6` |
| Icon-to-text gap | `gap-2` |

---

## 5. Border Radius

| Token | Computed value | Usage |
|-------|---------------|-------|
| `rounded-sm` | 4px (`--radius - 4px`) | Small elements, tight chips |
| `rounded-md` | 6px (`--radius - 2px`) | Buttons, inputs, select triggers |
| `rounded-lg` | 8px (`--radius`) | Cards, dialog content |
| `rounded-full` | 9999px | Status badges, avatar, pill chips |

---

## 6. Shadows

| Class | Usage |
|-------|-------|
| `shadow-sm` | Cards (default elevation) |
| `shadow-md` | Hovered cards, popovers |
| `shadow-lg` | Modals, overlaid panels (chat sidebar) |

---

## 7. Component Specifications

### Button
Built on CVA with these variants:

| Variant | Appearance | Use Case |
|---------|-----------|----------|
| `default` | `bg-primary text-white` hover `bg-primary/90` | Primary CTA (Submit, Upload, Save) |
| `destructive` | `bg-destructive text-white` | Delete, discard |
| `outline` | `border border-input bg-background` hover `bg-accent` | Secondary actions (Cancel, Back, Download) |
| `secondary` | `bg-secondary text-secondary-foreground` | Tertiary actions |
| `ghost` | No background, hover `bg-accent` | Icon buttons, subtle nav items |
| `link` | `text-primary underline-offset-4` hover underline | Inline links |

| Size | Height | Padding |
|------|--------|---------|
| `default` | `h-10` | `px-4 py-2` |
| `sm` | `h-9` | `px-3` |
| `lg` | `h-11` | `px-8` |
| `icon` | `h-10 w-10` | — |

All buttons: `rounded-md text-sm font-medium`, focus ring uses `ring-ring` (purple).

**Icon + label pattern** (very common):
```tsx
<Button variant="outline" className="group flex items-center gap-2 text-gray-700">
  <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
  <span>Back</span>
</Button>
```

### Input
```
h-10 w-full rounded-md border border-input bg-background px-3 py-2
text-sm placeholder:text-muted-foreground
focus-visible:ring-2 focus-visible:ring-ring (purple)
disabled:opacity-50
```

### Select
Trigger: same height/border as Input (`h-10`), with `ChevronDown` icon at right.  
Dropdown: `rounded-md border bg-popover shadow-md`, items `py-1.5 pl-8 pr-2 text-sm`, hover `bg-accent`.

### Card
```
rounded-lg border bg-card text-card-foreground shadow-sm
```
- `CardHeader`: `p-6`, vertical stack `space-y-1.5`
- `CardContent`: `p-6 pt-0`
- `CardTitle`: `text-2xl font-semibold leading-none tracking-tight`
- `CardDescription`: `text-sm text-muted-foreground`
- **Interactive card (clickable)**: add `hover:shadow-md transition-shadow cursor-pointer border-2 border-gray-100`

### Badge / Chip
```
inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold
```
Variants: `default` (purple fill), `secondary` (grey fill), `destructive` (red fill), `outline`.

### Dialog / Modal
- Overlay: `bg-black/80`
- Content: `fixed left-[50%] top-[50%] translate-[-50%,-50%] max-w-lg p-6 border bg-background shadow-lg sm:rounded-lg`
- Close button: top-right, opacity 70 hover 100
- Title: `text-lg font-semibold leading-none tracking-tight`
- Description: `text-sm text-muted-foreground`
- Footer: `flex sm:flex-row sm:justify-end sm:space-x-2`

> Note: Many existing screens use **Ant Design `<Modal>`** (50% width). New designs should prefer the shadcn `Dialog` for visual consistency.

### Tabs
- List: `inline-flex h-10 items-center rounded-md bg-muted p-1`
- Trigger: `px-3 py-1.5 text-sm font-medium rounded-sm`, active: `bg-background shadow-sm text-foreground`

### Table
- Wrapper: `rounded-md border overflow-hidden`
- Header: `h-12 px-4 text-left font-medium text-muted-foreground`
- Row: `border-b hover:bg-muted/50`, selected: `bg-muted`
- Cell: `p-4 align-middle text-sm`
- Empty state cell: `text-center h-24`

### Tooltip
Available via Radix. Trigger wraps icon button, content appears on hover.

---

## 8. Layout Structure

```
┌──────────────────────────────────────────────────────┐
│  TopBar (fixed, h-16, border-b, bg-white, z-50)      │
│  [Menu icon] [Logo] .............. [Bells] [Avatar]  │
└──────────────────────────────────────────────────────┘
┌───────┐ ┌────────────────────────────────────────────┐
│Sidebar│ │  <main> p-4 md:p-6  flex-1 overflow-auto   │
│ fixed │ │                                            │
│ 2.25rem│ │  Page Content Here                        │
│ wide  │ │                                            │
│(icon  │ │                                            │
│ only) │ │                                            │
└───────┘ └────────────────────────────────────────────┘
```

- **TopBar**: `fixed top-0 h-16 border-b bg-white px-4 z-50`
- **Sidebar**: fixed left, icon-only at `w-[2.25rem]`, expanded at `w-[16rem]`. Background is purple-tinted (`sidebar-background`).
- **Main content**: offset by sidebar width, `p-4 md:p-6`, scrollable.
- **Chat sidebar** (optional): `fixed right-0 top-16 w-[30vw] max-w-[420px] bg-white border-l shadow-lg`

---

## 9. The Import Screen — Current Design (Reference)

The existing import flow has three stages:

**Stage 1: Upload type selector**
```
┌─────────────────────────────────────────┐
│  Import Transactions via CSV            │  ← text-3xl font-bold text-gray-900
│  What would you like to do?             │  ← text-gray-600 mt-3
│                                         │
│  ┌─────────────┐  ┌─────────────┐       │
│  │   Upload    │  │   Upload    │       │  ← Two equal Cards, p-6, h-32 content area
│  │    CSV      │  │    PDF      │       │  ← hover:shadow-md border-2 border-gray-100
│  └─────────────┘  └─────────────┘       │
│                                         │
│  [← Back]              [↓ Sample CSV]   │  ← outline buttons
└─────────────────────────────────────────┘
```

**Stage 2: File upload dialog (Ant Design Modal)**
- 50% width modal with Ant Design `<Upload>` and `<Radio.Group>` for PDF options
- "Advanced options" toggle link (`text-[#7D23B2] hover:underline`) — note: this is a hardcoded hex of primary color

**Stage 3: CSV Mapper (full page)**
- Ant Design `<Table>` with column mapping dropdowns
- Pagination from `antd`
- Bulk select/delete via Ant Design checkboxes

**Issues to fix in redesign:**
- Stage 1 uses `text-3xl` heading which feels heavy for a utility screen
- Stage 2 is Ant Design Modal — visually inconsistent with the shadcn card/dialog used elsewhere
- Stage 3 mixes Ant Design table with shadcn buttons
- No drag-and-drop drop zone — users click a card then click again in a modal

---

## 10. Common Patterns & Conventions

### Page-level header pattern
```tsx
<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
  <h1 className="text-2xl font-bold">{title}</h1>
  <div className="flex items-center gap-2">
    {/* action buttons */}
  </div>
</div>
```

### Form layout pattern
```tsx
<div className="mx-auto w-[70%]">
  <div className="space-y-6">
    <div className="space-y-2">
      <Label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
        Field Name
      </Label>
      <Input ... />
      <p className="text-sm text-gray-600 mt-1">Helper text</p>
    </div>
  </div>
  <div className="flex justify-end space-x-2 mt-6">
    <Button variant="outline">Cancel</Button>
    <Button>Submit</Button>
  </div>
</div>
```

### Grid layouts
```tsx
{/* 2-column responsive */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">...</div>

{/* 2-column for larger forms */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">...</div>
```

### Empty state
```tsx
<div className="text-center h-24 flex items-center justify-center text-muted-foreground">
  No items found
</div>
```

### Scrollbar style (global)
Slim, 6px, `rgba(156,163,175,0.5)` thumb on transparent track. Applied globally.

---

## 11. Icon Usage

**Icon library**: Lucide React — always use `h-4 w-4` for inline/button icons, `h-5 w-5` for topbar icons, `h-10 w-10` for large feature icons.

Common icons in use:
| Purpose | Icon |
|---------|------|
| Upload file | `Upload` |
| PDF / document | `FileText` |
| CSV / spreadsheet | `FileSpreadsheet` |
| Download / sample | `Download` |
| Back navigation | `ChevronLeft` |
| Expand/collapse | `ChevronDown`, `ChevronRight` |
| Delete | `DeleteOutlined` (antd, legacy) or `Trash2` (lucide) |
| Settings | `Settings` |
| Notification | `Bell` |
| User | `UserRound` |
| Menu toggle | `Menu` |

---

## 12. Motion

- **Accordion**: `accordion-down` / `accordion-up` 0.2s ease-out
- **Dialog**: fade-in + zoom-in 95% + slide from top, 200ms duration
- **Sidebar**: `transition-all duration-500 ease-in-out`
- **Chat sidebar**: `transition-transform duration-500 ease-in-out`
- **Button hover**: `transition-colors` (instant)
- **Card hover**: `transition-shadow`
- **Select / Popover**: Radix data-[state] animations via tailwindcss-animate

---

## 13. Notes for the Import Screen Redesign

When designing the new compact import screen, preserve:
1. **Primary color** `#7028a0` — use `bg-primary` for key actions
2. **Font** — Lato body, maintain `text-sm` for most content
3. **Border radius** — `rounded-md` for inputs/buttons, `rounded-lg` for cards
4. **Focus ring** — purple `ring-ring`
5. **shadcn components** — prefer Dialog over Modal, use shadcn Button/Input/Select
6. **Compact goal**: reduce from 3 stage flow to ideally 1 or 2 stages. Consider an inline drop-zone rather than two separate cards + a modal.
7. **Avoid** hardcoded colors like `text-[#7D23B2]` — use `text-primary`
8. **Status feedback**: use shadcn `Toaster` (sonner) already wired in the app — not `notification` from antd
