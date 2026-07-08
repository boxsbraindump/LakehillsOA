import { useState } from "react";
import { Search, Pencil, Plus, Trash2 } from "lucide-react";
import { oaCases as seedCases } from "../data/oaCases";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import { useConfirm } from "../components/ConfirmProvider";
import OACaseForm from "../components/OACaseForm";
import EmptyState from "../components/EmptyState";
import type { OACase } from "../lib/types";

export default function OACases() {
  useHashHighlight();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useSyncedStorage<Record<string, OACase>>(
    "lh-oacases-overrides",
    {},
  );
  const [customCases, setCustomCases] = useSyncedStorage<OACase[]>("lh-oacases-custom", []);
  const [hiddenIds, setHiddenIds] = useSyncedStorage<string[]>("lh-oacases-hidden", []);
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const cases = [...seedCases.map((c) => overrides[c.id] ?? c), ...customCases].filter(
    (c) => !hiddenIds.includes(c.id),
  );

  function isCustom(id: string) {
    return customCases.some((c) => c.id === id);
  }

  function handleSave(updated: OACase) {
    if (isCustom(updated.id)) {
      setCustomCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } else {
      setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    }
    setEditingId(null);
  }

  function handleCreate(created: OACase) {
    setCustomCases((prev) => [...prev, created]);
    setIsAdding(false);
    setJustAddedId(created.id);
  }

  async function handleDelete(c: OACase) {
    if (!(await confirm({ message: t("oaCases.deleteConfirm", { title: c.title }) }))) return;
    const wasCustom = isCustom(c.id);
    const trashId = `oa-cases:${c.id}`;

    if (wasCustom) {
      setCustomCases((prev) => prev.filter((item) => item.id !== c.id));
    } else {
      setHiddenIds((prev) => [...prev, c.id]);
    }

    addToTrash({
      trashId,
      category: "oa-cases",
      itemId: c.id,
      wasCustom,
      deletedAt: Date.now(),
      title: c.title,
      snapshot: c,
    });

    showToast(t("oaCases.deletedToast", { title: c.title }), {
      label: t("common.undo"),
      onClick: () => {
        if (wasCustom) {
          setCustomCases((prev) => [...prev, c]);
        } else {
          setHiddenIds((prev) => prev.filter((id) => id !== c.id));
        }
        removeFromTrash(trashId);
      },
    });
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? cases.filter((c) =>
        [c.title, c.payer, c.summary, c.resolution, ...c.tags].join(" ").toLowerCase().includes(q),
      )
    : cases;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          OA Cases
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">{t("oaCases.subtitle")}</p>
      </div>

      <div className="relative mb-6">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("oaCases.searchPlaceholder")}
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

      <div className="flex flex-col gap-4">
        {query.trim() && filtered.length === 0 && (
          <p className="text-center text-[14px] text-(--color-ink-faint)">{t("oaCases.noMatches")}</p>
        )}
        {!query.trim() && cases.length === 0 && !isAdding && (
          <EmptyState
            title={t("oaCases.emptyTitle")}
            description={t("oaCases.emptyDescription")}
            actionLabel={t("empty.addFirst")}
            onAction={() => setIsAdding(true)}
          />
        )}
        {filtered.map((c) =>
          editingId === c.id ? (
            <OACaseForm
              key={c.id}
              initial={c}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <article
              key={c.id}
              id={c.id}
              className={[
                "group relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) sm:p-6",
                c.id === justAddedId ? "fade-in-up" : "",
              ].join(" ")}
            >
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  onClick={() => setEditingId(c.id)}
                  aria-label={t("common.edit")}
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  aria-label={t("common.delete")}
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-2 pr-12">
                <h2 className="text-[18px] leading-tight font-bold text-(--color-ink)">{c.title}</h2>
                {c.payer && (
                  <span className="rounded-full bg-(--color-canvas-soft) px-2.5 py-0.5 text-[12px] font-medium text-(--color-ink-secondary)">
                    {c.payer}
                  </span>
                )}
              </div>

              {c.summary && <p className="text-[14px] leading-relaxed text-(--color-ink-secondary)">{c.summary}</p>}

              {c.resolution && (
                <div className="mt-3 rounded-(--radius-md) bg-(--color-canvas-soft) p-3.5">
                  <p className="mb-1 text-[12px] font-semibold text-(--color-ink-faint)">
                    {t("oaCases.resolutionLabel")}
                  </p>
                  <p className="text-[14px] leading-relaxed text-(--color-ink)">{c.resolution}</p>
                </div>
              )}

              {c.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.tags.map((tag) => (
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
          <OACaseForm onSave={handleCreate} onCancel={() => setIsAdding(false)} />
        ) : (
          !query.trim() && cases.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex min-h-[100px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
            >
              <Plus size={16} />
              {t("oaCases.addNew")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
