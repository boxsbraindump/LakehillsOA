import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Tag, X } from "lucide-react";
import { useSearchIndex } from "../hooks/useSearchIndex";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLanguage } from "../components/LanguageProvider";
import { CATEGORY_DOT, categoryLabel } from "../lib/searchIndex";
import { collectPayers, matchDocsForPayer } from "../lib/payerFilter";
import type { Payer, SearchDoc } from "../lib/types";

function ResultList({ docs }: { docs: SearchDoc[] }) {
  const { lang } = useLanguage();
  return (
    <ul className="flex flex-col gap-1.5">
      {docs.map((doc) => (
        <li key={`${doc.category}-${doc.id}`}>
          <Link
            to={doc.path}
            className="flex items-start gap-2.5 rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) px-3 py-2.5 transition-colors hover:border-(--color-primary)/40"
          >
            <span
              aria-hidden
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_DOT[doc.category] }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-(--color-ink)">
                {doc.title}
              </span>
              <span className="block truncate text-[12px] text-(--color-ink-faint)">
                {doc.category === "custom" ? doc.categoryTitle : categoryLabel(doc.category, lang)}
                {doc.snippet ? ` · ${doc.snippet}` : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * One insurer at a time, across everything.
 *
 * Answering "what do we know about this payer" meant searching the name and hoping you had
 * spelled it the way the record did, then reading past the eight results the search box
 * returns. Here the insurers are a list to pick from, the results are all of them, and they
 * are split by how sure the match is: a record filed under the payer, versus one that merely
 * names it in the text.
 */
export default function ByPayer() {
  const { t } = useLanguage();
  const { docs } = useSearchIndex();
  const [directory] = useSyncedStorage<Payer[]>("lh-payers", []);
  const [selected, setSelected] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const payers = useMemo(
    () => collectPayers(docs, directory.map((entry) => entry.name)),
    [docs, directory],
  );

  // Typing wins over the chips: an insurer that is only ever named in prose — never in a
  // payer field, never in the directory — has no chip to click, and there were several.
  const active = typed.trim() || selected;
  const matches = useMemo(
    () => (active ? matchDocsForPayer(docs, active) : null),
    [docs, active],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {t("byPayer.title")}
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">{t("byPayer.subtitle")}</p>
      </div>

      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-ink-faint)"
        />
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("byPayer.searchPlaceholder")}
          className="w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas) py-2.5 pr-16 pl-9 text-[14px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)"
        />
        {typed && (
          <button
            type="button"
            onClick={() => setTyped("")}
            aria-label={t("common.cancel")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {payers.length > 0 && !typed.trim() && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {payers.map((payer) => {
            const isActive = selected === payer.name;
            return (
              <button
                key={payer.name}
                type="button"
                onClick={() => setSelected(isActive ? null : payer.name)}
                className={[
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  isActive
                    ? "border-(--color-primary) bg-(--color-primary)/10 font-medium text-(--color-primary)"
                    : "border-(--color-hairline) text-(--color-ink-muted) hover:border-(--color-primary)/40 hover:text-(--color-primary)",
                ].join(" ")}
              >
                {payer.name}
                <span className="text-(--color-ink-faint) tabular-nums">
                  {payer.tagged + payer.mentioned}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!active && (
        <div className="rounded-(--radius-lg) border border-dashed border-(--color-hairline) px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-(--color-ink)">{t("byPayer.pickTitle")}</p>
          <p className="mt-1 text-[13px] text-(--color-ink-muted)">
            {payers.length > 0 ? t("byPayer.pickDescription") : t("byPayer.noPayersDescription")}
          </p>
        </div>
      )}

      {matches && (
        <>
          <p className="mb-4 text-[13px] text-(--color-ink-muted)">
            {t("byPayer.resultSummary", {
              payer: active ?? "",
              total: String(matches.tagged.length + matches.mentioned.length),
            })}
          </p>

          {matches.tagged.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-(--color-ink)">
                <Tag size={13} />
                {t("byPayer.taggedHeading", { count: String(matches.tagged.length) })}
              </h2>
              <ResultList docs={matches.tagged} />
            </section>
          )}

          {matches.mentioned.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-1 text-[13px] font-semibold text-(--color-ink)">
                {t("byPayer.mentionedHeading", { count: String(matches.mentioned.length) })}
              </h2>
              <p className="mb-2 text-[12px] text-(--color-ink-faint)">
                {t("byPayer.mentionedHint")}
              </p>
              <ResultList docs={matches.mentioned} />
            </section>
          )}

          {matches.tagged.length === 0 && matches.mentioned.length === 0 && (
            <p className="rounded-(--radius-lg) border border-dashed border-(--color-hairline) py-10 text-center text-[14px] text-(--color-ink-faint)">
              {t("byPayer.noMatches", { payer: active ?? "" })}
            </p>
          )}
        </>
      )}

      {payers.length > 0 && (
        <p className="mt-6 text-[12px] text-(--color-ink-faint)">
          {t("byPayer.directoryNote")}
        </p>
      )}
    </div>
  );
}
