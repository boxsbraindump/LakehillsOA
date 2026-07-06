import { useState } from "react";
import {
  StickyNote,
  RotateCcw,
  Pencil,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { checklistSections } from "../data/checklist";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import ChecklistItemForm from "../components/ChecklistItemForm";
import { slugify } from "../lib/slugify";
import { todayKey, shiftDateKey, formatDisplayDate } from "../lib/date";
import type { ChecklistItem, ChecklistSectionMeta } from "../lib/types";

interface ItemState {
  checked: boolean;
  note: string;
}

type DayState = Record<string, ItemState>;
/** Keyed by YYYY-MM-DD — checked/note state is per day; sections & items themselves are global. */
type ChecklistState = Record<string, DayState>;

interface NoteMatch {
  date: string;
  itemId: string;
  itemLabel: string;
  note: string;
}

export default function Checklist() {
  useHashHighlight();
  const [state, setState] = useLocalStorage<ChecklistState>("lh-checklist-state", {});
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [noteQuery, setNoteQuery] = useState("");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [itemOverrides, setItemOverrides] = useLocalStorage<Record<string, ChecklistItem>>(
    "lh-checklist-item-overrides",
    {},
  );
  const [customItems, setCustomItems] = useLocalStorage<Record<string, ChecklistItem[]>>(
    "lh-checklist-custom-items",
    {},
  );
  const [hiddenItemIds, setHiddenItemIds] = useLocalStorage<string[]>(
    "lh-checklist-hidden-items",
    [],
  );
  const [customSections, setCustomSections] = useLocalStorage<ChecklistSectionMeta[]>(
    "lh-checklist-custom-sections",
    [],
  );
  const [hiddenSectionIds, setHiddenSectionIds] = useLocalStorage<string[]>(
    "lh-checklist-hidden-sections",
    [],
  );
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [justAddedSectionId, setJustAddedSectionId] = useState<string | null>(null);

  const sectionMetas = [
    ...checklistSections
      .filter((s) => !hiddenSectionIds.includes(s.id))
      .map((s) => ({ id: s.id, title: s.title, baseItems: s.items })),
    ...customSections.map((s) => ({ id: s.id, title: s.title, baseItems: [] as ChecklistItem[] })),
  ];

  const displayedSections = sectionMetas.map((section) => ({
    id: section.id,
    title: section.title,
    items: [
      ...section.baseItems.map((item) => itemOverrides[item.id] ?? item),
      ...(customItems[section.id] ?? []),
    ].filter((item) => !hiddenItemIds.includes(item.id)),
  }));

  const dayState = state[selectedDate] ?? {};

  function toggle(id: string) {
    setState((prev) => {
      const day = prev[selectedDate] ?? {};
      return {
        ...prev,
        [selectedDate]: {
          ...day,
          [id]: { checked: !day[id]?.checked, note: day[id]?.note ?? "" },
        },
      };
    });
  }

  function setNote(id: string, note: string) {
    setState((prev) => {
      const day = prev[selectedDate] ?? {};
      return {
        ...prev,
        [selectedDate]: { ...day, [id]: { checked: day[id]?.checked ?? false, note } },
      };
    });
  }

  function resetSelectedDay() {
    setState((prev) => {
      const day = prev[selectedDate] ?? {};
      return {
        ...prev,
        [selectedDate]: Object.fromEntries(
          Object.entries(day).map(([id, s]) => [id, { ...s, checked: false }]),
        ),
      };
    });
  }

  function jumpToMatch(match: NoteMatch) {
    setSelectedDate(match.date);
    setOpenNoteId(match.itemId);
    setNoteQuery("");
    requestAnimationFrame(() => {
      const el = document.getElementById(match.itemId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-highlight");
      setTimeout(() => el?.classList.remove("ring-highlight"), 2000);
    });
  }

  function isCustomItem(sectionId: string, itemId: string) {
    return (customItems[sectionId] ?? []).some((i) => i.id === itemId);
  }

  function isCustomSection(sectionId: string) {
    return customSections.some((s) => s.id === sectionId);
  }

  function handleSaveItem(sectionId: string, updated: ChecklistItem) {
    if (isCustomItem(sectionId, updated.id)) {
      setCustomItems((prev) => ({
        ...prev,
        [sectionId]: prev[sectionId].map((i) => (i.id === updated.id ? updated : i)),
      }));
    } else {
      setItemOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    }
    setEditingItemId(null);
  }

  function handleCreateItem(sectionId: string, created: ChecklistItem) {
    setCustomItems((prev) => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] ?? []), created],
    }));
    setAddingSectionId(null);
    setJustAddedId(created.id);
  }

  function handleDeleteItem(sectionId: string, item: ChecklistItem) {
    if (!window.confirm(`删除「${item.label}」？`)) return;
    const wasCustom = isCustomItem(sectionId, item.id);
    const trashId = `checklist:${item.id}`;

    if (wasCustom) {
      setCustomItems((prev) => ({
        ...prev,
        [sectionId]: prev[sectionId].filter((i) => i.id !== item.id),
      }));
    } else {
      setHiddenItemIds((prev) => [...prev, item.id]);
    }

    addToTrash({
      trashId,
      category: "checklist",
      itemId: item.id,
      sectionId,
      wasCustom,
      deletedAt: Date.now(),
      title: item.label,
      snapshot: item,
    });

    showToast(`已删除「${item.label}」`, {
      label: "撤销",
      onClick: () => {
        if (wasCustom) {
          setCustomItems((prev) => ({
            ...prev,
            [sectionId]: [...(prev[sectionId] ?? []), item],
          }));
        } else {
          setHiddenItemIds((prev) => prev.filter((id) => id !== item.id));
        }
        removeFromTrash(trashId);
      },
    });
  }

  function handleCreateSection(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = slugify(trimmed, "section");
    setCustomSections((prev) => [...prev, { id, title: trimmed }]);
    setIsAddingSection(false);
    setNewSectionTitle("");
    setJustAddedSectionId(id);
  }

  function handleDeleteSection(section: { id: string; title: string; items: ChecklistItem[] }) {
    if (!window.confirm(`删除整个 Section「${section.title}」？其中的 ${section.items.length} 个事项也会一并删除。`))
      return;
    const wasCustom = isCustomSection(section.id);
    const trashId = `checklist-section:${section.id}`;

    if (wasCustom) {
      setCustomSections((prev) => prev.filter((s) => s.id !== section.id));
    } else {
      setHiddenSectionIds((prev) => [...prev, section.id]);
    }

    addToTrash({
      trashId,
      category: "checklist",
      entryType: "section",
      itemId: section.id,
      wasCustom,
      deletedAt: Date.now(),
      title: section.title,
      snapshot: { id: section.id, title: section.title, items: section.items },
    });

    showToast(`已删除 Section「${section.title}」`, {
      label: "撤销",
      onClick: () => {
        if (wasCustom) {
          setCustomSections((prev) => [...prev, { id: section.id, title: section.title }]);
        } else {
          setHiddenSectionIds((prev) => prev.filter((id) => id !== section.id));
        }
        removeFromTrash(trashId);
      },
    });
  }

  const total = displayedSections.reduce((n, s) => n + s.items.length, 0);
  const done = Object.values(dayState).filter((s) => s.checked).length;
  const isToday = selectedDate === todayKey();

  const noteMatches: NoteMatch[] = (() => {
    const q = noteQuery.trim().toLowerCase();
    if (!q) return [];
    const results: NoteMatch[] = [];
    for (const [date, day] of Object.entries(state)) {
      for (const [itemId, itemState] of Object.entries(day)) {
        if (!itemState.note || !itemState.note.toLowerCase().includes(q)) continue;
        let itemLabel = itemId;
        for (const section of displayedSections) {
          const found = section.items.find((i) => i.id === itemId);
          if (found) {
            itemLabel = found.label;
            break;
          }
        }
        results.push({ date, itemId, itemLabel, note: itemState.note });
      }
    }
    return results.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  })();

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          前台工作 Checklist
        </h1>
        <button
          onClick={resetSelectedDay}
          className="flex shrink-0 items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
        >
          <RotateCcw size={14} />
          重置当日进度
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)" />
        <input
          value={noteQuery}
          onChange={(e) => setNoteQuery(e.target.value)}
          placeholder="搜索所有日期的备注，比如患者姓名…"
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) py-2.5 pr-3 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)"
        />
        {noteQuery.trim() && (
          <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-10 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) shadow-(--shadow-level-2)">
            {noteMatches.length === 0 ? (
              <p className="px-4 py-6 text-center text-[14px] text-(--color-ink-faint)">
                没有找到匹配的备注
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto py-1.5">
                {noteMatches.map((match) => (
                  <li key={`${match.date}-${match.itemId}`}>
                    <button
                      onClick={() => jumpToMatch(match)}
                      className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-(--color-canvas-soft)"
                    >
                      <span className="text-[14px] font-medium text-(--color-ink)">
                        {match.itemLabel}
                      </span>
                      <span className="text-[13px] text-(--color-ink-muted)">
                        {formatDisplayDate(match.date)} · {match.note}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedDate((d) => shiftDateKey(d, -1))}
            aria-label="前一天"
            className="rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-ink-secondary)"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[13px] text-(--color-ink) outline-none focus:shadow-(--shadow-level-1)"
          />
          <button
            onClick={() => setSelectedDate((d) => shiftDateKey(d, 1))}
            aria-label="后一天"
            className="rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-ink-secondary)"
          >
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayKey())}
              className="rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
            >
              今天
            </button>
          )}
        </div>
        <p className="text-[13px] text-(--color-ink-muted)">
          {formatDisplayDate(selectedDate)} · {done} / {total} 已完成
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {displayedSections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={[
              "group/section relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)",
              section.id === justAddedSectionId ? "fade-in-up" : "",
            ].join(" ")}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[18px] font-bold text-(--color-ink)">{section.title}</h2>
              <button
                onClick={() => handleDeleteSection(section)}
                aria-label="删除 Section"
                className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover/section:opacity-100 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <ul className="flex flex-col divide-y divide-(--color-hairline)">
              {section.items.map((item) => {
                if (editingItemId === item.id) {
                  return (
                    <li key={item.id}>
                      <ChecklistItemForm
                        initial={item}
                        onSave={(updated) => handleSaveItem(section.id, updated)}
                        onCancel={() => setEditingItemId(null)}
                      />
                    </li>
                  );
                }

                const itemState = dayState[item.id];
                const checked = itemState?.checked ?? false;
                const note = itemState?.note ?? "";
                const noteOpen = openNoteId === item.id;
                return (
                  <li
                    key={item.id}
                    id={item.id}
                    className={["group py-2.5", item.id === justAddedId ? "fade-in-up" : ""].join(
                      " ",
                    )}
                  >
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
                        onClick={() => setEditingItemId(item.id)}
                        aria-label="编辑"
                        className="flex shrink-0 items-center rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--color-primary)"
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(section.id, item)}
                        aria-label="删除"
                        className="flex shrink-0 items-center rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>

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

              {addingSectionId === section.id && (
                <li>
                  <ChecklistItemForm
                    onSave={(created) => handleCreateItem(section.id, created)}
                    onCancel={() => setAddingSectionId(null)}
                  />
                </li>
              )}
            </ul>

            {addingSectionId !== section.id && (
              <button
                onClick={() => setAddingSectionId(section.id)}
                className="mt-2 flex items-center gap-1 text-[13px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:text-(--color-primary) active:scale-[0.97]"
              >
                <Plus size={14} />
                添加事项
              </button>
            )}
          </section>
        ))}

        {isAddingSection ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateSection(newSectionTitle);
            }}
            className="fade-in-up rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)"
          >
            <label className="mb-1 block text-[12px] font-semibold text-(--color-ink-faint)">
              Section 名称
            </label>
            <input
              autoFocus
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              placeholder="例如 夜间检查"
              className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas-soft) px-2.5 py-1.5 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddingSection(false);
                  setNewSectionTitle("");
                }}
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
        ) : (
          <button
            onClick={() => setIsAddingSection(true)}
            className="flex min-h-[64px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
          >
            <Plus size={16} />
            添加新 Section
          </button>
        )}
      </div>
    </div>
  );
}
