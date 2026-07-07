import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ExternalLink, Pencil, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import CustomEntryForm from "../components/CustomEntryForm";
import { todayKey, formatDisplayDate } from "../lib/date";
import type {
  CustomCategory as CustomCategoryType,
  CustomCategoryTemplate,
  CustomEntry,
} from "../lib/types";

interface ChecklistItemState {
  checked: boolean;
  note: string;
}

type CustomChecklistState = Record<string, Record<string, Record<string, ChecklistItemState>>>;

function getTemplate(category?: CustomCategoryType): CustomCategoryTemplate {
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
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const { lang } = useLanguage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const category = categories.find((c) => c.id === categoryId);
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
      [categoryId]: (prev[categoryId] ?? []).map((e) => (e.id === updated.id ? updated : e)),
    }));
    setEditingId(null);
  }

  function handleDelete(entry: CustomEntry) {
    if (!window.confirm(t("customCategory.deleteConfirm", { title: entry.title }))) return;
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
  const filtered = q ? entries.filter((e) => getEntrySearchText(e).includes(q)) : entries;
  const done = entries.filter((entry) => dayState[entry.id]?.checked).length;

  function addButtonLabel() {
    if (template === "checklist") return t("checklist.addItem");
    if (template === "payments") return t("payments.addNew");
    return t("oaCases.addNew");
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
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
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) py-2.5 pr-3 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)"
        />
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
        {filtered.length === 0 && (
          <p className={template === "payments" ? "text-center text-[14px] text-(--color-ink-faint) sm:col-span-2" : "text-center text-[14px] text-(--color-ink-faint)"}>
            {t("customCategory.noMatches")}
          </p>
        )}
        {filtered.map((entry) =>
          editingId === entry.id ? (
            <CustomEntryForm
              key={entry.id}
              template={template}
              initial={entry}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          ) : template === "checklist" ? (
            <article
              key={entry.id}
              id={entry.id}
              className={[
                "group relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1)",
                entry.id === justAddedId ? "fade-in-up" : "",
              ].join(" ")}
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
                      "text-[15px] font-medium",
                      dayState[entry.id]?.checked
                        ? "text-(--color-ink-faint) line-through"
                        : "text-(--color-ink)",
                    ].join(" ")}
                  >
                    {entry.title}
                  </h2>
                  {(entry.detail || entry.notes) && (
                    <p className="mt-1 text-[13px] text-(--color-ink-muted)">
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

              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
              className={[
                "group relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)",
                entry.id === justAddedId ? "fade-in-up" : "",
              ].join(" ")}
            >
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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

              <h2 className="mb-3 pr-12 text-[18px] font-bold text-(--color-ink)">{entry.title}</h2>
              <div className="flex flex-col gap-2">
                {(entry.portals ?? []).map((portal, i) =>
                  portal.url ? (
                    <a
                      key={i}
                      href={portal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-[14px] text-(--color-ink-secondary)"
                    >
                      <span className="text-(--color-ink-muted)">{portal.name}:</span>
                      <span className="inline-flex items-center gap-1 font-medium text-(--color-primary) hover:underline">
                        {t("common.link")}
                        <ExternalLink size={12} />
                      </span>
                    </a>
                  ) : (
                    <span key={i} className="text-[14px] text-(--color-ink-secondary)">
                      {portal.name}
                    </span>
                  ),
                )}
              </div>
              {entry.notes && (
                <div className="mt-4 rounded-(--radius-md) border border-(--color-accent-sky)/30 bg-(--color-accent-sky)/8 p-3.5 text-[13px] text-(--color-ink-secondary)">
                  {entry.notes}
                </div>
              )}
            </section>
          ) : (
            <article
              key={entry.id}
              id={entry.id}
              className={[
                "group relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)",
                entry.id === justAddedId ? "fade-in-up" : "",
              ].join(" ")}
            >
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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

              <div className="mb-2 flex flex-wrap items-center gap-2 pr-12">
                <h2 className="text-[18px] font-bold text-(--color-ink)">{entry.title}</h2>
                {entry.payer && (
                  <span className="rounded-full bg-(--color-canvas-soft) px-2.5 py-0.5 text-[12px] font-medium text-(--color-ink-secondary)">
                    {entry.payer}
                  </span>
                )}
              </div>

              {(entry.summary || entry.notes) && (
                <p className="text-[14px] text-(--color-ink-secondary)">
                  {entry.summary ?? entry.notes}
                </p>
              )}

              {entry.resolution && (
                <div className="mt-3 rounded-(--radius-md) bg-(--color-canvas-soft) p-3.5">
                  <p className="mb-1 text-[12px] font-semibold text-(--color-ink-faint)">
                    {t("oaCases.resolutionLabel")}
                  </p>
                  <p className="text-[14px] text-(--color-ink)">{entry.resolution}</p>
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
          ),
        )}

        {isAdding ? (
          <CustomEntryForm
            template={template}
            onSave={handleCreate}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          !query.trim() && (
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
