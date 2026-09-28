import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Coins,
  List,
  Plus,
  Scale,
  Trash2,
  X,
} from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "../components/LanguageProvider";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { todayKey, formatDisplayDate } from "../lib/date";
import {
  CHASE_AFTER_DAYS,
  VISIT_STATUSES,
  groupByPaidDate,
  groupByVisitDate,
  isOpen,
  isStale,
  matchRemittance,
  newVisitId,
  parseNameList,
} from "../lib/visitLedger";
import type { Visit, VisitStatus } from "../lib/visitLedger";
import type { TranslationKey } from "../lib/translations";

const STORAGE_KEY = "lh-visit-ledger";

const STATUS_LABEL: Record<VisitStatus, TranslationKey> = {
  new: "ledger.statusNew",
  entered: "ledger.statusEntered",
  submitted: "ledger.statusSubmitted",
  paid: "ledger.statusPaid",
  denied: "ledger.statusDenied",
};

/** The spreadsheet's own colours, so the state of a row reads the same as it always did. */
const STATUS_DOT: Record<VisitStatus, string> = {
  new: "bg-(--color-ink-faint)/30",
  entered: "bg-red-500",
  submitted: "bg-amber-400",
  paid: "bg-green-500",
  denied: "bg-red-500 ring-2 ring-red-200",
};

type View = "list" | "byPaid" | "byVisit";

export default function VisitLedger() {
  const { t, lang } = useLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const today = todayKey();

  const [visits, setVisits] = useSyncedStorage<Visit[]>(STORAGE_KEY, []);
  const [view, setView] = useState<View>("list");
  const [statusFilter, setStatusFilter] = useState<VisitStatus | "all" | "open">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [quickName, setQuickName] = useState("");
  // The date sticks between adds: a batch is usually one day's bookings, typed one after
  // another, and re-picking the date every time would be the slow part.
  const [quickDate, setQuickDate] = useState(today);
  const [reconciling, setReconciling] = useState(false);

  const sorted = useMemo(
    () => [...visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate) || a.name.localeCompare(b.name)),
    [visits],
  );
  const shown = useMemo(() => {
    if (statusFilter === "all") return sorted;
    if (statusFilter === "open") return sorted.filter(isOpen);
    return sorted.filter((visit) => visit.status === statusFilter);
  }, [sorted, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: visits.length, open: visits.filter(isOpen).length };
    for (const status of VISIT_STATUSES) map[status] = visits.filter((v) => v.status === status).length;
    return map;
  }, [visits]);

  function quickAdd() {
    const name = quickName.trim();
    if (!name) return;
    setVisits((prev) => [
      ...prev,
      { id: newVisitId(), name, visitDate: quickDate, status: "new", createdAt: Date.now() },
    ]);
    setQuickName("");
  }

  function patch(ids: string[], changes: Partial<Visit>) {
    const idSet = new Set(ids);
    setVisits((prev) => prev.map((visit) => (idSet.has(visit.id) ? { ...visit, ...changes } : visit)));
  }

  function setStatus(ids: string[], status: VisitStatus) {
    // Paid is the only status that records a date, and clearing it again must not leave a
    // stale one behind or the payroll view would count it twice.
    patch(ids, status === "paid" ? { status, paidDate: today } : { status, paidDate: undefined });
  }

  async function removeVisits(ids: string[]) {
    const removed = visits.filter((visit) => ids.includes(visit.id));
    if (!(await confirm({ message: t("ledger.deleteConfirm", { count: String(ids.length) }) }))) return;
    setVisits((prev) => prev.filter((visit) => !ids.includes(visit.id)));
    setSelected([]);
    showToast(t("ledger.deletedToast", { count: String(removed.length) }), {
      label: t("common.undo"),
      onClick: () => setVisits((prev) => [...prev, ...removed]),
    });
  }

  const selectedShown = shown.filter((visit) => selected.includes(visit.id));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
            {t("ledger.title")}
          </h1>
          <p className="mt-1 text-[15px] text-(--color-ink-muted)">{t("ledger.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setReconciling(true)}
            className="flex items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) px-3 py-2 text-[14px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
          >
            <Scale size={15} />
            {t("ledger.reconcile")}
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-(--radius-md) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-(--color-on-primary)"
          >
            <Plus size={15} />
            {t("ledger.add")}
          </button>
        </div>
      </div>

      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
        {([
          ["list", List, "ledger.viewList"],
          ["byPaid", Coins, "ledger.viewByPaid"],
          ["byVisit", CalendarDays, "ledger.viewByVisit"],
        ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={[
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
              view === key
                ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                : "border-(--color-hairline) text-(--color-ink-muted) hover:border-(--color-primary)/40 hover:text-(--color-primary)",
            ].join(" ")}
          >
            <Icon size={13} />
            {t(label)}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
        className="mb-4 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2"
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

      {visits.length === 0 ? (
        <div className="rounded-(--radius-lg) border border-dashed border-(--color-hairline) px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-(--color-ink)">{t("ledger.emptyTitle")}</p>
          <p className="mt-1 text-[13px] text-(--color-ink-muted)">{t("ledger.emptyBody")}</p>
          <button
            onClick={() => setAdding(true)}
            className="mt-3 text-[13px] font-medium text-(--color-primary)"
          >
            {t("ledger.addMany")}
          </button>
        </div>
      ) : view === "list" ? (
        <>
          <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
            {(["all", "open", ...VISIT_STATUSES] as const).map((key) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={[
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  statusFilter === key
                    ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                    : "border-(--color-hairline) text-(--color-ink-muted) hover:border-(--color-primary)/40",
                ].join(" ")}
              >
                {key !== "all" && key !== "open" && (
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[key]}`} />
                )}
                {t(
                  key === "all" ? "ledger.filterAll" : key === "open" ? "ledger.filterOpen" : STATUS_LABEL[key],
                )}
                <span className="tabular-nums text-(--color-ink-faint)">{counts[key] ?? 0}</span>
              </button>
            ))}
          </div>

          {selectedShown.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas-soft) px-3 py-2">
              <span className="text-[13px] text-(--color-ink-muted)">
                {t("ledger.selectedCount", { count: String(selectedShown.length) })}
              </span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {VISIT_STATUSES.map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setStatus(selectedShown.map((v) => v.id), status);
                      setSelected([]);
                    }}
                    className="flex items-center gap-1 rounded-(--radius-sm) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1 text-[12px] font-medium text-(--color-ink) hover:border-(--color-primary)/40"
                  >
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                    {t(STATUS_LABEL[status])}
                  </button>
                ))}
                <button
                  onClick={() => removeVisits(selectedShown.map((v) => v.id))}
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
                  aria-label={t("common.delete")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={shown.length > 0 && selectedShown.length === shown.length}
              onChange={(e) => setSelected(e.target.checked ? shown.map((v) => v.id) : [])}
              className="size-4 accent-(--color-primary)"
              aria-label={t("ledger.selectAll")}
            />
            <span className="text-[12px] text-(--color-ink-faint)">
              {t("ledger.showing", { count: String(shown.length) })}
            </span>
          </div>

          <ul className="flex flex-col divide-y divide-(--color-hairline) rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas)">
            {shown.map((visit) => (
              <li key={visit.id} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.includes(visit.id)}
                  onChange={() =>
                    setSelected((prev) =>
                      prev.includes(visit.id) ? prev.filter((id) => id !== visit.id) : [...prev, visit.id],
                    )
                  }
                  className="size-4 shrink-0 accent-(--color-primary)"
                  aria-label={visit.name}
                />
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[visit.status]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-(--color-ink)">{visit.name}</span>
                  <span className="block text-[12px] text-(--color-ink-faint)">
                    {visit.visitDate}
                    {visit.paidDate ? ` · ${t("ledger.paidOn", { date: visit.paidDate })}` : ""}
                    {isStale(visit, today) ? ` · ${t("ledger.stale", { days: String(CHASE_AFTER_DAYS) })}` : ""}
                  </span>
                </span>
                <select
                  value={visit.status}
                  onChange={(e) => setStatus([visit.id], e.target.value as VisitStatus)}
                  className="shrink-0 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-1.5 py-1 text-[12px] text-(--color-ink) outline-none focus:border-(--color-primary)"
                >
                  {VISIT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(STATUS_LABEL[status])}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <DayView
          groups={view === "byPaid" ? groupByPaidDate(visits) : groupByVisitDate(visits)}
          mode={view}
          lang={lang}
        />
      )}

      {adding && (
        <AddPanel
          today={today}
          onClose={() => setAdding(false)}
          onAdd={(added) => {
            setVisits((prev) => [...prev, ...added]);
            setAdding(false);
            showToast(t("ledger.addedToast", { count: String(added.length) }));
          }}
        />
      )}

      {reconciling && (
        <ReconcilePanel
          visits={visits}
          today={today}
          onClose={() => setReconciling(false)}
          onSettle={(ids, paidDate) => {
            patch(ids, { status: "paid", paidDate });
            showToast(t("ledger.settledToast", { count: String(ids.length), date: paidDate }));
          }}
        />
      )}
    </div>
  );
}

function DayView({
  groups,
  mode,
  lang,
}: {
  groups: ReturnType<typeof groupByVisitDate>;
  mode: "byPaid" | "byVisit";
  lang: "zh" | "en";
}) {
  const { t } = useLanguage();
  if (groups.length === 0) {
    return (
      <p className="rounded-(--radius-lg) border border-dashed border-(--color-hairline) py-10 text-center text-[14px] text-(--color-ink-faint)">
        {t(mode === "byPaid" ? "ledger.noPayments" : "ledger.noVisits")}
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
            {mode === "byPaid" ? (
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
          <p className="mt-1 truncate text-[12px] text-(--color-ink-faint)">
            {group.visits.map((visit) => visit.name).join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

function AddPanel({
  today,
  onClose,
  onAdd,
}: {
  today: string;
  onClose: () => void;
  onAdd: (visits: Visit[]) => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [visitDate, setVisitDate] = useState(today);
  // Importing the existing sheet loses its colours, so the batch carries a status instead:
  // paste the green rows as paid, the yellow ones as submitted, and so on.
  const [status, setStatus] = useState<VisitStatus>("new");
  // Importing the backlog as paid must not invent a payment date: the old sheet's colour
  // says money arrived, not when. Asked for rather than assumed, or the payment-date view
  // would report days no money actually landed on.
  const [paidDate, setPaidDate] = useState(today);
  const preview = useMemo(() => parseNameList(text, visitDate), [text, visitDate]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-3) sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-(--color-ink)">{t("ledger.addTitle")}</h2>
            <p className="mt-1 text-[13px] text-(--color-ink-muted)">{t("ledger.addHelp")}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.cancel")} className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)">
            <X size={18} />
          </button>
        </div>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("ledger.addPlaceholder")}
          rows={7}
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
        />

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
            <button onClick={onClose} className="rounded-(--radius-sm) px-3 py-2 text-[14px] text-(--color-ink-muted) hover:text-(--color-ink)">
              {t("common.cancel")}
            </button>
            <button
              disabled={preview.length === 0}
              onClick={() =>
                onAdd(
                  preview.map((visit) => ({
                    ...visit,
                    id: newVisitId() + Math.random().toString(36).slice(2, 5),
                    status,
                    paidDate: status === "paid" ? paidDate : undefined,
                  })),
                )
              }
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
          <button onClick={onClose} aria-label={t("common.cancel")} className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)">
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
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-(--color-ink)">
                <CheckCircle2 size={14} className="text-green-600" />
                {t("ledger.matched", { count: String(result.matched.length) })}
              </h3>
              {result.matched.length === 0 ? (
                <p className="text-[12px] text-(--color-ink-faint)">{t("ledger.matchedNone")}</p>
              ) : (
                <ul className="max-h-40 overflow-y-auto rounded-(--radius-md) border border-(--color-hairline)">
                  {result.matched.map(({ visit }) => (
                    <li key={visit.id} className="flex justify-between gap-3 border-b border-(--color-hairline) px-3 py-1.5 text-[13px] last:border-0">
                      <span className="truncate text-(--color-ink)">{visit.name}</span>
                      <span className="shrink-0 text-(--color-ink-faint)">{visit.visitDate}</span>
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
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {group.visits.map((visit) => (
                          <button
                            key={visit.id}
                            onClick={() =>
                              setChosen((prev) =>
                                prev.includes(visit.id) ? prev.filter((id) => id !== visit.id) : [...prev, visit.id],
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

            <section>
              <h3 className="mb-1 text-[13px] font-semibold text-(--color-ink)">
                {t("ledger.notReturned", { count: String(result.notReturned.length) })}
              </h3>
              <p className="text-[12px] text-(--color-ink-faint)">{t("ledger.notReturnedHint")}</p>
            </section>

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
                <button onClick={onClose} className="rounded-(--radius-sm) px-3 py-2 text-[14px] text-(--color-ink-muted) hover:text-(--color-ink)">
                  {t("common.cancel")}
                </button>
                <button
                  disabled={result.matched.length + chosen.length === 0}
                  onClick={() => {
                    onSettle([...result.matched.map((m) => m.visit.id), ...chosen], paidDate);
                    onClose();
                  }}
                  className="rounded-(--radius-sm) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-(--color-on-primary) disabled:opacity-40"
                >
                  {t("ledger.settle", { count: String(result.matched.length + chosen.length) })}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
