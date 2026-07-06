import { useState } from "react";
import { Search, Pencil, Plus, Trash2 } from "lucide-react";
import { oaCases as seedCases } from "../data/oaCases";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import OACaseForm from "../components/OACaseForm";
import type { OACase } from "../lib/types";

export default function OACases() {
  useHashHighlight();
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useSyncedStorage<Record<string, OACase>>(
    "lh-oacases-overrides",
    {},
  );
  const [customCases, setCustomCases] = useSyncedStorage<OACase[]>("lh-oacases-custom", []);
  const [hiddenIds, setHiddenIds] = useSyncedStorage<string[]>("lh-oacases-hidden", []);
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
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

  function handleDelete(c: OACase) {
    if (!window.confirm(`删除「${c.title}」？`)) return;
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

    showToast(`已删除「${c.title}」`, {
      label: "撤销",
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
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          OA Cases
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">
          遇到奇怪的理赔情况时，先搜一下这里有没有类似案例
        </p>
      </div>

      <div className="relative mb-6">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按标题、保险公司、标签搜索…"
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) py-2.5 pr-3 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)"
        />
      </div>

      <div className="flex flex-col gap-4">
        {filtered.length === 0 && (
          <p className="text-center text-[14px] text-(--color-ink-faint)">没有匹配的案例</p>
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
                "group relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)",
                c.id === justAddedId ? "fade-in-up" : "",
              ].join(" ")}
            >
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => setEditingId(c.id)}
                  aria-label="编辑"
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  aria-label="删除"
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-2 pr-12">
                <h2 className="text-[18px] font-bold text-(--color-ink)">{c.title}</h2>
                {c.payer && (
                  <span className="rounded-full bg-(--color-canvas-soft) px-2.5 py-0.5 text-[12px] font-medium text-(--color-ink-secondary)">
                    {c.payer}
                  </span>
                )}
              </div>

              {c.summary && <p className="text-[14px] text-(--color-ink-secondary)">{c.summary}</p>}

              {c.resolution && (
                <div className="mt-3 rounded-(--radius-md) bg-(--color-canvas-soft) p-3.5">
                  <p className="mb-1 text-[12px] font-semibold text-(--color-ink-faint)">处理方式</p>
                  <p className="text-[14px] text-(--color-ink)">{c.resolution}</p>
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
          !query.trim() && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex min-h-[100px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
            >
              <Plus size={16} />
              添加新案例
            </button>
          )
        )}
      </div>
    </div>
  );
}
