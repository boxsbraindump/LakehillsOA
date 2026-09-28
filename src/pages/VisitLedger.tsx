import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ListChecks,
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
  activityOn,
  bucketByDate,
  groupByPaidDate,
  groupByPatient,
  groupByVisitDate,
  isOpen,
  matchRemittance,
  matchesQuery,
  operationDates,
  newVisitId,
  parseVisitRows,
  visitHistory,
  withStatus,
} from "../lib/visitLedger";
import type {
  DateLens,
  ParsedVisitRow,
  PatientRecord,
  Visit,
  VisitStatus,
} from "../lib/visitLedger";
import { readSheetFile } from "../lib/sheetImport";
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
  new: "border-(--color-hairline) bg-(--color-surface) text-(--color-ink-muted)",
  entered: "border-sky-300 bg-sky-50 text-sky-800",
  submitted: "border-amber-300 bg-amber-50 text-amber-800",
  paid: "border-emerald-300 bg-emerald-50 text-emerald-800",
  denied: "border-rose-300 bg-rose-50 text-rose-800",
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
export default function VisitLedger() {
  const { t, lang } = useLanguage();
  const { showToast } = useToast();
  const today = todayKey();

  const [visits, setVisits] = useSyncedStorage<Visit[]>(STORAGE_KEY, []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailName, setDetailName] = useState<string | null>(null);
  const [quickName, setQuickName] = useState("");
  // The date sticks between adds: a batch is one day's bookings typed straight through.
  const [quickDate, setQuickDate] = useState(today);
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

  const rows = useMemo(
    () =>
      visits
        .filter((v) => matchesQuery(v, query))
        .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || a.name.localeCompare(b.name)),
    [visits, query],
  );

  const patients = useMemo(() => groupByPatient(visits), [visits]);
  const log = useMemo(() => activityLog(visits), [visits]);
  const todayWork = useMemo(() => activityOn(visits, today), [visits, today]);
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
  const detail = detailName ? patients.find((p) => p.name === detailName) ?? null : null;

  const thisWeek = useMemo(() => {
    const from = shiftDateKey(today, -6);
    return visits.filter(
      (v) => v.status === "paid" && v.paidDate && v.paidDate >= from && v.paidDate <= today,
    ).length;
  }, [visits, today]);

  const selectedSet = new Set(selected);
  const allShownSelected = rows.length > 0 && rows.every((v) => selectedSet.has(v.id));

  function quickAdd() {
    const name = quickName.trim();
    if (!name) return;
    const at = Date.now();
    setVisits((prev) => [
      ...prev,
      {
        id: newVisitId() + Math.random().toString(36).slice(2, 5),
        name,
        visitDate: quickDate,
        status: "new",
        createdAt: at,
        history: [{ status: "new", at }],
      },
    ]);
    setQuickName("");
  }

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

  function remove(ids: string[]) {
    const idSet = new Set(ids);
    const removed = visits.filter((v) => idSet.has(v.id));
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

      {view === "table" && todayWork && (
        <button
          onClick={() => setView("log")}
          className="mt-3 flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-(--radius-md) border border-(--color-primary)/25 bg-(--color-primary)/[0.05] px-3 py-2 text-left"
        >
          <span className="text-[13px] font-medium text-(--color-ink)">
            {t("ledger.todayLabel")}
          </span>
          {VISIT_STATUSES.filter(
            (status) => status !== "new" && todayWork.counts[status] > 0,
          ).map((status) => (
            <span
              key={status}
              className={[
                "rounded-full border px-2 py-0.5 text-[12px] font-medium",
                STATUS_TONE[status],
              ].join(" ")}
            >
              {t(STATUS_LABEL[status])} {todayWork.counts[status]}
            </span>
          ))}
          {todayWork.total === 0 && (
            <span className="text-[13px] text-(--color-ink-muted)">{t("ledger.todayNothing")}</span>
          )}
          <span className="ml-auto text-[12px] text-(--color-ink-muted)">
            {t("ledger.viewLog")} →
          </span>
        </button>
      )}

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
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ledger.searchPlaceholder")}
            className="w-full rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) py-2 pr-3 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
          />
        </div>
        <button
          onClick={() => setBatchOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-(--radius-sm) border border-(--color-hairline) px-3 py-2 text-[13px] text-(--color-ink-muted) hover:text-(--color-primary)"
        >
          <Plus size={13} />
          {t("ledger.addMany")}
        </button>
        <button
          onClick={() => setReconciling(true)}
          className="flex shrink-0 items-center gap-1 rounded-(--radius-sm) border border-(--color-primary)/40 px-3 py-2 text-[13px] font-medium text-(--color-primary)"
        >
          <Scale size={13} />
          {t("ledger.reconcileShort")}
        </button>

      </div>

      {view === "table" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            quickAdd();
          }}
          className="mt-2 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2"
        >
          <input
            type="date"
            value={quickDate}
            onChange={(e) => setQuickDate(e.target.value)}
            aria-label={t("ledger.visitDate")}
            className="shrink-0 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[13px] text-(--color-ink) outline-none focus:border-(--color-primary)"
          />
          <input
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder={t("ledger.quickAddPlaceholder")}
            className="min-w-0 flex-1 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
          />
          <button
            type="submit"
            disabled={!quickName.trim()}
            className="shrink-0 rounded-(--radius-sm) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) disabled:opacity-40"
          >
            {t("ledger.quickAdd")}
          </button>
        </form>
      )}

      {/* The weekly batch lives here: select rows, say what happened to them. */}
      {selected.length > 0 && view === "table" && (
        <div className="sticky top-2 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--color-primary)/40 bg-(--color-primary)/[0.07] px-3 py-2 backdrop-blur">
          <span className="text-[13px] font-medium text-(--color-ink)">
            {t("ledger.selectedCount", { count: String(selected.length) })}
          </span>
          <label className="flex items-center gap-1 text-[12px] text-(--color-ink-muted)">
            {t("ledger.onDate")}
            <input
              type="date"
              value={batchDate}
              onChange={(e) => setBatchDate(e.target.value)}
              className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-1.5 py-1 text-[12px] text-(--color-ink) outline-none focus:border-(--color-primary)"
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
            className="ml-auto flex items-center gap-1 text-[12px] text-rose-700"
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
        </div>
      ) : view === "log" ? (
        <div className="mt-4">
        <div className="mt-4 overflow-hidden rounded-(--radius-lg) border border-(--color-hairline)">
          <p className="border-b border-(--color-hairline) bg-(--color-surface) px-4 py-2 text-[12px] font-semibold text-(--color-ink-muted)">
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
                  <li key={day.date} className={day.date === today ? "bg-(--color-primary)/[0.05]" : ""}>
                    <button
                      onClick={() => setOpenDay(open ? null : day.date)}
                      className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-left"
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
              <span className="min-w-[7ch] text-center text-[14px] font-medium text-(--color-ink) tabular-nums">
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
        <div className="mt-3 overflow-x-auto rounded-(--radius-lg) border border-(--color-hairline)">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-(--color-hairline) bg-(--color-surface)">
                <th className="w-9 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={() => setSelected(allShownSelected ? [] : rows.map((v) => v.id))}
                    aria-label={t("ledger.selectAll")}
                    className="align-middle"
                  />
                </th>
                <th className="px-3 py-2 text-[12px] font-medium text-(--color-ink-muted)">
                  {t("ledger.colPatient")}
                </th>
                <th className="px-3 py-2 text-[12px] font-medium text-(--color-ink-muted)">
                  {t("ledger.colVisitDate")}
                </th>
                <th className="px-3 py-2 text-[12px] font-medium text-(--color-ink-muted)">
                  <button
                    onClick={() => setManagingTags(true)}
                    className="flex items-center gap-1 hover:text-(--color-primary)"
                  >
                    {t("ledger.colService")}
                    <Tag size={11} />
                  </button>
                </th>
                <th className="px-3 py-2 text-[12px] font-medium text-(--color-ink-muted)">
                  {t("ledger.colStatus")}
                </th>
                <th className="px-3 py-2 text-[12px] font-medium whitespace-nowrap text-(--color-ink-muted)">
                  {t("ledger.colEnteredDate")}
                </th>
                <th className="px-3 py-2 text-[12px] font-medium whitespace-nowrap text-(--color-ink-muted)">
                  {t("ledger.colSubmittedDate")}
                </th>
                <th className="px-3 py-2 text-[12px] font-medium whitespace-nowrap text-(--color-ink-muted)">
                  {t("ledger.colPaidDate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((visit) => (
                <tr
                  key={visit.id}
                  className={[
                    "border-b border-(--color-hairline) last:border-0",
                    selectedSet.has(visit.id) ? "bg-(--color-primary)/[0.06]" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(visit.id)}
                      onChange={() => toggle(visit.id)}
                      aria-label={visit.name}
                      className="align-middle"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setDetailName(visit.name)}
                      className="max-w-[16ch] truncate text-[14px] font-medium text-(--color-ink) underline-offset-2 hover:text-(--color-primary) hover:underline sm:max-w-none"
                    >
                      {visit.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={visit.visitDate}
                      onChange={(e) => setVisitDate(visit, e.target.value)}
                      aria-label={t("ledger.colVisitDate")}
                      className="rounded-(--radius-xs) border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-(--color-ink-muted) tabular-nums outline-none hover:border-(--color-hairline) focus:border-(--color-primary)"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={visit.serviceTag ?? ""}
                      onChange={(e) => {
                        if (e.target.value === "__manage") setManagingTags(true);
                        else setServiceTag(visit, e.target.value);
                      }}
                      aria-label={t("ledger.colService")}
                      className={[
                        "cursor-pointer rounded-full border px-2 py-1 text-[12px] outline-none",
                        tagById(serviceTags, visit.serviceTag)
                          ? TAG_COLORS[tagById(serviceTags, visit.serviceTag)!.color % TAG_COLORS.length]
                          : "border-(--color-hairline) bg-(--color-surface) text-(--color-ink-faint)",
                      ].join(" ")}
                    >
                      <option value="">{t("ledger.noService")}</option>
                      {serviceTags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.label}
                        </option>
                      ))}
                      <option value="__manage">{t("ledger.manageTags")}</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {/* A status is a cell you change, not a stage you graduate from. */}
                    <select
                      value={visit.status}
                      onChange={(e) => setStatusWithUndo([visit.id], e.target.value as VisitStatus)}
                      aria-label={t("ledger.colStatus")}
                      className={[
                        "cursor-pointer rounded-full border px-2 py-1 text-[12px] font-medium outline-none",
                        STATUS_TONE[visit.status],
                      ].join(" ")}
                    >
                      {VISIT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(STATUS_LABEL[status])}
                        </option>
                      ))}
                    </select>
                  </td>
                  {/* Each step's own day, correctable — the week's work is not always ticked
                      off on the day it happened. */}
                  {(
                    [
                      ["enteredDate", "ledger.colEnteredDate"],
                      ["submittedDate", "ledger.colSubmittedDate"],
                      ["paidDate", "ledger.colPaidDate"],
                    ] as const
                  ).map(([field, label]) => {
                    const dates = operationDates(visit);
                    const value =
                      field === "enteredDate"
                        ? dates.entered
                        : field === "submittedDate"
                          ? dates.submitted
                          : dates.paid;
                    return (
                      <td key={field} className="px-3 py-2">
                        {value ? (
                          <input
                            type="date"
                            value={value}
                            onChange={(e) => setStepDate(visit, field, e.target.value)}
                            aria-label={t(label)}
                            className="rounded-(--radius-xs) border border-transparent bg-transparent px-1 py-1 text-[12px] text-(--color-ink-muted) tabular-nums outline-none hover:border-(--color-hairline) focus:border-(--color-primary)"
                          />
                        ) : (
                          <span className="pl-1 text-[13px] text-(--color-ink-faint)">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <PatientPanel
          record={detail}
          lang={lang}
          onClose={() => setDetailName(null)}
          onSetStatus={(id, status) => setStatusWithUndo([id], status)}
          onSetVisitDate={(id, date) => {
            const visit = visits.find((v) => v.id === id);
            if (visit) setVisitDate(visit, date);
          }}
          onRemove={(id) => remove([id])}
        />
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
 * One patient's whole record — the thing a spreadsheet of coloured cells could never show,
 * because a colour is overwritten by the next colour. Every visit keeps its trail.
 */
function PatientPanel({
  record,
  lang,
  onClose,
  onSetStatus,
  onSetVisitDate,
  onRemove,
}: {
  record: PatientRecord;
  lang: "zh" | "en";
  onClose: () => void;
  onSetStatus: (id: string, status: VisitStatus) => void;
  onSetVisitDate: (id: string, visitDate: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) shadow-lg">
        <div className="flex items-start gap-3 border-b border-(--color-hairline) px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-bold text-(--color-ink)">{record.name}</h2>
            <p className="mt-0.5 text-[13px] text-(--color-ink-muted)">
              {t("ledger.patientSummary", {
                total: String(record.total),
                paid: String(record.paid),
                open: String(record.open),
              })}
            </p>
            <p className="mt-0.5 text-[12px] text-(--color-ink-faint)">
              {t("ledger.patientSpan", {
                from: formatDisplayDate(record.firstVisit, lang),
                to: formatDisplayDate(record.lastVisit, lang),
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.cancel")}
            className="shrink-0 rounded-(--radius-xs) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={16} />
          </button>
        </div>

        <ul className="flex flex-col divide-y divide-(--color-hairline)">
          {record.visits.map((visit) => (
            <li key={visit.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={visit.visitDate}
                  onChange={(e) => onSetVisitDate(visit.id, e.target.value)}
                  aria-label={t("ledger.colVisitDate")}
                  className="rounded-(--radius-xs) border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-medium text-(--color-ink) tabular-nums outline-none hover:border-(--color-hairline) focus:border-(--color-primary)"
                />
                <select
                  value={visit.status}
                  onChange={(e) => onSetStatus(visit.id, e.target.value as VisitStatus)}
                  aria-label={t("ledger.colStatus")}
                  className={[
                    "cursor-pointer rounded-full border px-2 py-0.5 text-[12px] font-medium outline-none",
                    STATUS_TONE[visit.status],
                  ].join(" ")}
                >
                  {VISIT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(STATUS_LABEL[status])}
                    </option>
                  ))}
                </select>
                {visit.paidDate && (
                  <span className="text-[12px] text-emerald-700 tabular-nums">
                    {t("ledger.paidOn", { date: formatDisplayDate(visit.paidDate, lang) })}
                  </span>
                )}
                <button
                  onClick={() => onRemove(visit.id)}
                  aria-label={t("common.delete")}
                  className="ml-auto shrink-0 text-(--color-ink-faint) hover:text-rose-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* When each thing was done. The sheet had nowhere to put this. */}
              <ol className="mt-1.5 flex flex-col gap-0.5 border-l-2 border-(--color-hairline) pl-3">
                {visitHistory(visit).map((event, i) => (
                  <li
                    key={`${event.status}-${event.at}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-[12px]"
                  >
                    <span className="text-(--color-ink-muted)">{t(STATUS_LABEL[event.status])}</span>
                    <span className="text-(--color-ink-faint) tabular-nums">
                      {timestamp(event.at, lang)}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </div>
    </div>
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
      <div className="grid grid-cols-7 border-b border-(--color-hairline) bg-(--color-surface)">
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
                  group.outstanding > 0 ? "font-medium text-amber-700" : "text-(--color-ink-muted)",
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
                className="shrink-0 rounded-(--radius-xs) p-1 text-(--color-ink-faint) hover:text-rose-600"
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
          <p className="mb-2 flex items-start gap-1 text-[12px] text-amber-700">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {readError}
          </p>
        )}

        <textarea
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
                          row.usedFallbackDate ? "text-amber-700" : "text-(--color-ink-muted)"
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
          <p className="mt-1 text-[11px] text-amber-700">
            {t("ledger.undatedRows", { count: String(undated) })}
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("ledger.visitDate")}
            </span>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[14px] text-(--color-ink) outline-none focus:border-(--color-primary)"
            />
            <span className="mt-0.5 block text-[11px] text-(--color-ink-faint)">
              {t("ledger.yearHint")}
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("ledger.importAs")}
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as VisitStatus)}
              className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[14px] text-(--color-ink) outline-none focus:border-(--color-primary)"
            >
              {VISIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_LABEL[s])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1 text-[11px] text-(--color-ink-faint)">{t("ledger.importAsHint")}</p>

        {status === "paid" && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              {t("ledger.paidDate")}
            </span>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[14px] text-(--color-ink) outline-none focus:border-(--color-primary) sm:w-1/2"
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
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
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
                <h3 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-amber-800">
                  <AlertTriangle size={14} />
                  {t("ledger.ambiguous", { count: String(result.ambiguous.length) })}
                </h3>
                <p className="mb-1.5 text-[12px] text-(--color-ink-faint)">{t("ledger.ambiguousHint")}</p>
                <ul className="flex flex-col gap-2 rounded-(--radius-md) bg-amber-50 p-2.5">
                  {result.ambiguous.map((group) => (
                    <li key={group.name}>
                      <p className="text-[13px] font-medium text-amber-900">
                        {group.name} · {t("ledger.ambiguousLines", { lines: String(group.lines) })}
                      </p>
                      {group.datesOnRemittance.length > 0 && (
                        <p className="text-[11px] text-amber-800">
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
                                ? "border-green-600 bg-green-50 font-medium text-green-800"
                                : "border-amber-300 text-amber-900 hover:border-green-500",
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
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1 text-[13px] text-(--color-ink) outline-none focus:border-(--color-primary)"
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
