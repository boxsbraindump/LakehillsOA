import { Fragment, useState, type DragEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { ExternalLink, GripVertical, Pencil, Pin, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import { useConfirm } from "../components/ConfirmProvider";
import CustomEntryForm from "../components/CustomEntryForm";
import EmptyState from "../components/EmptyState";
import { todayKey, formatDisplayDate } from "../lib/date";
import {
  CUSTOM_CATEGORY_DELETIONS_KEY,
  filterDeletedCustomCategories,
  normalizeCategoryTitle,
} from "../lib/customCategories";
import type {
  CustomCategory as CustomCategoryType,
  CustomCategoryTemplate,
  CustomEntry,
  DeletedCustomCategory,
} from "../lib/types";

interface ChecklistItemState {
  checked: boolean;
  note: string;
}

type CustomChecklistState = Record<string, Record<string, Record<string, ChecklistItemState>>>;

function getTemplate(category?: CustomCategoryType): CustomCategoryTemplate {
  if (category && normalizeCategoryTitle(category.title) === "查保险") return "payments";
  return category?.template ?? "oa-case";
}

function getEntrySearchText(entry: CustomEntry) {
  return [
    entry.title,
    entry.detail ?? "",
    entry.notes ?? "",
    entry.payer ?? "",
    entry.summary ?? "",
    entry.resolution ?? "",
    ...entry.tags,
    ...(entry.portals ?? []).flatMap((portal) => [portal.name, portal.url]),
  ]
    .join(" ")
    .toLowerCase();
}

export default function CustomCategory() {
  useHashHighlight();
  const { categoryId = "" } = useParams();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [categories] = useSyncedStorage<CustomCategoryType[]>("lh-custom-categories", []);
  const [allEntries, setAllEntries] = useSyncedStorage<Record<string, CustomEntry[]>>(
    "lh-custom-entries",
    {},
  );
  const [checklistState, setChecklistState] = useSyncedStorage<CustomChecklistState>(
    "lh-custom-checklist-state",
    {},
  );
  const [deletedCategories] = useSyncedStorage<DeletedCustomCategory[]>(
    CUSTOM_CATEGORY_DELETIONS_KEY,
    [],
  );
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { lang } = useLanguage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dragOverEntryId, setDragOverEntryId] = useState<string | null>(null);

  const category = filterDeletedCustomCategories(categories, deletedCategories).find(
    (c) => c.id === categoryId,
  );
  const template = getTemplate(category);
  const entries = allEntries[categoryId] ?? [];
  const dayState = checklistState[categoryId]?.[selectedDate] ?? {};

  function toggleChecklistEntry(id: string) {
    setChecklistState((prev) => {
      const categoryState = prev[categoryId] ?? {};
      const day = categoryState[selectedDate] ?? {};
      return {
        ...prev,
        [categoryId]: {
          ...categoryState,
          [selectedDate]: {
            ...day,
            [id]: { checked: !day[id]?.checked, note: day[id]?.note ?? "" },
          },
        },
      };
    });
  }

  function setChecklistNote(id: string, note: string) {
    setChecklistState((prev) => {
      const categoryState = prev[categoryId] ?? {};
      const day = categoryState[selectedDate] ?? {};
      return {
        ...prev,
        [categoryId]: {
          ...categoryState,
          [selectedDate]: {
            ...day,
            [id]: { checked: day[id]?.checked ?? false, note },
          },
        },
      };
    });
  }

  function resetSelectedDay() {
    setChecklistState((prev) => {
      const categoryState = prev[categoryId] ?? {};
      const day = categoryState[selectedDate] ?? {};
      return {
        ...prev,
        [categoryId]: {
          ...categoryState,
          [selectedDate]: Object.fromEntries(
            Object.entries(day).map(([id, state]) => [id, { ...state, checked: false }]),
          ),
        },
      };
    });
  }

  function handleCreate(created: CustomEntry) {
    setAllEntries((prev) => ({ ...prev, [categoryId]: [...(prev[categoryId] ?? []), created] }));
    setIsAdding(false);
    setJustAddedId(created.id);
  }

  function handleSave(updated: CustomEntry) {
    setAllEntries((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).map((e) =>
        e.id === updated.id ? { ...updated, pinned: e.pinned } : e,
      ),
    }));
    setEditingId(null);
  }

  function moveEntryBefore(draggedId: string, beforeId: string) {
    if (draggedId === beforeId) return;

    setAllEntries((prev) => {
      const current = prev[categoryId] ?? [];
      const dragged = current.find((entry) => entry.id === draggedId);
      const target = current.find((entry) => entry.id === beforeId);
      if (!dragged || !target) return prev;

      const withoutDragged = current.filter((entry) => entry.id !== draggedId);
      const targetIndex = withoutDragged.findIndex((entry) => entry.id === beforeId);
      if (targetIndex < 0) return prev;

      const movedEntry =
        Boolean(dragged.pinned) === Boolean(target.pinned)
          ? dragged
          : { ...dragged, pinned: target.pinned };
      const next = [
        ...withoutDragged.slice(0, targetIndex),
        movedEntry,
        ...withoutDragged.slice(targetIndex),
      ];

      return { ...prev, [categoryId]: next };
    });
  }

  function togglePinned(entry: CustomEntry) {
    setAllEntries((prev) => {
      const current = prev[categoryId] ?? [];
      const withoutEntry = current.filter((item) => item.id !== entry.id);
      const updatedEntry = { ...entry, pinned: !entry.pinned };

      if (updatedEntry.pinned) {
        return { ...prev, [categoryId]: [updatedEntry, ...withoutEntry] };
      }

      const pinned = withoutEntry.filter((item) => item.pinned);
      const unpinned = withoutEntry.filter((item) => !item.pinned);
      return { ...prev, [categoryId]: [...pinned, updatedEntry, ...unpinned] };
    });
  }

  function entryDragProps(entry: CustomEntry) {
    const isSearchActive = query.trim().length > 0;
    const canDrag = !isSearchActive && editingId !== entry.id;

    return {
      draggable: canDrag,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        if (!canDrag) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", entry.id);
        setDraggedEntryId(entry.id);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!draggedEntryId || draggedEntryId === entry.id || isSearchActive) return;
        event.preventDefault();
        setDragOverEntryId(entry.id);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (draggedEntryId && draggedEntryId !== entry.id && !isSearchActive) {
          moveEntryBefore(draggedEntryId, entry.id);
        }
        setDraggedEntryId(null);
        setDragOverEntryId(null);
      },
      onDragEnd: () => {
        setDraggedEntryId(null);
        setDragOverEntryId(null);
      },
    };
  }

  async function handleDelete(entry: CustomEntry) {
    if (!(await confirm({ message: t("customCategory.deleteConfirm", { title: entry.title }) }))) return;
    const trashId = `custom:${entry.id}`;

    setAllEntries((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).filter((e) => e.id !== entry.id),
    }));

    addToTrash({
      trashId,
      category: "custom",
      itemId: entry.id,
      sectionId: categoryId,
      categoryTitle: category?.title,
      wasCustom: true,
      deletedAt: Date.now(),
      title: entry.title,
      snapshot: entry,
    });

    showToast(t("customCategory.deletedToast", { title: entry.title }), {
      label: t("common.undo"),
      onClick: () => {
        setAllEntries((prev) => ({
          ...prev,
          [categoryId]: [...(prev[categoryId] ?? []), entry],
        }));
        removeFromTrash(trashId);
      },
    });
  }

  if (!category) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-12 text-center">
        <p className="text-[15px] text-(--color-ink-muted)">{t("customCategory.notFound")}</p>
        <Link
          to="/"
          className="mt-3 inline-block text-[14px] font-medium text-(--color-primary) hover:underline"
        >
          {t("customCategory.backHome")}
        </Link>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const orderedEntries = [
    ...entries.filter((entry) => entry.pinned),
    ...entries.filter((entry) => !entry.pinned),
  ];
  const filtered = q ? orderedEntries.filter((e) => getEntrySearchText(e).includes(q)) : orderedEntries;
  const done = entries.filter((entry) => dayState[entry.id]?.checked).length;

  function addButtonLabel() {
    if (template === "checklist") return t("checklist.addItem");
    if (template === "payments") return t("payments.addNew");
    return t("oaCases.addNew");
  }

  function cardClassName(entry: CustomEntry) {
    return [
      "group relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) transition-[transform,box-shadow,border-color] duration-150 sm:p-6",
      entry.id === justAddedId ? "fade-in-up" : "",
      draggedEntryId === entry.id ? "scale-[0.99] border-(--color-primary)/45 opacity-45 shadow-(--shadow-level-2)" : "",
      dragOverEntryId === entry.id && draggedEntryId !== entry.id
        ? "translate-y-2 border-(--color-primary)/45"
        : "",
    ].join(" ");
  }

  function dropPreview(entry: CustomEntry) {
    if (!draggedEntryId || dragOverEntryId !== entry.id || draggedEntryId === entry.id) return null;

    return (
      <div
        className={[
          "drag-drop-preview relative h-3 transition-all duration-200",
          template === "payments" ? "sm:col-span-2" : "",
        ].join(" ")}
      >
        <span className="absolute top-1/2 right-0 left-0 h-[2px] -translate-y-1/2 rounded-full bg-(--color-primary) shadow-[0_0_0_3px_rgba(40,175,165,0.10)]" />
      </div>
    );
  }

  function pinnedBadge(entry: CustomEntry) {
    if (!entry.pinned) return null;

    return (
      <span className="rounded-full bg-(--color-primary)/10 px-2.5 py-0.5 text-[12px] font-semibold text-(--color-primary)">
        {t("common.pinned")}
      </span>
    );
  }

  function entryActions(entry: CustomEntry) {
    const pinLabel = entry.pinned ? t("common.unpin") : t("common.pin");

    return (
      <div className="absolute top-4 right-4 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <span
          aria-label={t("customCategory.dragHandle")}
          title={t("customCategory.dragHandle")}
          className="hidden cursor-grab rounded-(--radius-sm) p-1 text-(--color-ink-faint) active:cursor-grabbing sm:inline-flex"
        >
          <GripVertical size={14} />
        </span>
        <button
          onClick={() => togglePinned(entry)}
          aria-label={pinLabel}
          title={pinLabel}
          className={[
            "rounded-(--radius-sm) p-1 hover:text-(--color-primary)",
            entry.pinned ? "text-(--color-primary)" : "text-(--color-ink-faint)",
          ].join(" ")}
        >
          <Pin size={14} fill={entry.pinned ? "currentColor" : "none"} />
        </button>
        <button
          onClick={() => setEditingId(entry.id)}
          aria-label={t("common.edit")}
          className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => handleDelete(entry)}
          aria-label={t("common.delete")}
          className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {category.title}
        </h1>
      </div>

      <div className="relative mb-6">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("customCategory.searchPlaceholder")}
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) py-2.5 pr-16 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-(--radius-sm) px-2 py-1 text-[12px] font-medium text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-primary)"
          >
            {t("common.cancel")}
          </button>
        )}
      </div>

      {template === "checklist" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) px-2 py-1.5 text-[13px] text-(--color-ink) outline-none focus:shadow-(--shadow-level-1)"
            />
            <button
              onClick={resetSelectedDay}
              className="rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
            >
              {t("checklist.resetDay")}
            </button>
          </div>
          <p className="text-[13px] text-(--color-ink-muted)">
            {formatDisplayDate(selectedDate, lang)} ·{" "}
            {t("checklist.completedCount", { done, total: entries.length })}
          </p>
        </div>
      )}

      <div className={template === "payments" ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "flex flex-col gap-4"}>
        {query.trim() && filtered.length === 0 && (
          <p className={template === "payments" ? "text-center text-[14px] text-(--color-ink-faint) sm:col-span-2" : "text-center text-[14px] text-(--color-ink-faint)"}>
            {t("customCategory.noMatches")}
          </p>
        )}
        {!query.trim() && entries.length === 0 && !isAdding && (
          <EmptyState
            title={t("customCategory.emptyTitle")}
            description={t("customCategory.emptyDescription")}
            actionLabel={t("empty.addFirst")}
            onAction={() => setIsAdding(true)}
            className={template === "payments" ? "sm:col-span-2" : ""}
          />
        )}
        {filtered.map((entry) => (
          <Fragment key={entry.id}>
            {dropPreview(entry)}
            {editingId === entry.id ? (
            <div key={entry.id} className={template === "payments" ? "sm:col-span-2" : ""}>
              <CustomEntryForm
                template={template}
                initial={entry}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : template === "checklist" ? (
            <article
              key={entry.id}
              id={entry.id}
              className={cardClassName(entry)}
              {...entryDragProps(entry)}
            >
              <div className="flex items-start gap-3 pr-16">
                <button
                  role="checkbox"
                  aria-checked={dayState[entry.id]?.checked ?? false}
                  onClick={() => toggleChecklistEntry(entry.id)}
                  className={[
                    "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                    dayState[entry.id]?.checked
                      ? "border-(--color-primary) bg-(--color-primary)"
                      : "border-(--color-ink-faint)",
                  ].join(" ")}
                >
                  {dayState[entry.id]?.checked && (
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
                  <h2
                    className={[
                      "text-[15px] leading-snug font-semibold",
                      dayState[entry.id]?.checked
                        ? "text-(--color-ink-faint) line-through"
                        : "text-(--color-ink)",
                    ].join(" ")}
                  >
                    {entry.title}
                  </h2>
                  {pinnedBadge(entry)}
                  {(entry.detail || entry.notes) && (
                    <p className="mt-1 text-[13px] leading-relaxed text-(--color-ink-muted)">
                      {entry.detail ?? entry.notes}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setOpenNoteId(openNoteId === entry.id ? null : entry.id)}
                  className={[
                    "shrink-0 rounded-(--radius-sm) p-1",
                    dayState[entry.id]?.note
                      ? "text-(--color-primary)"
                      : "text-(--color-ink-faint) hover:text-(--color-ink-muted)",
                  ].join(" ")}
                >
                  <StickyNote size={14} />
                </button>
              </div>

              {entryActions(entry)}

              {openNoteId === entry.id && (
                <textarea
                  autoFocus
                  value={dayState[entry.id]?.note ?? ""}
                  onChange={(e) => setChecklistNote(entry.id, e.target.value)}
                  placeholder={t("checklist.notePlaceholder")}
                  rows={2}
                  className="mt-3 ml-[30px] w-[calc(100%-30px)] rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas-soft) px-2.5 py-2 text-[13px] text-(--color-ink) outline-none focus:shadow-(--shadow-level-1)"
                />
              )}
            </article>
          ) : template === "payments" ? (
            <section
              key={entry.id}
              id={entry.id}
              className={cardClassName(entry)}
              {...entryDragProps(entry)}
            >
              {entryActions(entry)}

              <div className="mb-2 flex flex-wrap items-center gap-2 pr-16">
                <h2 className="text-[18px] leading-tight font-bold text-(--color-ink)">{entry.title}</h2>
                {pinnedBadge(entry)}
              </div>
              <div className="flex flex-col gap-2.5">
                {(entry.portals ?? []).map((portal, i) =>
                  portal.url ? (
                    <a
                      key={i}
                      href={portal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-[14px] leading-relaxed text-(--color-ink-secondary)"
                    >
                      <span className="text-(--color-ink-muted)">{portal.name}:</span>
                      <span className="inline-flex items-center gap-1 font-medium text-(--color-primary) hover:underline">
                        {t("common.link")}
                        <ExternalLink size={12} />
                      </span>
                    </a>
                  ) : (
                    <span key={i} className="text-[14px] leading-relaxed text-(--color-ink-secondary)">
                      {portal.name}
                    </span>
                  ),
                )}
              </div>
              {entry.notes && (
                <div className="mt-3 rounded-(--radius-md) border border-(--color-accent-sky)/30 bg-(--color-accent-sky)/8 p-3.5 text-[13px] leading-relaxed whitespace-pre-wrap text-(--color-ink-secondary)">
                  {entry.notes}
                </div>
              )}
            </section>
          ) : (
            <article
              key={entry.id}
              id={entry.id}
              className={cardClassName(entry)}
              {...entryDragProps(entry)}
            >
              {entryActions(entry)}

              <div className="mb-2 flex flex-wrap items-center gap-2 pr-16">
                <h2 className="text-[18px] leading-tight font-bold text-(--color-ink)">{entry.title}</h2>
                {pinnedBadge(entry)}
                {entry.payer && (
                  <span className="rounded-full bg-(--color-canvas-soft) px-2.5 py-0.5 text-[12px] font-medium text-(--color-ink-secondary)">
                    {entry.payer}
                  </span>
                )}
              </div>

              {(entry.summary || entry.notes) && (
                <p className="text-[14px] leading-relaxed text-(--color-ink-secondary)">
                  {entry.summary ?? entry.notes}
                </p>
              )}

              {entry.resolution && (
                <div className="mt-3 rounded-(--radius-md) bg-(--color-canvas-soft) p-3.5">
                  <p className="mb-1 text-[12px] font-semibold text-(--color-ink-faint)">
                    {t("oaCases.resolutionLabel")}
                  </p>
                  <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-(--color-ink)">
                    {entry.resolution}
                  </p>
                </div>
              )}

              {entry.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-(--color-hairline) px-2 py-0.5 text-[12px] text-(--color-ink-muted)"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
            )}
          </Fragment>
        ))}

        {isAdding ? (
          <div className={template === "payments" ? "sm:col-span-2" : ""}>
            <CustomEntryForm
              template={template}
              onSave={handleCreate}
              onCancel={() => setIsAdding(false)}
            />
          </div>
        ) : (
          !query.trim() && entries.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              className={[
                "flex items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]",
                template === "payments" ? "min-h-[120px]" : "min-h-[100px]",
              ].join(" ")}
            >
              <Plus size={16} />
              {addButtonLabel()}
            </button>
          )
        )}
      </div>
    </div>
  );
}
