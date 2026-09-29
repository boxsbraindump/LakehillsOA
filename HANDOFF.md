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

### Visit ledger (`src/pages/VisitLedger.tsx`, `src/lib/visitLedger.ts`)

The owner's second clinic (Renton, massage only) cannot be given Unified Practice access without
also seeing the first clinic's business, so its appointments arrive outside the system and
Bellevue works each one through four steps. That was a spreadsheet with four cell colours, and it
broke the week a single Kaiser remittance covered about sixty patients across both clinics and
six thousand dollars.

**Why colours could not hold it.** A colour says what state a row is in. It cannot say *which
payment settled which visit* — so telling this round from the last one meant light green versus
dark green, which caps you at two rounds; a partial return left no trace of what was still
outstanding; and the weekly figure owed to the other clinic had to be counted by eye. One
miscount cost a second pass through sixty rows.

The ledger gives each visit a **paid date**, which makes rounds unlimited and the weekly figure a
sum. Five statuses map onto the old sheet: `new` is the blank cell, then entered / submitted /
paid / denied. Denied is not terminal — it goes back to submitted once resubmitted.

- **Reconciliation searches the pasted remittance rather than parsing it.** For each open visit
  it asks "is this patient named on any line of this text". A remittance has no format worth
  relying on, and parsing one would fail invisibly; this way column layout, wrapping and codes
  are all irrelevant, and the only thing it can miss is a name genuinely written differently —
  which is reported as "not in this remittance" rather than swallowed. **Do not replace this with
  a parser.**
- Matching requires *every* part of the name on one line, so "DOE, JANE" finds a ledger entry of
  "Jane Doe" while a shared surname alone settles nobody. Tokens under two characters are dropped.
- **One remittance covers visits months apart, and prints one patient's payments pages apart.**
  Both fall out of searching rather than reading in order, but they shape how a shared name is
  handled: `datesInLine` reads the service dates a line states, and a namesake is settled only
  when the remittance names *its* date. Two visits both dated are both settled, with nothing to
  decide; one dated leaves the other open; **undated duplicates still go to a person**, because
  every visit reimburses the same and nothing in the data separates them. A stated date that
  matches no open visit is surfaced on the match rather than acted on — that is how a payment
  landing on the wrong visit becomes visible.
- The payment-date view shows the span of visit dates a payment covered and each name with its
  own visit date, since "which visits did this cheque pay for" is not answerable otherwise.
- It cannot report how many names in the remittance belong to the *other* clinic — nothing reads
  the remittance's own list. It does not need to: matched visits are this clinic's, and that is
  the number being asked for.
- Two groupings, both wanted for different reasons: **by paid date** answers what the other clinic
  is owed this week; **by visit date** shows a day where everything around it came back and that
  one did not, which is how a bad day used to reveal itself on the sheet.
- **Adding one person is a field, not a dialog**: a name box above the list, enter to add, with
  the date sticking between adds so a day of bookings is typed straight through. There is no
  spreadsheet to import from — an earlier version was written around pasting one and had to be
  reworded. The batch panel remains for putting a group in at once. When a batch goes in as paid
  the payment date is asked for, never derived from the visit date — the status says money
  arrived, not when, and inventing a date would corrupt the payment-date view. When

**The page is the record, not the procedure.** Three builds got this wrong in the same way.
The first exposed all five statuses as filter chips, three view tabs and two add buttons — nine
controls on an empty ledger. The second cut that to three piles named for where a visit sat. The
third renamed the piles after the week's three jobs (into UP / to Office Ally / chase the money).
All three answered *what do I do next*, and the owner wanted the page to answer *what happened to
this patient* — which is the question a front desk is actually asked, and the one the spreadsheet
answered by being a flat list you could look down.

So the main view is that list: **one row per visit**, every patient, sorted newest first, with
columns for patient, visit date, status, paid date and when the status last changed. Status is a
coloured cell you change from a dropdown, not a stage you graduate from — the old sheet's colours
are kept, because reading a column of them at a glance was the one thing it did well.

- **The batch operations survive as row selection, not as page structure.** Tick the rows that
  went to Office Ally this week, then say what happened to them; one undo covers the batch. This
  keeps the weekly upload to one click without the page being shaped like the workflow.
- **Search is one box over both names and dates** (`matchesQuery`), so "09-15" finds a day and
  "li" finds Wen Li without the user first saying which they mean.
- **Every visit now carries a trail** (`history: StatusEvent[]`, read through `visitHistory`).
  This is the thing coloured cells could never do: a colour is overwritten by the next colour, so
  the sheet could say a visit was paid but never *when it was marked*. Records written before the
  trail existed have none, and `visitHistory` back-fills only what is actually known — creation,
  and the payment date if paid. It does not invent the steps in between.
- **Clicking a name opens that patient's whole record**: how many visits, how many paid, how many
  still waiting, each visit's status and paid date, and under each one the dated trail of every
  change. Names are folded case- and spacing-insensitively, but the spelling shown is the one
  first entered — correcting a patient's name is the user's call, not something to do silently.
- Paid visits stay in the list like everything else; the two date groupings behind 按日期看 remain
  for "what did this cheque settle" and "which day never came back".

**What the page is for, in the clinic's own words: 让我知道我今天弄了多少事情.** The EOB is
theirs to read; the page's job is to show the day's work. A dated block at the top counts every
status change made on a given day, broken down by kind, expandable to exactly which visits and
at what time, with arrows back to earlier days. This is only answerable because changes are
timestamped — a sheet of coloured cells cannot answer it at all, since recolouring leaves no
trace of when, and so the day's work vanishes the moment it is done.

**An import that failed twice, and why.** Reading the EOB out of its PDF was built and then
removed: it did not work on their real EOB. Commit 46b39b6 still has it, with pdfjs-dist, if it is
ever worth retrying on a PDF that has a text layer. The spreadsheet import failed for two
separate reasons, both now fixed: there was no file picker at all, only a paste box; and
`datesInLine` did not know `2026/10/2`, which is what a Chinese-locale Excel writes — it read
that as month 2026, gave up, and imported nothing at all. Dates now parse year-first and
year-last with any of three separators, plus 年月日.

**The .xlsx is read without a dependency.** An .xlsx is a ZIP of XML and the browser can already
inflate, so `sheetImport.ts` walks the zip's central directory, inflates entries with
`DecompressionStream("deflate-raw")`, and turns the first worksheet into tab-separated text —
the same shape pasting cells produces, so both routes land in one parser and there is only one
thing to get right. Styles are parsed too, because a date in a sheet is only a number: without
its number format a visit date imports as 46296.

**Service area is a Notion-style select** (`serviceTags.ts`). A visit stores the option's
**id**, never its label, so renaming an option changes every visit already tagged with it —
which is exactly what was asked for ("把里面的字自己改了就行"), and nothing has to be migrated.
The four defaults are a starting point meant to be renamed or deleted. An import invents options
for labels it has not seen, since their sheet already carries this column. A single Chinese
character is a valid label, so the row parser's two-character minimum applies only to Latin
text — "头" was being silently dropped.

**Their sheet is one patient per COLUMN, and reading it row-wise produced garbage.** The real
layout is a header row of patient names with each patient's visits down the column beneath —
`09/18 肩颈` in a single cell, date and body area together, and no year anywhere. The parser
now detects the shape instead of assuming it: a columnar sheet is one where *every* filled cell
below the header states a date, because every one of them is a visit, while a row-per-record
sheet always has a name cell with no date in it. Both shapes are tested. The missing year comes
from the date being imported against, and a date landing more than ~3 months ahead of it is read
as last year's — a sheet opened in January still holds December's visits.

**Each step keeps its own date, and the dates are editable.** `enteredDate`,
`submittedDate` and `paidDate` record the day the work happened, defaulted to today when
the status changes and correctable afterwards. An event timestamp cannot stand in for this: a
batch reported to Office Ally on Friday and ticked off on Monday would read as Monday, and "哪一
天我们报了 OA，哪一天回的钱" was named as one of the clinic's real pain points. `history` still
records when the click happened — the two answer different questions and both are kept.
`operationDates` falls back to the trail for records written before the fields existed, and
claims nothing about a step a visit never reached. Moving a visit backwards clears the dates of
every step after it, or a pushed-back visit would keep its payment date and stay in the payout
figure.

The bulk bar carries a date, because a batch shares one: select the week's rows, set the day it
actually went out, then say what happened to it. The calendar has a third lens over that same
date (按报 OA 日期), so a day's submissions are as findable as a day's payments.

**No native selects or date inputs anywhere on this page.** A `<select>` draws its own
arrow and its own list from the operating system, and `<input type="date">` draws the OS
calendar glyph and picker — next to a coloured status chip both read as something glued on from
elsewhere, and at two or three per row they were most of the visual noise. `Select.tsx` and
`DatePicker.tsx` replace them, sharing `Popover.tsx`.

The popover **must** be a portal. The ledger table scrolls horizontally, and a panel positioned
inside it is clipped at the table's edge — which is exactly where the status and date cells sit.
It measures the trigger, flips above when there is no room below, and clamps to the viewport.
Scrolling and resizing **re-measure rather than close**: an earlier version closed on both, which
threw away a half-made choice whenever the window changed size. Escape and an outside press
close it.

The status dropdown renders each option as the chip it will become, so the colour is chosen
rather than remembered. The date picker reuses `monthGridDays` from the calendar view, so
there is one month-grid implementation.

**Deleting asks first.** The undo toast was the only net, and it is easy to hit the bin by
accident, miss the toast, and find the record gone days later when a payment will not match. The
toast stays as the second net for deletes that were meant.

**The patient panel shows three labelled dates, not a progress track.** It briefly had a
three-dot track with connectors. It looked like progress and cost four lines a visit to say what
three labelled dates say in one — and a half-drawn connector between a skipped step and a
completed one read as a bug rather than as information. The status chip already states where a
visit is; the dates only have to state when each step happened. The click trail stays behind a
操作记录 toggle, since it is audit data.

**Design pass, and what was deliberately not taken from it.** The house frontend skill is written
for marketing pages and SaaS dashboards. Bento grids, perpetual micro-animations, magnetic
buttons and hero sections were all rejected on purpose: this is a page someone stares at while
doing repetitive data entry, and anything that moves on its own is a distraction. Swapping the
icon set (the skill asks for Phosphor/Radix) was also declined — lucide is app-wide, and
changing one page would leave two icon languages side by side. Skeleton loaders were declined
because the store is local-first and there is no load to cover.

What was taken: a sticky table header; press feedback and focus rings (the page had neither, and
was mouse-only); colour moved out of raw Tailwind palette classes into tokens; rows tightened
from 41px to 36px, which is two more visible at a time; dates set in `--font-mono` so they
read as data; one boxed container removed from the day log; and motion in exactly three places —
a popover that opens from its trigger, a row that tints for a moment when its status changes, and
the press travel. All of it is transform/opacity and all of it is inside
`prefers-reduced-motion: no-preference`.

**The patient modal is gone; the table holds what it held.** Searching a name already filters
to that patient, folding spellings exactly the way the modal grouped them — `matchesQuery` and
`groupByPatient` both normalise through `compactForSearch`, so `wen` finds `Wen Li`, `wen  li` and
`WEN LI` alike. That left the modal three jobs, and all three moved into the table: the totals
appear as a strip above it whenever a search narrows to exactly one person; the other two step
dates and the change log open in the row itself, behind a disclosure at its end. The patient name is plain text, not a
control: people copy names out of this table, and a name you cannot drag-select — or that
replaces the search on a stray click — is worse than one that does nothing. Searching is what
the search box is for. Net 100 lines lighter, one
fewer modal, and no context switch away from the row being worked on.

**One way to add people, not two.** There used to be an inline name field under the search bar
as well as a batch dialog. Two fields stacked under each other, one of which searched and one of
which added, is a trap — and the batch dialog was always able to take a single name, since it
reads one name per line. The inline form is gone and the dialog is the only entry point, with
its copy leading on the simple case and its box focused on open. Adding one person is now: click
加患者, type, Enter-Enter for a second, click 添加.

**Sortable by patient, visit date or last step, either way up.** Clicking the active column
turns it over; clicking a new one starts it the way that column reads (names up, dates down).
Every comparator falls back to the other two keys, so a column of identical dates still comes out
in a stable order instead of whatever the previous sort left behind. A visit nobody has touched
yet sorts with the oldest rather than above everything.

**Column alignment: text aligns to text, chips align by their box.** The status and area chips are
pills, so their left border sits on the header. A borderless date button is read as text, but its
own padding pushed it 7px right of the header — next to the patient column, which has no padding
and lined up exactly, that drift was what looked broken. The date cells now pull back by exactly
that inset. Measure this with a Range over the text node, not the element box, or padding hides
the problem.

**The ledger shows one date, not three.** Three date columns beside a status column stated the
same fact twice: a row reading 已报 OA with 09/22 beside it *is* "we reported it on the 22nd".
So the table is 患者 / 就诊日期 / 部位 / 状态 / 上次操作 — six columns including the checkbox —
and `currentStep` picks which stored date to show from the status. Editing that cell edits
whichever step the status owns, so a date can still be corrected from the ledger. All three step
dates remain on the patient's panel, editable, for the times an earlier step needs checking.
`new` shows no date at all: a visit appearing is the other clinic's booking, not a step
this clinic performed.

The today banner went with it — the 每天干了什么 tab sits directly above it and says the same
thing. The table now starts 274px down, with about fifteen rows visible before any scrolling.

**Three views, one page — and why not three pages.** At eight weeks of real use the day log
had grown to 629px and pushed the first ledger row past a screen's worth of scrolling, growing
without bound as the clinic kept using it. Routed sub-pages were the obvious fix and the wrong
one: reconciling a payment and changing a status both need the records in front of you, and a
nav layer is exactly what got the three earlier structures rejected. So `view` switches
台账 / 每天干了什么 / 日历 in place, over one set of records. The table view keeps a single
clickable line of today's work, which opens the log. Search only appears over the table, since
that is the only thing it filters. The first ledger row now sits about a third of a screen down
instead of past the fold.

**Measure in a real viewport.** An earlier pass at this measured the page while the browser pane
was collapsed to 0×0, where every block wraps to one character per line and heights are
meaningless — it reported the title alone as 297px tall. Any layout measurement taken through
the pane must set a viewport size first and check `document.documentElement.clientWidth`
is non-zero before trusting a number.

**The main view of the day's work is a log of days, not a card for today.** The clinic does
one kind of work per day — the week's visits go into Unified Practice on one day, the claims go
to Office Ally on another, the money lands on a third — so a single-day card with arrows was the
wrong shape and had to be paged through to find anything. `activityLog` returns every day
that had activity, newest first, each row naming what was done and how many; clicking one opens
exactly which visits and at what time. Today is highlighted and open by default.

**`new` is not counted as work done.** A visit appearing is the other clinic booking someone,
not this clinic doing something, so the day's figure excludes it and reports it on its own line
underneath. Counting an import of sixty bookings as sixty things handled would make the one
number on the page meaningless.

**Resist re-introducing a workflow shell here.** Three attempts at one were all rejected, each
time because the page has to be the record first.

**Access, as of 2026-09-28.** Both users are already on `ALLOWED_EMAILS`, so this runs today in
any workspace they create. Letting the other clinic's staff in still needs two things that do not
exist yet: a member-management endpoint (workspace creation only enrols its creator), and a login
path for an invited-but-not-allowlisted email — today such an email gets 403 unless
`PUBLIC_SIGNUPS` is on, and adding them to `ALLOWED_EMAILS` would hand them the primary
workspace, which is the one thing the owner must not do. The right shape is "a member of any
workspace may sign in", checked against `user_workspaces`.

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
