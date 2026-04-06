# Fabriq pitch deck (Guy Kawasaki 10-slide format)

This folder contains a [Slidev](https://sli.dev/) deck that follows [Guy Kawasaki’s ten-slide pitch template](https://guykawasaki.com/the-only-10-slides-you-need-in-your-pitch/) and the **10 / 20 / 30** guideline: about **ten concepts**, about **twenty minutes** of speaking, and (when you design slides) **no body text smaller than ~30pt** — the included `slides.md` uses larger base fonts to stay readable when exported.

## Quick start

```bash
cd docs/positioning/forge-application/pitch
npm install
npm run dev
```

This folder pins `@slidev/cli` to **0.49.x** so it runs on common **Node 20 LTS** installs. If you upgrade to **Node ≥ 20.19** (or 22+), you can bump Slidev to the latest release in `package.json` for newer tooling.

## Export PDF

Requires a one-time browser install for headless export (Playwright):

```bash
npx playwright install chromium
npm run export:pdf
```

Output: `fabriq-pitch.pdf` in this directory.

Alternative (no local `package.json`):

```bash
npx @slidev/cli export path/to/slides.md --output fabriq-pitch.pdf
```

## Customize before sending

- Replace `[email]` and `[phone]` on slide 1.
- Double-check market numbers (slide 9) against sources you are comfortable citing.
- Trim `<v-clicks>` animations if you want static PDFs without build steps (remove `<v-clicks>` wrappers and leave bullet lists).

## Source copy

Narrative is aligned with `../answers.md` (Forge application draft).
