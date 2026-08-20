import { useState } from "react";
import type {
  CustomCategoryTemplate,
  CustomEntry,
  Payer,
  PaymentPortal,
  Platform,
} from "../lib/types";
import { slugify } from "../lib/slugify";
import { useLanguage } from "./LanguageProvider";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { defaultPlatforms } from "../data/platforms";
import PortalFields from "./PortalFields";
import { useAuth } from "./AuthProvider";
import VoiceInputButton from "./VoiceInputButton";

const CUSTOM_PAYER_VALUE = "__custom__";

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

export default function CustomEntryForm({
  template,
  initial,
  onSave,
  onCancel,
}: {
  template: CustomCategoryTemplate;
  initial?: CustomEntry;
  onSave: (entry: CustomEntry) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const { syncEnabled, workspace } = useAuth();
  const isPersonalWorkspace = Boolean(syncEnabled && workspace && !workspace.isPrimary);
  const [payers] = useSyncedStorage<Payer[]>("lh-payers", []);
  const [platforms] = useSyncedStorage<Platform[]>(
    "lh-platforms",
    isPersonalWorkspace ? [] : defaultPlatforms,
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? initial?.notes ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [payer, setPayer] = useState(initial?.payer ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? initial?.notes ?? "");
  const [resolution, setResolution] = useState(initial?.resolution ?? "");
  const matchingCasePayer = payers.find((p) => p.name === initial?.payer);
  const [selectedCasePayerValue, setSelectedCasePayerValue] = useState(
    matchingCasePayer ? matchingCasePayer.id : CUSTOM_PAYER_VALUE,
  );
  const matchingPaymentPayer = payers.find((p) => p.name === (initial?.payer ?? initial?.title));
  const [selectedPaymentPayerValue, setSelectedPaymentPayerValue] = useState(
    matchingPaymentPayer ? matchingPaymentPayer.id : CUSTOM_PAYER_VALUE,
  );

  const [paymentPayer, setPaymentPayer] = useState(initial?.title ?? "");
  const showPaymentPayerInput =
    isPersonalWorkspace || payers.length === 0 || selectedPaymentPayerValue === CUSTOM_PAYER_VALUE;
  const [portals, setPortals] = useState<PaymentPortal[]>(
    initial?.portals ?? [{ name: "", url: "" }],
  );

  function appendVoiceText(current: string, text: string, multiline = false) {
    if (!current.trim()) return text;
    const separator = multiline ? "\n" : " ";
    return `${current}${separator}${text}`;
  }

  function handleCasePayerSelect(value: string) {
    setSelectedCasePayerValue(value);
    if (value !== CUSTOM_PAYER_VALUE) {
      const found = payers.find((p) => p.id === value);
      if (found) setPayer(found.name);
    }
  }

  function handlePaymentPayerSelect(value: string) {
    setSelectedPaymentPayerValue(value);
    if (value !== CUSTOM_PAYER_VALUE) {
      const found = payers.find((p) => p.id === value);
      if (found) setPaymentPayer(found.name);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Spread `initial` first in every branch: a template only edits its own fields,
    // so anything it doesn't render must survive the save untouched. Rebuilding the
    // entry from scratch silently destroyed fields whenever the folder's template
    // differed from the one an entry was created under.
    if (template === "checklist") {
      if (!title.trim()) return;
      onSave({
        ...initial,
        id: initial?.id ?? slugify(title, "item"),
        title: title.trim(),
        detail: detail.trim() || undefined,
        notes: detail.trim() || undefined,
        tags: initial?.tags ?? [],
      });
      return;
    }

    if (template === "payments") {
      if (!paymentPayer.trim()) return;
      const cleanPortals = portals
        .map((p) => ({ name: p.name.trim(), url: p.url.trim() }))
        .filter((p) => p.name || p.url);

      onSave({
        ...initial,
        id: initial?.id ?? slugify(paymentPayer, "payer"),
        title: paymentPayer.trim(),
        notes: notes.trim() || undefined,
        tags: initial?.tags ?? [],
        portals: cleanPortals.length > 0 ? cleanPortals : [{ name: "", url: "" }],
      });
      return;
    }

    if (!title.trim()) return;

    onSave({
      ...initial,
      id: initial?.id ?? slugify(title, "case"),
      title: title.trim(),
      payer: isPersonalWorkspace ? undefined : payer.trim(),
      summary: summary.trim(),
      resolution: resolution.trim(),
      notes: summary.trim() || undefined,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fade-in-up rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) sm:p-6"
    >
      {template === "checklist" && (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[12px] font-semibold text-(--color-ink-faint)">
              {t("customEntryForm.checklistItem")}
            </label>
            <VoiceInputButton onTranscript={(text) => setTitle((current) => appendVoiceText(current, text))} />
          </div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("checklistItemForm.contentPlaceholder")}
            className={`${inputClass} mb-3`}
          />

          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[12px] font-semibold text-(--color-ink-faint)">
              {t("customEntryForm.detail")}
            </label>
            <VoiceInputButton onTranscript={(text) => setDetail((current) => appendVoiceText(current, text, true))} />
          </div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            placeholder={t("checklistItemForm.detailPlaceholder")}
            className={inputClass}
          />
        </>
      )}

      {template === "oa-case" && (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[12px] font-semibold text-(--color-ink-faint)">
              {t("oaCaseForm.title")}
            </label>
            <VoiceInputButton onTranscript={(text) => setTitle((current) => appendVoiceText(current, text))} />
          </div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(
              isPersonalWorkspace
                ? "customEntryForm.personalTitlePlaceholder"
                : "oaCaseForm.titlePlaceholder",
            )}
            className={`${inputClass} mb-3`}
          />

          {!isPersonalWorkspace && (
            <>
              <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
                {t("oaCaseForm.payer")}
              </label>
              {payers.length > 0 && (
                <select
                  value={selectedCasePayerValue}
                  onChange={(e) => handleCasePayerSelect(e.target.value)}
                  className={`${inputClass} mb-1.5`}
                >
                  <option value={CUSTOM_PAYER_VALUE}>{t("paymentEntryForm.customPayer")}</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {(payers.length === 0 || selectedCasePayerValue === CUSTOM_PAYER_VALUE) && (
                <input
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                  placeholder={t("oaCaseForm.payerPlaceholder")}
                  className={`${inputClass} mb-3`}
                />
              )}
            </>
          )}

          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[12px] font-semibold text-(--color-ink-faint)">
              {t("oaCaseForm.summary")}
            </label>
            <VoiceInputButton onTranscript={(text) => setSummary((current) => appendVoiceText(current, text, true))} />
          </div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder={t(
              isPersonalWorkspace
                ? "customEntryForm.personalSummaryPlaceholder"
                : "oaCaseForm.summaryPlaceholder",
            )}
            className={`${inputClass} mb-3`}
          />

          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[12px] font-semibold text-(--color-ink-faint)">
              {t("oaCaseForm.resolution")}
            </label>
            <VoiceInputButton onTranscript={(text) => setResolution((current) => appendVoiceText(current, text, true))} />
          </div>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={3}
            placeholder={t(
              isPersonalWorkspace
                ? "customEntryForm.personalResolutionPlaceholder"
                : "oaCaseForm.resolutionPlaceholder",
            )}
            className={`${inputClass} mb-3`}
          />

          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("oaCaseForm.tags")}
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t(
              isPersonalWorkspace
                ? "customEntryForm.personalTagsPlaceholder"
                : "oaCaseForm.tagsPlaceholder",
            )}
            className={inputClass}
          />
        </>
      )}

      {template === "payments" && (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[12px] font-semibold text-(--color-ink-faint)">
              {isPersonalWorkspace ? t("linkEntryForm.title") : t("paymentEntryForm.payer")}
            </label>
            {/* Only offer the mic when the field it types into is actually on screen —
                otherwise dictation silently appended to the payer picked from the dropdown. */}
            {showPaymentPayerInput && (
              <VoiceInputButton onTranscript={(text) => setPaymentPayer((current) => appendVoiceText(current, text))} />
            )}
          </div>
          {!isPersonalWorkspace && payers.length > 0 && (
            <select
              value={selectedPaymentPayerValue}
              onChange={(e) => handlePaymentPayerSelect(e.target.value)}
              className={`${inputClass} mb-1.5`}
            >
              <option value={CUSTOM_PAYER_VALUE}>{t("paymentEntryForm.customPayer")}</option>
              {payers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {showPaymentPayerInput && (
            <input
              autoFocus
              value={paymentPayer}
              onChange={(e) => setPaymentPayer(e.target.value)}
              placeholder={
                isPersonalWorkspace
                  ? t("linkEntryForm.titlePlaceholder")
                  : t("paymentEntryForm.payerPlaceholder")
              }
              className={`${inputClass} mb-3`}
            />
          )}

          <PortalFields
            portals={portals}
            platforms={platforms}
            setPortals={setPortals}
            personalCopy={isPersonalWorkspace}
          />

          <div className="mt-3 mb-1 flex items-center justify-between gap-2">
            <label className="text-[12px] font-semibold text-(--color-ink-faint)">
              {t("paymentEntryForm.notes")}
            </label>
            <VoiceInputButton onTranscript={(text) => setNotes((current) => appendVoiceText(current, text, true))} />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t(
              isPersonalWorkspace
                ? "linkEntryForm.notesPlaceholder"
                : "paymentEntryForm.notesPlaceholder",
            )}
            className={inputClass}
          />
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-(--radius-md) border border-(--color-hairline) px-3 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          className="rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
        >
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
