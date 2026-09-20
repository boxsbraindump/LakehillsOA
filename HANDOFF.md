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

### By insurer — **removed**

A page for pulling one insurer out across every record was built and removed the same day
(2026-09-20), not wanted. Recoverable from `c95def6`.

One measurement from it is worth keeping, because it would shape any future attempt: on the
live workspace **every OA case carried a `payer` field, no folder entry did, and thirteen of
thirty folder entries named an insurer only in their prose.** Any insurer-based grouping that
honours the payer field alone will therefore look almost empty and leave a tagging chore behind.

### VA request for service (`src/pages/VaRfs.tsx`, `src/lib/vaRfsForm.ts`)

A veteran who runs out of authorised visits needs a fresh RFS. The ask sounded like a letter
template, but the sample turned out to be one sentence in box 18 — the real work was filling
**VA Form 10-10172** by hand, because it is a flat PDF with no AcroForm fields (checked: zero).
Twelve of the twenty-two boxes on page 1 never change, and the clinic only ever fills page 1.

- The blank form ships as `public/va-form-10-10172.pdf` (a public US government form). Values are
  drawn **onto the real form** with pdf-lib, not onto a lookalike, because the VA facility should
  receive the document it expects.
- Coordinates in `PLACE` / `CHECKS` are PDF points against the **MAR 2025** revision, origin
  bottom-left, derived from the label positions in the blank form. `FORM_REVISION` states this
  out loud: **if VA reissues the form, replace the asset and re-check every coordinate.** The way
  to check is to fill it with dummy data and rasterise page 1 — pdf.js plus a canvas in Node does
  it, and eyeballing the result catches a drifted box instantly.
- Boxes 6, 10, 11 and 12 are ticked automatically (NO, NO, YES, NO): an extension is by definition
  a continuation of care, not urgent, and not a referral.
- Box 18 is the only multi-line box, so it wraps to the box width. Other values shrink rather than
  overflow — a number running into the neighbouring box is worse than small type.
- Box 21 is deliberately left empty: it wants a signature, so the form gets printed and signed.
- **The veteran's details are never stored.** Only the clinic's own boxes persist
  (`lh-va-rfs-defaults`); the patient fields live in component state and are gone on reload. That
  means this feature never raises the PHI question at all.
- pdf-lib is loaded on demand inside `fillRfsForm`, so its ~430KB is a separate chunk.

The boxes that copy clinic defaults are **pre-filled into the visible inputs**, not shown as
grey placeholder text. An earlier version used placeholders and fell back at generation time,
which meant a box could look empty and still print something. Now what is on screen is what
prints: clearing a box prints nothing there, and a value typed for one request survives a later
edit to the default.

Open questions the owner has not answered, currently handled by defaults rather than guesses:
box 3 in their sample held a patient address rather than a VA facility, so it is a per-request
field with a saved default; CPT codes are editable with the usual pair saved as the default.

### Follow-up board (`src/components/FollowUpBoard.tsx`)

Everything else on the Checklist page is a *reference owned by a date*: `lh-checklist-day-item-ids`
says which shared definitions a given day shows. That is right for a daily routine and wrong for
"chase this claim", which stays open for a week. Such an item either had to be copied forward by
hand every morning — cluttering each day among the routine — or was dropped the first time nobody
copied it.

So follow-ups sit **outside the calendar entirely**: one flat list in `lh-checklist-followups`
(`FollowUpItem[]`), rendered above the day's sections and identical on every date. Do not give it a
per-day shape; that is the bug it exists to avoid.

- Open items sort oldest-first, and show their age once past a day. Past `STALE_AFTER_DAYS` (3) the
  age turns amber — the board's job is to make something that has been sitting too long look wrong.
- Ticking sets `doneAt` and moves the item into a collapsed done group rather than deleting it, so a
  misclick is one click back. `清除已完成` clears them, with undo.
- Deleting offers undo via a toast. It deliberately does **not** go through the 30-day Trash: that is
  for the day/section/item model, and wiring a fourth entry type through `Trash.tsx` restore was more
  surface than a small self-contained row warrants. Worth revisiting if follow-ups grow.
- **The bridge is the point of use**: each day item has a `promoteToFollowUp` action (the up-arrow),
  which moves it off *this day only*, carries that day's note across, and drops the shared definition
  only when no other day still references it — the same rule the per-day delete uses.
- `promoteToFollowUp` writes through `updateSyncedStorage(FOLLOW_UPS_KEY, ...)` rather than owning the
  state, so the board picks the new item up wherever it is mounted. Keep it that way; two components
  holding the same key in their own `useState` would drift.

### Billing / chasing balances — **removed**

A worklist for chasing patient balances was built here and then removed at the owner's request
(2026-09-20), having never been used: all three of its stores were still empty on the live
workspace. Recoverable from `c71569a`, the commit before the removal.

It is worth knowing why it existed before rebuilding anything like it. The expensive part of
chasing balances was never the sending — it was that nothing remembered the previous round, so
every run re-triaged the same people already judged "coming back next week". If the problem
comes back, that is the part to solve, and `c71569a` has a tested implementation of it
(import, carry decisions forward, surface only what changed) plus a PDF reader for the printed
UP report and handling for the cells that report clips.

Two findings from that work outlive it:

- **The UP balance report's columns are `PATIENT | EMAIL | PHONE # | AMOUNT DUE | PRINT`**, read
  out of a real printed report. There is no account number anywhere, and printing clips long
  cells with an ellipsis — 34 of 229 cells in the sample, mostly emails and phones.
- **That report page has an `EXPORT` button and a `Print patient statements` feature**, neither
  of which had been tried. Worth checking before building any import for it.

With this gone, **the app once again stores no patient data at all.** The VA form filler holds
only the clinic's own boxes. Keep it that way unless there is a decision to the contrary.

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

## Current backlog — the 新版本调整 folder

The owner keeps feedback in a custom folder called **新版本调整** inside the app itself (folder
id `反馈-修改-87xv1`). It is the source of truth for what to build next, not this file — read it
first. Reaching it needs a signed-in session; `wrangler d1` was not authorised for the account
as of this writing.

| # | Item | Status |
|---|------|--------|
| 1 | OA cases needs categorisation | **Built, then removed** at the owner request — see below. The need as stated (pull one insurer out across everything) did not turn out to be worth a page. |
| 2 | Search misses names typed without spaces | **Done** (`0fe7d42`), verified live against real records: `communityhealthplan` finds "Community Health Plan of WA". |
| 3a | Things written in the to-do list vanished | **Done** (`6dd1ecf`, `7a747a6`) — two sync bugs. Only real use over time can confirm it; worth asking whether it has recurred. |
| 3b | "…然后在descption那块，如果把notes打开了" | **Dropped by the owner** (2026-09-19): the entry trails off mid-sentence and they decided it does not need acting on. Do not guess at what it meant. |
| 4 | Checklist wants a pinned follow-up section, daily separate | **Done** — `FollowUpBoard`, see below. |
| 5 | Copy-previous-day should not overwrite | **Done** — see below. |
| 6 | Automatic VA form | **Done** — `VaRfs`, see below. It turned out not to be a letter: the work was hand-filling VA Form 10-10172 every time. |

All six are closed: 2 and 3a were already fixed, 1, 4, 5 and 6 were built, 3b was dropped by the
owner. **The folder is the live backlog — re-read it rather than this table** before picking up
new work, since it is where new feedback lands.

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
