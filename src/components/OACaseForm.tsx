import { useState } from "react";
import type { OACase, Payer } from "../lib/types";
import { slugify } from "../lib/slugify";
import { useLanguage } from "./LanguageProvider";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { defaultPayers } from "../data/payers";

const CUSTOM_PAYER_VALUE = "__custom__";

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

export default function OACaseForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: OACase;
  onSave: (entry: OACase) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [payers] = useSyncedStorage<Payer[]>("lh-payers", defaultPayers);
  const matchingPayer = payers.find((p) => p.name === initial?.payer);
  const [selectedPayerValue, setSelectedPayerValue] = useState(
    matchingPayer ? matchingPayer.id : CUSTOM_PAYER_VALUE,
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [payer, setPayer] = useState(initial?.payer ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [resolution, setResolution] = useState(initial?.resolution ?? "");

  function handlePayerSelect(value: string) {
    setSelectedPayerValue(value);
    if (value !== CUSTOM_PAYER_VALUE) {
      const found = payers.find((p) => p.id === value);
      if (found) setPayer(found.name);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      id: initial?.id ?? slugify(title, "case"),
      title: title.trim(),
      payer: payer.trim(),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      summary: summary.trim(),
      resolution: resolution.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fade-in-up rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) sm:p-6"
    >
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
          value={payer}
          onChange={(e) => setPayer(e.target.value)}
          placeholder={t("oaCaseForm.payerPlaceholder")}
          className={`${inputClass} mb-3`}
        />
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
