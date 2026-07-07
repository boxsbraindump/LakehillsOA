import { useState } from "react";
import type { CustomEntry } from "../lib/types";
import { slugify } from "../lib/slugify";
import { useLanguage } from "./LanguageProvider";

const inputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

export default function CustomEntryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CustomEntry;
  onSave: (entry: CustomEntry) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      id: initial?.id ?? slugify(title, "entry"),
      title: title.trim(),
      notes: notes.trim() || undefined,
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
      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        {t("customEntryForm.title")}
      </label>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("customEntryForm.titlePlaceholder")}
        className={`${inputClass} mb-3`}
      />

      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        {t("customEntryForm.notes")}
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={t("customEntryForm.notesPlaceholder")}
        className={`${inputClass} mb-3`}
      />

      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        {t("customEntryForm.tags")}
      </label>
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
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
