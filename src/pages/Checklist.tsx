import { useState } from "react";
import { StickyNote, RotateCcw } from "lucide-react";
import { checklistSections } from "../data/checklist";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useHashHighlight } from "../hooks/useHashHighlight";

interface ItemState {
  checked: boolean;
  note: string;
}

type ChecklistState = Record<string, ItemState>;

export default function Checklist() {
  useHashHighlight();
  const [state, setState] = useLocalStorage<ChecklistState>("lh-checklist-state", {});
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  function toggle(id: string) {
    setState((prev) => ({
      ...prev,
      [id]: { checked: !prev[id]?.checked, note: prev[id]?.note ?? "" },
    }));
  }

  function setNote(id: string, note: string) {
    setState((prev) => ({ ...prev, [id]: { checked: prev[id]?.checked ?? false, note } }));
  }

  function resetToday() {
    setState((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, s]) => [id, { ...s, checked: false }])),
    );
  }

  const total = checklistSections.reduce((n, s) => n + s.items.length, 0);
  const done = Object.values(state).filter((s) => s.checked).length;

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
            前台工作 Checklist
          </h1>
          <p className="mt-1 text-[15px] text-(--color-ink-muted)">
            {done} / {total} 已完成 · 每一项可展开写备注
          </p>
        </div>
        <button
          onClick={resetToday}
          className="flex shrink-0 items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
        >
          <RotateCcw size={14} />
          重置今日进度
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {checklistSections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)"
          >
            <h2 className="mb-3 text-[18px] font-bold text-(--color-ink)">{section.title}</h2>
            <ul className="flex flex-col divide-y divide-(--color-hairline)">
              {section.items.map((item) => {
                const itemState = state[item.id];
                const checked = itemState?.checked ?? false;
                const note = itemState?.note ?? "";
                const noteOpen = openNoteId === item.id;
                return (
                  <li key={item.id} id={item.id} className="py-2.5">
                    <div className="flex items-start gap-3">
                      <button
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggle(item.id)}
                        className={[
                          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                          checked
                            ? "border-(--color-primary) bg-(--color-primary)"
                            : "border-(--color-ink-faint)",
                        ].join(" ")}
                      >
                        {checked && (
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M3 8.5L6.2 11.5L13 4.5"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <span
                          className={[
                            "text-[15px]",
                            checked ? "text-(--color-ink-faint) line-through" : "text-(--color-ink)",
                          ].join(" ")}
                        >
                          {item.label}
                        </span>
                        {item.detail && (
                          <span className="block text-[13px] text-(--color-ink-muted)">
                            {item.detail}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setOpenNoteId(noteOpen ? null : item.id)}
                        className={[
                          "flex shrink-0 items-center gap-1 rounded-(--radius-sm) px-1.5 py-1 text-[12px]",
                          note
                            ? "text-(--color-primary)"
                            : "text-(--color-ink-faint) hover:text-(--color-ink-muted)",
                        ].join(" ")}
                      >
                        <StickyNote size={14} />
                      </button>
                    </div>

                    {noteOpen && (
                      <textarea
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(item.id, e.target.value)}
                        placeholder="写点备注…"
                        rows={2}
                        className="mt-2 ml-[30px] w-[calc(100%-30px)] rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas-soft) px-2.5 py-2 text-[13px] text-(--color-ink) outline-none focus:shadow-(--shadow-level-1)"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
