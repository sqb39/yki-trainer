# Local development

Instructions for running and testing **YKI B1 Trainer** on your machine.

## Prerequisites

- **Node.js** 20+ and **npm**
- **Python 3** (used only during `npm run build` to generate PWA icons)

## Setup

```bash
cd personal/yki-trainer
npm install
```

Book content lives in `data/book.json` and is seeded into IndexedDB automatically on first load.

## Run the dev server

```bash
npm run dev
```

Open the app at:

**http://localhost:5173/yki-trainer/**

The trailing path is required because the app is configured for GitHub Pages (`base: '/yki-trainer/'` in `vite.config.ts`).

### Test on your phone (same Wi‑Fi)

```bash
npm run dev:host
```

Use the network URL Vite prints (for example `http://192.168.x.x:5173/yki-trainer/`).

## Production-like local test

```bash
npm run build
npm run preview
```

Preview URL: **http://localhost:4173/yki-trainer/**

Use this to verify the service worker and PWA behavior (offline shell is disabled in dev mode).

## Type check

```bash
npx tsc -b
```

## Validate book data

```bash
npm run seed
```

Checks `data/book.json` structure and prints chapter/content counts. Does not modify the browser database.

## Regenerate icons only

```bash
npm run icons
```

Writes PNG icons into `public/`.

## Manual test checklist

After code changes, verify in the browser:

1. **Open chapter access**
   - Go to **Kapitel** — all 7 chapters should be expandable (no lock icon or greyed-out state).
   - Open **Quiz**, **Dialoger**, **Tala**, or **Skriva** — chapter dropdown lists all chapters.
   - Open **Flashcards** — filter shows **Alla kapitel** and every chapter option.
   - Visit `/boss/7` (or any chapter boss) directly — no “Kapitel låst” screen.

2. **Guidance still works**
   - **Dashboard** shows **Rekommenderat kapitel** (first chapter under 80%, not a lock).
   - **Studieplan** highlights the suggested week; later weeks stay visible and clickable.

3. **Progress unchanged**
   - Complete some flashcards/quiz in a chapter — progress % and badges at 80% still update.

4. **Data persistence**
   - Progress is stored in the browser (IndexedDB). Use **Inställningar → Synka** to export/import backups when testing across devices.

## Reset local progress

In browser DevTools → **Application** → **IndexedDB** → delete the `yki-trainer` database, then reload the page.

## Deploy note

Pushes to `main` deploy automatically to GitHub Pages via `.github/workflows/deploy-pages.yml`.
