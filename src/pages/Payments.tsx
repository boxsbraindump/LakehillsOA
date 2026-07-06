import { useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { paymentEntries as seedEntries } from "../data/payments";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import PaymentEntryForm from "../components/PaymentEntryForm";
import type { PaymentEntry } from "../lib/types";

export default function Payments() {
  useHashHighlight();
  const [overrides, setOverrides] = useSyncedStorage<Record<string, PaymentEntry>>(
    "lh-payments-overrides",
    {},
  );
  const [customEntries, setCustomEntries] = useSyncedStorage<PaymentEntry[]>(
    "lh-payments-custom",
    [],
  );
  const [hiddenIds, setHiddenIds] = useSyncedStorage<string[]>("lh-payments-hidden", []);
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const entries = [
    ...seedEntries.map((entry) => overrides[entry.id] ?? entry),
    ...customEntries,
  ].filter((entry) => !hiddenIds.includes(entry.id));

  function isCustom(id: string) {
    return customEntries.some((c) => c.id === id);
  }

  function handleSave(updated: PaymentEntry) {
    if (isCustom(updated.id)) {
      setCustomEntries((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } else {
      setOverrides((prev) => ({ ...prev, [updated.id]: updated }));
    }
    setEditingId(null);
  }

  function handleCreate(created: PaymentEntry) {
    setCustomEntries((prev) => [...prev, created]);
    setIsAdding(false);
    setJustAddedId(created.id);
  }

  function handleDelete(entry: PaymentEntry) {
    if (!window.confirm(`删除「${entry.payer}」？`)) return;
    const wasCustom = isCustom(entry.id);
    const trashId = `payments:${entry.id}`;

    if (wasCustom) {
      setCustomEntries((prev) => prev.filter((c) => c.id !== entry.id));
    } else {
      setHiddenIds((prev) => [...prev, entry.id]);
    }

    addToTrash({
      trashId,
      category: "payments",
      itemId: entry.id,
      wasCustom,
      deletedAt: Date.now(),
      title: entry.payer,
      snapshot: entry,
    });

    showToast(`已删除「${entry.payer}」`, {
      label: "撤销",
      onClick: () => {
        if (wasCustom) {
          setCustomEntries((prev) => [...prev, entry]);
        } else {
          setHiddenIds((prev) => prev.filter((id) => id !== entry.id));
        }
        removeFromTrash(trashId);
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          Where to Find Payments
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">
          按保险公司查对应的付款查询入口
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {entries.map((entry) =>
          editingId === entry.id ? (
            <PaymentEntryForm
              key={entry.id}
              initial={entry}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          ) : (
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
                  aria-label="编辑"
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-primary)"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(entry)}
                  aria-label="删除"
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <h2 className="mb-3 pr-12 text-[18px] font-bold text-(--color-ink)">
                {entry.payer}
              </h2>
              <div className="flex flex-col gap-2">
                {entry.portals.map((portal, i) => (
                  <a
                    key={i}
                    href={portal.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[14px] text-(--color-ink-secondary)"
                  >
                    <span className="text-(--color-ink-muted)">{portal.name}:</span>
                    <span className="inline-flex items-center gap-1 font-medium text-(--color-primary) hover:underline">
                      Link
                      <ExternalLink size={12} />
                    </span>
                  </a>
                ))}
              </div>
              {entry.notes && (
                <div className="mt-4 rounded-(--radius-md) border border-(--color-accent-sky)/30 bg-(--color-accent-sky)/8 p-3.5 text-[13px] text-(--color-ink-secondary)">
                  {entry.notes}
                </div>
              )}
            </section>
          ),
        )}

        {isAdding ? (
          <PaymentEntryForm onSave={handleCreate} onCancel={() => setIsAdding(false)} />
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex min-h-[120px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
          >
            <Plus size={16} />
            添加新条目
          </button>
        )}
      </div>
    </div>
  );
}
