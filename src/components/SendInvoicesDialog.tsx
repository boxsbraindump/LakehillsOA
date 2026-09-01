import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import {
  fetchSquareConfig,
  isSendableEmail,
  sendSquareInvoices,
  toCents,
} from "../lib/squareApi";
import type { InvoiceResult, SquareConfig } from "../lib/squareApi";
import { formatUSD } from "../lib/billing";
import type { BillingPatient } from "../lib/billing";
import { shiftDateKey, todayKey } from "../lib/date";

interface Props {
  patients: BillingPatient[];
  onClose: () => void;
  onSent: (results: InvoiceResult[]) => void;
}

/** How long a patient gets before Square starts reminding them. */
const DUE_IN_DAYS = 14;

/**
 * The only screen in the app that reaches outside it. Everything here exists to make the last
 * click unsurprising: who is being emailed, for how much, who is being skipped and why, and
 * whether this is the sandbox or somebody's real inbox.
 */
export default function SendInvoicesDialog({ patients, onClose, onSent }: Props) {
  const { t } = useLanguage();
  const [config, setConfig] = useState<SquareConfig | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<InvoiceResult[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Fixed for the life of this dialog, so a double-click reuses Square's idempotency keys
  // instead of billing anyone twice.
  const batchId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    let active = true;
    void fetchSquareConfig().then((value) => {
      if (active) setConfig(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const sendable = patients.filter(
    (patient) => isSendableEmail(patient.email) && patient.balance > 0,
  );
  const blocked = patients.filter(
    (patient) => !isSendableEmail(patient.email) || patient.balance <= 0,
  );
  const total = sendable.reduce((sum, patient) => sum + patient.balance, 0);

  async function handleSend() {
    setSending(true);
    setFailure(null);
    const response = await sendSquareInvoices(
      batchId,
      sendable.map((patient) => ({
        key: patient.key,
        name: patient.name,
        email: patient.email!.trim(),
        amountCents: toCents(patient.balance),
        lines: patient.lines
          .filter((line) => line.balance > 0)
          .map((line) => ({
            serviceDate: line.serviceDate,
            description: line.description,
            amountCents: toCents(line.balance),
          })),
        note: patient.note,
        dueDate: shiftDateKey(todayKey(), DUE_IN_DAYS),
      })),
    );
    setSending(false);

    if (!response.ok) {
      setFailure(
        response.error === "square_not_configured"
          ? t("square.notConfigured")
          : t("square.sendFailed"),
      );
      return;
    }
    setResults(response.results);
    onSent(response.results.filter((result) => result.ok));
  }

  const succeeded = results?.filter((result) => result.ok) ?? [];
  const failed = results?.filter((result) => !result.ok) ?? [];
  const nameFor = (key: string) => patients.find((patient) => patient.key === key)?.name ?? key;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-3) sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-[18px] font-bold text-(--color-ink)">{t("square.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={18} />
          </button>
        </div>

        {config && !config.configured && (
          <p className="mb-3 rounded-(--radius-sm) bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            {t("square.notConfigured")}
          </p>
        )}

        {config?.configured && (
          <p
            className={[
              "mb-3 rounded-(--radius-sm) px-3 py-2 text-[13px]",
              config.mode === "production"
                ? "bg-red-50 font-medium text-red-700"
                : "bg-(--color-canvas-soft) text-(--color-ink-secondary)",
            ].join(" ")}
          >
            {config.mode === "production" ? t("square.modeLive") : t("square.modeSandbox")}
          </p>
        )}

        {results ? (
          <>
            <p className="mb-2 flex items-center gap-1.5 text-[14px] font-medium text-(--color-ink)">
              <CheckCircle2 size={15} className="text-(--color-primary)" />
              {t("square.resultSummary", {
                sent: String(succeeded.length),
                failed: String(failed.length),
              })}
            </p>
            {failed.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1 rounded-(--radius-md) bg-red-50 p-3">
                {failed.map((result) => (
                  <li key={result.key} className="text-[12px] text-red-700">
                    <span className="font-medium">{nameFor(result.key)}</span> — {result.error}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-(--radius-sm) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-white"
              >
                {t("common.close")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-(--color-ink-muted)">{t("square.explainer")}</p>

            {blocked.length > 0 && (
              <div className="mb-3 rounded-(--radius-md) bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-800">
                  <AlertTriangle size={14} />
                  {t("square.blockedTitle", { count: String(blocked.length) })}
                </p>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {blocked.map((patient) => (
                    <li key={patient.key} className="text-[12px] text-amber-800">
                      {patient.name} —{" "}
                      {patient.balance <= 0
                        ? t("square.blockedNoBalance")
                        : patient.email
                          ? t("square.blockedBadEmail", { email: patient.email })
                          : t("square.blockedNoEmail")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sendable.length > 0 ? (
              <div className="mb-3 max-h-64 overflow-y-auto rounded-(--radius-md) border border-(--color-hairline)">
                <table className="w-full border-collapse text-[13px]">
                  <tbody>
                    {sendable.map((patient) => (
                      <tr key={patient.key} className="border-b border-(--color-hairline) last:border-0">
                        <td className="px-3 py-2 text-(--color-ink)">{patient.name}</td>
                        <td className="px-3 py-2 text-(--color-ink-muted)">{patient.email}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-(--color-ink)">
                          {formatUSD(patient.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mb-3 text-[13px] text-(--color-ink-muted)">{t("square.nothingToSend")}</p>
            )}

            {failure && (
              <p className="mb-3 rounded-(--radius-sm) bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {failure}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-(--color-ink-muted)">
                {t("square.totalLine", {
                  count: String(sendable.length),
                  amount: formatUSD(total),
                })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-(--radius-sm) px-3 py-2 text-[14px] text-(--color-ink-muted) hover:text-(--color-ink)"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={sending || sendable.length === 0 || !config?.configured}
                  onClick={handleSend}
                  className="flex items-center gap-1.5 rounded-(--radius-sm) bg-(--color-primary) px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending
                    ? t("square.sending")
                    : t("square.sendButton", { count: String(sendable.length) })}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
