import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "./LanguageProvider";
import { useToast } from "./ToastProvider";
import type { FollowUpItem } from "../lib/types";

export const FOLLOW_UPS_KEY = "lh-checklist-followups";

/** Anything still open after this reads as stuck rather than in progress. */
const STALE_AFTER_DAYS = 3;

export function daysOpen(createdAt: number): number {
  return Math.floor((Date.now() - createdAt) / 86_400_000);
}

/**
 * Work that spans days does not belong to a day.
 *
 * Every checklist item is a reference held by a particular date, which is right for a daily
 * routine and wrong for "chase this claim": such a task either had to be copied forward by
 * hand every morning, cluttering each day among the routine, or was forgotten the first time
 * nobody copied it. So follow-ups live outside the calendar entirely — one list, the same on
 * every date, sitting above the day and staying there until it is actually done.
 */
export default function FollowUpBoard() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [items, setItems] = useSyncedStorage<FollowUpItem[]>(FOLLOW_UPS_KEY, []);

  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  // Longest-waiting first: the point of the board is that something has been sitting too long.
  const open = items
    .filter((item) => !item.doneAt)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
  const done = items
    .filter((item) => item.doneAt)
    .slice()
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  function addItem(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setItems((prev) => [
      ...prev,
      { id: `followup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: trimmed, createdAt: Date.now() },
    ]);
    setDraft("");
    setIsAdding(false);
  }

  function patch(id: string, changes: Partial<FollowUpItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function toggleDone(item: FollowUpItem) {
    patch(item.id, { doneAt: item.doneAt ? undefined : Date.now() });
  }

  function removeItem(item: FollowUpItem) {
    setItems((prev) => prev.filter((candidate) => candidate.id !== item.id));
    showToast(t("followUp.deletedToast", { label: item.label }), {
      label: t("common.undo"),
      onClick: () => setItems((prev) => (prev.some((c) => c.id === item.id) ? prev : [...prev, item])),
    });
  }

  function clearDone() {
    const cleared = done;
    if (cleared.length === 0) return;
    setItems((prev) => prev.filter((item) => !item.doneAt));
    showToast(t("followUp.clearedToast", { count: String(cleared.length) }), {
      label: t("common.undo"),
      onClick: () => setItems((prev) => [...prev, ...cleared]),
    });
  }

  function startEditing(item: FollowUpItem) {
    setEditingId(item.id);
    setEditingLabel(item.label);
  }

  function commitEditing() {
    if (!editingId) return;
    const trimmed = editingLabel.trim();
    if (trimmed) patch(editingId, { label: trimmed });
    setEditingId(null);
  }

  // Nothing to carry and nothing to add yet: stay out of the way rather than occupy the top
  // of every day with an empty box.
  if (open.length === 0 && done.length === 0 && !isAdding) {
    return (
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        className="mb-6 flex w-full items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) py-3 text-[13px] font-medium text-(--color-ink-faint) transition-colors hover:border-(--color-primary)/40 hover:text-(--color-primary)"
      >
        <Plus size={14} />
        {t("followUp.emptyAdd")}
      </button>
    );
  }

  return (
    <section className="mb-6 rounded-(--radius-lg) border border-(--color-primary)/25 bg-(--color-primary)/[0.04] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-(--color-ink)">
            {t("followUp.title")}
            {open.length > 0 && (
              <span className="ml-1.5 text-[13px] font-medium text-(--color-ink-muted) tabular-nums">
                {open.length}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-[12px] text-(--color-ink-muted)">{t("followUp.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex shrink-0 items-center gap-1 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1 text-[12px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
        >
          <Plus size={13} />
          {t("followUp.add")}
        </button>
      </div>

      {isAdding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addItem(draft);
          }}
          className="mb-2 flex items-center gap-1.5"
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("followUp.placeholder")}
            className="min-w-0 flex-1 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
          />
          <button
            type="submit"
            className="shrink-0 rounded-(--radius-md) bg-(--color-primary) px-2.5 py-1.5 text-[12px] font-medium text-(--color-on-primary)"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setDraft("");
            }}
            aria-label={t("common.cancel")}
            className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={15} />
          </button>
        </form>
      )}

      <ul className="flex flex-col">
        {open.map((item) => {
          const age = daysOpen(item.createdAt);
          const stale = age >= STALE_AFTER_DAYS;
          return (
            <li key={item.id} className="group border-t border-(--color-hairline)/60 py-2 first:border-t-0">
              <div className="flex items-start gap-2.5">
                <button
                  role="checkbox"
                  aria-checked={false}
                  aria-label={t("followUp.markDone", { label: item.label })}
                  onClick={() => toggleDone(item)}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border border-(--color-ink-faint) transition-colors hover:border-(--color-primary)"
                />

                {editingId === item.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitEditing();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                  >
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onBlur={commitEditing}
                      className="min-w-0 flex-1 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1 text-[14px] text-(--color-ink) outline-none focus:border-(--color-primary)"
                    />
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                    <span className="select-text text-[15px] text-(--color-ink)">{item.label}</span>
                    {age >= 1 && (
                      <span
                        className={[
                          "ml-2 text-[12px] tabular-nums",
                          stale ? "font-medium text-amber-700" : "text-(--color-ink-faint)",
                        ].join(" ")}
                      >
                        {t("followUp.daysOpen", { days: String(age) })}
                      </span>
                    )}
                    {item.note && openNoteId !== item.id && (
                      <span className="block select-text text-[13px] whitespace-pre-wrap text-(--color-ink-muted)">
                        {item.note}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setOpenNoteId((prev) => (prev === item.id ? null : item.id))}
                    aria-label={t("followUp.noteAria")}
                    className={[
                      "rounded-(--radius-sm) p-1 hover:text-(--color-primary)",
                      item.note ? "text-(--color-primary)" : "text-(--color-ink-faint)",
                    ].join(" ")}
                  >
                    <MessageSquare size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(item)}
                    aria-label={t("common.edit")}
                    className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    aria-label={t("common.delete")}
                    className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {openNoteId === item.id && (
                <textarea
                  autoFocus
                  value={item.note ?? ""}
                  onChange={(e) => patch(item.id, { note: e.target.value })}
                  placeholder={t("followUp.notePlaceholder")}
                  rows={2}
                  className="mt-1.5 ml-[28px] w-[calc(100%-28px)] rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2.5 py-1.5 text-[13px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
                />
              )}
            </li>
          );
        })}
      </ul>

      {done.length > 0 && (
        <div className="mt-2 border-t border-(--color-hairline)/60 pt-2">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowDone((prev) => !prev)}
              className="flex items-center gap-1 text-[12px] font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
            >
              {showDone ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {t("followUp.doneCount", { count: String(done.length) })}
            </button>
            {showDone && (
              <button
                type="button"
                onClick={clearDone}
                className="text-[12px] font-medium text-(--color-ink-faint) hover:text-red-500"
              >
                {t("followUp.clearDone")}
              </button>
            )}
          </div>

          {showDone && (
            <ul className="mt-1 flex flex-col gap-1">
              {done.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5">
                  <button
                    role="checkbox"
                    aria-checked
                    aria-label={t("followUp.markNotDone", { label: item.label })}
                    onClick={() => toggleDone(item)}
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-(--color-primary) bg-(--color-primary)"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 8.5L6.2 11.5L13 4.5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <span className="select-text text-[14px] text-(--color-ink-faint) line-through">
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
