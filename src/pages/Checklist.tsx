import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  StickyNote,
  Copy,
  RotateCcw,
  Pencil,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import { useConfirm } from "../components/ConfirmProvider";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useSyncedStorage<ChecklistState>("lh-checklist-state", {});
  const [selectedDate, setSelectedDate] = useState(searchParams.get("date") ?? todayKey());
  const [noteQuery, setNoteQuery] = useState("");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [customItems, setCustomItems] = useSyncedStorage<Record<string, ChecklistItem[]>>(
    "lh-checklist-custom-items",
    {},
  );
  const [customSections, setCustomSections] = useSyncedStorage<ChecklistSectionMeta[]>(
    "lh-checklist-custom-sections",
    [],
  );
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { t, lang } = useLanguage();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [justAddedSectionId, setJustAddedSectionId] = useState<string | null>(null);
  const [dayItemIds, setDayItemIds] = useSyncedStorage<Record<string, string[]>>(
    "lh-checklist-day-item-ids",
    {},
  );
  const [daySectionIds, setDaySectionIds] = useSyncedStorage<Record<string, string[]>>(
    "lh-checklist-day-section-ids",
    {},
  );
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");

  useEffect(() => {
    const routeDate = searchParams.get("date");
    if (routeDate && routeDate !== selectedDate) setSelectedDate(routeDate);
  }, [searchParams, selectedDate]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setSearchParams(date === todayKey() ? {} : { date }, { replace: true });
  }

  const sectionMetas = customSections.map((s) => ({
    id: s.id,
    title: s.title,
    baseItems: [] as ChecklistItem[],
  }));

  const allSections = sectionMetas.map((section) => ({
    id: section.id,
    title: section.title,
    items: [...section.baseItems, ...(customItems[section.id] ?? [])],
  }));

  const allItemIdSet = new Set(allSections.flatMap((section) => section.items.map((item) => item.id)));
  const dayState = state[selectedDate] ?? {};
  const selectedDayItemIds = getDayItemIds(selectedDate);
  const selectedDayItemIdSet = new Set(selectedDayItemIds);
  const selectedDaySectionIdSet = new Set(getDaySectionIds(selectedDate, selectedDayItemIds));
  const displayedSections = allSections
    .filter(
      (section) =>
        selectedDaySectionIdSet.has(section.id) ||
        section.items.some((item) => selectedDayItemIdSet.has(item.id)),
    )
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => selectedDayItemIdSet.has(item.id)),
    }));

  function getDayItemIds(date: string) {
    const storedIds = dayItemIds[date];
    if (storedIds) return storedIds.filter((id) => allItemIdSet.has(id));

    return Object.entries(state[date] ?? {})
      .filter(([, itemState]) => itemState.checked || itemState.note.trim())
      .filter(([id]) => allItemIdSet.has(id))
      .map(([id]) => id);
  }

  function getDaySectionIds(date: string, itemIds = getDayItemIds(date)) {
    const customSectionIdSet = new Set(customSections.map((section) => section.id));
    const storedIds = daySectionIds[date];
    if (storedIds) return storedIds.filter((id) => customSectionIdSet.has(id));

    const itemIdSet = new Set(itemIds);
    return allSections
      .filter((section) => section.items.some((item) => itemIdSet.has(item.id)))
      .map((section) => section.id);
  }

  function addItemsToDay(date: string, itemIds: string[]) {
    setDayItemIds((prev) => ({
      ...prev,
      [date]: Array.from(new Set([...(prev[date] ?? getDayItemIds(date)), ...itemIds])),
    }));
  }

  function addSectionsToDay(date: string, sectionIds: string[]) {
    setDaySectionIds((prev) => ({
      ...prev,
      [date]: Array.from(new Set([...(prev[date] ?? getDaySectionIds(date)), ...sectionIds])),
    }));
  }

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

  async function resetSelectedDay() {
    if (
      hasSelectedDayContent(selectedDate) &&
      !(await confirm({
        title: t("checklist.clearDayConfirmTitle"),
        message: t("checklist.clearDayConfirm", {
          date: formatDisplayDate(selectedDate, lang),
        }),
        confirmLabel: t("checklist.clearDay"),
        tone: "default",
      }))
    )
      return;

    setState((prev) => {
      const { [selectedDate]: _removed, ...rest } = prev;
      return rest;
    });
    setDayItemIds((prev) => {
      const { [selectedDate]: _removed, ...rest } = prev;
      return rest;
    });
    setDaySectionIds((prev) => {
      const { [selectedDate]: _removed, ...rest } = prev;
      return rest;
    });
    setOpenNoteId(null);
  }

  function compactDayState(day: DayState | undefined) {
    return Object.fromEntries(
      Object.entries(day ?? {}).filter(([, itemState]) => itemState.checked || itemState.note.trim()),
    ) as DayState;
  }

  function hasDayContent(day: DayState | undefined) {
    return Object.keys(compactDayState(day)).length > 0;
  }

  function hasSelectedDayContent(date: string) {
    return getDaySectionIds(date).length > 0 || getDayItemIds(date).length > 0 || hasDayContent(state[date]);
  }

  async function copyPreviousDay() {
    const sourceDate = shiftDateKey(selectedDate, -1);
    const sourceDay = compactDayState(state[sourceDate]);
    const sourceItemIds = getDayItemIds(sourceDate);
    const sourceSectionIds = getDaySectionIds(sourceDate, sourceItemIds);

    if (sourceSectionIds.length === 0 && sourceItemIds.length === 0 && Object.keys(sourceDay).length === 0) {
      showToast(t("checklist.noPreviousDayToast", { date: formatDisplayDate(sourceDate, lang) }));
      return;
    }

    if (
      hasSelectedDayContent(selectedDate) &&
      !(await confirm({
        title: t("checklist.copyPreviousDayConfirmTitle"),
        message: t("checklist.copyPreviousDayConfirm", {
          sourceDate: formatDisplayDate(sourceDate, lang),
          targetDate: formatDisplayDate(selectedDate, lang),
        }),
        confirmLabel: t("checklist.copyPreviousDay"),
        tone: "default",
      }))
    )
      return;

    setState((prev) => ({ ...prev, [selectedDate]: sourceDay }));
    setDayItemIds((prev) => ({ ...prev, [selectedDate]: sourceItemIds }));
    setDaySectionIds((prev) => ({ ...prev, [selectedDate]: sourceSectionIds }));
    setOpenNoteId(null);
    showToast(
      t("checklist.copiedPreviousDayToast", { date: formatDisplayDate(sourceDate, lang) }),
    );
  }

  function jumpToMatch(match: NoteMatch) {
    selectDate(match.date);
    setOpenNoteId(match.itemId);
    setNoteQuery("");
    requestAnimationFrame(() => {
      const el = document.getElementById(match.itemId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-highlight");
      setTimeout(() => el?.classList.remove("ring-highlight"), 2000);
    });
  }

  function isCustomSection(sectionId: string) {
    return customSections.some((s) => s.id === sectionId);
  }

  function handleSaveItem(sectionId: string, updated: ChecklistItem) {
    setCustomItems((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).map((i) => (i.id === updated.id ? updated : i)),
    }));
    setEditingItemId(null);
  }

  function handleCreateItem(sectionId: string, created: ChecklistItem) {
    setCustomItems((prev) => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] ?? []), created],
    }));
    addItemsToDay(selectedDate, [created.id]);
    addSectionsToDay(selectedDate, [sectionId]);
    setAddingSectionId(null);
    setJustAddedId(created.id);
  }

  async function handleDeleteItem(sectionId: string, item: ChecklistItem) {
    if (!(await confirm({ message: t("checklist.deleteItemConfirm", { label: item.label }) }))) return;
    const trashId = `checklist:${item.id}`;

    setCustomItems((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).filter((i) => i.id !== item.id),
    }));

    addToTrash({
      trashId,
      category: "checklist",
      itemId: item.id,
      sectionId,
      wasCustom: true,
      deletedAt: Date.now(),
      title: item.label,
      snapshot: item,
    });

    showToast(t("checklist.deletedItemToast", { label: item.label }), {
      label: t("common.undo"),
      onClick: () => {
        setCustomItems((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? []), item],
        }));
        addItemsToDay(selectedDate, [item.id]);
        addSectionsToDay(selectedDate, [sectionId]);
        removeFromTrash(trashId);
      },
    });
    setDayItemIds((prev) => ({
      ...prev,
      [selectedDate]: (prev[selectedDate] ?? getDayItemIds(selectedDate)).filter(
        (id) => id !== item.id,
      ),
    }));
  }

  function handleCreateSection(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = slugify(trimmed, "section");
    setCustomSections((prev) => [...prev, { id, title: trimmed }]);
    addSectionsToDay(selectedDate, [id]);
    setIsAddingSection(false);
    setNewSectionTitle("");
    setJustAddedSectionId(id);
  }

  function startEditingSection(section: { id: string; title: string }) {
    setEditingSectionId(section.id);
    setEditingSectionTitle(section.title);
  }

  function cancelEditingSection() {
    setEditingSectionId(null);
    setEditingSectionTitle("");
  }

  function handleSaveSectionTitle(sectionId: string) {
    const trimmed = editingSectionTitle.trim();
    if (!trimmed) return;

    setCustomSections((prev) =>
      prev.map((section) => (section.id === sectionId ? { ...section, title: trimmed } : section)),
    );

    cancelEditingSection();
  }

  async function handleDeleteSection(section: { id: string; title: string; items: ChecklistItem[] }) {
    if (
      !(await confirm({
        message: t("checklist.deleteSectionConfirm", {
          title: section.title,
          count: section.items.length,
        }),
      }))
    )
      return;
    const wasCustom = isCustomSection(section.id);
    const trashId = `checklist-section:${section.id}`;

    setCustomSections((prev) => prev.filter((s) => s.id !== section.id));
    const removedItemIds = new Set(section.items.map((item) => item.id));
    setDaySectionIds((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([date, ids]) => [date, ids.filter((id) => id !== section.id)]),
      ),
    );
    setDayItemIds((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([date, ids]) => [
          date,
          ids.filter((id) => !removedItemIds.has(id)),
        ]),
      ),
    );

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

    showToast(t("checklist.deletedSectionToast", { title: section.title }), {
      label: t("common.undo"),
      onClick: () => {
        setCustomSections((prev) => [...prev, { id: section.id, title: section.title }]);
        addSectionsToDay(selectedDate, [section.id]);
        addItemsToDay(selectedDate, section.items.map((item) => item.id));
        removeFromTrash(trashId);
      },
    });
  }

  const total = displayedSections.reduce((n, s) => n + s.items.length, 0);
  const done = displayedSections.reduce(
    (n, s) => n + s.items.filter((item) => dayState[item.id]?.checked).length,
    0,
  );
  const isToday = selectedDate === todayKey();

  const noteMatches: NoteMatch[] = (() => {
    const q = noteQuery.trim().toLowerCase();
    if (!q) return [];
    const results: NoteMatch[] = [];
    for (const [date, day] of Object.entries(state)) {
      for (const [itemId, itemState] of Object.entries(day)) {
        if (!itemState.note || !itemState.note.toLowerCase().includes(q)) continue;
        let itemLabel = itemId;
        for (const section of allSections) {
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
          {t("checklist.title")}
        </h1>
        <button
          onClick={resetSelectedDay}
          className="flex shrink-0 items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
        >
          <RotateCcw size={14} />
          {t("checklist.clearDay")}
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)" />
        <input
          value={noteQuery}
          onChange={(e) => setNoteQuery(e.target.value)}
          placeholder={t("checklist.searchPlaceholder")}
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) py-2.5 pr-16 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)"
        />
        {noteQuery && (
          <button
            type="button"
            onClick={() => setNoteQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-(--radius-sm) px-2 py-1 text-[12px] font-medium text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-primary)"
          >
            {t("common.cancel")}
          </button>
        )}
        {noteQuery.trim() && (
          <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-10 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) shadow-(--shadow-level-2)">
            {noteMatches.length === 0 ? (
              <p className="px-4 py-6 text-center text-[14px] text-(--color-ink-faint)">
                {t("checklist.noNoteMatches")}
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
                        {formatDisplayDate(match.date, lang)} · {match.note}
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
            onClick={() => selectDate(shiftDateKey(selectedDate, -1))}
            aria-label={t("checklist.prevDay")}
            className="rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-ink-secondary)"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && selectDate(e.target.value)}
            className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[13px] text-(--color-ink) outline-none focus:shadow-(--shadow-level-1)"
          />
          <button
            onClick={() => selectDate(shiftDateKey(selectedDate, 1))}
            aria-label={t("checklist.nextDay")}
            className="rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-ink-secondary)"
          >
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button
              onClick={() => selectDate(todayKey())}
              className="rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
            >
              {t("checklist.today")}
            </button>
          )}
          <button
            onClick={copyPreviousDay}
            className="flex items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
          >
            <Copy size={14} />
            {t("checklist.copyPreviousDay")}
          </button>
        </div>
        <p className="text-[13px] text-(--color-ink-muted)">
          {formatDisplayDate(selectedDate, lang)} · {t("checklist.completedCount", { done, total })}
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
              {editingSectionId === section.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveSectionTitle(section.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <input
                    autoFocus
                    value={editingSectionTitle}
                    onChange={(e) => setEditingSectionTitle(e.target.value)}
                    aria-label={t("checklist.sectionNameLabel")}
                    className="min-w-0 flex-1 rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas-soft) px-2.5 py-1.5 text-[16px] font-semibold text-(--color-ink) outline-none focus:border-(--color-primary) focus:shadow-(--shadow-level-1)"
                  />
                  <button
                    type="submit"
                    aria-label={t("common.save")}
                    className="shrink-0 rounded-(--radius-sm) p-1.5 text-(--color-primary) hover:bg-(--color-canvas-soft)"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditingSection}
                    aria-label={t("common.cancel")}
                    className="shrink-0 rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-ink-secondary)"
                  >
                    <X size={15} />
                  </button>
                </form>
              ) : (
                <>
                  <h2 className="min-w-0 text-[18px] font-bold text-(--color-ink)">
                    {section.title}
                  </h2>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/section:opacity-100">
                    <button
                      onClick={() => startEditingSection(section)}
                      aria-label={t("checklist.editSectionAria")}
                      className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteSection(section)}
                      aria-label={t("checklist.deleteSectionAria")}
                      className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
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
                        aria-label={t("common.edit")}
                        className="flex shrink-0 items-center rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--color-primary)"
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(section.id, item)}
                        aria-label={t("common.delete")}
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

                    {note && !noteOpen && (
                      <div className="mt-2 ml-[30px] w-[calc(100%-30px)] rounded-(--radius-md) bg-(--color-canvas-soft) px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-(--color-ink-secondary)">
                        {note}
                      </div>
                    )}

                    {noteOpen && (
                      <textarea
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(item.id, e.target.value)}
                        placeholder={t("checklist.notePlaceholder")}
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
                {t("checklist.addItem")}
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
              {t("checklist.sectionNameLabel")}
            </label>
            <input
              autoFocus
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              placeholder={t("checklist.sectionNamePlaceholder")}
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
        ) : (
          <button
            onClick={() => setIsAddingSection(true)}
            className="flex min-h-[64px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
          >
            <Plus size={16} />
            {t("checklist.addSection")}
          </button>
        )}
      </div>
    </div>
  );
}
