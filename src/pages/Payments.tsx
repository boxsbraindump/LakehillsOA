import { useState } from "react";
import { ExternalLink, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { paymentEntries as seedEntries } from "../data/payments";
import { useHashHighlight } from "../hooks/useHashHighlight";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import { useConfirm } from "../components/ConfirmProvider";
import PaymentEntryForm from "../components/PaymentEntryForm";
import EmptyState from "../components/EmptyState";
import type { PaymentEntry } from "../lib/types";

export default function Payments() {
  useHashHighlight();
  const { t } = useLanguage();
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
  const { confirm } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const entries = [
    ...seedEntries.map((entry) => overrides[entry.id] ?? entry),
    ...customEntries,
  ].filter((entry) => !hiddenIds.includes(entry.id));
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter((entry) =>
        [
          entry.payer,
          entry.notes ?? "",
          ...entry.portals.flatMap((portal) => [portal.name, portal.url]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : entries;

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

  async function handleDelete(entry: PaymentEntry) {
    if (!(await confirm({ message: t("payments.deleteConfirm", { payer: entry.payer }) }))) return;
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

    showToast(t("payments.deletedToast", { payer: entry.payer }), {
      label: t("common.undo"),
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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {t("payments.title")}
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">{t("payments.subtitle")}</p>
      </div>

      <div className="relative mb-6">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("payments.searchPlaceholder")}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {query.trim() && filtered.length === 0 && (
          <p className="text-center text-[14px] text-(--color-ink-faint) sm:col-span-2">
            {t("payments.noMatches")}
          </p>
        )}
        {!query.trim() && entries.length === 0 && !isAdding && (
          <EmptyState
            title={t("payments.emptyTitle")}
            description={t("payments.emptyDescription")}
            actionLabel={t("empty.addFirst")}
            onAction={() => setIsAdding(true)}
            className="sm:col-span-2"
          />
        )}
        {filtered.map((entry) =>
          editingId === entry.id ? (
            <div key={entry.id} className="sm:col-span-2">
              <PaymentEntryForm
                initial={entry}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <section
              key={entry.id}
              id={entry.id}
              className={[
                "group relative rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-5 shadow-(--shadow-level-1) sm:p-6",
                entry.id === justAddedId ? "fade-in-up" : "",
              ].join(" ")}
            >
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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

              <h2 className="mb-2 pr-12 text-[18px] leading-tight font-bold text-(--color-ink)">
                {entry.payer}
              </h2>
              <div className="flex flex-col gap-2.5">
                {entry.portals.map((portal, i) => (
                  <a
                    key={i}
                    href={portal.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[14px] leading-relaxed text-(--color-ink-secondary)"
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
                <div className="mt-3 rounded-(--radius-md) border border-(--color-accent-sky)/30 bg-(--color-accent-sky)/8 p-3.5 text-[13px] leading-relaxed whitespace-pre-wrap text-(--color-ink-secondary)">
                  {entry.notes}
                </div>
              )}
            </section>
          ),
        )}

        {isAdding ? (
          <div className="sm:col-span-2">
            <PaymentEntryForm onSave={handleCreate} onCancel={() => setIsAdding(false)} />
          </div>
        ) : (
          !query.trim() && entries.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex min-h-[120px] items-center justify-center gap-1.5 rounded-(--radius-lg) border border-dashed border-(--color-hairline) text-[14px] font-medium text-(--color-ink-faint) transition-transform duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.97]"
            >
              <Plus size={16} />
              {t("payments.addNew")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
