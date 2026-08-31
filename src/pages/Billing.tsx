import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardPaste,
  Printer,
  Send,
  Trash2,
  X,
  CalendarClock,
  Hourglass,
  Receipt,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "../components/LanguageProvider";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import EmptyState from "../components/EmptyState";
import { todayKey, shiftDateKey } from "../lib/date";
import {
  COLUMN_ROLES,
  EMPTY_CLINIC_PROFILE,
  INSURANCE_FOLLOWUP_DAYS,
  bucketOf,
  buildImportedPatients,
  formatUSD,
  guessRoles,
  mergeImport,
  parseTable,
  totalBalance,
  waitingDays,
} from "../lib/billing";
import type { TranslationKey } from "../lib/translations";
import type {
  BillingBucket,
  BillingDecision,
  BillingLine,
  BillingPatient,
  ClinicProfile,
  ColumnRole,
} from "../lib/billing";

const BUCKET_ORDER: BillingBucket[] = ["todo", "returning", "waiting", "sendBill", "sent", "cleared"];

const BUCKET_LABEL: Record<BillingBucket, TranslationKey> = {
  todo: "billing.bucketTodo",
  returning: "billing.bucketReturning",
  waiting: "billing.bucketWaiting",
  sendBill: "billing.bucketSendBill",
  sent: "billing.bucketSent",
  cleared: "billing.bucketCleared",
};

/** Header text is the only stable thing about an export, so it is what the saved mapping keys on. */
function mappingSignature(headers: string[] | null): string {
  return headers ? headers.map((header) => header.trim().toLowerCase()).join("|") : "";
}

type ImportMode = "paste" | "manual";

interface ManualRow {
  name: string;
  account: string;
  amount: string;
}

const EMPTY_MANUAL_ROW: ManualRow = { name: "", account: "", amount: "" };

function lineIsBlank(line: BillingLine) {
  return !line.serviceDate && !line.description;
}

/**
 * Printing has to be paired with the class that hides the app shell — a bare window.print()
 * would put the sidebar and the tab bar on a patient bill.
 */
function runStatementPrint() {
  document.documentElement.classList.add("printing-statement");
  const cleanup = () => {
    document.documentElement.classList.remove("printing-statement");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Not every browser fires afterprint; without this the app would stay hidden on screen.
  window.setTimeout(cleanup, 1000);
}

export default function Billing() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const today = todayKey();

  const [patients, setPatients] = useSyncedStorage<BillingPatient[]>("lh-billing-patients", []);
  const [clinic] = useSyncedStorage<ClinicProfile>("lh-clinic-profile", EMPTY_CLINIC_PROFILE);
  const [savedMappings, setSavedMappings] = useSyncedStorage<Record<string, ColumnRole[]>>(
    "lh-billing-column-map",
    {},
  );

  const [activeBucket, setActiveBucket] = useState<BillingBucket>("todo");
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("paste");
  const [pasted, setPasted] = useState("");
  const [manualRows, setManualRows] = useState<ManualRow[]>([{ ...EMPTY_MANUAL_ROW }]);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [printing, setPrinting] = useState<BillingPatient[] | null>(null);
  const printRequestRef = useRef(false);

  // The sheets must be committed to the DOM before the print dialog reads the page, so the
  // trigger lives in an effect. An earlier version used requestAnimationFrame, which never
  // fires while the tab sits in the background — the dialog simply never opened.
  useEffect(() => {
    if (!printing || !printRequestRef.current) return;
    printRequestRef.current = false;
    runStatementPrint();
  }, [printing]);

  const parsed = useMemo(() => (pasted.trim() ? parseTable(pasted) : null), [pasted]);
  const preview = useMemo(
    () => (parsed && roles.length ? buildImportedPatients(parsed.rows, roles) : []),
    [parsed, roles],
  );
  // Typed rows go through the same grouping and merge path as a paste, so a hand-entered
  // list behaves identically from here on — including carrying decisions forward.
  const manualPreview = useMemo(
    () =>
      buildImportedPatients(
        manualRows
          .filter((row) => row.name.trim() || row.account.trim())
          .map((row) => [row.account, row.name, row.amount]),
        ["account", "name", "balance"],
      ),
    [manualRows],
  );
  const effectivePreview = importMode === "manual" ? manualPreview : preview;

  const buckets = useMemo(() => {
    const map: Record<BillingBucket, BillingPatient[]> = {
      todo: [],
      returning: [],
      waiting: [],
      sendBill: [],
      sent: [],
      cleared: [],
    };
    for (const patient of patients) map[bucketOf(patient, today)].push(patient);

    // Longest-waiting claims first — they are the ones about to age out of a filing window.
    map.waiting.sort((a, b) => (a.decisionDate ?? "9999").localeCompare(b.decisionDate ?? "9999"));
    map.returning.sort((a, b) => (a.decisionDate ?? "9999").localeCompare(b.decisionDate ?? "9999"));
    map.todo.sort((a, b) => b.balance - a.balance);
    map.sendBill.sort((a, b) => b.balance - a.balance);
    return map;
  }, [patients, today]);

  const visible = buckets[activeBucket];

  function handlePaste(text: string) {
    setPasted(text);
    const table = text.trim() ? parseTable(text) : null;
    if (!table || table.rows.length === 0) {
      setRoles([]);
      return;
    }
    const columnCount = table.rows[0].length;
    const saved = savedMappings[mappingSignature(table.headers)];
    setRoles(
      saved && saved.length === columnCount ? saved : guessRoles(table.headers, columnCount),
    );
  }

  function setRole(index: number, role: ColumnRole) {
    setRoles((prev) => {
      const next = [...prev];
      // Two columns claiming the same job would silently drop one of them.
      if (role !== "ignore") {
        for (let i = 0; i < next.length; i += 1) if (next[i] === role) next[i] = "ignore";
      }
      next[index] = role;
      return next;
    });
  }

  function closeImport() {
    setIsImporting(false);
    setPasted("");
    setRoles([]);
    setManualRows([{ ...EMPTY_MANUAL_ROW }]);
  }

  /** Keeps exactly one blank row at the end, so typing never needs an "add row" click. */
  function editManualRow(index: number, changes: Partial<ManualRow>) {
    setManualRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...changes } : row));
      const last = next[next.length - 1];
      if (last.name.trim() || last.account.trim() || last.amount.trim()) {
        next.push({ ...EMPTY_MANUAL_ROW });
      }
      return next;
    });
  }

  function removeManualRow(index: number) {
    setManualRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ ...EMPTY_MANUAL_ROW }];
    });
  }

  function commitImport() {
    if (effectivePreview.length === 0) return;
    const result = mergeImport(patients, effectivePreview, Date.now());
    setPatients(result.merged);
    if (importMode === "paste" && parsed?.headers) {
      setSavedMappings((prev) => ({ ...prev, [mappingSignature(parsed.headers)]: roles }));
    }
    closeImport();
    setActiveBucket("todo");
    showToast(
      t("billing.importSummary", {
        added: String(result.addedKeys.length),
        changed: String(result.changedKeys.length),
        cleared: String(result.clearedKeys.length),
      }),
    );
  }

  function decide(key: string, decision: BillingDecision, date?: string) {
    setPatients((prev) =>
      prev.map((patient) =>
        patient.key === key
          ? {
              ...patient,
              decision,
              decisionDate: date ?? patient.decisionDate,
              decidedAt: Date.now(),
              // Re-baselining is what clears the "amount moved" flag for this row.
              balanceAtDecision: patient.balance,
            }
          : patient,
      ),
    );
  }

  function patch(key: string, changes: Partial<BillingPatient>) {
    setPatients((prev) =>
      prev.map((patient) => (patient.key === key ? { ...patient, ...changes } : patient)),
    );
  }

  async function removePatient(patient: BillingPatient) {
    if (!(await confirm({ message: t("billing.removeConfirm", { name: patient.name }) }))) return;
    setPatients((prev) => prev.filter((item) => item.key !== patient.key));
    setSelected((prev) => prev.filter((key) => key !== patient.key));
  }

  async function purgeCleared() {
    if (!(await confirm({ message: t("billing.purgeClearedConfirm") }))) return;
    setPatients((prev) => prev.filter((patient) => !patient.clearedAt));
  }

  function toggleSelected(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const selectedInBucket = visible.filter((patient) => selected.includes(patient.key));

  function printStatements(list: BillingPatient[]) {
    if (list.length === 0) return;
    printRequestRef.current = true;
    setPrinting(list);
  }

  function markSent(list: BillingPatient[]) {
    const keys = new Set(list.map((patient) => patient.key));
    setPatients((prev) =>
      prev.map((patient) =>
        keys.has(patient.key)
          ? { ...patient, decision: "sent", sentAt: Date.now(), balanceAtDecision: patient.balance }
          : patient,
      ),
    );
    setSelected([]);
    showToast(t("billing.markedSent", { count: String(list.length) }));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
            {t("billing.title")}
          </h1>
          <p className="mt-1 text-[15px] text-(--color-ink-muted)">{t("billing.subtitle")}</p>
        </div>
        <button
          onClick={() => setIsImporting(true)}
          className="flex items-center gap-1.5 rounded-(--radius-md) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-white transition-transform duration-150 active:scale-[0.97]"
        >
          <ClipboardPaste size={15} />
          {t("billing.import")}
        </button>
      </div>

      {patients.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) px-5 py-4 shadow-(--shadow-level-1)">
          <Stat label={t("billing.statOutstanding")} value={formatUSD(totalBalance(patients.filter((p) => !p.clearedAt)))} />
          <Stat label={t("billing.statPeople")} value={String(patients.filter((p) => !p.clearedAt).length)} />
          <Stat
            label={t("billing.statToBill")}
            value={formatUSD(totalBalance(buckets.sendBill))}
            emphasis={buckets.sendBill.length > 0}
          />
        </div>
      )}

      {patients.length === 0 && !isImporting ? (
        <EmptyState
          title={t("billing.emptyTitle")}
          description={t("billing.emptyDescription")}
          actionLabel={t("billing.import")}
          onAction={() => setIsImporting(true)}
        />
      ) : (
        <>
          <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
            {BUCKET_ORDER.map((bucket) => (
              <button
                key={bucket}
                type="button"
                onClick={() => setActiveBucket(bucket)}
                className={[
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  activeBucket === bucket
                    ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                    : "border-(--color-hairline) text-(--color-ink-muted) hover:border-(--color-primary)/40 hover:text-(--color-primary)",
                ].join(" ")}
              >
                {t(BUCKET_LABEL[bucket])}
                <span className="text-(--color-ink-faint) tabular-nums">{buckets[bucket].length}</span>
              </button>
            ))}
          </div>

          {activeBucket === "sendBill" && visible.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas-soft) px-3.5 py-2.5">
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    selectedInBucket.length === visible.length ? [] : visible.map((p) => p.key),
                  )
                }
                className="text-[13px] font-medium text-(--color-primary)"
              >
                {selectedInBucket.length === visible.length
                  ? t("billing.selectNone")
                  : t("billing.selectAll")}
              </button>
              <span className="text-[13px] text-(--color-ink-muted)">
                {t("billing.selectedCount", {
                  count: String(selectedInBucket.length),
                  amount: formatUSD(totalBalance(selectedInBucket)),
                })}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={selectedInBucket.length === 0}
                  onClick={() => printStatements(selectedInBucket)}
                  className="flex items-center gap-1.5 rounded-(--radius-sm) border border-(--color-hairline) bg-(--color-canvas) px-3 py-1.5 text-[13px] font-medium text-(--color-ink) disabled:opacity-40"
                >
                  <Printer size={14} />
                  {t("billing.printStatements")}
                </button>
                <button
                  type="button"
                  disabled={selectedInBucket.length === 0}
                  onClick={() => markSent(selectedInBucket)}
                  className="flex items-center gap-1.5 rounded-(--radius-sm) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                >
                  <Send size={14} />
                  {t("billing.markSent")}
                </button>
              </div>
            </div>
          )}

          {activeBucket === "cleared" && visible.length > 0 && (
            <button
              type="button"
              onClick={purgeCleared}
              className="mb-4 text-[13px] font-medium text-(--color-ink-muted) hover:text-red-500"
            >
              {t("billing.purgeCleared")}
            </button>
          )}

          {visible.length === 0 ? (
            <p className="rounded-(--radius-lg) border border-dashed border-(--color-hairline) py-10 text-center text-[14px] text-(--color-ink-faint)">
              {t("billing.bucketEmpty")}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {visible.map((patient) => (
                <PatientRow
                  key={patient.key}
                  patient={patient}
                  bucket={activeBucket}
                  today={today}
                  selected={selected.includes(patient.key)}
                  onToggleSelected={() => toggleSelected(patient.key)}
                  onDecide={(decision, date) => decide(patient.key, decision, date)}
                  onPatch={(changes) => patch(patient.key, changes)}
                  onPrint={() => printStatements([patient])}
                  onRemove={() => removePatient(patient)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {isImporting && (
        <ImportPanel
          mode={importMode}
          onSetMode={setImportMode}
          pasted={pasted}
          parsed={parsed}
          roles={roles}
          preview={effectivePreview}
          manualRows={manualRows}
          onEditManualRow={editManualRow}
          onRemoveManualRow={removeManualRow}
          onPaste={handlePaste}
          onSetRole={setRole}
          onCancel={closeImport}
          onCommit={commitImport}
        />
      )}

      {printing && (
        <StatementSheets
          patients={printing}
          clinic={clinic}
          today={today}
          onClose={() => setPrinting(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[12px] text-(--color-ink-faint)">{label}</p>
      <p
        className={[
          "text-[19px] font-bold tabular-nums",
          emphasis ? "text-(--color-primary)" : "text-(--color-ink)",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

interface PatientRowProps {
  patient: BillingPatient;
  bucket: BillingBucket;
  today: string;
  selected: boolean;
  onToggleSelected: () => void;
  onDecide: (decision: BillingDecision, date?: string) => void;
  onPatch: (changes: Partial<BillingPatient>) => void;
  onPrint: () => void;
  onRemove: () => void;
}

function PatientRow({
  patient,
  bucket,
  today,
  selected,
  onToggleSelected,
  onDecide,
  onPatch,
  onPrint,
  onRemove,
}: PatientRowProps) {
  const { t } = useLanguage();
  const [showNote, setShowNote] = useState(false);

  const amountMoved =
    patient.decision !== null &&
    patient.balanceAtDecision !== undefined &&
    Math.abs(patient.balanceAtDecision - patient.balance) > 0.004;
  const pending = waitingDays(patient, today);
  const overdue = pending !== undefined && pending >= INSURANCE_FOLLOWUP_DAYS;
  const dated = patient.lines.filter((line) => line.serviceDate).map((line) => line.serviceDate!);
  const oldest = dated.length ? dated.reduce((a, b) => (a < b ? a : b)) : undefined;

  return (
    <article className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-4 shadow-(--shadow-level-1)">
      <div className="flex flex-wrap items-start gap-3">
        {bucket === "sendBill" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={t("billing.selectPatient", { name: patient.name })}
            className="mt-1 size-4 shrink-0 accent-(--color-primary)"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="text-[16px] font-bold text-(--color-ink)">
              {patient.name || t("billing.unnamed")}
            </h2>
            <span className="text-[17px] font-bold tabular-nums text-(--color-ink)">
              {formatUSD(patient.balance)}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-(--color-ink-faint)">
            {[
              patient.account ? t("billing.accountLabel", { account: patient.account }) : "",
              patient.lines.length > 1
                ? t("billing.lineCount", { count: String(patient.lines.length) })
                : "",
              oldest ? t("billing.oldestService", { date: oldest }) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("common.delete")}
          className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {amountMoved && (
        <p className="mt-2 flex items-center gap-1.5 rounded-(--radius-sm) bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">
          <AlertTriangle size={13} className="shrink-0" />
          {t("billing.amountMoved", {
            from: formatUSD(patient.balanceAtDecision ?? 0),
            to: formatUSD(patient.balance),
          })}
        </p>
      )}

      {bucket === "waiting" && pending !== undefined && (
        <p
          className={[
            "mt-2 flex items-center gap-1.5 text-[12px]",
            overdue ? "font-medium text-red-600" : "text-(--color-ink-muted)",
          ].join(" ")}
        >
          <Hourglass size={13} className="shrink-0" />
          {overdue
            ? t("billing.waitingOverdue", { days: String(pending) })
            : t("billing.waitingDays", { days: String(pending) })}
        </p>
      )}

      {bucket === "returning" && patient.decisionDate && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-(--color-ink-muted)">
          <CalendarClock size={13} className="shrink-0" />
          {t("billing.expectedBack", { date: patient.decisionDate })}
        </p>
      )}

      {bucket === "sent" && patient.sentAt && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-(--color-ink-muted)">
          <CheckCircle2 size={13} className="shrink-0" />
          {t("billing.sentOn", { date: new Date(patient.sentAt).toLocaleDateString() })}
        </p>
      )}

      {bucket !== "cleared" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <DecisionButton
            active={patient.decision === "returning" && !amountMoved}
            icon={CalendarClock}
            label={t("billing.decideReturning")}
            onClick={() => onDecide("returning", patient.decisionDate ?? shiftDateKey(today, 30))}
          />
          <DecisionButton
            active={patient.decision === "waiting-insurance" && !amountMoved}
            icon={Hourglass}
            label={t("billing.decideWaiting")}
            onClick={() => onDecide("waiting-insurance", patient.decisionDate ?? today)}
          />
          <DecisionButton
            active={patient.decision === "send-bill" && !amountMoved}
            icon={Receipt}
            label={t("billing.decideSendBill")}
            onClick={() => onDecide("send-bill")}
          />
          <button
            type="button"
            onClick={() => setShowNote((prev) => !prev)}
            className="rounded-(--radius-sm) px-2 py-1.5 text-[13px] text-(--color-ink-muted) hover:text-(--color-primary)"
          >
            {patient.note ? t("billing.editNote") : t("billing.addNote")}
          </button>
          {(bucket === "sendBill" || bucket === "sent") && (
            <button
              type="button"
              onClick={onPrint}
              className="ml-auto flex items-center gap-1.5 rounded-(--radius-sm) border border-(--color-hairline) px-2.5 py-1.5 text-[13px] font-medium text-(--color-ink) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
            >
              <Printer size={13} />
              {t("billing.printStatement")}
            </button>
          )}
        </div>
      )}

      {(patient.decision === "returning" || patient.decision === "waiting-insurance") &&
        bucket !== "cleared" && (
          <label className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-(--color-ink-muted)">
            {patient.decision === "returning"
              ? t("billing.expectedBackLabel")
              : t("billing.claimSentLabel")}
            <input
              type="date"
              value={patient.decisionDate ?? ""}
              onChange={(e) => onPatch({ decisionDate: e.target.value })}
              className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1 text-[13px] text-(--color-ink) outline-none focus:border-(--color-primary)"
            />
          </label>
        )}

      {(bucket === "sendBill" || bucket === "sent") && (
        <label className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-(--color-ink-muted)">
          {t("billing.payLinkLabel")}
          <input
            type="url"
            value={patient.payLink ?? ""}
            onChange={(e) => onPatch({ payLink: e.target.value })}
            placeholder={t("billing.payLinkPlaceholder")}
            className="min-w-0 flex-1 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1 text-[13px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
          />
        </label>
      )}

      {(showNote || patient.note) && bucket !== "cleared" && (
        <textarea
          value={patient.note ?? ""}
          onChange={(e) => onPatch({ note: e.target.value })}
          placeholder={t("billing.notePlaceholder")}
          rows={2}
          className="mt-2.5 w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[13px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
        />
      )}
    </article>
  );
}

function DecisionButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof CalendarClock;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 rounded-(--radius-sm) border px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
          : "border-(--color-hairline) text-(--color-ink-muted) hover:border-(--color-primary)/40 hover:text-(--color-primary)",
      ].join(" ")}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

interface ImportPanelProps {
  mode: ImportMode;
  onSetMode: (mode: ImportMode) => void;
  pasted: string;
  parsed: ReturnType<typeof parseTable> | null;
  roles: ColumnRole[];
  preview: ReturnType<typeof buildImportedPatients>;
  manualRows: ManualRow[];
  onEditManualRow: (index: number, changes: Partial<ManualRow>) => void;
  onRemoveManualRow: (index: number) => void;
  onPaste: (text: string) => void;
  onSetRole: (index: number, role: ColumnRole) => void;
  onCancel: () => void;
  onCommit: () => void;
}

function ImportPanel({
  mode,
  onSetMode,
  pasted,
  parsed,
  roles,
  preview,
  manualRows,
  onEditManualRow,
  onRemoveManualRow,
  onPaste,
  onSetRole,
  onCancel,
  onCommit,
}: ImportPanelProps) {
  const { t } = useLanguage();
  const hasBalance = roles.includes("balance");
  const hasIdentity = roles.includes("name") || roles.includes("account");
  const mappingUsable = mode === "manual" || (hasIdentity && hasBalance);
  const previewTotal = preview.reduce((sum, patient) => sum + patient.balance, 0);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-3) sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-[18px] font-bold text-(--color-ink)">{t("billing.importTitle")}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("common.cancel")}
            className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 flex gap-1.5">
          {(["paste", "manual"] as ImportMode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSetMode(option)}
              className={[
                "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                mode === option
                  ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                  : "border-(--color-hairline) text-(--color-ink-muted) hover:border-(--color-primary)/40 hover:text-(--color-primary)",
              ].join(" ")}
            >
              {t(option === "paste" ? "billing.modePaste" : "billing.modeManual")}
            </button>
          ))}
        </div>

        <p className="mb-3 text-[13px] text-(--color-ink-muted)">
          {t(mode === "paste" ? "billing.importHelp" : "billing.manualHelp")}
        </p>

        {mode === "paste" ? (
          <>
            <textarea
              autoFocus
              value={pasted}
              onChange={(e) => onPaste(e.target.value)}
              placeholder={t("billing.importPlaceholder")}
              rows={6}
              className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2 font-mono text-[12px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
            />

            {parsed && parsed.rows.length > 0 && (
              <>
                <p className="mt-4 mb-2 text-[13px] font-semibold text-(--color-ink)">
                  {t("billing.mapColumns")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles.map((role, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-2 rounded-(--radius-sm) border border-(--color-hairline) px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] text-(--color-ink-muted)">
                        {parsed.headers?.[index]?.trim() ||
                          t("billing.columnN", { n: String(index + 1) })}
                        <span className="ml-1 text-(--color-ink-faint)">
                          {parsed.rows[0]?.[index] ? `· ${parsed.rows[0][index]}` : ""}
                        </span>
                      </span>
                      <select
                        value={role}
                        onChange={(e) => onSetRole(index, e.target.value as ColumnRole)}
                        className="shrink-0 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-1.5 py-1 text-[12px] text-(--color-ink) outline-none focus:border-(--color-primary)"
                      >
                        {COLUMN_ROLES.map((option) => (
                          <option key={option} value={option}>
                            {t(`billing.role.${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[1fr_88px_92px_28px] gap-2 px-0.5 text-[12px] font-semibold text-(--color-ink-faint)">
              <span>{t("billing.manualName")}</span>
              <span>{t("billing.manualAccount")}</span>
              <span className="text-right">{t("billing.manualAmount")}</span>
              <span />
            </div>
            {manualRows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_88px_92px_28px] items-center gap-2">
                <input
                  autoFocus={index === 0}
                  value={row.name}
                  onChange={(e) => onEditManualRow(index, { name: e.target.value })}
                  placeholder={t("billing.manualNamePlaceholder")}
                  className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[13px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
                />
                <input
                  value={row.account}
                  onChange={(e) => onEditManualRow(index, { account: e.target.value })}
                  className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[13px] text-(--color-ink) outline-none focus:border-(--color-primary)"
                />
                <input
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => onEditManualRow(index, { amount: e.target.value })}
                  className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-right text-[13px] tabular-nums text-(--color-ink) outline-none focus:border-(--color-primary)"
                />
                {manualRows.length > 1 && index < manualRows.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemoveManualRow(index)}
                    aria-label={t("billing.removeRow")}
                    className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        )}

        {(mode === "manual" || (parsed && parsed.rows.length > 0)) && (
          <div className="mt-4 rounded-(--radius-md) bg-(--color-canvas-soft) p-3.5">
            {!mappingUsable ? (
              <p className="text-[13px] text-amber-700">{t("billing.mapIncomplete")}</p>
            ) : preview.length === 0 ? (
              <p className="text-[13px] text-(--color-ink-muted)">{t("billing.manualEmpty")}</p>
            ) : (
              <>
                <p className="text-[13px] font-medium text-(--color-ink)">
                  {t("billing.previewSummary", {
                    count: String(preview.length),
                    amount: formatUSD(previewTotal),
                  })}
                </p>
                {/* The report has its own grand total; matching it is how you catch a
                    mistyped digit or a row you skipped. */}
                <p className="mt-0.5 text-[12px] text-(--color-ink-faint)">
                  {t("billing.totalCheckHint")}
                </p>
                <ul className="mt-2 flex flex-col gap-0.5">
                  {preview.slice(0, 5).map((patient) => (
                    <li
                      key={patient.key}
                      className="flex justify-between gap-3 text-[12px] text-(--color-ink-secondary)"
                    >
                      <span className="truncate">
                        {patient.name || patient.account}
                        {patient.lines.length > 1 ? ` (${patient.lines.length})` : ""}
                      </span>
                      <span className="tabular-nums">{formatUSD(patient.balance)}</span>
                    </li>
                  ))}
                  {preview.length > 5 && (
                    <li className="text-[12px] text-(--color-ink-faint)">
                      {t("billing.previewMore", { count: String(preview.length - 5) })}
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-(--radius-sm) px-3 py-2 text-[14px] text-(--color-ink-muted) hover:text-(--color-ink)"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={preview.length === 0 || !mappingUsable}
            onClick={onCommit}
            className="rounded-(--radius-sm) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {t("billing.importConfirm")}
          </button>
        </div>
      </div>
    </div>
);
}

interface StatementSheetsProps {
  patients: BillingPatient[];
  clinic: ClinicProfile;
  today: string;
  onClose: () => void;
}

/**
 * Square's invoice email leads with "Pay Now" and nothing else, which is why patients call
 * asking what the charge is for. This sheet is the answer: dates, what insurance covered, and
 * what is left — the thing you attach to the invoice or mail on its own.
 */
function StatementSheets({ patients, clinic, today, onClose }: StatementSheetsProps) {
  const { t } = useLanguage();

  return (
    <div className="statement-print-root fixed inset-0 z-50 overflow-y-auto bg-(--color-canvas-soft) p-4 sm:p-8">
      <div className="print-hide mx-auto mb-4 flex max-w-[8.5in] items-center justify-between gap-3">
        <p className="text-[13px] text-(--color-ink-muted)">
          {t("billing.printPreviewHint", { count: String(patients.length) })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={runStatementPrint}
            className="flex items-center gap-1.5 rounded-(--radius-sm) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-white"
          >
            <Printer size={14} />
            {t("billing.printAgain")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-(--radius-sm) border border-(--color-hairline) bg-(--color-canvas) px-3 py-1.5 text-[13px] font-medium text-(--color-ink)"
          >
            {t("common.close")}
          </button>
        </div>
      </div>

      {patients.map((patient) => (
        <StatementSheet
          key={patient.key}
          patient={patient}
          clinic={clinic}
          today={today}
        />
      ))}
    </div>
  );
}

function StatementSheet({
  patient,
  clinic,
  today,
}: {
  patient: BillingPatient;
  clinic: ClinicProfile;
  today: string;
}) {
  const { t } = useLanguage();
  // A table of empty columns reads as broken, so only show what this export actually carried.
  const show = {
    charge: patient.lines.some((line) => line.charge !== undefined),
    insurance: patient.lines.some((line) => line.insurancePaid !== undefined),
    adjustment: patient.lines.some((line) => line.adjustment !== undefined),
  };
  const money = (value: number | undefined) => (value === undefined ? "—" : formatUSD(value));

  return (
    <section className="statement-sheet mx-auto mb-6 min-h-[10.5in] w-full max-w-[8.5in] bg-white p-[0.6in] text-[12px] leading-relaxed text-black shadow-(--shadow-level-1)">
      <header className="flex items-start justify-between gap-6 border-b border-black/15 pb-4">
        <div>
          <p className="text-[17px] font-bold">{clinic.name || t("billing.clinicNameFallback")}</p>
          {clinic.addressLine1 && <p>{clinic.addressLine1}</p>}
          {clinic.addressLine2 && <p>{clinic.addressLine2}</p>}
          {clinic.phone && <p>{clinic.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-[17px] font-bold tracking-[0.08em] uppercase">
            {t("billing.statementHeading")}
          </p>
          <p>{t("billing.statementDate", { date: today })}</p>
        </div>
      </header>

      <div className="mt-4">
        <p className="text-[14px] font-bold">{patient.name || t("billing.unnamed")}</p>
        {patient.account && <p>{t("billing.accountLabel", { account: patient.account })}</p>}
      </div>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-black/20 text-left">
            <th className="py-1.5 pr-2 font-semibold">{t("billing.colDate")}</th>
            <th className="py-1.5 pr-2 font-semibold">{t("billing.colDescription")}</th>
            {show.charge && (
              <th className="py-1.5 pr-2 text-right font-semibold">{t("billing.colCharge")}</th>
            )}
            {show.insurance && (
              <th className="py-1.5 pr-2 text-right font-semibold">{t("billing.colInsurance")}</th>
            )}
            {show.adjustment && (
              <th className="py-1.5 pr-2 text-right font-semibold">{t("billing.colAdjustment")}</th>
            )}
            <th className="py-1.5 text-right font-semibold">{t("billing.colBalance")}</th>
          </tr>
        </thead>
        <tbody>
          {patient.lines.map((line, index) => (
            <tr key={index} className="border-b border-black/10">
              <td className="py-1.5 pr-2 whitespace-nowrap">{line.serviceDate ?? "—"}</td>
              <td className="py-1.5 pr-2">
                {line.description ?? (lineIsBlank(line) ? t("billing.balanceForward") : "—")}
              </td>
              {show.charge && (
                <td className="py-1.5 pr-2 text-right tabular-nums">{money(line.charge)}</td>
              )}
              {show.insurance && (
                <td className="py-1.5 pr-2 text-right tabular-nums">{money(line.insurancePaid)}</td>
              )}
              {show.adjustment && (
                <td className="py-1.5 pr-2 text-right tabular-nums">{money(line.adjustment)}</td>
              )}
              <td className="py-1.5 text-right tabular-nums">{formatUSD(line.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="flex items-baseline gap-6 border-t-2 border-black pt-2">
          <span className="text-[13px] font-bold tracking-[0.04em] uppercase">
            {t("billing.amountDue")}
          </span>
          <span className="text-[17px] font-bold tabular-nums">{formatUSD(patient.balance)}</span>
        </div>
      </div>

      {(clinic.payInstructions || patient.payLink) && (
        <div className="mt-6 border-t border-black/15 pt-3">
          <p className="font-semibold">{t("billing.howToPay")}</p>
          {clinic.payInstructions && (
            <p className="whitespace-pre-wrap">{clinic.payInstructions}</p>
          )}
          {patient.payLink && <p className="mt-1 break-all">{patient.payLink}</p>}
        </div>
      )}

      <p className="mt-6 text-[11px] text-black/50">
        {t("billing.statementFooter")}
      </p>
    </section>
  );
}
