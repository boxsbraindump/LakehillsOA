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
  GripVertical,
} from "lucide-react";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useAuth } from "../components/AuthProvider";
import ChecklistItemForm from "../components/ChecklistItemForm";
import EmptyState from "../components/EmptyState";
import VoiceInputButton from "../components/VoiceInputButton";
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

interface ChecklistMatch {
  date: string;
  itemId: string;
  itemLabel: string;
  sectionTitle: string;
  note: string;
  detail: string;
  matchedField: "item" | "detail" | "note" | "section" | "date";
  snippet: string;
}

interface DraggedItem {
  type: "item";
  itemId: string;
  sourceSectionId: string;
}

interface DraggedSection {
  type: "section";
  sectionId: string;
}

type DraggedChecklistEntity = DraggedItem | DraggedSection;

interface DragOverTarget {
  type: "item" | "section";
  id: string;
}

export default function Checklist() {
  useHashHighlight();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useSyncedStorage<ChecklistState>("lh-checklist-state", {});
  const [selectedDate, setSelectedDate] = useState(searchParams.get("date") ?? todayKey());
  const [noteQuery, setNoteQuery] = useState("");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [isCopyPanelOpen, setIsCopyPanelOpen] = useState(false);
  const [copyOnlyUnfinished, setCopyOnlyUnfinished] = useState(true);
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
  const { syncEnabled, workspace } = useAuth();
  const isPersonalWorkspace = Boolean(syncEnabled && workspace && !workspace.isPrimary);
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
  const [draggedEntity, setDraggedEntity] = useState<DraggedChecklistEntity | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragOverTarget | null>(null);

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

  /**
   * Items and sections are shared definitions; each day only stores references to them,
   * and "copy yesterday" copies references rather than duplicating content. So a delete
   * made while viewing one day must only drop that day's reference — dropping the shared
   * definition erased the item from every other day that still listed it.
   * The definition is only discarded once no day refers to it any more.
   */
  function isReferencedByOtherDay(
    ids: Record<string, string[]>,
    id: string,
    exceptDate: string,
  ) {
    return Object.entries(ids).some(([date, list]) => date !== exceptDate && list.includes(id));
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

  function appendVoiceText(current: string, text: string, multiline = false) {
    if (!current.trim()) return text;
    const separator = multiline ? "\n" : " ";
    return `${current}${separator}${text}`;
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

    // Snapshot the day before clearing it. This used to be a hard delete with no Trash
    // record at all, so a mis-click wiped a day's work with nothing to restore from.
    const clearedItemIds = dayItemIds[selectedDate] ?? getDayItemIds(selectedDate);
    const clearedSectionIds = daySectionIds[selectedDate] ?? getDaySectionIds(selectedDate);
    const clearedState = state[selectedDate];
    const trashId = `checklist-day:${selectedDate}`;

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

    function restoreClearedDay() {
      if (clearedState) setState((prev) => ({ ...prev, [selectedDate]: clearedState }));
      setDayItemIds((prev) => ({ ...prev, [selectedDate]: clearedItemIds }));
      setDaySectionIds((prev) => ({ ...prev, [selectedDate]: clearedSectionIds }));
    }

    addToTrash({
      trashId,
      category: "checklist",
      entryType: "day",
      itemId: selectedDate,
      wasCustom: true,
      deletedAt: Date.now(),
      title: formatDisplayDate(selectedDate, lang),
      snapshot: {
        date: selectedDate,
        itemIds: clearedItemIds,
        sectionIds: clearedSectionIds,
        state: clearedState ?? {},
      },
    });

    showToast(t("checklist.clearedDayToast", { date: formatDisplayDate(selectedDate, lang) }), {
      label: t("common.undo"),
      onClick: () => {
        restoreClearedDay();
        removeFromTrash(trashId);
      },
    });
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

  /**
   * The most recent earlier day that actually has a checklist. Copying was hard-wired to
   * "yesterday", so with the clinic closed midweek you had to hop through each closed day
   * to carry work forward.
   */
  function findLatestDayWithContent(before: string) {
    const candidates = new Set([...Object.keys(dayItemIds), ...Object.keys(state)]);
    let latest: string | null = null;
    for (const date of candidates) {
      if (date >= before) continue;
      if (getDayItemIds(date).length === 0 && !hasDayContent(state[date])) continue;
      if (!latest || date > latest) latest = date;
    }
    return latest;
  }

  const copySourceDate = findLatestDayWithContent(selectedDate);
  const copySourceUnfinishedCount = copySourceDate
    ? getDayItemIds(copySourceDate).filter((id) => !state[copySourceDate]?.[id]?.checked).length
    : 0;

  async function copyFromDay(sourceDate: string, onlyUnfinished: boolean) {
    const sourceState = state[sourceDate] ?? {};
    const allSourceItemIds = getDayItemIds(sourceDate);
    const itemIds = onlyUnfinished
      ? allSourceItemIds.filter((id) => !sourceState[id]?.checked)
      : allSourceItemIds;

    if (itemIds.length === 0) {
      showToast(
        onlyUnfinished
          ? t("checklist.nothingUnfinishedToast", { date: formatDisplayDate(sourceDate, lang) })
          : t("checklist.noPreviousDayToast", { date: formatDisplayDate(sourceDate, lang) }),
      );
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

    // Keep only the sections that still have something in them after filtering, so a
    // fully-finished section doesn't arrive as an empty header.
    const copiedIds = new Set(itemIds);
    const sectionIds = getDaySectionIds(sourceDate, allSourceItemIds).filter((sectionId) =>
      (customItems[sectionId] ?? []).some((item) => copiedIds.has(item.id)),
    );

    // A copied item starts as work still to do: carry its note across for context, but
    // never its tick — otherwise the new day arrives already marked complete.
    const carriedState: DayState = {};
    for (const id of itemIds) {
      const note = sourceState[id]?.note ?? "";
      if (note.trim()) carriedState[id] = { checked: false, note };
    }

    setState((prev) => ({ ...prev, [selectedDate]: carriedState }));
    setDayItemIds((prev) => ({ ...prev, [selectedDate]: itemIds }));
    setDaySectionIds((prev) => ({ ...prev, [selectedDate]: sectionIds }));
    setOpenNoteId(null);
    setIsCopyPanelOpen(false);
    showToast(
      t("checklist.copiedPreviousDayToast", { date: formatDisplayDate(sourceDate, lang) }),
    );
  }

  function jumpToMatch(match: ChecklistMatch) {
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

  function findItem(itemId: string) {
    for (const section of allSections) {
      const item = section.items.find((candidate) => candidate.id === itemId);
      if (item) return { item, section };
    }
    return null;
  }

  function isItemPlacedBefore(itemId: string, targetSectionId: string, beforeItemId?: string) {
    const targetSection = allSections.find((section) => section.id === targetSectionId);
    if (!targetSection) return false;

    const itemIds = targetSection.items.map((item) => item.id);
    const itemIndex = itemIds.indexOf(itemId);
    if (itemIndex < 0) return false;

    if (!beforeItemId) return itemIndex === itemIds.length - 1;

    const targetIndex = itemIds.indexOf(beforeItemId);
    return targetIndex >= 0 && itemIndex === targetIndex - 1;
  }

  function isSectionPlacedBefore(sectionId: string, beforeSectionId?: string) {
    const sectionIds = customSections.map((section) => section.id);
    const sectionIndex = sectionIds.indexOf(sectionId);
    if (sectionIndex < 0) return false;

    if (!beforeSectionId) return sectionIndex === sectionIds.length - 1;

    const targetIndex = sectionIds.indexOf(beforeSectionId);
    return targetIndex >= 0 && sectionIndex === targetIndex - 1;
  }

  function moveItem(itemId: string, targetSectionId: string, beforeItemId?: string) {
    const found = findItem(itemId);
    if (!found) return;

    setCustomItems((prev) => {
      const item = found.item;
      const next = { ...prev };
      Object.keys(next).forEach((sectionId) => {
        next[sectionId] = (next[sectionId] ?? []).filter((candidate) => candidate.id !== itemId);
      });
      const targetItems = next[targetSectionId] ?? [];
      const withoutDragged = targetItems.filter((candidate) => candidate.id !== itemId);
      const foundIndex = beforeItemId
        ? withoutDragged.findIndex((candidate) => candidate.id === beforeItemId)
        : -1;
      const insertAt = foundIndex >= 0 ? foundIndex : withoutDragged.length;
      next[targetSectionId] = [
        ...withoutDragged.slice(0, insertAt),
        item,
        ...withoutDragged.slice(insertAt),
      ];
      return next;
    });

    setDayItemIds((prev) => {
      const current = prev[selectedDate] ?? getDayItemIds(selectedDate);
      return {
        ...prev,
        [selectedDate]: current.includes(itemId) ? current : [...current, itemId],
      };
    });

    setDaySectionIds((prev) => {
      const current = prev[selectedDate] ?? getDaySectionIds(selectedDate);
      return {
        ...prev,
        [selectedDate]: Array.from(new Set([...current, targetSectionId])),
      };
    });
  }

  function moveSection(sectionId: string, beforeSectionId?: string) {
    if (sectionId === beforeSectionId) return;
    setCustomSections((prev) => {
      const section = prev.find((candidate) => candidate.id === sectionId);
      if (!section) return prev;
      const withoutDragged = prev.filter((candidate) => candidate.id !== sectionId);
      const foundIndex = beforeSectionId
        ? withoutDragged.findIndex((candidate) => candidate.id === beforeSectionId)
        : -1;
      const insertAt = foundIndex >= 0 ? foundIndex : withoutDragged.length;
      return [
        ...withoutDragged.slice(0, insertAt),
        section,
        ...withoutDragged.slice(insertAt),
      ];
    });
  }

  function previewItemMove(targetSectionId: string, beforeItemId?: string) {
    if (!draggedEntity || draggedEntity.type !== "item") return;
    if (draggedEntity.itemId === beforeItemId) return;
    if (isItemPlacedBefore(draggedEntity.itemId, targetSectionId, beforeItemId)) return;

    moveItem(draggedEntity.itemId, targetSectionId, beforeItemId);
    setDraggedEntity({ ...draggedEntity, sourceSectionId: targetSectionId });
  }

  function previewSectionMove(beforeSectionId?: string) {
    if (!draggedEntity || draggedEntity.type !== "section") return;
    if (draggedEntity.sectionId === beforeSectionId) return;
    if (isSectionPlacedBefore(draggedEntity.sectionId, beforeSectionId)) return;

    moveSection(draggedEntity.sectionId, beforeSectionId);
  }

  function handleSectionDrop(sectionId: string) {
    if (!draggedEntity) return;
    if (draggedEntity.type === "item") {
      moveItem(draggedEntity.itemId, sectionId);
    } else {
      moveSection(draggedEntity.sectionId, sectionId);
    }
    setDraggedEntity(null);
    setDragOverTarget(null);
  }

  function handleItemDrop(targetSectionId: string, beforeItemId: string) {
    if (!draggedEntity) return;
    if (draggedEntity.type === "item") {
      if (draggedEntity.itemId !== beforeItemId) {
        moveItem(draggedEntity.itemId, targetSectionId, beforeItemId);
      }
    } else {
      moveSection(draggedEntity.sectionId, targetSectionId);
    }
    setDraggedEntity(null);
    setDragOverTarget(null);
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

    // Drop the shared definition only when no other day still lists this item.
    const keepDefinition = isReferencedByOtherDay(dayItemIds, item.id, selectedDate);
    if (!keepDefinition) {
      setCustomItems((prev) => ({
        ...prev,
        [sectionId]: (prev[sectionId] ?? []).filter((i) => i.id !== item.id),
      }));
    }

    addToTrash({
      trashId,
      category: "checklist",
      itemId: item.id,
      sectionId,
      date: selectedDate,
      wasCustom: true,
      deletedAt: Date.now(),
      title: item.label,
      snapshot: item,
    });

    showToast(t("checklist.deletedItemToast", { label: item.label }), {
      label: t("common.undo"),
      onClick: () => {
        setCustomItems((prev) =>
          (prev[sectionId] ?? []).some((i) => i.id === item.id)
            ? prev
            : { ...prev, [sectionId]: [...(prev[sectionId] ?? []), item] },
        );
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

  function startFirstItem() {
    const existingSection = customSections[0];
    const title = t("checklist.defaultSectionTitle");
    const sectionId = existingSection?.id ?? slugify(title, "section");

    if (!existingSection) {
      setCustomSections((prev) =>
        prev.some((section) => section.id === sectionId) ? prev : [...prev, { id: sectionId, title }],
      );
    }

    addSectionsToDay(selectedDate, [sectionId]);
    setAddingSectionId(sectionId);
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

    // Remove this section from the day being viewed only. This used to map over every
    // date and strip the section from all of them, so deleting it on one day silently
    // erased it from every earlier day too — and Undo below only restored it to the
    // current day, which made that loss permanent.
    const removedItemIds = new Set(section.items.map((item) => item.id));
    const dayItemIdsAfter = {
      ...dayItemIds,
      [selectedDate]: (dayItemIds[selectedDate] ?? getDayItemIds(selectedDate)).filter(
        (id) => !removedItemIds.has(id),
      ),
    };
    const stillUsedElsewhere = isReferencedByOtherDay(dayItemIdsAfter, section.id, selectedDate)
      || Object.entries(dayItemIdsAfter).some(
        ([date, ids]) => date !== selectedDate && ids.some((id) => removedItemIds.has(id)),
      );
    if (!stillUsedElsewhere) {
      setCustomSections((prev) => prev.filter((s) => s.id !== section.id));
    }
    setDaySectionIds((prev) => ({
      ...prev,
      [selectedDate]: (prev[selectedDate] ?? getDaySectionIds(selectedDate)).filter(
        (id) => id !== section.id,
      ),
    }));
    setDayItemIds(dayItemIdsAfter);

    addToTrash({
      trashId,
      category: "checklist",
      entryType: "section",
      itemId: section.id,
      date: selectedDate,
      wasCustom,
      deletedAt: Date.now(),
      title: section.title,
      snapshot: { id: section.id, title: section.title, items: section.items },
    });

    showToast(t("checklist.deletedSectionToast", { title: section.title }), {
      label: t("common.undo"),
      onClick: () => {
        setCustomSections((prev) =>
          prev.some((s) => s.id === section.id)
            ? prev
            : [...prev, { id: section.id, title: section.title }],
        );
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

  const checklistMatches: ChecklistMatch[] = (() => {
    const q = noteQuery.trim().toLowerCase();
    if (!q) return [];
    const results: ChecklistMatch[] = [];
    const dates = Array.from(
      new Set([
        ...Object.keys(state),
        ...Object.keys(dayItemIds),
        ...Object.keys(daySectionIds),
      ]),
    );
    for (const date of dates) {
      const day = state[date] ?? {};
      const itemIds = Array.from(new Set([...getDayItemIds(date), ...Object.keys(day)]));
      for (const itemId of itemIds) {
        const found = findItem(itemId);
        const itemLabel = found?.item.label ?? itemId;
        const detail = found?.item.detail ?? "";
        const note = day[itemId]?.note ?? "";
        const sectionTitle = found?.section.title ?? "";
        const displayDate = formatDisplayDate(date, lang);
        const fields = [
          { key: "item" as const, value: itemLabel },
          { key: "detail" as const, value: detail },
          { key: "note" as const, value: note },
          { key: "section" as const, value: sectionTitle },
          { key: "date" as const, value: displayDate },
        ];
        const haystack = fields.map((field) => field.value).join(" ").toLowerCase();
        if (!haystack.includes(q)) continue;
        const matched = fields.find((field) => field.value.toLowerCase().includes(q)) ?? fields[0];
        results.push({
          date,
          itemId,
          itemLabel,
          sectionTitle,
          note,
          detail,
          matchedField: matched.key,
          snippet: matched.value || note || detail || sectionTitle || itemLabel,
        });
      }
    }
    return results.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  })();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {isPersonalWorkspace ? t("checklist.personalTitle") : t("checklist.title")}
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
          placeholder={
            isPersonalWorkspace
              ? t("checklist.personalSearchPlaceholder")
              : t("checklist.searchPlaceholder")
          }
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
            {checklistMatches.length === 0 ? (
              <p className="px-4 py-6 text-center text-[14px] text-(--color-ink-faint)">
                {t("checklist.noNoteMatches")}
              </p>
            ) : (
              <div>
                <div className="border-b border-(--color-hairline) px-4 py-2 text-[12px] font-medium text-(--color-ink-faint)">
                  {t("checklist.searchResultCount", { count: checklistMatches.length })}
                </div>
                <ul className="max-h-96 overflow-y-auto py-1.5">
                {checklistMatches.map((match) => (
                  <li key={`${match.date}-${match.itemId}`}>
                    <button
                      onClick={() => jumpToMatch(match)}
                      className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-(--color-canvas-soft)"
                    >
                      <span className="text-[14px] font-medium text-(--color-ink)">
                        {match.itemLabel}
                      </span>
                      <span className="text-[13px] text-(--color-ink-muted)">
                        {formatDisplayDate(match.date, lang)}
                        {match.sectionTitle ? ` · ${match.sectionTitle}` : ""}
                      </span>
                      {match.snippet && (
                        <span className="mt-1 flex max-w-full items-start gap-2">
                          <span className="shrink-0 rounded-full bg-(--color-primary)/10 px-2 py-0.5 text-[11px] font-semibold text-(--color-primary)">
                            {t(`checklist.match.${match.matchedField}`)}
                          </span>
                          <span className="line-clamp-2 text-[13px] text-(--color-ink-muted)">
                            {match.snippet}
                          </span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
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
          <div className="relative">
            <button
              onClick={() => setIsCopyPanelOpen((open) => !open)}
              aria-expanded={isCopyPanelOpen}
              className="flex items-center gap-1.5 rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
            >
              <Copy size={14} />
              {t("checklist.copyPreviousDay")}
            </button>

            {isCopyPanelOpen && (
              <div className="fade-in-up absolute top-[calc(100%+6px)] left-0 z-20 w-72 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-3 shadow-(--shadow-level-2)">
                {copySourceDate ? (
                  <>
                    <p className="text-[12px] text-(--color-ink-muted)">
                      {t("checklist.copyFromLabel")}
                    </p>
                    <p className="mt-0.5 text-[14px] font-medium text-(--color-ink)">
                      {formatDisplayDate(copySourceDate, lang)}
                    </p>

                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px] text-(--color-ink-secondary)">
                      <input
                        type="checkbox"
                        checked={copyOnlyUnfinished}
                        onChange={(e) => setCopyOnlyUnfinished(e.target.checked)}
                        className="mt-0.5 shrink-0"
                      />
                      <span>
                        {t("checklist.copyOnlyUnfinished")}
                        <span className="block text-[12px] text-(--color-ink-faint)">
                          {t("checklist.copyOnlyUnfinishedHint", {
                            count: copySourceUnfinishedCount,
                          })}
                        </span>
                      </span>
                    </label>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCopyPanelOpen(false)}
                        className="rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1 text-[12px] font-medium text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyFromDay(copySourceDate, copyOnlyUnfinished)}
                        className="rounded-(--radius-md) bg-(--color-primary) px-2.5 py-1 text-[12px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
                      >
                        {t("checklist.copyPreviousDay")}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-(--color-ink-muted)">
                    {t("checklist.noEarlierDayToast")}
                  </p>
                )}
              </div>
            )}
          </div>
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
            onDragOver={(event) => {
              if (!draggedEntity) return;
              event.preventDefault();
              if (
                draggedEntity.type === "section" &&
                draggedEntity.sectionId !== section.id
              ) {
                setDragOverTarget({ type: "section", id: section.id });
                previewSectionMove(section.id);
              } else if (draggedEntity.type === "item") {
                setDragOverTarget({ type: "section", id: section.id });
                previewItemMove(section.id);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragOverTarget((target) =>
                  target?.type === "section" && target.id === section.id ? null : target,
                );
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleSectionDrop(section.id);
            }}
            className={[
              "group/section relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) transition-[transform,margin,box-shadow,border-color] duration-150 sm:p-6",
              dragOverTarget?.type === "section" && dragOverTarget.id === section.id
                ? "mt-3 translate-y-1 border-(--color-primary)/35 shadow-(--shadow-level-2) before:absolute before:-top-3 before:right-4 before:left-4 before:h-0.5 before:rounded-full before:bg-(--color-primary)"
                : "",
              draggedEntity?.type === "section" && draggedEntity.sectionId === section.id
                ? "scale-[0.995] border-(--color-primary)/35 shadow-(--shadow-level-2)"
                : "",
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
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      draggable={editingSectionId !== section.id}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", section.id);
                        setDraggedEntity({ type: "section", sectionId: section.id });
                      }}
                      onDragEnd={() => {
                        setDraggedEntity(null);
                        setDragOverTarget(null);
                      }}
                      className="shrink-0 cursor-grab text-(--color-ink-faint) active:cursor-grabbing"
                      aria-label={t("customCategory.dragHandle")}
                      title={t("customCategory.dragHandle")}
                    >
                      <GripVertical size={15} aria-hidden />
                    </span>
                    <h2 className="min-w-0 text-[18px] font-bold text-(--color-ink)">
                      {section.title}
                    </h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/section:opacity-100">
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
                    onDragOver={(event) => {
                      if (!draggedEntity) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (
                        draggedEntity.type === "item" &&
                        draggedEntity.itemId !== item.id
                      ) {
                        setDragOverTarget({ type: "item", id: item.id });
                        previewItemMove(section.id, item.id);
                      } else if (draggedEntity.type === "section") {
                        setDragOverTarget({ type: "section", id: section.id });
                        previewSectionMove(section.id);
                      }
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDragOverTarget((target) =>
                          target?.type === "item" && target.id === item.id ? null : target,
                        );
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleItemDrop(section.id, item.id);
                    }}
                    className={[
                      "group relative py-2.5 transition-[transform,padding,box-shadow,border-color] duration-150",
                      dragOverTarget?.type === "item" && dragOverTarget.id === item.id
                        ? "translate-y-1 pt-4 before:absolute before:top-1 before:right-0 before:left-0 before:h-0.5 before:rounded-full before:bg-(--color-primary)"
                        : "",
                      draggedEntity?.type === "item" && draggedEntity.itemId === item.id
                        ? "z-10 rounded-(--radius-md) bg-(--color-canvas) shadow-(--shadow-level-2) ring-1 ring-(--color-primary)/20"
                        : "",
                      item.id === justAddedId ? "fade-in-up" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        draggable={editingItemId !== item.id}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                          setDraggedEntity({
                            type: "item",
                            itemId: item.id,
                            sourceSectionId: section.id,
                          });
                        }}
                        onDragEnd={() => {
                          setDraggedEntity(null);
                          setDragOverTarget(null);
                        }}
                        className="mt-0.5 shrink-0 cursor-grab text-(--color-ink-faint) opacity-70 active:cursor-grabbing"
                        aria-label={t("customCategory.dragHandle")}
                        title={t("customCategory.dragHandle")}
                      >
                        <GripVertical size={14} aria-hidden />
                      </span>
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
                            "select-text text-[15px]",
                            checked ? "text-(--color-ink-faint) line-through" : "text-(--color-ink)",
                          ].join(" ")}
                        >
                          {item.label}
                        </span>
                        {item.detail && (
                          <span className="block select-text text-[13px] text-(--color-ink-muted)">
                            {item.detail}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setEditingItemId(item.id)}
                        aria-label={t("common.edit")}
                        className="flex shrink-0 items-center rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-100 transition-opacity hover:text-(--color-primary) sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(section.id, item)}
                        aria-label={t("common.delete")}
                        className="flex shrink-0 items-center rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-100 transition-opacity hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
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
                      <div className="mt-2 ml-[30px] w-[calc(100%-30px)] select-text rounded-(--radius-md) bg-(--color-canvas-soft) px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-(--color-ink-secondary)">
                        {note}
                      </div>
                    )}

                    {noteOpen && (
                      <div className="mt-2 ml-[30px] w-[calc(100%-30px)]">
                        <div className="mb-1 flex justify-end">
                          <VoiceInputButton
                            onTranscript={(text) =>
                              setNote(item.id, appendVoiceText(note, text, true))
                            }
                          />
                        </div>
                        <textarea
                          autoFocus
                          value={note}
                          onChange={(e) => setNote(item.id, e.target.value)}
                          placeholder={t("checklist.notePlaceholder")}
                          rows={2}
                          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas-soft) px-2.5 py-2 text-[13px] text-(--color-ink) outline-none focus:shadow-(--shadow-level-1)"
                        />
                      </div>
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

        {displayedSections.length === 0 && !isAddingSection && (
          <EmptyState
            title={t("checklist.emptyTitle")}
            description={t("checklist.emptyDescription")}
            actionLabel={t("empty.addFirst")}
            onAction={startFirstItem}
          />
        )}

        {isAddingSection ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateSection(newSectionTitle);
            }}
            className="fade-in-up rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) sm:p-6"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-[12px] font-semibold text-(--color-ink-faint)">
                {t("checklist.sectionNameLabel")}
              </label>
              <VoiceInputButton
                onTranscript={(text) =>
                  setNewSectionTitle((current) => appendVoiceText(current, text))
                }
              />
            </div>
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
          displayedSections.length > 0 && (
            <button
              onClick={() => setIsAddingSection(true)}
              className="flex min-h-[64px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
            >
              <Plus size={16} />
              {t("checklist.addSection")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
