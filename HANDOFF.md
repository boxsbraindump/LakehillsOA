# Handoff — Lake Hills Acupuncture Operation Assistant

> Internal front-desk tool for a clinic. React 19 + Vite + TypeScript + Tailwind v4,
> Notion-style design (see `design.md`). GitHub Pages frontend, Cloudflare Worker + D1
> cloud sync, Google Sign-In as an access gate.

- **Repo**: `boxsbraindump/LakehillsOA` (branch `main`)
- **Live**: https://boxsbraindump.github.io/LakehillsOA/
- **Deploy**: push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds & publishes Pages. Build-time env from repo secrets `VITE_API_BASE`, `VITE_GOOGLE_CLIENT_ID`.
- **Backend**: `worker/` (Cloudflare Worker + D1). See `worker/README.md`. Deploy with `wrangler`.

## Non-negotiable architectural constraints

1. **Data is ONE shared dataset for the whole team — not multi-tenant.** Google Sign-In is
   purely an access gate (email allowlist). Colleagues searching each other's notes is the
   core use case. Do NOT partition data per user.
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
- `src/main.tsx`: LanguageProvider → AuthProvider → LoginGate → HashRouter (HashRouter chosen for GH Pages static hosting). Routes: index/checklist/oa-cases/payments/custom/:categoryId/trash/settings.
- `src/App.tsx`: ToastProvider + Sidebar + `<Outlet/>`.

## Known, intentionally-deferred tech debt
- **User-added/edited Checklist items, OA Cases, and Payment entries are NOT in the search index** — only seed data + custom-category entries are indexed. This is a conscious deferral (flagged in `buildSeedSearchDocs()`'s comment in `src/lib/searchIndex.ts`), NOT an oversight. To fix: wire those three categories' synced-storage data into `useSearchIndex`.

## Dev / verification notes (Windows)
- PowerShell is the primary shell. Dev server runs on port 5185 (`npm run dev`).
- Verification flow: `npx tsc --noEmit` must be clean, then browser end-to-end.
- **Gotcha:** in the Claude Code preview harness, `preview_console_logs` showed a stale cached buffer — don't trust its reported errors; verify real DOM state via snapshot/eval. `preview_screenshot` occasionally times out at 30s.

## Recent commits (latest first)
- `5939a37` Fix sidebar trash/profile stuck near top instead of bottom (`md:mt-4` was overriding `mt-auto`)
- `df44467` Add bilingual i18n, payer directory, and user-editable custom sidebar categories
- `c8bb2ce` Fix login card rendering as a narrow sliver (Tailwind v4 `--spacing-*` collision)
- `f2b3626` Wire up production D1 database ID for the deployed Worker
- `3da7be2` Add cloud sync backend with Google Sign-In auth
