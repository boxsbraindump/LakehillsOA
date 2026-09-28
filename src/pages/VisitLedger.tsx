import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronRight, Scale, Trash2, X } from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "../components/LanguageProvider";
import { useToast } from "../components/ToastProvider";
import { todayKey, formatDisplayDate, shiftDateKey } from "../lib/date";
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

/**
 * The page is the job, not the data model.
 *
 * The week has exactly three jobs in it — put them into Unified Practice, send the claims to
 * Office Ally, chase the money — so the page is those three jobs and nothing else. A pile is
 * named for the work still owed on it, and each pile's own button does that work for everyone
 * in it at once, because that is how two of the three actually happen: one upload, one batch.
 * Paid visits leave the piles entirely; they are the figure at the top, which is the number
 * the other clinic gets paid on.
 */
const STAGES = [
  {
    key: "toUp",
    statuses: ["new"] as VisitStatus[],
    title: "ledger.stageToUp",
    hint: "ledger.stageToUpHint",
    // Scheduling is one patient at a time in UP, but a day's worth often goes in together.
    bulk: { to: "entered" as VisitStatus, label: "ledger.bulkEntered" as TranslationKey },
  },
  {
    key: "toOa",
    statuses: ["entered"] as VisitStatus[],
    title: "ledger.stageToOa",
    hint: "ledger.stageToOaHint",
    // The week's claims go to Office Ally in a single upload. One click, not one per person.
    bulk: { to: "submitted" as VisitStatus, label: "ledger.bulkSubmitted" as TranslationKey },
  },
  {
    key: "toPay",
    statuses: ["submitted", "denied"] as VisitStatus[],
    title: "ledger.stageToPay",
    hint: "ledger.stageToPayHint",
    // Money comes back per patient on an EOB, so this pile empties by matching, not marking.
    bulk: null,
  },
] as const;

/** What the single button on a row should do, given where that row is now. */
const NEXT_STEP: Partial<Record<VisitStatus, { to: VisitStatus; label: TranslationKey }>> = {
  new: { to: "entered", label: "ledger.stepEntered" },
  entered: { to: "submitted", label: "ledger.stepSubmitted" },
  submitted: { to: "paid", label: "ledger.stepPaid" },
  denied: { to: "submitted", label: "ledger.stepResubmitted" },
};

export default function VisitLedger() {
  const { t, lang } = useLanguage();
  const { showToast } = useToast();
  const today = todayKey();

  const [visits, setVisits] = useSyncedStorage<Visit[]>(STORAGE_KEY, []);
  const [quickName, setQuickName] = useState("");
  // The date sticks between adds: a batch is one day's bookings typed straight through.
  const [quickDate, setQuickDate] = useState(today);
  const [batchOpen, setBatchOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [byDate, setByDate] = useState<null | "paid" | "visit">(null);
  const [expanded, setExpanded] = useState<string | null>("toUp");


  /** The one number the week turns on: how many visits the other clinic gets paid for. */
  const thisWeek = useMemo(() => {
    const from = shiftDateKey(today, -6);
    return visits.filter(
      (v) => v.status === "paid" && v.paidDate && v.paidDate >= from && v.paidDate <= today,
    );
  }, [visits, today]);

  function quickAdd() {
    const name = quickName.trim();
    if (!name) return;
    setVisits((prev) => [
      ...prev,
      {
        id: newVisitId() + Math.random().toString(36).slice(2, 5),
        name,
        visitDate: quickDate,
        status: "new",
        createdAt: Date.now(),
      },
    ]);
    setQuickName("");
  }

  function move(ids: string[], status: VisitStatus, paidDate?: string): Visit[] {
    const before = visits.filter((v) => ids.includes(v.id));
    setVisits((prev) =>
      prev.map((v) =>
        ids.includes(v.id)
          ? { ...v, status, paidDate: status === "paid" ? (paidDate ?? today) : undefined }
          : v,
      ),
    );
    return before;
  }

  /** Every step is one click, so every step is one click back. */
  function moveWithUndo(visit: Visit, status: VisitStatus) {
    const [before] = move([visit.id], status);
    showToast(t("ledger.movedToast", { name: visit.name, step: t(STATUS_LABEL[status]) }), {
      label: t("common.undo"),
      onClick: () => setVisits((prev) => prev.map((v) => (v.id === before.id ? before : v))),
    });
  }

  /** Two of the three weekly jobs happen to everyone at once, so they undo that way too. */
  function moveManyWithUndo(group: readonly Visit[], status: VisitStatus) {
    if (group.length === 0) return;
    const before = move(group.map((v) => v.id), status);
    showToast(
      t("ledger.movedManyToast", { count: String(group.length), step: t(STATUS_LABEL[status]) }),
      {
        label: t("common.undo"),
        onClick: () =>
          setVisits((prev) => {
            const byId = new Map(before.map((v) => [v.id, v]));
            return prev.map((v) => byId.get(v.id) ?? v);
          }),
      },
    );
  }

  function remove(visit: Visit) {
    setVisits((prev) => prev.filter((v) => v.id !== visit.id));
    showToast(t("ledger.deletedToast", { count: "1" }), {
      label: t("common.undo"),
      onClick: () => setVisits((prev) => [...prev, visit]),
    });
  }

  const stages = STAGES.map((stage) => ({
    ...stage,
    visits: visits
      .filter((v) => stage.statuses.includes(v.status))
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || a.name.localeCompare(b.name)),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
        {t("ledger.title")}
      </h1>

      {/* The week's figure, stated outright rather than hidden behind a view. */}
      {visits.length > 0 && (
        <div className="mt-3 mb-5 rounded-(--radius-lg) border border-(--color-primary)/25 bg-(--color-primary)/[0.05] px-4 py-3">
          <p className="text-[13px] text-(--color-ink-muted)">
            {t("ledger.thisWeekLabel", { from: shiftDateKey(today, -6), to: today })}
          </p>
          <p className="mt-0.5 text-[22px] font-bold tabular-nums text-(--color-ink)">
            {t("ledger.thisWeekCount", { count: String(thisWeek.length) })}
          </p>
          {thisWeek.length > 0 && (
            <p className="mt-0.5 text-[12px] text-(--color-ink-faint)">
              {thisWeek.map((v) => v.name).join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Step one, always and only: write down who came. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
        className="mb-2 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2"
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

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          onClick={() => setBatchOpen(true)}
          className="text-[12px] text-(--color-ink-muted) hover:text-(--color-primary)"
        >
          {t("ledger.addMany")}
        </button>
        {/* Reconciling lives on pile ③, which is the pile it empties. */}
        {visits.length > 0 && (
          <button
            onClick={() => setByDate(byDate ? null : "paid")}
            className="ml-auto flex items-center gap-1 text-[12px] text-(--color-ink-muted) hover:text-(--color-primary)"
          >
            <CalendarDays size={12} />
            {t(byDate ? "ledger.backToStages" : "ledger.seeByDate")}
          </button>
        )}
      </div>

      {visits.length === 0 ? (
        <div className="rounded-(--radius-lg) border border-dashed border-(--color-hairline) px-6 py-10 text-center">
          <p className="text-[14px] text-(--color-ink-muted)">{t("ledger.emptyBody")}</p>
        </div>
      ) : byDate ? (
        <>
          <div className="mb-3 flex gap-1.5">
            {(["paid", "visit"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setByDate(mode)}
                className={[
                  "rounded-full border px-3 py-1.5 text-[13px]",
                  byDate === mode
                    ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                    : "border-(--color-hairline) text-(--color-ink-muted)",
                ].join(" ")}
              >
                {t(mode === "paid" ? "ledger.viewByPaid" : "ledger.viewByVisit")}
              </button>
            ))}
          </div>
          <DayView
            groups={byDate === "paid" ? groupByPaidDate(visits) : groupByVisitDate(visits)}
            mode={byDate}
            lang={lang}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {stages.map((stage) => {
            const open = expanded === stage.key;
            return (
              <section
                key={stage.key}
                className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas)"
              >
                <div className="flex items-center gap-2 px-4 py-3">
                  <button
                    onClick={() => setExpanded(open ? null : stage.key)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRight
                      size={15}
                      className={[
                        "shrink-0 text-(--color-ink-faint) transition-transform",
                        open ? "rotate-90" : "",
                      ].join(" ")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-(--color-ink)">
                        {t(stage.title)}
                        <span className="ml-1.5 text-[14px] font-medium text-(--color-ink-muted) tabular-nums">
                          {stage.visits.length}
                        </span>
                      </span>
                      <span className="block text-[12px] text-(--color-ink-faint)">{t(stage.hint)}</span>
                    </span>
                  </button>
                  {/* The whole pile at once — that is what the weekly job actually is. */}
                  {stage.bulk && stage.visits.length > 0 && (
                    <button
                      onClick={() => moveManyWithUndo(stage.visits, stage.bulk.to)}
                      className="shrink-0 rounded-(--radius-sm) bg-(--color-primary) px-2.5 py-1.5 text-[12px] font-medium text-(--color-on-primary)"
                    >
                      {t(stage.bulk.label, { count: String(stage.visits.length) })}
                    </button>
                  )}
                  {stage.key === "toPay" && stage.visits.length > 0 && (
                    <button
                      onClick={() => setReconciling(true)}
                      className="flex shrink-0 items-center gap-1 rounded-(--radius-sm) border border-(--color-primary)/40 px-2.5 py-1.5 text-[12px] font-medium text-(--color-primary)"
                    >
                      <Scale size={12} />
                      {t("ledger.reconcileShort")}
                    </button>
                  )}
                </div>

                {open && stage.visits.length > 0 && (
                  <ul className="flex flex-col divide-y divide-(--color-hairline) border-t border-(--color-hairline)">
                    {stage.visits.map((visit) => (
                      <Row
                        key={visit.id}
                        visit={visit}
                        today={today}
                        onAdvance={() => {
                          const next = NEXT_STEP[visit.status];
                          if (next) moveWithUndo(visit, next.to);
                        }}
                        onDeny={() => moveWithUndo(visit, "denied")}
                        onRemove={() => remove(visit)}
                      />
                    ))}
                  </ul>
                )}
                {open && stage.visits.length === 0 && (
                  <p className="border-t border-(--color-hairline) px-4 py-4 text-center text-[13px] text-(--color-ink-faint)">
                    {t("ledger.stageEmpty")}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {batchOpen && (
        <BatchPanel
          today={today}
          onClose={() => setBatchOpen(false)}
          onAdd={(rows, status, paidDate) => {
            setVisits((prev) => [
              ...prev,
              ...rows.map((r) => ({
                ...r,
                id: newVisitId() + Math.random().toString(36).slice(2, 5),
                status,
                paidDate: status === "paid" ? paidDate : undefined,
              })),
            ]);
            setBatchOpen(false);
            showToast(t("ledger.addedToast", { count: String(rows.length) }));
          }}
        />
      )}

      {reconciling && (
        <ReconcilePanel
          visits={visits}
          today={today}
          onClose={() => setReconciling(false)}
          onSettle={(ids, paidDate) => {
            move(ids, "paid", paidDate);
            showToast(t("ledger.settledToast", { count: String(ids.length), date: paidDate }));
          }}
        />
      )}
    </div>
  );
}

function Row({
  visit,
  today,
  onAdvance,
  onDeny,
  onRemove,
}: {
  visit: Visit;
  today: string;
  onAdvance: () => void;
  onDeny: () => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const [menu, setMenu] = useState(false);
  const next = NEXT_STEP[visit.status];

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-(--color-ink)">{visit.name}</span>
          <span className="block text-[12px] text-(--color-ink-faint)">
            {visit.visitDate}
            {visit.paidDate ? ` · ${t("ledger.paidOn", { date: visit.paidDate })}` : ""}
            {visit.status === "denied" ? ` · ${t("ledger.statusDenied")}` : ""}
            {isStale(visit, today) ? ` · ${t("ledger.stale", { days: String(CHASE_AFTER_DAYS) })}` : ""}
          </span>
        </span>

        {next && (
          <button
            onClick={onAdvance}
            className="shrink-0 rounded-(--radius-sm) border border-(--color-primary)/40 px-2.5 py-1 text-[12px] font-medium text-(--color-primary) hover:bg-(--color-primary)/10"
          >
            {t(next.label)}
          </button>
        )}
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label={t("ledger.more")}
          className="shrink-0 rounded-(--radius-sm) px-1.5 py-1 text-[13px] text-(--color-ink-faint) hover:text-(--color-ink)"
        >
          ⋯
        </button>
      </div>

      {menu && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visit.status === "submitted" && (
            <button
              onClick={() => {
                onDeny();
                setMenu(false);
              }}
              className="rounded-(--radius-sm) border border-(--color-hairline) px-2 py-1 text-[12px] text-(--color-ink-secondary) hover:border-red-300 hover:text-red-600"
            >
              {t("ledger.markDenied")}
            </button>
          )}
          <button
            onClick={() => {
              onRemove();
              setMenu(false);
            }}
            className="flex items-center gap-1 rounded-(--radius-sm) border border-(--color-hairline) px-2 py-1 text-[12px] text-(--color-ink-secondary) hover:border-red-300 hover:text-red-600"
          >
            <Trash2 size={12} />
            {t("common.delete")}
          </button>
        </div>
      )}
    </li>
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

function BatchPanel({
  today,
  onClose,
  onAdd,
}: {
  today: string;
  onClose: () => void;
  onAdd: (rows: Visit[], status: VisitStatus, paidDate: string) => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [visitDate, setVisitDate] = useState(today);
  const [status, setStatus] = useState<VisitStatus>("new");
  // Never derived from the visit date: the batch's status says money arrived, not when.
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
