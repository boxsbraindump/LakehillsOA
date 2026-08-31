# Handoff — Lake Hills Acupuncture Operation Assistant

> Internal front-desk tool for a clinic. React 19 + Vite + TypeScript + Tailwind v4,
> Notion-style design (see `design.md`). GitHub Pages frontend, Cloudflare Worker + D1
> cloud sync, Google Sign-In as an access gate.

- **Repo**: `boxsbraindump/LakehillsOA` (branch `main`)
- **Live**: https://boxsbraindump.github.io/LakehillsOA/
- **Deploy**: push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds & publishes Pages. Build-time env from repo secrets `VITE_API_BASE`, `VITE_GOOGLE_CLIENT_ID`.
- **Backend**: `worker/` (Cloudflare Worker + D1). See `worker/README.md`. Deploy with `wrangler`.

## History — 2026-07-09 (kept for context; not the current state)

### Public welcome / login flow
- Added a public pre-login welcome page at `#/welcome` (`src/pages/PublicHome.tsx`) using the same teal design system.
- `src/main.tsx` exposes `#/welcome` outside the protected workspace routes. Signed-out users are redirected there by `LoginGate`.
- Extracted the Google sign-in card into `src/components/SignInPanel.tsx`.
- Clicking "Sign in / 登录工作区" on the welcome page opens a custom sign-in dialog instead of only scrolling to the bottom.
- Fixed HashRouter section links: welcome-page nav buttons now use in-page scrolling instead of raw `#access` / `#features` anchors, which previously caused blank routes.
- Fixed post-login behavior: after Google sign-in succeeds, the user is automatically navigated into the workspace instead of staying on the welcome page.
- Local dev got a gitignored `.env.local` so `127.0.0.1:5185` can show the same Google sign-in UI locally. This file must stay untracked.

### Product strategy
- Added `PRODUCT_STRATEGY.md` with the current product direction:
  - Broader category: Admin Operations Workspace / Administrative Memory Workspace.
  - Lake Hills should become the first clinic-admin template, not necessarily the product name forever.
  - The product is more than bookmarks because it stores context, descriptions, process notes, and "how we handle this" memory around links and tasks.
  - Recommended path: template first, full workspace product later.
- Current product thesis: small clinic/admin teams may pay when the tool reduces repeated questions, staff training friction, lost links, and handoff loss.

### Workspace boundary safety work
- Began adding a workspace data boundary so Lake Hills data is not exposed if public signups are ever enabled.
- Important: this does **not** change the visible Google login UI.
- Backend changes in `worker/src/index.ts`:
  - Existing allowlisted emails continue into the primary `lake-hills` workspace.
  - Primary Lake Hills data still uses the existing legacy `kv_store`, so current data is preserved.
  - Unknown emails remain blocked by default.
  - If `PUBLIC_SIGNUPS = "true"` is intentionally enabled later, unknown Google accounts get their own separate workspace and do not see Lake Hills data.
  - Added `/api/auth/session` so the frontend can recover email + workspace metadata on reload.
  - Added workspace-aware reads/writes through `workspace_kv_store` for non-primary workspaces.
  - Added `http://127.0.0.1:5185` to allowed CORS origins.
- Schema changes in `worker/schema.sql`: `workspaces` and `workspace_kv_store`.
- Frontend changes:
  - `src/lib/syncApi.ts` stores `lh-auth-workspace` and clears cached remote state when sessions/workspaces change.
  - `src/components/AuthProvider.tsx` exposes `workspace`.
  - `src/App.tsx` sends non-primary workspaces to a new template/onboarding shell.
  - New `src/pages/WorkspaceOnboarding.tsx`: a clean template selector shell for future non-Lake-Hills users.
  - Added i18n keys for onboarding in `src/lib/translations.ts`.
- Verification already run for these local changes:
  - `npx tsc --noEmit` clean
  - `npm run build` clean
  - Worker `npx tsc --noEmit` clean
  - `npm run lint` only existing Fast Refresh warnings

## Non-negotiable architectural constraints

1. **Lake Hills data is ONE shared dataset for the Lake Hills team.** Google Sign-In is
   the access gate for the primary clinic workspace. Colleagues searching each other's notes is
   the core Lake Hills use case. Do NOT partition Lake Hills data per user. Future public users
   must be isolated by workspace/team, not by individual private copies of Lake Hills data.
2. **Local-first + background sync.** All persisted state goes through
   `useSyncedStorage<T>(key, initial)` (`src/hooks/useSyncedStorage.ts`): same interface as
   `useLocalStorage`, reads local instantly, reconciles with remote, debounced push,
   last-write-wins. Degrades to pure-local when no backend configured
   (`syncEnabled = Boolean(API_BASE && googleClientId)`).
3. **i18n**: `src/lib/translations.ts` (flat `{zh,en}` dict) + `LanguageProvider` /
   `useLanguage()` → `t(key, params?)`. Language persisted to `localStorage` key `lh-lang`,
   **deliberately NOT synced to cloud** (personal preference). Every user-facing string must
   go through `t()`. Brand name "Lake Hills OA" and tagline are intentionally hardcoded.
4. **Tailwind v4 trap (already hit once):** custom `--spacing-*` theme tokens collide with
   Tailwind's reserved namespace and silently break sizing utilities like `max-w-sm`.
   Do not add custom `--spacing-*` tokens.

## Feature map

### Three fixed built-in categories (cannot be renamed/hidden/deleted)
- **前台工作 Checklist** — one list per day with per-item notes and cross-date search.
  Items and sections are *shared definitions*; `lh-checklist-day-item-ids` /
  `-day-section-ids` hold each day's references and `lh-checklist-state` holds that day's
  ticks and notes. Copying carries references forward from the most recent earlier day that
  has content (so days the clinic is closed are skipped), optionally only the unfinished
  items, always arriving unticked. `src/pages/Checklist.tsx`
- **OA Cases** — insurance claim edge-case cards (title/payer/tags/summary/resolution). `src/pages/OACases.tsx`
- **Where to Find Payments** — payment-portal lookup per payer; payer field is a dropdown fed by the Payer directory. `src/pages/Payments.tsx`

### 催账 / Billing (`src/pages/Billing.tsx`, logic in `src/lib/billing.ts`)
Replaces a Notion-based workflow: pull balance-due out of UP → retype into Notion → decide
person by person who gets a bill → open Square once per patient. The expensive part was never
the sending; it was that **nothing remembered the previous round**, so every run re-triaged the
same people already judged "coming back next week". That is why the task kept getting deferred.

- **Import** — paste a tab- or comma-delimited export. `parseTable` detects the delimiter and
  whether row 0 is a header (a row containing money or a date is data, not a header).
  `guessRoles` pre-fills the column mapping from header text; the user can override every
  guess, and the corrected mapping is saved per header signature (`lh-billing-column-map`) so
  the next paste maps itself. **Do not hardcode UP's columns** — they were never specified and
  the mapping UI exists precisely so a format change does not need a code change.
- **Per-claim or per-patient exports both work.** `buildImportedPatients` groups rows by
  account (falling back to a normalized name) and sums balances, so repeated rows become the
  statement's line items.
- **`mergeImport` is the feature.** Decisions carry forward; it returns `addedKeys`,
  `changedKeys` (balance moved since the decision), and `clearedKeys` (dropped off the report
  entirely — that is how you learn someone paid). Re-importing identical data must leave the
  triage queue empty; that is the invariant to protect.
- **Buckets are states with a clock, not folders** (`bucketOf`). "Coming back" expires on its
  own once the expected date passes and the balance is still there; "awaiting insurance" ages
  and flags at `INSURANCE_FOLLOWUP_DAYS` (30). A changed balance pulls a row back to triage.
- **Statements** print from the browser (no PDF library). `runStatementPrint()` in
  `Billing.tsx` toggles `html.printing-statement`, which the `@media print` block at the
  bottom of `src/index.css` uses to hide the app shell via `visibility` (not `display` — the
  sheets are nested inside the app's DOM). **Never call `window.print()` directly here**, or
  the sidebar prints on the patient's bill.
- Storage: `lh-billing-patients`, `lh-billing-column-map`, `lh-clinic-profile` (statement
  header, edited in Settings). All synced.

**Two deliberate decisions, do not "fix" them without asking:**
1. Billing is *not* in the search index. That index feeds Home and the call panel; patient
   names do not belong there. Verified: searching a patient name or account number finds nothing.
2. This is the first patient data in the app (name + balance + dates of service), and it syncs
   to Cloudflare D1 on a standard plan with no BAA. The owner chose this knowingly, over a
   local-only option, because home/clinic continuity was the point. Do not widen what is stored
   (no DOB, no diagnosis, no insurance ID) without raising it first.

**Square context:** no API integration by choice. Square *Invoices* (unlike the *Payment Links*
the clinic had been using) do support line items and up to 10 attachments / 25MB; per Square's
docs only custom fields and installment schedules need Invoices Plus. The workflow is: print the
statement to PDF, attach it to a Square invoice. If this is ever automated, it needs
`INVOICES_WRITE` + `ORDERS_WRITE` and a token in the Worker.

**Logic is unit-testable without a browser** — `src/lib/billing.ts` is pure. Compile it with
`npx esbuild src/lib/billing.ts --format=esm --outfile=<tmp>/billing.mjs` and run assertions
against it in plain node. Worth doing before touching `mergeImport` or `bucketOf`.

### Settings (`src/pages/Settings.tsx`)
- Account (email + logout), Language toggle, **Payer directory** (name + payer ID, stored `lh-payers`) — these payers populate the dropdown in `PaymentEntryForm`.

### User-editable custom sidebar categories (most recent work)
- Sidebar "添加分类" creates a new category (name + one of 5 icons); inline rename; delete via Trash/undo (cascade-deletes its entries). `src/components/Sidebar.tsx`
- Route `/custom/:categoryId` → `src/pages/CustomCategory.tsx`: generic card list (title/notes/tags) with full CRUD.
- **Custom entries are searchable from Home** via `src/hooks/useSearchIndex.ts` (reactively rebuilds the Fuse index). Point of the feature: build a "查保险" category, add "Aetna → underwritten by Premera", then searching "Premera" on Home jumps to Aetna.
- Storage keys: `lh-custom-categories` (`CustomCategory[]`), `lh-custom-entries` (`Record<catId, CustomEntry[]>`).
- Types in `src/lib/types.ts`: `Category` union gained `"custom"`; `SearchDoc`/`TrashEntry` gained `categoryTitle?`; whole-category trash uses `entryType:"section"` with snapshot `{category, entries}`.

### Cross-cutting
- **Trash / undo**: 30-day soft-delete for all deletions. `src/hooks/useTrash.ts`, `src/lib/trash.ts`, `src/pages/Trash.tsx` (handles per-category restore incl. custom branch). Opportunistic purge on mount.
- **Toasts** with optional Undo action: `src/components/ToastProvider.tsx`.
- **Search**: Fuse.js. Index built in `src/lib/searchIndex.ts` (`buildSeedSearchDocs`, `buildCustomSearchDocs`, `categoryLabel`, `CATEGORY_DOT`), consumed via `useSearchIndex()`.
- **Auth**: `@react-oauth/google` + server-side sessions (Worker verifies Google JWT once, issues 60-day opaque session token in D1 `sessions` table). `src/components/AuthProvider.tsx`, `LoginGate.tsx`, `ProfileMenu.tsx`.

## Provider / layout structure
- `src/main.tsx`: LanguageProvider → AuthProvider → HashRouter. Route `welcome` is public; workspace routes are wrapped in `LoginGate`. HashRouter is chosen for GH Pages static hosting.
- Workspace routes: index/checklist/oa-cases/payments/custom/:categoryId/trash/settings.
- `src/App.tsx`: ToastProvider + ConfirmProvider. Primary Lake Hills workspace renders Sidebar + `<Outlet/>`; future non-primary workspaces render `WorkspaceOnboarding`.

## Known, intentionally-deferred tech debt
- (Resolved) User-added/edited Checklist items, OA Cases, and Payment entries are now in the search index — `useSearchIndex` reads their synced-storage state (overrides / custom / hidden / live checklist sections) and rebuilds the Fuse index reactively (`src/hooks/useSearchIndex.ts`). Nothing outstanding here.

## Dev / verification notes (Windows)
- PowerShell is the primary shell. Dev server runs on port 5185 (`npm run dev`).
- **Verify with `npm run build`, NOT `npx tsc --noEmit`.** The root tsconfig is a solution
  file that checks nothing, so `tsc --noEmit` exits 0 on code that does not compile — it
  waved through two real type errors in one session. `npm run build` is the only trustworthy
  type gate. Then verify behaviour in the browser.
- Login is gated by `.env.local` (gitignored, holds `VITE_API_BASE` + `VITE_GOOGLE_CLIENT_ID`).
  To exercise workspace pages without signing in, temporarily move that file aside: with no
  sync configured `LoginGate` passes straight through and the app runs local-only, which is a
  faithful stand-in for the primary workspace UI. **Restore it afterwards and diff it against a
  backup** — Vite restarts on the change, so the app flips modes automatically.
- Reading DOM state in the same call that clicked something returns the *pre-render* value.
  React state updates are async: click in one call, assert in the next, or await a short
  timeout. Several "bugs" in this repo were only this race. Toasts auto-dismiss, so a late
  read can also miss a message that really did appear.

## How data recovery works (D1 Time Travel)
`kv_store` overwrites in place and keeps no history, but D1 retains 30 days of
point-in-time bookmarks. There is no read-only view of a past state — recovering means
restoring the database, so treat it as production surgery:
1. `wrangler d1 export lakehills-oa --remote --output backup.sql` (safe, do this first).
2. Record the current bookmark: `wrangler d1 time-travel info lakehills-oa`.
3. Restore to the moment before the loss (`--timestamp` or `--bookmark`), read what you need.
4. Restore forward to the bookmark from step 2, then **diff the live data against the
   pre-operation snapshot** to prove nothing else moved.
5. Re-apply only the lost rows with a targeted `UPDATE` that merges rather than replaces.
Nobody may use the app during the window — an edit made then is rolled back on the way
forward. `updated_at` on each row is the best clue for when a deletion happened.

## Bug patterns this codebase keeps producing
Worth checking first when something "won't save" or "disappeared":
- **Identity by title instead of id.** Matching folders/entries on their name made tombstones
  act as permanent name blocklists, which made create/rename purge Trash to free a name.
  Always key off ids.
- **Forms rebuilt from scratch on save.** Each template branch wrote a fresh object, so every
  field the current template did not render was dropped. Spread the existing record first.
- **Day-scoped views over shared definitions.** Checklist items/sections are global; each day
  only stores references, and "copy" copies references. A delete must remove the day's
  reference, not the shared definition, or it erases the item from every other day.
- **Sync clobber.** Pushes are debounced, so local state runs ahead of the server. Any
  reconcile in that window must push local rather than overwrite it, and the guard must be
  per storage key — several components mount the same key and each reconciles on mount.
- **Silent no-ops.** Several handlers `return` on invalid input with no message, which reads
  as "the button is broken". Say why instead.

## Recent commits (latest first)
- `f96fb76` Add the billing worklist: import balances, triage once, print statements
- `e111988` Let the sidebar be dragged wider
- `045215b` Make sidebar folder dragging land where you aim it
- `b4b10c9` Copy forward from the last day worked, and let it skip finished items
- `d564b10` Say why a checklist item did not save instead of ignoring the click
- `6dd1ecf` Never let a reconcile overwrite an edit that has not been pushed yet
- `7a747a6` Stop serving one stale server snapshot for the whole page load
- `6496894` Keep checklist deletes scoped to the day you are viewing
- `89ebfb7` Fix voice input never stopping and portal fields vanishing while typing
- `0b65f5e` Stop silent data loss in custom folders
- `28c1119` Redirect to workspace after sign in
- `7d763d7` Show sign-in dialog from welcome page
- `f2a6e6a` Fix welcome page section navigation
- `91a9f86` Redirect signed-out users to welcome
- `5322347` Add public workspace homepage
- `5939a37` Fix sidebar trash/profile stuck near top instead of bottom (`md:mt-4` was overriding `mt-auto`)
- `df44467` Add bilingual i18n, payer directory, and user-editable custom sidebar categories
- `c8bb2ce` Fix login card rendering as a narrow sliver (Tailwind v4 `--spacing-*` collision)
- `f2b3626` Wire up production D1 database ID for the deployed Worker
- `3da7be2` Add cloud sync backend with Google Sign-In auth
