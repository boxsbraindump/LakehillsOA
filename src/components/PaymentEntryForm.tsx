import { useState } from "react";
import type { Payer, PaymentEntry, PaymentPortal, Platform } from "../lib/types";
import { slugify } from "../lib/slugify";
import { defaultPayers } from "../data/payers";
import { defaultPlatforms } from "../data/platforms";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "./LanguageProvider";
import PortalFields from "./PortalFields";

const CUSTOM_PAYER_VALUE = "__custom__";

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

export default function PaymentEntryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: PaymentEntry;
  onSave: (entry: PaymentEntry) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [payers] = useSyncedStorage<Payer[]>("lh-payers", defaultPayers);
  const [platforms] = useSyncedStorage<Platform[]>("lh-platforms", defaultPlatforms);
  const matchingPayer = payers.find((p) => p.name === initial?.payer);
  const [selectedPayerValue, setSelectedPayerValue] = useState(
    matchingPayer ? matchingPayer.id : CUSTOM_PAYER_VALUE,
  );
  const [payer, setPayer] = useState(initial?.payer ?? "");
  const [portals, setPortals] = useState<PaymentPortal[]>(
    initial?.portals ?? [{ name: "", url: "" }],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function handlePayerSelect(value: string) {
    setSelectedPayerValue(value);
    if (value !== CUSTOM_PAYER_VALUE) {
      const found = payers.find((p) => p.id === value);
      if (found) setPayer(found.name);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payer.trim()) return;
    const cleanPortals = portals
      .map((p) => ({ name: p.name.trim(), url: p.url.trim() }))
      .filter((p) => p.name || p.url);

    onSave({
      id: initial?.id ?? slugify(payer, "payer"),
      payer: payer.trim(),
      portals: cleanPortals.length > 0 ? cleanPortals : [{ name: "", url: "" }],
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fade-in-up rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)"
    >
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
          value={payer}
          onChange={(e) => setPayer(e.target.value)}
          placeholder={t("paymentEntryForm.payerPlaceholder")}
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
