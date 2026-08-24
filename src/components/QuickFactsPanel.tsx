import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Phone, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import type { QuickFact } from "../lib/types";

/**
 * The details read aloud on nearly every insurance call — NPI, tax ID, provider name,
 * callback number — kept one click away on whatever page is already open. They used to
 * live as prose inside a folder entry, so taking a call meant leaving the checklist you
 * were typing notes into, finding them, and navigating back.
 */
export default function QuickFactsPanel() {
  const { t } = useLanguage();
  const [facts] = useSyncedStorage<QuickFact[]>("lh-quick-facts", []);
  const [isOpen, setIsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const copyResetRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyResetRef.current), []);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function copyValue(fact: QuickFact) {
    try {
      await navigator.clipboard.writeText(fact.value);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — the value is on screen
      // to read out either way, which is the main thing during a call.
      return;
    }
    setCopiedId(fact.id);
    window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div ref={panelRef} className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="fade-in-up w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) shadow-(--shadow-level-2)">
          <div className="flex items-center justify-between border-b border-(--color-hairline) px-3 py-2">
            <p className="text-[13px] font-semibold text-(--color-ink)">{t("quickFacts.title")}</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={t("quickFacts.close")}
              className="rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink-secondary)"
            >
              <X size={14} />
            </button>
          </div>

          {facts.length === 0 ? (
            <div className="px-3 py-4">
              <p className="text-[13px] text-(--color-ink-muted)">{t("quickFacts.empty")}</p>
              <Link
                to="/settings"
                onClick={() => setIsOpen(false)}
                className="mt-2 inline-block text-[13px] font-medium text-(--color-primary) hover:underline"
              >
                {t("quickFacts.manage")}
              </Link>
            </div>
          ) : (
            <ul className="max-h-[60svh] divide-y divide-(--color-hairline) overflow-y-auto">
              {facts.map((fact) => (
                <li key={fact.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] tracking-[0.04em] text-(--color-ink-faint) uppercase">
                      {fact.label}
                    </p>
                    {/* Tabular figures so long digit strings stay easy to read off aloud. */}
                    <p className="text-[15px] font-medium break-all text-(--color-ink) [font-variant-numeric:tabular-nums]">
                      {fact.value}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyValue(fact)}
                    aria-label={t(copiedId === fact.id ? "quickFacts.copied" : "quickFacts.copy")}
                    title={t(copiedId === fact.id ? "quickFacts.copied" : "quickFacts.copy")}
                    className="shrink-0 rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-primary)"
                  >
                    {copiedId === fact.id ? (
                      <Check size={14} className="text-(--color-primary)" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t("quickFacts.open")}
        aria-expanded={isOpen}
        title={t("quickFacts.open")}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-(--color-primary) text-white shadow-[0_10px_24px_rgba(40,175,165,0.32)] transition-transform hover:bg-(--color-primary-active) active:scale-95"
      >
        <Phone size={18} strokeWidth={2.1} />
      </button>
    </div>
  );
}
