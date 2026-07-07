import { useState } from "react";
import type { ChecklistItem } from "../lib/types";
import { slugify } from "../lib/slugify";
import { useLanguage } from "./LanguageProvider";

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas-soft) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

export default function ChecklistItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ChecklistItem;
  onSave: (item: ChecklistItem) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;

    onSave({
      id: initial?.id ?? slugify(label, "item"),
      label: label.trim(),
      detail: detail.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="fade-in-up py-2.5">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t("checklistItemForm.contentPlaceholder")}
        className={`${inputClass} mb-1.5`}
      />
      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder={t("checklistItemForm.detailPlaceholder")}
        className={inputClass}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-(--radius-md) border border-(--color-hairline) px-3 py-1 text-[12px] font-medium text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          className="rounded-(--radius-md) bg-(--color-primary) px-3 py-1 text-[12px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
        >
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
