import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Phone, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useSearchIndex } from "../hooks/useSearchIndex";
import { searchDocs } from "../lib/searchIndex";
import type { CallCard } from "../lib/types";

/**
 * The board you keep open while on the phone to an insurance company.
 *
 * Everything on it is pulled in by searching what is already written down, rather than
 * retyped: the NPI and tax ID live in a folder entry already, and copying them into a
 * settings screen by hand was work for no gain. Pinned cards stay for every call; the
 * rest are gathered before a call and cleared after it.
 */
export default function QuickFactsPanel() {
  const { t } = useLanguage();
  const { docs, fuse } = useSearchIndex();
  // Pinned cards are the same on every machine; the per-call scratch pile is not — it
  // belongs to the person holding the phone right now.
  const [pinned, setPinned] = useSyncedStorage<CallCard[]>("lh-call-pinned", []);
  const [scratch, setScratch] = useLocalStorage<CallCard[]>("lh-call-scratch", []);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const copyResetRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyResetRef.current), []);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Re-read each card from the live index, so a card added before an edit still shows the
  // current text; the stored copy is only a fallback for records since deleted.
  const cards = useMemo(() => {
    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    return [...pinned, ...scratch].map((card) => {
      const live = byId.get(card.id);
      if (!live) return card;
      return {
        ...card,
        title: live.title,
        body: live.body ?? live.snippet ?? card.body,
        source: live.categoryTitle ?? card.source,
      };
    });
  }, [pinned, scratch, docs]);
  const onBoard = useMemo(() => new Set(cards.map((card) => card.id)), [cards]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchDocs(fuse, query, 6).filter((doc) => !onBoard.has(doc.id));
  }, [fuse, query, onBoard]);

  function addCard(docId: string) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc) return;
    setScratch((prev) =>
      prev.some((card) => card.id === doc.id)
        ? prev
        : [
            ...prev,
            { id: doc.id, title: doc.title, body: doc.body ?? doc.snippet, source: doc.categoryTitle },
          ],
    );
    setQuery("");
  }

  function removeCard(card: CallCard) {
    setPinned((prev) => prev.filter((c) => c.id !== card.id));
    setScratch((prev) => prev.filter((c) => c.id !== card.id));
  }

  function togglePin(card: CallCard) {
    const isPinned = pinned.some((c) => c.id === card.id);
    if (isPinned) {
      setPinned((prev) => prev.filter((c) => c.id !== card.id));
      setScratch((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]));
      return;
    }
    setScratch((prev) => prev.filter((c) => c.id !== card.id));
    setPinned((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]));
  }

  async function copyCard(card: CallCard) {
    const text = card.body ? `${card.title}\n${card.body}` : card.title;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard refused (not focused, insecure origin) — it is on screen to read out.
      return;
    }
    setCopiedId(card.id);
    window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t("callBoard.open")}
        title={t("callBoard.open")}
        className="fixed right-4 bottom-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-(--color-primary) text-white shadow-[0_10px_24px_rgba(40,175,165,0.32)] transition-transform hover:bg-(--color-primary-active) active:scale-95"
      >
        <Phone size={18} strokeWidth={2.1} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("callBoard.title")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="fade-in-up flex max-h-[86svh] w-full max-w-2xl flex-col overflow-hidden rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) shadow-(--shadow-level-2)">
            <div className="flex items-center justify-between gap-3 border-b border-(--color-hairline) px-5 py-3">
              <h2 className="text-[16px] font-bold text-(--color-ink)">{t("callBoard.title")}</h2>
              <div className="flex items-center gap-2">
                {scratch.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setScratch([])}
                    className="rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1 text-[12px] font-medium text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
                  >
                    {t("callBoard.clear")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label={t("common.cancel")}
                  className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink-secondary)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="border-b border-(--color-hairline) px-5 py-3">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("callBoard.searchPlaceholder")}
                  className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) py-2 pr-3 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)"
                />
              </div>
              {query.trim() && (
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-(--radius-md) border border-(--color-hairline)">
                  {results.length === 0 ? (
                    <li className="px-3 py-2 text-[13px] text-(--color-ink-faint)">
                      {t("callBoard.noResults")}
                    </li>
                  ) : (
                    results.map((doc) => (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => addCard(doc.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-(--color-canvas-soft)"
                        >
                          <Plus size={13} className="shrink-0 text-(--color-primary)" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-(--color-ink)">
                              {doc.title}
                            </span>
                            <span className="block truncate text-[12px] text-(--color-ink-faint)">
                              {doc.snippet}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {cards.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-(--color-ink-muted)">
                  {t("callBoard.empty")}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((card) => {
                    const isPinned = pinned.some((c) => c.id === card.id);
                    return (
                      <li
                        key={card.id}
                        className="rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas-soft) p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            {card.source && (
                              <p className="text-[11px] tracking-[0.04em] text-(--color-ink-faint) uppercase">
                                {card.source}
                              </p>
                            )}
                            {/* Big and tabular: these get read down a phone line. */}
                            <p className="text-[16px] font-semibold text-(--color-ink) [font-variant-numeric:tabular-nums]">
                              {card.title}
                            </p>
                            {card.body && (
                              <>
                                {/* One long record would otherwise bury every card under
                                    it — the same reason folders are hard to scroll. */}
                                <p
                                  className={[
                                    "mt-1 text-[14px] leading-relaxed whitespace-pre-wrap text-(--color-ink-secondary) [font-variant-numeric:tabular-nums]",
                                    expandedIds.includes(card.id) ? "" : "line-clamp-6",
                                  ].join(" ")}
                                >
                                  {card.body}
                                </p>
                                {(card.body.length > 300 || card.body.split("\n").length > 6) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedIds((prev) =>
                                        prev.includes(card.id)
                                          ? prev.filter((x) => x !== card.id)
                                          : [...prev, card.id],
                                      )
                                    }
                                    className="mt-1 text-[12px] font-medium text-(--color-primary) hover:underline"
                                  >
                                    {t(
                                      expandedIds.includes(card.id)
                                        ? "entry.showLess"
                                        : "entry.showMore",
                                    )}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => copyCard(card)}
                              aria-label={t(copiedId === card.id ? "callBoard.copied" : "callBoard.copy")}
                              title={t(copiedId === card.id ? "callBoard.copied" : "callBoard.copy")}
                              className="rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas) hover:text-(--color-primary)"
                            >
                              {copiedId === card.id ? (
                                <Check size={14} className="text-(--color-primary)" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePin(card)}
                              aria-label={t(isPinned ? "callBoard.unpin" : "callBoard.pin")}
                              title={t(isPinned ? "callBoard.unpin" : "callBoard.pin")}
                              className={[
                                "rounded-(--radius-sm) p-1.5 hover:bg-(--color-canvas)",
                                isPinned
                                  ? "text-(--color-primary)"
                                  : "text-(--color-ink-faint) hover:text-(--color-primary)",
                              ].join(" ")}
                            >
                              {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCard(card)}
                              aria-label={t("common.delete")}
                              className="rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas) hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
