# Fabriq Books Pitch Deck

A Slidev presentation for Fabriq Books' application to The Forge at McMaster University.

## Setup

```bash
# Install dependencies (dev-only)
npm install

# Run dev server with live preview
npm run dev

# Export to PDF (primary deliverable)
npm run export
```

## Project Structure

- `slides.md` — Complete slide content and layout (source of truth)
- `package.json` — Slidev and build dependencies (dev-only)
- `fabriq_books.pdf` — Exported PDF (generated via `npm run export`)

## Slide Content

10 slides covering:

1. **Title** — Fabriq Books brand introduction
2. **Problem** — Three finance workflows that demand human time
3. **Market** — Pyramid visualization of addressable businesses
4. **Solution** — Before/after comparison of workflows with Fabriq
5. **Why Now** — Three converging market forces
6. **How It Works** — Five-stage workflow with three use cases
7. **Differentiation** — Comparison table vs competitors
8. **Business Model** — Partner-led GTM and SaaS economics
9. **The Team** — Founders, experience, and what we're seeking
10. **The Ask** — Three specific requests for mentorship and network

## Design System

- **Color Palette:** Teal (#1D9E75), gray (#888780), red/green accents
- **Typography:** Inter or system-ui sans-serif
- **Layout:** 16:9 aspect ratio (1280×720px)
- **Components:** No animations, no gradients, clean geometric SVG shapes

## PDF Export

The PDF is the primary deliverable format. It renders:

- All 10 slides on individual pages (16:9)
- SVG graphics (pyramid, flow diagrams, tables)
- Clean typography and color palette
- No navigation controls or page numbers in the PDF itself

To regenerate the PDF after editing `slides.md`:

```bash
npm run export
```

## Editing

All content and layout edits happen in `slides.md`. The file is structured as Markdown with embedded Vue/HTML for custom layouts. Each slide is separated by `---`.

**Do not rewrite copy.** The narrative is final. Only update if product direction changes.

## Notes

- Slidev dependencies are dev-only (not included in runtime)
- The deck is self-contained and maintainable by the Fabriq team
- PDF export requires Playwright; it's installed as a dev dependency
