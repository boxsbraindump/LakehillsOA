import { useState } from "react";
import type { OACase } from "../lib/types";
import { slugify } from "../lib/slugify";

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
  const [title, setTitle] = useState(initial?.title ?? "");
  const [payer, setPayer] = useState(initial?.payer ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [resolution, setResolution] = useState(initial?.resolution ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      id: initial?.id ?? slugify(title, "case"),
      title: title.trim(),
      payer: payer.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      summary: summary.trim(),
      resolution: resolution.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fade-in-up rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)"
    >
      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        标题
      </label>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="例如 有二次保险但 claim 仍被 deny"
        className={`${inputClass} mb-3`}
      />

      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        保险公司 / Payer
      </label>
      <input
        value={payer}
        onChange={(e) => setPayer(e.target.value)}
        placeholder="例如 Blue Shield"
        className={`${inputClass} mb-3`}
      />

      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        情况说明
      </label>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder="发生了什么"
        className={`${inputClass} mb-3`}
      />

      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        处理方式
      </label>
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        rows={3}
        placeholder="怎么解决的"
        className={`${inputClass} mb-3`}
      />

      <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
        标签（逗号分隔，可选）
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
          取消
        </button>
        <button
          type="submit"
          className="rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[13px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
        >
          保存
        </button>
      </div>
    </form>
  );
}
