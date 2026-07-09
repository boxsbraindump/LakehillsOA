# Handoff — Lake Hills Acupuncture Operation Assistant

> Internal front-desk tool for a clinic. React 19 + Vite + TypeScript + Tailwind v4,
> Notion-style design (see `design.md`). GitHub Pages frontend, Cloudflare Worker + D1
> cloud sync, Google Sign-In as an access gate.

- **Repo**: `boxsbraindump/LakehillsOA` (branch `main`)
- **Live**: https://boxsbraindump.github.io/LakehillsOA/
- **Deploy**: push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds & publishes Pages. Build-time env from repo secrets `VITE_API_BASE`, `VITE_GOOGLE_CLIENT_ID`.
- **Backend**: `worker/` (Cloudflare Worker + D1). See `worker/README.md`. Deploy with `wrangler`.

## Today's work — 2026-07-09

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
- **前台工作 Checklist** — date-keyed daily checklist with per-item notes; cross-date note search bar. `src/pages/Checklist.tsx`
- **OA Cases** — insurance claim edge-case cards (title/payer/tags/summary/resolution). `src/pages/OACases.tsx`
- **Where to Find Payments** — payment-portal lookup per payer; payer field is a dropdown fed by the Payer directory. `src/pages/Payments.tsx`

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
- Verification flow: `npx tsc --noEmit` must be clean, then browser end-to-end.
- **Gotcha:** in the Claude Code preview harness, `preview_console_logs` showed a stale cached buffer — don't trust its reported errors; verify real DOM state via snapshot/eval. `preview_screenshot` occasionally times out at 30s.

## Recent commits (latest first)
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
