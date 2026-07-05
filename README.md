# Lake Hills Acupuncture · Operation Assistant

Internal front-desk tool: a daily operations checklist plus a searchable reference for unusual insurance claim (OA) cases and payment lookups.

## Content is data, not hardcoded UI

Edit these files to update what's shown in the app — no component changes needed:

- [`src/data/checklist.ts`](src/data/checklist.ts) — front-desk checklist sections & items
- [`src/data/oaCases.ts`](src/data/oaCases.ts) — weird claim cases and how they were resolved
- [`src/data/payments.ts`](src/data/payments.ts) — where to find/verify each type of payment

The home page search box indexes all three files automatically (via `src/lib/searchIndex.ts`).

## Data model

- Content (checklist items, cases, payment steps) is static and lives in the data files above — edit + redeploy to update it for everyone.
- Checkbox state and per-item notes on the Checklist page are personal — stored in each browser's `localStorage`, not shared between staff/devices.

## Develop

```bash
npm install
npm run dev
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages. In the repo settings, set **Pages → Source → GitHub Actions**.

If the GitHub repo name isn't `lake-hills-acupuncture-oa`, update the `base` path in [`vite.config.ts`](vite.config.ts) to match.
