import { Fragment, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ListChecks,
  ArrowDown,
  ArrowUp,
  Eye,
  Rows3,
  ChevronLeft,
  ChevronRight,
  Plus,
  Scale,
  Search,
  Trash2,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "../components/LanguageProvider";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { Select } from "../components/Select";
import { DatePicker } from "../components/DatePicker";
import {
  todayKey,
  formatDisplayDate,
  shiftDateKey,
  monthKeyOf,
  shiftMonthKey,
  monthGridDays,
} from "../lib/date";
import {
  VISIT_STATUSES,
  activityLog,

  bucketByDate,
  groupByPaidDate,
  groupByPatient,
  groupByVisitDate,
  isOpen,
  matchRemittance,
  matchesQuery,
  currentStep,
  operationDates,
  newVisitId,
  parseVisitRows,
  visitHistory,
  withStatus,
} from "../lib/visitLedger";
import type {
  DateLens,
  ParsedVisitRow,
  Visit,
  VisitStatus,
} from "../lib/visitLedger";
import { readSheetFile } from "../lib/sheetImport";
import { buildSampleLedger } from "../lib/sampleLedger";
import {
  DEFAULT_SERVICE_TAGS,
  TAG_COLORS,
  newTagId,
  resolveImportedTags,
  tagById,
} from "../lib/serviceTags";
import type { ServiceTag } from "../lib/serviceTags";
import type { TranslationKey } from "../lib/translations";


const STORAGE_KEY = "lh-visit-ledger";

const STATUS_LABEL: Record<VisitStatus, TranslationKey> = {
  new: "ledger.statusNew",
  entered: "ledger.statusEntered",
  submitted: "ledger.statusSubmitted",
  paid: "ledger.statusPaid",
  denied: "ledger.statusDenied",
};

/**
 * The old sheet's four colours, kept. A column of statuses has to be readable at a glance —
 * that was the one thing the spreadsheet did well, and losing it would be a step backwards.
 */
const STATUS_TONE: Record<VisitStatus, string> = {
  new: 'tone tone-new',
  entered: 'tone tone-entered',
  submitted: 'tone tone-submitted',
  paid: 'tone tone-paid',
  denied: 'tone tone-denied',
};

function timestamp(at: number, lang: "zh" | "en"): string {
  return new Date(at).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The page is the record, not the procedure.
 *
 * Two earlier versions organised this around the week's steps — first five status filters and
 * three view tabs, then three piles, one per weekly job. Both answered "what do I do next" and
 * neither answered "what happened to this patient", which is the question a front desk is
 * actually asked. The spreadsheet this replaced was one flat list of every visit, and being
 * flat was its virtue: you could look down it.
 *
 * So the main view is that list, with the batch operations reachable by selecting rows rather
 * than by the page being shaped like the workflow. A status is a cell you change, not a stage
 * you graduate from. What the sheet could not do — say *when* each change was made, because a
 * cell colour overwrites the colour before it — is on the patient's own page.
 */
/** The status list, as the styled select wants it — each option carrying its own colour. */
function statusOptions(t: (key: TranslationKey) => string) {
  return VISIT_STATUSES.map((status) => ({
    value: status,
    label: t(STATUS_LABEL[status]),
    tone: STATUS_TONE[status],
  }));
}

function tagOptions(tags: ServiceTag[], none: string) {
  return [
    { value: "", label: none },
    ...tags.map((tag) => ({
      value: tag.id,
      label: tag.label,
      tone: TAG_COLORS[tag.color % TAG_COLORS.length],
    })),
  ];
}

/** A page you can actually look down. The clinic asked for 25–50; the rest are there for choice. */
const PAGE_SIZES = [25, 50, 100];

type SortKey = "name" | "visitDate" | "lastStep";

/**
 * How two visits compare on one column.
 *
 * Every key falls back to the other two, so a column of identical dates still comes out in a
 * stable, sensible order rather than whatever the previous sort happened to leave behind.
 */
function compareBy(a: Visit, b: Visit, key: SortKey): number {
  if (key === "name") {
    return a.name.localeCompare(b.name) || b.visitDate.localeCompare(a.visitDate);
  }
  if (key === "visitDate") {
    return a.visitDate.localeCompare(b.visitDate) || a.name.localeCompare(b.name);
  }
  // A visit nobody has touched yet sorts with the oldest, not above everything.
  const left = currentStep(a).date ?? "";
  const right = currentStep(b).date ?? "";
  return (
    left.localeCompare(right) ||
    a.visitDate.localeCompare(b.visitDate) ||
    a.name.localeCompare(b.name)
  );
}

export default function VisitLedger() {
  const { t, lang } = useLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const today = todayKey();

  const [stored, setStored] = useSyncedStorage<Visit[]>(STORAGE_KEY, []);
  /**
   * Sample rows, for seeing what the page does before there is anything real in it.
   *
   * Held in React state and never written to storage: the workspace is shared and synced, so
   * loading samples into it would put them on a colleague's screen too. Everything below reads
   * `visits` and writes `setVisits` without knowing which of the two it has, so the preview
   * exercises the real edit paths — sorting, paging, marking, expanding — and throws it all
   * away on reload.
   */
  const [preview, setPreview] = useState<Visit[] | null>(null);
  const visits = preview ?? stored;
  const setVisits: Dispatch<SetStateAction<Visit[]>> = preview
    ? (action) =>
        setPreview((prev) =>
          typeof action === "function"
            ? (action as (p: Visit[]) => Visit[])(prev ?? [])
            : action,
        )
    : setStored;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  // Newest visit first is the useful default; every column can be turned over from its header.
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "visitDate",
    dir: "desc",
  });
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  /**
   * Rows whose status just moved.
   *
   * Marking twenty rows at once changed twenty chips silently, several of them off screen, and
   * the only evidence was a toast. A brief tint on each row says what was actually touched.
   */
  const [justChanged, setJustChanged] = useState<string[]>([]);
  /**
   * One row's other two dates and its change log, opened in place.
   *
   * These used to live in a modal reached by clicking a patient's name. Searching a name
   * already filters the table to that patient — folding spellings exactly the way the modal
   * grouped them — so the modal's only remaining job was the two dates the ledger does not
   * show and the change log. One row at a time: this is a reference, not a comparison.
   */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [trailOpen, setTrailOpen] = useState(false);


  const [batchOpen, setBatchOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  /**
   * Three views, one page.
   *
   * Measured at eight weeks of real use, the day log had grown to 1,496px and pushed the first
   * ledger row 2,191px down — two and a half screens before you could see your own records, and
   * growing forever. Splitting these into separate routes was the obvious fix and the wrong one:
   * reconciling and changing statuses both need the records in front of you, so the value here
   * is that everything is one place. They are views, not pages.
   */
  const [view, setView] = useState<"table" | "log" | "calendar">("table");
  const [lens, setLens] = useState<DateLens>("submitted");
  const [month, setMonth] = useState(() => monthKeyOf(todayKey()));
  const [serviceTags, setServiceTags] = useSyncedStorage<ServiceTag[]>(
    "lh-visit-service-tags",
    DEFAULT_SERVICE_TAGS,
  );
  const [managingTags, setManagingTags] = useState(false);
  // "哪一天是我把这个 batch 报到 OA 的" — a batch shares one date, and it is often not today.
  const [batchDate, setBatchDate] = useState(today);
  // What was done, and when — the question the clinic actually asked this page to answer.
  const [openDay, setOpenDay] = useState<string | null>(today);
  const [logLimit, setLogLimit] = useState(14);
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filtered = visits.filter((v) => matchesQuery(v, query));
    const sign = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => sign * compareBy(a, b, sort.key));
  }, [visits, query, sort]);

  /** Clicking the active column turns it over; a new column starts the way that column reads. */
  function sortBy(key: SortKey) {
    setPage(1);
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // Clamped on read rather than corrected in an effect: deleting the last row of the last page
  // would otherwise render an empty table for a frame before the effect caught up.
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );

  const patients = useMemo(() => groupByPatient(visits), [visits]);
  const log = useMemo(() => activityLog(visits), [visits]);

  const dayGroups = useMemo(() => {
    if (lens === "visit") return groupByVisitDate(visits);
    if (lens === "paid") return groupByPaidDate(visits);
    const byDay = bucketByDate(visits, "submitted");
    return [...byDay.entries()]
      .map(([date, group]) => ({
        date,
        total: group.length,
        paid: group.filter((v) => v.status === "paid").length,
        outstanding: group.filter(isOpen).length,
        visits: group,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [visits, lens]);
  /** Shown only when the search has narrowed to exactly one person, which is why you searched. */
  const focused = useMemo(() => {
    if (!query.trim() || rows.length === 0) return null;
    const grouped = groupByPatient(rows);
    return grouped.length === 1 ? grouped[0] : null;
  }, [rows, query]);

  const thisWeek = useMemo(() => {
    const from = shiftDateKey(today, -6);
    return visits.filter(
      (v) => v.status === "paid" && v.paidDate && v.paidDate >= from && v.paidDate <= today,
    ).length;
  }, [visits, today]);

  const selectedSet = new Set(selected);
  // "All" is the page you are looking at — selecting rows you cannot see would be a trap,
  // especially with a delete button on the same bar.
  const allShownSelected = pageRows.length > 0 && pageRows.every((v) => selectedSet.has(v.id));


  /** Every status change goes through here, so nothing can move without leaving a trail. */
  function setStatus(ids: string[], status: VisitStatus, onDate?: string): Visit[] {
    const idSet = new Set(ids);
    const before = visits.filter((v) => idSet.has(v.id));
    setVisits((prev) =>
      prev.map((v) => (idSet.has(v.id) ? withStatus(v, status, onDate ?? today) : v)),
    );
    return before;
  }

  /** Correcting one step's date afterwards, without touching the status or the trail. */
  function setStepDate(visit: Visit, field: "enteredDate" | "submittedDate" | "paidDate", date: string) {
    setVisits((prev) =>
      prev.map((v) => (v.id === visit.id ? { ...v, [field]: date || undefined } : v)),
    );
  }

  function setStatusWithUndo(ids: string[], status: VisitStatus, onDate?: string) {
    const before = setStatus(ids, status, onDate);
    setJustChanged(ids);
    window.setTimeout(() => setJustChanged((prev) => (prev === ids ? [] : prev)), 900);
    if (before.length === 0) return;
    const message =
      before.length === 1
        ? t("ledger.movedToast", { name: before[0].name, step: t(STATUS_LABEL[status]) })
        : t("ledger.movedManyToast", {
            count: String(before.length),
            step: t(STATUS_LABEL[status]),
          });
    showToast(message, {
      label: t("common.undo"),
      onClick: () =>
        setVisits((prev) => {
          const byId = new Map(before.map((v) => [v.id, v]));
          return prev.map((v) => byId.get(v.id) ?? v);
        }),
    });
  }

  function setServiceTag(visit: Visit, tagId: string) {
    setVisits((prev) =>
      prev.map((v) => (v.id === visit.id ? { ...v, serviceTag: tagId || undefined } : v)),
    );
  }


  /**
   * The visit date is editable, not fixed at entry.
   *
   * One payment settles visits from months apart, so a remittance regularly states a service
   * date the ledger has wrong — the quick-add form carries the last date typed, which is what
   * makes a run of entries fast and also what makes one of them wrong. Correcting it has to be
   * possible in the row itself; a status change cannot fix a date.
   */
  function setVisitDate(visit: Visit, visitDate: string) {
    if (!visitDate) return;
    setVisits((prev) => prev.map((v) => (v.id === visit.id ? { ...v, visitDate } : v)));
  }

  /**
   * Deleting asks first.
   *
   * The undo toast is not enough on its own: it is easy to click the bin by accident, miss the
   * toast, and only notice the record is gone days later when a payment does not match. The
   * toast stays as the second net for the deletes that were meant.
   */
  async function remove(ids: string[]) {
    const idSet = new Set(ids);
    const removed = visits.filter((v) => idSet.has(v.id));
    if (removed.length === 0) return;

    const ok = await confirm({
      title: t("ledger.deleteTitle"),
      message:
        removed.length === 1
          ? t("ledger.deleteOne", { name: removed[0].name, date: removed[0].visitDate })
          : t("ledger.deleteMany", { count: String(removed.length) }),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;

    setVisits((prev) => prev.filter((v) => !idSet.has(v.id)));
    setSelected([]);
    showToast(t("ledger.deletedToast", { count: String(removed.length) }), {
      label: t("common.undo"),
      onClick: () => setVisits((prev) => [...prev, ...removed]),
    });
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {t("ledger.title")}
        </h1>
        {visits.length > 0 && (
          <p className="text-[13px] text-(--color-ink-muted)">
            {t("ledger.summaryLine", {
              patients: String(patients.length),
              visits: String(visits.length),
              week: String(thisWeek),
            })}
          </p>
        )}
      </div>

      {preview && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--color-warn)/40 px-3 py-2 text-[12px] tone tone-warn">
          <Eye size={13} className="shrink-0" />
          {t("ledger.previewBanner")}
          <button
            onClick={() => setPreview(null)}
            className="ml-auto rounded-(--radius-xs) border border-(--color-warn)/50 px-2 py-0.5 font-medium"
          >
            {t("ledger.previewExit")}
          </button>
        </p>
      )}

      {/* One row of tabs, not a nav: the same records seen three ways. */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {(
          [
            ["table", "ledger.viewTable", Rows3],
            ["log", "ledger.viewLog", ListChecks],
            ["calendar", "ledger.viewCalendar", CalendarDays],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={[
              "flex items-center gap-1.5 rounded-(--radius-sm) border px-3 py-1.5 text-[13px]",
              view === key
                ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                : "border-(--color-hairline) text-(--color-ink-muted) hover:text-(--color-primary)",
            ].join(" ")}
          >
            <Icon size={13} />
            {t(label)}
          </button>
        ))}
      </div>


      {/* Search first: the list is long by design, and finding a patient is the common errand. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {/* Search filters the table, so it is only offered where there is a table to filter. */}
        <div className={["relative w-full min-w-0 sm:w-auto sm:flex-1", view === "table" ? "" : "hidden"].join(" ")}>
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t("ledger.searchPlaceholder")}
            className="w-full rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) py-2 pr-3 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
          />
        </div>
        <button
          onClick={() => setBatchOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-(--radius-sm) bg-(--color-primary) px-3 py-2 text-[13px] font-medium text-(--color-on-primary)"
        >
          <Plus size={13} />
          {t("ledger.addPatients")}
        </button>
        <button
          onClick={() => setReconciling(true)}
          className="flex shrink-0 items-center gap-1 rounded-(--radius-sm) border border-(--color-primary)/40 px-3 py-2 text-[13px] font-medium text-(--color-primary)"
        >
          <Scale size={13} />
          {t("ledger.reconcileShort")}
        </button>

      </div>


      {/* The weekly batch lives here: select rows, say what happened to them.

          A floating bar rather than a sticky one: it used to stick to the top of the page and
          would now collide with the table header that sticks there too — and half the point of
          selecting rows is doing it far down a long table, nowhere near the top. */}
      {selected.length > 0 && view === "table" && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(60rem,calc(100vw-2rem))] flex-wrap items-center gap-2 rounded-(--radius-lg) border border-(--color-primary)/40 bg-(--color-canvas)/95 px-3 py-2 shadow-(--shadow-level-3) backdrop-blur">
          <span className="text-[13px] font-medium text-(--color-ink)">
            {t("ledger.selectedCount", { count: String(selected.length) })}
          </span>
          <label className="flex items-center gap-1 text-[12px] text-(--color-ink-muted)">
            {t("ledger.onDate")}
            <DatePicker
              value={batchDate}
              onChange={setBatchDate}
              ariaLabel={t("ledger.onDate")}
              className="border-(--color-hairline)! bg-(--color-canvas) text-[12px] text-(--color-ink)"
            />
          </label>
          {VISIT_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusWithUndo(selected, status, batchDate);
                setSelected([]);
              }}
              className={[
                "rounded-full border px-2.5 py-1 text-[12px] font-medium",
                STATUS_TONE[status],
              ].join(" ")}
            >
              {t(STATUS_LABEL[status])}
            </button>
          ))}
          <button
            onClick={() => remove(selected)}
            className="ml-auto flex items-center gap-1 text-[12px] text-(--color-danger)"
          >
            <Trash2 size={12} />
            {t("common.delete")}
          </button>
          <button
            onClick={() => setSelected([])}
            className="text-[12px] text-(--color-ink-muted)"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      {visits.length === 0 ? (
        <div className="mt-4 rounded-(--radius-lg) border border-dashed border-(--color-hairline) px-6 py-10 text-center">
          <p className="text-[14px] text-(--color-ink-muted)">{t("ledger.emptyBody")}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setBatchOpen(true)}
              className="rounded-(--radius-sm) bg-(--color-primary) px-3 py-2 text-[13px] font-medium text-(--color-on-primary)"
            >
              {t("ledger.addPatients")}
            </button>
            {/* Nothing here is worth looking at until there are rows in it. */}
            <button
              onClick={() => setPreview(buildSampleLedger())}
              className="flex items-center gap-1.5 rounded-(--radius-sm) border border-(--color-hairline) px-3 py-2 text-[13px] text-(--color-ink-muted) hover:text-(--color-primary)"
            >
              <Eye size={13} />
              {t("ledger.previewLoad")}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-(--color-ink-faint)">{t("ledger.previewHint")}</p>
        </div>
      ) : view === "log" ? (
        <div className="mt-4">
        <div className="mt-4">
          <p className="border-b border-(--color-hairline) px-1 py-2 text-[12px] font-semibold text-(--color-ink-muted)">
            {t("ledger.logTitle")}
          </p>
          {log.length === 0 ? (
            <p className="px-4 py-5 text-center text-[13px] text-(--color-ink-faint)">
              {t("ledger.logEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-(--color-hairline)">
              {log.slice(0, logLimit).map((day) => {
                const open = openDay === day.date;
                return (
                  <li
                    key={day.date}
                    className={day.date === today ? "bg-(--color-primary)/[0.05]" : ""}
                  >
                    <button
                      onClick={() => setOpenDay(open ? null : day.date)}
                      className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-1 py-2 text-left"
                    >
                      <span
                        className={[
                          "text-[13px] whitespace-nowrap",
                          day.date === today
                            ? "font-bold text-(--color-ink)"
                            : "text-(--color-ink-muted)",
                        ].join(" ")}
                      >
                        {day.date === today && `${t("ledger.todayLabel")} · `}
                        {formatDisplayDate(day.date, lang)}
                      </span>
                      <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
                        {VISIT_STATUSES.filter(
                          (status) => status !== "new" && day.counts[status] > 0,
                        ).map((status) => (
                          <span
                            key={status}
                            className={[
                              "rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
                              STATUS_TONE[status],
                            ].join(" ")}
                          >
                            {t(STATUS_LABEL[status])} {day.counts[status]}
                          </span>
                        ))}
                        {/* Bookings arriving are the other clinic's doing, so they are shown
                            without being dressed up as work this clinic did. */}
                        {day.added > 0 && (
                          <span className="text-[12px] whitespace-nowrap text-(--color-ink-faint)">
                            {t("ledger.addedApart", { count: String(day.added) })}
                          </span>
                        )}
                      </span>
                    </button>

                    {open && day.entries.length > 0 && (
                      <ul className="border-t border-(--color-hairline) px-4 pt-1 pb-2">
                        {day.entries.map((entry, i) => (
                          <li
                            key={`${entry.visit.id}-${entry.at}-${i}`}
                            className="flex flex-wrap items-baseline gap-x-2 py-0.5 text-[12px]"
                          >
                            <span className="font-medium text-(--color-ink)">{entry.visit.name}</span>
                            <span className="text-(--color-ink-faint) tabular-nums">
                              {entry.visit.visitDate}
                            </span>
                            <span className="text-(--color-ink-muted)">
                              → {t(STATUS_LABEL[entry.status])}
                            </span>
                            <span className="ml-auto text-(--color-ink-faint) tabular-nums">
                              {timestamp(entry.at, lang)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {log.length > logLimit && (
            <button
              onClick={() => setLogLimit(logLimit + 14)}
              className="w-full border-t border-(--color-hairline) py-2 text-[12px] text-(--color-ink-muted) hover:text-(--color-primary)"
            >
              {t("ledger.logMore", { count: String(log.length - logLimit) })}
            </button>
          )}
        </div>
        </div>
      ) : view === "calendar" ? (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {(
              [
                ["submitted", "ledger.viewBySubmitted"],
                ["paid", "ledger.viewByPaid"],
                ["visit", "ledger.viewByVisit"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => {
                  setLens(mode);
                  setPickedDay(null);
                }}
                className={[
                  "rounded-full border px-3 py-1.5 text-[13px]",
                  lens === mode
                    ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                    : "border-(--color-hairline) text-(--color-ink-muted)",
                ].join(" ")}
              >
                {t(label)}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setMonth(shiftMonthKey(month, -1))}
                aria-label={t("ledger.prevMonth")}
                className="rounded-(--radius-xs) p-1.5 text-(--color-ink-muted) hover:text-(--color-primary)"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[7ch] text-center font-mono text-[14px] font-medium text-(--color-ink)">
                {month}
              </span>
              <button
                onClick={() => setMonth(shiftMonthKey(month, 1))}
                aria-label={t("ledger.nextMonth")}
                className="rounded-(--radius-xs) p-1.5 text-(--color-ink-muted) hover:text-(--color-primary)"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => {
                  setMonth(monthKeyOf(today));
                  setPickedDay(null);
                }}
                className="rounded-(--radius-sm) border border-(--color-hairline) px-2 py-1 text-[12px] text-(--color-ink-muted) hover:text-(--color-primary)"
              >
                {t("ledger.thisMonth")}
              </button>
            </div>
          </div>

          {/* One grouping per lens, so "which day did we claim these" is answerable. */}
          <MonthCalendar
            month={month}
            today={today}
            byDay={bucketByDate(visits, lens)}
            picked={pickedDay}
            onPick={(day) => setPickedDay(day === pickedDay ? null : day)}
          />

          <div className="mt-4">
            {pickedDay ? (
              <>
                <p className="mb-2 text-[13px] font-medium text-(--color-ink)">
                  {formatDisplayDate(pickedDay, lang)}
                </p>
                <DayView
                  groups={dayGroups.filter((g) => g.date === pickedDay)}
                  mode={lens === "visit" ? "visit" : "paid"}
                  lang={lang}
                />
              </>
            ) : (
              <DayView
                groups={dayGroups}
                mode={lens === "visit" ? "visit" : "paid"}
                lang={lang}
              />
            )}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-(--radius-lg) border border-dashed border-(--color-hairline) py-10 text-center text-[14px] text-(--color-ink-faint)">
          {t("ledger.noMatches", { query })}
        </p>
      ) : (
        <>
        {focused && (
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
            <span className="text-[13px] font-bold text-(--color-ink)">{focused.name}</span>
            <span className="rounded-full border border-(--color-hairline) px-2 py-0.5 text-(--color-ink-muted)">
              {t("ledger.totalVisits", { count: String(focused.total) })}
            </span>
            {focused.paid > 0 && (
              <span className={["rounded-full border px-2 py-0.5", STATUS_TONE.paid].join(" ")}>
                {t("ledger.paidCountChip", { count: String(focused.paid) })}
              </span>
            )}
            {focused.open > 0 && (
              <span className={["rounded-full border px-2 py-0.5", STATUS_TONE.submitted].join(" ")}>
                {t("ledger.waitingChip", { count: String(focused.open) })}
              </span>
            )}
            <span className="text-(--color-ink-faint)">
              {t("ledger.patientSpan", {
                from: formatDisplayDate(focused.firstVisit, lang),
                to: formatDisplayDate(focused.lastVisit, lang),
              })}
            </span>
          </p>
        )}

        <div
          className={[
            "mt-2 max-h-[calc(100dvh-16rem)] overflow-auto rounded-(--radius-lg) border border-(--color-hairline)",
            // The floating batch bar sits over the foot of the table while it is up.
            selected.length > 0 ? "pb-16" : "",
          ].join(" ")}
        >
          <table className="w-full border-collapse text-left">
            {/* Sticky, because the table runs to sixty rows and more: scrolling used to leave
                you guessing which column was 报 OA and which was 回款. Sticky goes on the cells,
                not the row — a sticky <tr> is ignored by most browsers. */}
            <thead>
              <tr className="border-b border-(--color-hairline)">
                <th className="sticky top-0 z-10 w-9 bg-(--color-canvas-soft) px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={() =>
                      setSelected(allShownSelected ? [] : pageRows.map((v) => v.id))
                    }
                    aria-label={t("ledger.selectAll")}
                    className="align-middle"
                  />
                </th>
                <SortHeader
                  label={t("ledger.colPatient")}
                  active={sort.key === "name"}
                  dir={sort.dir}
                  onClick={() => sortBy("name")}
                />
                <SortHeader
                  label={t("ledger.colVisitDate")}
                  active={sort.key === "visitDate"}
                  dir={sort.dir}
                  onClick={() => sortBy("visitDate")}
                />
                <th className="sticky top-0 z-10 bg-(--color-canvas-soft) px-3 py-2 text-[12px] font-medium text-(--color-ink-muted)">
                  <button
                    onClick={() => setManagingTags(true)}
                    className="flex items-center gap-1 hover:text-(--color-primary)"
                  >
                    {t("ledger.colService")}
                    <Tag size={11} />
                  </button>
                </th>
                <th className="sticky top-0 z-10 bg-(--color-canvas-soft) px-3 py-2 text-[12px] font-medium text-(--color-ink-muted)">
                  {t("ledger.colStatus")}
                </th>
                <SortHeader
                  label={t("ledger.colLastStep")}
                  active={sort.key === "lastStep"}
                  dir={sort.dir}
                  onClick={() => sortBy("lastStep")}
                />
                <th className="sticky top-0 z-10 w-8 bg-(--color-canvas-soft) px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((visit) => {
                const open = expandedId === visit.id;
                const steps = operationDates(visit);
                return (
                <Fragment key={visit.id}>
                <tr
                  className={[
                    "border-b border-(--color-hairline) last:border-0",
                    selectedSet.has(visit.id) ? "bg-(--color-primary)/[0.06]" : "",
                    justChanged.includes(visit.id) ? "row-changed" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-1">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(visit.id)}
                      onChange={() => toggle(visit.id)}
                      aria-label={visit.name}
                      className="align-middle"
                    />
                  </td>
                  <td className="px-3 py-1">
                    <span className="block max-w-[16ch] truncate text-[14px] font-medium text-(--color-ink) select-text sm:max-w-none">
                      {visit.name}
                    </span>
                  </td>
                  <td className="px-3 py-1">
                    <DatePicker
                      value={visit.visitDate}
                      onChange={(date) => setVisitDate(visit, date)}
                      ariaLabel={t("ledger.colVisitDate")}
                      className="-ml-[7px] font-mono text-[13px] text-(--color-ink-muted)"
                    />
                  </td>
                  <td className="px-3 py-1">
                    <Select
                      value={visit.serviceTag ?? ""}
                      options={[
                        ...tagOptions(serviceTags, t("ledger.noService")),
                        { value: "__manage", label: t("ledger.manageTags") },
                      ]}
                      onChange={(next) => {
                        if (next === "__manage") setManagingTags(true);
                        else setServiceTag(visit, next);
                      }}
                      ariaLabel={t("ledger.colService")}
                      className={
                        tagById(serviceTags, visit.serviceTag)
                          ? TAG_COLORS[
                              tagById(serviceTags, visit.serviceTag)!.color % TAG_COLORS.length
                            ]
                          : "border-(--color-hairline) bg-(--color-canvas-soft) text-(--color-ink-faint)"
                      }
                    />
                  </td>
                  <td className="px-3 py-1">
                    {/* A status is a cell you change, not a stage you graduate from. */}
                    <Select
                      value={visit.status}
                      options={statusOptions(t)}
                      onChange={(next) => setStatusWithUndo([visit.id], next as VisitStatus)}
                      ariaLabel={t("ledger.colStatus")}
                      className={["font-medium", STATUS_TONE[visit.status]].join(" ")}
                    />
                  </td>
                  {/* One date, not three: the status already says which step this is, so
                      "已报 OA" plus 09/22 *is* "we reported it on the 22nd". Editing it edits
                      whichever step the status owns — the week's work is not always ticked off
                      on the day it happened. The other two dates stay on the patient's page. */}
                  <td className="px-3 py-1">
                    {(() => {
                      const step = currentStep(visit);
                      if (!step.field || !step.date) {
                        return <span className="text-[13px] text-(--color-ink-faint)">—</span>;
                      }
                      return (
                        <DatePicker
                          value={step.date}
                          onChange={(date) => setStepDate(visit, step.field!, date)}
                          ariaLabel={t("ledger.colLastStep")}
                          className="-ml-[7px] font-mono text-[12px] text-(--color-ink-muted)"
                        />
                      );
                    })()}
                  </td>
                  <td className="px-1 py-1">
                    <button
                      onClick={() => {
                        setExpandedId(open ? null : visit.id);
                        setTrailOpen(false);
                      }}
                      aria-label={t("ledger.moreOnThisVisit")}
                      aria-expanded={open}
                      className="rounded-(--radius-xs) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
                    >
                      <ChevronRight
                        size={14}
                        className={["transition-transform", open ? "rotate-90" : ""].join(" ")}
                      />
                    </button>
                  </td>
                </tr>

                {open && (
                  <tr className="border-b border-(--color-hairline) bg-(--color-canvas-soft)">
                    <td colSpan={7} className="px-3 py-2">
                      {/* The two steps the ledger column cannot show, plus who touched it when. */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {(
                          [
                            ["enteredDate", "ledger.colEnteredDate", steps.entered],
                            ["submittedDate", "ledger.colSubmittedDate", steps.submitted],
                            ["paidDate", "ledger.colPaidDate", steps.paid],
                          ] as const
                        ).map(([field, label, value]) => (
                          <span key={field} className="flex items-center gap-1 text-[12px]">
                            <span className="text-(--color-ink-faint)">{t(label)}</span>
                            {value ? (
                              <DatePicker
                                value={value}
                                onChange={(date) => setStepDate(visit, field, date)}
                                ariaLabel={t(label)}
                                className="font-mono text-[12px] text-(--color-ink-muted)"
                              />
                            ) : (
                              <span className="px-1.5 text-(--color-ink-faint)">—</span>
                            )}
                          </span>
                        ))}
                        <button
                          onClick={() => setTrailOpen(!trailOpen)}
                          className="text-[11px] text-(--color-ink-faint) hover:text-(--color-primary)"
                        >
                          {t(trailOpen ? "ledger.hideTrail" : "ledger.showTrail")}
                        </button>
                        <button
                          onClick={() => void remove([visit.id])}
                          className="ml-auto flex items-center gap-1 text-[11px] text-(--color-ink-faint) hover:text-(--color-danger)"
                        >
                          <Trash2 size={12} />
                          {t("common.delete")}
                        </button>
                      </div>

                      {trailOpen && (
                        <ol className="mt-1.5 flex flex-col gap-0.5 border-l-2 border-(--color-hairline) pl-3">
                          {visitHistory(visit).map((event, i) => (
                            <li
                              key={`${event.status}-${event.at}-${i}`}
                              className="flex flex-wrap items-baseline gap-x-2 text-[11px]"
                            >
                              <span className="text-(--color-ink-muted)">
                                {t(STATUS_LABEL[event.status])}
                              </span>
                              <span className="font-mono text-(--color-ink-faint)">
                                {timestamp(event.at, lang)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-1 text-[12px] text-(--color-ink-muted)">
          <span>
            {t("ledger.showingRange", {
              from: String((safePage - 1) * pageSize + 1),
              to: String(Math.min(safePage * pageSize, rows.length)),
              total: String(rows.length),
            })}
          </span>

          {pageCount > 1 && (
            <span className="flex items-center gap-1">
              <button
                onClick={() => setPage(safePage - 1)}
                disabled={safePage <= 1}
                aria-label={t("ledger.prevPage")}
                className="rounded-(--radius-xs) p-1 hover:text-(--color-primary) disabled:opacity-30"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="font-mono">
                {safePage} / {pageCount}
              </span>
              <button
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= pageCount}
                aria-label={t("ledger.nextPage")}
                className="rounded-(--radius-xs) p-1 hover:text-(--color-primary) disabled:opacity-30"
              >
                <ChevronRight size={15} />
              </button>
            </span>
          )}

          <span className="ml-auto flex items-center gap-1.5">
            {t("ledger.perPage")}
            <Select
              value={String(pageSize)}
              options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
              onChange={(next) => {
                setPageSize(Number(next));
                setPage(1);
              }}
              ariaLabel={t("ledger.perPage")}
              align="end"
              className="border-(--color-hairline) text-(--color-ink-muted)"
            />
          </span>
        </div>
        </>
      )}


      {managingTags && (
        <TagManager
          tags={serviceTags}
          onChange={setServiceTags}
          onClose={() => setManagingTags(false)}
        />
      )}

      {batchOpen && (
        <BatchPanel
          today={today}
          onClose={() => setBatchOpen(false)}
          onAdd={(newRows, status, paidDate) => {
            const at = Date.now();
            // Their sheet already says which part was treated; an import that dropped that
            // column would leave them re-entering by hand what they had written down.
            const { tags, idFor } = resolveImportedTags(
              serviceTags,
              newRows.map((r) => r.service),
            );
            if (tags.length !== serviceTags.length) setServiceTags(tags);

            setVisits((prev) => [
              ...prev,
              ...newRows.map((r) => ({
                id: newVisitId() + Math.random().toString(36).slice(2, 5),
                name: r.name,
                visitDate: r.visitDate,
                status,
                paidDate: status === "paid" ? paidDate : undefined,
                createdAt: at,
                history: [{ status, at }],
                ...(r.service
                  ? { serviceTag: idFor.get(r.service.trim().toLowerCase().replace(/\s+/g, "")) }
                  : {}),
              })),
            ]);
            setBatchOpen(false);
            showToast(t("ledger.addedToast", { count: String(newRows.length) }));
          }}
        />
      )}

      {reconciling && (
        <ReconcilePanel
          visits={visits}
          today={today}
          onClose={() => setReconciling(false)}
          onSettle={(ids, paidDate) => {
            setStatus(ids, "paid", paidDate);
            showToast(t("ledger.settledToast", { count: String(ids.length), date: paidDate }));
          }}
        />
      )}
    </div>
  );
}


/**
 * One visit inside a patient's record.
 *
 * This was briefly a three-dot progress track. It looked like progress and cost four lines a
 * visit to say what three labelled dates say in one — and a half-drawn connector between a
 * skipped step and a completed one read as a bug rather than as information. The status chip
 * already states where the visit is; these dates only have to state when each step happened.
 */
/** A column header you can sort by. The arrow only appears on the column doing the sorting. */
function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className="sticky top-0 z-10 bg-(--color-canvas-soft) px-3 py-2 text-left"
    >
      <button
        onClick={onClick}
        className={[
          "flex items-center gap-1 text-[12px] font-medium whitespace-nowrap",
          active ? "text-(--color-primary)" : "text-(--color-ink-muted) hover:text-(--color-ink)",
        ].join(" ")}
      >
        {label}
        <Arrow size={11} className={active ? "" : "opacity-0 group-hover:opacity-40"} />
      </button>
    </th>
  );
}



/**
 * A month of visits.
 *
 * Which date a cell stands for is the caller's choice, and both readings matter: the visit
 * calendar shows a day where everything around it settled and that one did not, and the payment
 * calendar shows what a single day's remittance actually covered. A cell carries the statuses in
 * it as colour, because that is how the clinic read the sheet it replaced.
 */
function MonthCalendar({
  month,
  today,
  byDay,
  picked,
  onPick,
}: {
  month: string;
  today: string;
  byDay: Map<string, Visit[]>;
  picked: string | null;
  onPick: (day: string) => void;
}) {
  const { t } = useLanguage();
  const days = monthGridDays(month);
  const weekdays: TranslationKey[] = [
    "ledger.sun",
    "ledger.mon",
    "ledger.tue",
    "ledger.wed",
    "ledger.thu",
    "ledger.fri",
    "ledger.sat",
  ];

  return (
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-hairline)">
      <div className="grid grid-cols-7 border-b border-(--color-hairline) bg-(--color-canvas-soft)">
        {weekdays.map((key) => (
          <div
            key={key}
            className="px-1 py-1.5 text-center text-[11px] font-medium text-(--color-ink-muted)"
          >
            {t(key)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = day.startsWith(month);
          const visits = byDay.get(day) ?? [];
          const isToday = day === today;
          const isPicked = day === picked;
          return (
            <button
              key={day}
              onClick={() => onPick(day)}
              disabled={visits.length === 0}
              className={[
                "min-h-[62px] border-r border-b border-(--color-hairline) p-1 text-left align-top last:border-r-0 disabled:cursor-default",
                inMonth ? "" : "opacity-40",
                isPicked ? "bg-(--color-primary)/10" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums",
                  isToday
                    ? "bg-(--color-primary) font-bold text-(--color-on-primary)"
                    : "text-(--color-ink-muted)",
                ].join(" ")}
              >
                {Number(day.slice(8))}
              </span>
              {visits.length > 0 && (
                <span className="mt-0.5 flex flex-wrap gap-0.5">
                  {visits.slice(0, 6).map((visit) => (
                    <span
                      key={visit.id}
                      title={`${visit.name} · ${t(STATUS_LABEL[visit.status])}`}
                      className={[
                        "h-1.5 w-1.5 rounded-full border",
                        STATUS_TONE[visit.status],
                      ].join(" ")}
                    />
                  ))}
                </span>
              )}
              {visits.length > 0 && (
                <span className="mt-0.5 block truncate text-[10px] text-(--color-ink-faint)">
                  {visits.length === 1 ? visits[0].name : t("ledger.dayCount", { count: String(visits.length) })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  groups,
  mode,
  lang,
}: {
  groups: ReturnType<typeof groupByVisitDate>;
  mode: "paid" | "visit";
  lang: "zh" | "en";
}) {
  const { t } = useLanguage();
  if (groups.length === 0) {
    return (
      <p className="rounded-(--radius-lg) border border-dashed border-(--color-hairline) py-10 text-center text-[14px] text-(--color-ink-faint)">
        {t(mode === "paid" ? "ledger.noPayments" : "ledger.noVisits")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group) => (
        <li
          key={group.date}
          className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) px-4 py-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-medium text-(--color-ink)">
              {formatDisplayDate(group.date, lang)}
            </span>
            {mode === "paid" ? (
              <span className="text-[14px] font-bold tabular-nums text-(--color-primary)">
                {t("ledger.paidCount", { count: String(group.paid) })}
              </span>
            ) : (
              <span
                className={[
                  "flex items-center gap-1.5 text-[13px] tabular-nums",
                  group.outstanding > 0 ? "font-medium text-(--color-warn)" : "text-(--color-ink-muted)",
                ].join(" ")}
              >
                {group.outstanding > 0 && <AlertTriangle size={13} />}
                {t("ledger.dayBreakdown", {
                  total: String(group.total),
                  paid: String(group.paid),
                  outstanding: String(group.outstanding),
                })}
              </span>
            )}
          </div>
          {mode === "paid" && group.visits.length > 0 && (
            <p className="mt-0.5 text-[12px] text-(--color-ink-muted)">
              {t("ledger.covers", {
                from: [...group.visits].sort((a, b) => a.visitDate.localeCompare(b.visitDate))[0].visitDate,
                to: [...group.visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate))[0].visitDate,
              })}
            </p>
          )}
          <p className="mt-1 text-[12px] text-(--color-ink-faint)">
            {mode === "paid"
              ? group.visits.map((v) => `${v.name}（${v.visitDate}）`).join(" · ")
              : group.visits.map((v) => v.name).join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The service-part options, edited the way Notion edits a select.
 *
 * Visits store the option's id, so renaming one here changes every visit already tagged with
 * it — which is the point: the clinic wanted to "把里面的字自己改了就行". Deleting an option
 * leaves those visits untagged rather than silently rewriting them to something else.
 */
function TagManager({
  tags,
  onChange,
  onClose,
}: {
  tags: ServiceTag[];
  onChange: (tags: ServiceTag[]) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState("");

  function rename(id: string, label: string) {
    onChange(tags.map((tag) => (tag.id === id ? { ...tag, label } : tag)));
  }

  function remove(id: string) {
    onChange(tags.filter((tag) => tag.id !== id));
  }

  function add() {
    const label = draft.trim();
    if (!label) return;
    onChange([...tags, { id: newTagId(), label, color: tags.length % TAG_COLORS.length }]);
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div className="w-full max-w-sm rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-3)">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold text-(--color-ink)">{t("ledger.tagsTitle")}</h2>
            <p className="mt-0.5 text-[12px] text-(--color-ink-muted)">{t("ledger.tagsHelp")}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="flex flex-col gap-1.5">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-2">
              <span
                className={[
                  "h-3 w-3 shrink-0 rounded-full border",
                  TAG_COLORS[tag.color % TAG_COLORS.length],
                ].join(" ")}
              />
              <input
                value={tag.label}
                onChange={(e) => rename(tag.id, e.target.value)}
                aria-label={t("ledger.tagName")}
                className="min-w-0 flex-1 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1 text-[14px] text-(--color-ink) outline-none focus:border-(--color-primary)"
              />
              <button
                onClick={() => remove(tag.id)}
                aria-label={t("common.delete")}
                className="shrink-0 rounded-(--radius-xs) p-1 text-(--color-ink-faint) hover:text-(--color-danger)"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("ledger.tagNew")}
            className="min-w-0 flex-1 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="shrink-0 rounded-(--radius-sm) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) disabled:opacity-40"
          >
            {t("ledger.tagAdd")}
          </button>
        </form>
      </div>
    </div>
  );
}

function BatchPanel({
  today,
  onClose,
  onAdd,
}: {
  today: string;
  onClose: () => void;
  onAdd: (rows: ParsedVisitRow[], status: VisitStatus, paidDate: string) => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [visitDate, setVisitDate] = useState(today);
  const [status, setStatus] = useState<VisitStatus>("new");
  // Never derived from the visit date: the batch's status says money arrived, not when.
  const [paidDate, setPaidDate] = useState(today);
  const preview = useMemo(() => parseVisitRows(text, visitDate), [text, visitDate]);
  const undated = preview.filter((row) => row.usedFallbackDate).length;
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  /** The other clinic's own .xlsx, read as-is — retyping it is the step this page removes. */
  async function pickSheet(file: File) {
    setReading(true);
    setReadError(null);
    try {
      const sheet = await readSheetFile(file);
      if (!sheet.text.trim()) {
        setReadError(t("ledger.sheetEmpty"));
        return;
      }
      setText((prev) => (prev.trim() ? prev + "\n" + sheet.text : sheet.text));
    } catch {
      setReadError(t("ledger.sheetFailed"));
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-3) sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-(--color-ink)">{t("ledger.addTitle")}</h2>
            <p className="mt-1 text-[13px] text-(--color-ink-muted)">{t("ledger.addHelp")}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={18} />
          </button>
        </div>

        <label className="mb-2 flex cursor-pointer items-center justify-center gap-2 rounded-(--radius-sm) border border-dashed border-(--color-primary)/50 px-3 py-3 text-[13px] font-medium text-(--color-primary) hover:bg-(--color-primary)/[0.04]">
          <Upload size={14} />
          {reading ? t("ledger.sheetReading") : t("ledger.pickSheet")}
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickSheet(file);
              e.target.value = "";
            }}
          />
        </label>
        {readError && (
          <p className="mb-2 flex items-start gap-1 text-[12px] text-(--color-warn)">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {readError}
          </p>
        )}

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("ledger.addPlaceholder")}
          rows={6}
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
        />

        {/* Show what was understood, because a paste is not a form: column order varies. */}
        {preview.length > 0 && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-(--radius-xs) border border-(--color-hairline)">
            <table className="w-full text-left">
              <tbody>
                {preview.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className="border-b border-(--color-hairline) last:border-0">
                    <td className="px-2.5 py-1 text-[13px] text-(--color-ink)">{row.name}</td>
                    <td className="px-2.5 py-1 text-[12px] text-(--color-ink-muted)">
                      {row.service ?? ""}
                    </td>
                    <td className="px-2.5 py-1 text-right text-[12px] tabular-nums">
                      <span
                        className={
                          row.usedFallbackDate ? "text-(--color-warn)" : "text-(--color-ink-muted)"
                        }
                      >
                        {row.visitDate}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {undated > 0 && (
          <p className="mt-1 text-[11px] text-(--color-warn)">
            {t("ledger.undatedRows", { count: String(undated) })}
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("ledger.visitDate")}
            </span>
            <DatePicker
              value={visitDate}
              onChange={setVisitDate}
              ariaLabel={t("ledger.visitDate")}
              className="w-full border-(--color-hairline)! bg-(--color-canvas) px-2 py-1.5 text-[14px] text-(--color-ink)"
            />
            <span className="mt-0.5 block text-[11px] text-(--color-ink-faint)">
              {t("ledger.yearHint")}
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("ledger.importAs")}
            </span>
            <Select
              value={status}
              options={statusOptions(t)}
              onChange={(next) => setStatus(next as VisitStatus)}
              ariaLabel={t("ledger.importAs")}
              className={["w-full justify-between", STATUS_TONE[status]].join(" ")}
            />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-(--color-ink-faint)">{t("ledger.importAsHint")}</p>

        {status === "paid" && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("ledger.paidDate")}
            </span>
            <DatePicker
              value={paidDate}
              onChange={setPaidDate}
              ariaLabel={t("ledger.paidDate")}
              className="w-full border-(--color-hairline)! bg-(--color-canvas) px-2 py-1.5 text-[14px] text-(--color-ink) sm:w-1/2"
            />
            <span className="mt-0.5 block text-[11px] text-(--color-ink-faint)">
              {t("ledger.importPaidDateHint")}
            </span>
          </label>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[13px] text-(--color-ink-muted)">
            {t("ledger.willAdd", { count: String(preview.length) })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-(--radius-sm) px-3 py-2 text-[14px] text-(--color-ink-muted) hover:text-(--color-ink)"
            >
              {t("common.cancel")}
            </button>
            <button
              disabled={preview.length === 0}
              onClick={() => onAdd(preview, status, paidDate)}
              className="rounded-(--radius-sm) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-(--color-on-primary) disabled:opacity-40"
            >
              {t("ledger.addConfirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReconcilePanel({
  visits,
  today,
  onClose,
  onSettle,
}: {
  visits: Visit[];
  today: string;
  onClose: () => void;
  onSettle: (ids: string[], paidDate: string) => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [paidDate, setPaidDate] = useState(today);
  const [chosen, setChosen] = useState<string[]>([]);
  const result = useMemo(() => (text.trim() ? matchRemittance(visits, text) : null), [visits, text]);
  const openCount = visits.filter(isOpen).length;
  const total = (result?.matched.length ?? 0) + chosen.length;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-3) sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-(--color-ink)">{t("ledger.reconcileTitle")}</h2>
            <p className="mt-1 text-[13px] text-(--color-ink-muted)">
              {t("ledger.reconcileHelp", { count: String(openCount) })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={18} />
          </button>
        </div>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("ledger.reconcilePlaceholder")}
          rows={6}
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2 font-mono text-[12px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
        />

        {result && (
          <div className="mt-4 flex flex-col gap-4">
            <section>
              <h3 className="mb-1.5 text-[13px] font-semibold text-(--color-ink)">
                {t("ledger.matched", { count: String(result.matched.length) })}
              </h3>
              {result.matched.length === 0 ? (
                <p className="text-[12px] text-(--color-ink-faint)">{t("ledger.matchedNone")}</p>
              ) : (
                <ul className="max-h-40 overflow-y-auto rounded-(--radius-md) border border-(--color-hairline)">
                  {result.matched.map(({ visit, datesOnRemittance }) => (
                    <li
                      key={visit.id}
                      className="border-b border-(--color-hairline) px-3 py-1.5 text-[13px] last:border-0"
                    >
                      <span className="flex justify-between gap-3">
                        <span className="truncate text-(--color-ink)">{visit.name}</span>
                        <span className="shrink-0 text-(--color-ink-faint)">{visit.visitDate}</span>
                      </span>
                      {datesOnRemittance && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-(--color-warn)">
                          <AlertTriangle size={11} className="shrink-0" />
                          {t("ledger.dateMismatch", { dates: datesOnRemittance.join(" · ") })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {result.ambiguous.length > 0 && (
              <section>
                <h3 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-(--color-warn)">
                  <AlertTriangle size={14} />
                  {t("ledger.ambiguous", { count: String(result.ambiguous.length) })}
                </h3>
                <p className="mb-1.5 text-[12px] text-(--color-ink-faint)">{t("ledger.ambiguousHint")}</p>
                <ul className="tone tone-warn flex flex-col gap-2 rounded-(--radius-md) border p-2.5">
                  {result.ambiguous.map((group) => (
                    <li key={group.name}>
                      <p className="text-[13px] font-medium text-(--color-warn)">
                        {group.name} · {t("ledger.ambiguousLines", { lines: String(group.lines) })}
                      </p>
                      {group.datesOnRemittance.length > 0 && (
                        <p className="text-[11px] text-(--color-warn)">
                          {t("ledger.remittanceSays", { dates: group.datesOnRemittance.join(" · ") })}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {group.visits.map((visit) => (
                          <button
                            key={visit.id}
                            onClick={() =>
                              setChosen((prev) =>
                                prev.includes(visit.id)
                                  ? prev.filter((id) => id !== visit.id)
                                  : [...prev, visit.id],
                              )
                            }
                            className={[
                              "rounded-(--radius-sm) border px-2 py-1 text-[12px] transition-colors",
                              chosen.includes(visit.id)
                                ? "tone tone-paid font-medium"
                                : "border-(--color-warn)/40 text-(--color-warn) hover:border-(--color-primary)",
                            ].join(" ")}
                          >
                            {visit.visitDate}
                            {chosen.includes(visit.id) ? " ✓" : ""}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-[12px] text-(--color-ink-faint)">
              {t("ledger.notReturned", { count: String(result.notReturned.length) })} ·{" "}
              {t("ledger.notReturnedHint")}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--color-hairline) pt-3">
              <label className="flex items-center gap-2 text-[13px] text-(--color-ink-muted)">
                {t("ledger.paidDate")}
                <DatePicker
                  value={paidDate}
                  onChange={setPaidDate}
                  ariaLabel={t("ledger.paidDate")}
                  className="border-(--color-hairline)! bg-(--color-canvas) px-2 py-1 text-[13px] text-(--color-ink)"
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-(--radius-sm) px-3 py-2 text-[14px] text-(--color-ink-muted) hover:text-(--color-ink)"
                >
                  {t("common.cancel")}
                </button>
                <button
                  disabled={total === 0}
                  onClick={() => {
                    onSettle([...result.matched.map((m) => m.visit.id), ...chosen], paidDate);
                    onClose();
                  }}
                  className="rounded-(--radius-sm) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-(--color-on-primary) disabled:opacity-40"
                >
                  {t("ledger.settle", { count: String(total) })}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
