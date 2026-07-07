import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Search, Pencil, Plus, Trash2 } from "lucide-react";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import CustomEntryForm from "../components/CustomEntryForm";
import type { CustomCategory as CustomCategoryType, CustomEntry } from "../lib/types";

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
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const category = categories.find((c) => c.id === categoryId);
  const entries = allEntries[categoryId] ?? [];

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
  const filtered = q
    ? entries.filter((e) =>
        [e.title, e.notes ?? "", ...e.tags].join(" ").toLowerCase().includes(q),
      )
    : entries;

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

      <div className="flex flex-col gap-4">
        {filtered.length === 0 && (
          <p className="text-center text-[14px] text-(--color-ink-faint)">
            {t("customCategory.noMatches")}
          </p>
        )}
        {filtered.map((entry) =>
          editingId === entry.id ? (
            <CustomEntryForm
              key={entry.id}
              initial={entry}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
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

              <h2 className="mb-2 pr-12 text-[18px] font-bold text-(--color-ink)">{entry.title}</h2>

              {entry.notes && <p className="text-[14px] text-(--color-ink-secondary)">{entry.notes}</p>}

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
          <CustomEntryForm onSave={handleCreate} onCancel={() => setIsAdding(false)} />
        ) : (
          !query.trim() && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex min-h-[100px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
            >
              <Plus size={16} />
              {t("customCategory.addNew")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
