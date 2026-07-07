import { useState } from "react";
import { Plus, X } from "lucide-react";
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

const CUSTOM_PAYER_VALUE = "__custom__";
const CUSTOM_PLATFORM_VALUE = "__custom__";

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
  const [payers] = useSyncedStorage<Payer[]>("lh-payers", []);
  const [platforms] = useSyncedStorage<Platform[]>("lh-platforms", defaultPlatforms);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? initial?.notes ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [payer, setPayer] = useState(initial?.payer ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? initial?.notes ?? "");
  const [resolution, setResolution] = useState(initial?.resolution ?? "");
  const matchingPayer = payers.find((p) => p.name === (initial?.payer ?? initial?.title));
  const [selectedPayerValue, setSelectedPayerValue] = useState(
    matchingPayer ? matchingPayer.id : CUSTOM_PAYER_VALUE,
  );
  const [paymentPayer, setPaymentPayer] = useState(initial?.title ?? "");
  const [portals, setPortals] = useState<PaymentPortal[]>(
    initial?.portals ?? [{ name: "", url: "" }],
  );

  function handlePayerSelect(value: string) {
    setSelectedPayerValue(value);
    if (value !== CUSTOM_PAYER_VALUE) {
      const found = payers.find((p) => p.id === value);
      if (found) setPaymentPayer(found.name);
    }
  }

  function updatePortal(index: number, field: keyof PaymentPortal, value: string) {
    setPortals((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function handlePlatformSelect(index: number, value: string) {
    if (value === CUSTOM_PLATFORM_VALUE) {
      updatePortal(index, "name", "");
      return;
    }

    const found = platforms.find((platform) => platform.id === value);
    if (!found) return;

    setPortals((prev) =>
      prev.map((portal, i) =>
        i === index
          ? {
              ...portal,
              name: found.name,
              url: found.url?.trim() ? found.url : portal.url,
            }
          : portal,
      ),
    );
  }

  function removePortal(index: number) {
    setPortals((prev) => prev.filter((_, i) => i !== index));
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
      payer: payer.trim(),
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
      className="fade-in-up rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)"
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

          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("oaCaseForm.payer")}
          </label>
          <input
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            placeholder={t("oaCaseForm.payerPlaceholder")}
            className={`${inputClass} mb-3`}
          />

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
            {t("paymentEntryForm.payer")}
          </label>
          {payers.length > 0 && (
            <select
              value={selectedPayerValue}
              onChange={(e) => handlePayerSelect(e.target.value)}
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
          {(payers.length === 0 || selectedPayerValue === CUSTOM_PAYER_VALUE) && (
            <input
              autoFocus
              value={paymentPayer}
              onChange={(e) => setPaymentPayer(e.target.value)}
              placeholder={t("paymentEntryForm.payerPlaceholder")}
              className={`${inputClass} mb-3`}
            />
          )}

          <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
            {t("paymentEntryForm.portalsLabel")}
          </label>
          <div className="flex flex-col gap-2">
            {portals.map((portal, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="flex flex-1 flex-col gap-1.5">
                  {platforms.length > 0 && (
                    <select
                      value={
                        platforms.find((platform) => platform.name === portal.name)?.id ??
                        CUSTOM_PLATFORM_VALUE
                      }
                      onChange={(e) => handlePlatformSelect(i, e.target.value)}
                      className={inputClass}
                    >
                      <option value={CUSTOM_PLATFORM_VALUE}>
                        {t("paymentEntryForm.customPlatform")}
                      </option>
                      {platforms.map((platform) => (
                        <option key={platform.id} value={platform.id}>
                          {platform.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {(platforms.length === 0 ||
                    !platforms.some((platform) => platform.name === portal.name)) && (
                    <input
                      value={portal.name}
                      onChange={(e) => updatePortal(i, "name", e.target.value)}
                      placeholder={t("paymentEntryForm.portalNamePlaceholder")}
                      className={inputClass}
                    />
                  )}
                </div>
                <input
                  value={portal.url}
                  onChange={(e) => updatePortal(i, "url", e.target.value)}
                  placeholder="https://..."
                  className={`${inputClass} flex-1`}
                />
                {portals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePortal(i)}
                    className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink-secondary)"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPortals((prev) => [...prev, { name: "", url: "" }])}
            className="mt-2 flex items-center gap-1 text-[13px] font-medium text-(--color-primary)"
          >
            <Plus size={14} />
            {t("paymentEntryForm.addPortal")}
          </button>

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
