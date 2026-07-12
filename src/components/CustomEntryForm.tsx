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
  const [platforms] = useSyncedStorage<Platform[]>("lh-platforms", defaultPlatforms);
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
  const [portals, setPortals] = useState<PaymentPortal[]>(
    initial?.portals ?? [{ name: "", url: "" }],
  );

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

    if (template === "checklist") {
      if (!title.trim()) return;
      onSave({
        id: initial?.id ?? slugify(title, "item"),
        title: title.trim(),
        detail: detail.trim() || undefined,
        notes: detail.trim() || undefined,
        tags: [],
      });
      return;
    }

    if (template === "payments") {
      if (!paymentPayer.trim()) return;
      const cleanPortals = portals
        .map((p) => ({ name: p.name.trim(), url: p.url.trim() }))
        .filter((p) => p.name || p.url);

      onSave({
        id: initial?.id ?? slugify(paymentPayer, "payer"),
        title: paymentPayer.trim(),
        notes: notes.trim() || undefined,
        tags: [],
        portals: cleanPortals.length > 0 ? cleanPortals : [{ name: "", url: "" }],
      });
      return;
    }

    if (!title.trim()) return;

    onSave({
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
          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("customEntryForm.checklistItem")}
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("checklistItemForm.contentPlaceholder")}
            className={`${inputClass} mb-3`}
          />

          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("customEntryForm.detail")}
          </label>
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
          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("oaCaseForm.title")}
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("oaCaseForm.titlePlaceholder")}
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

          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("oaCaseForm.summary")}
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder={t("oaCaseForm.summaryPlaceholder")}
            className={`${inputClass} mb-3`}
          />

          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("oaCaseForm.resolution")}
          </label>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={3}
            placeholder={t("oaCaseForm.resolutionPlaceholder")}
            className={`${inputClass} mb-3`}
          />

          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("oaCaseForm.tags")}
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="denial, prior authorization"
            className={inputClass}
          />
        </>
      )}

      {template === "payments" && (
        <>
          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {isPersonalWorkspace ? t("linkEntryForm.title") : t("paymentEntryForm.payer")}
          </label>
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
          {(isPersonalWorkspace || payers.length === 0 || selectedPaymentPayerValue === CUSTOM_PAYER_VALUE) && (
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

          <PortalFields portals={portals} platforms={platforms} setPortals={setPortals} />

          <label className="mt-3 mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("paymentEntryForm.notes")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t("paymentEntryForm.notesPlaceholder")}
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
