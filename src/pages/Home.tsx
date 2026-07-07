import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search } from "lucide-react";
import { CATEGORY_DOT } from "../lib/searchIndex";
import { useSearchIndex } from "../hooks/useSearchIndex";
import { useUsageStats } from "../hooks/useUsageStats";
import SearchResults from "../components/SearchResults";
import SplitText from "../components/SplitText";
import { useLanguage } from "../components/LanguageProvider";
import type { SearchDoc } from "../lib/types";

const QUICK_CHIP_IDS = [
  "opening-voicemail",
  "case-secondary-denial",
  "kaiser-permanente",
  "day-copay",
  "case-auth-expired",
  "medicare",
];

type QuickChip = Pick<SearchDoc, "id" | "category" | "categoryTitle" | "path" | "title">;

export default function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { docs, fuse } = useSearchIndex();
  const { trackUsage, usageEntries } = useUsageStats();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query, { limit: 8 }).map((r) => r.item);
  }, [query, fuse]);

  const quickChips = useMemo(() => {
    const docsByPath = new Map(docs.map((doc) => [doc.path, doc]));
    const fallbackDocs = QUICK_CHIP_IDS.map((id) => docs.find((doc) => doc.id === id)).filter(
      Boolean,
    );
    const chips: QuickChip[] = [];
    const seenPaths = new Set<string>();

    for (const entry of usageEntries) {
      if (entry.path === "/" || entry.path === "/settings" || entry.path === "/trash") continue;
      const chip = docsByPath.get(entry.path) ?? entry;
      if (seenPaths.has(chip.path)) continue;
      chips.push(chip);
      seenPaths.add(chip.path);
    }

    for (const doc of fallbackDocs) {
      if (!doc || seenPaths.has(doc.path)) continue;
      chips.push(doc);
      seenPaths.add(doc.path);
    }

    return chips.slice(0, 6);
  }, [docs, usageEntries]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results.length > 0) {
      trackUsage(results[0]);
      navigate(results[0].path);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="inline-flex max-w-full items-center rounded-full border border-(--color-primary)/15 bg-white/78 px-3 py-1 text-[12px] font-semibold tracking-[0.005em] text-(--color-secondary) shadow-(--shadow-level-1)">
            Lake Hills Acupuncture · Internal
          </span>
          <SplitText
            key={`h1-${lang}`}
            tag="h1"
            text={t("home.heading")}
            className="mt-4 text-[44px] leading-[1.04] font-bold tracking-(--tracking-heading) text-(--color-ink)"
            splitType="chars"
            delay={50}
            duration={0.6}
            ease="power3.out"
            from={{ opacity: 0, y: 20 }}
            to={{ opacity: 1, y: 0 }}
            textAlign="center"
          />
          <SplitText
            key={`p-${lang}`}
            tag="p"
            text={t("home.subtitle")}
            className="mt-3 text-[16px] text-(--color-ink-muted)"
            splitType="words"
            delay={50}
            duration={0.5}
            ease="power3.out"
            from={{ opacity: 0, y: 12 }}
            to={{ opacity: 1, y: 0 }}
            textAlign="center"
          />
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-center rounded-full border border-(--color-hairline) bg-white/88 shadow-(--shadow-level-1) transition-[box-shadow,border-color,transform] duration-200 focus-within:border-(--color-primary)/30 focus-within:shadow-(--shadow-level-2)">
            <Search size={18} className="ml-5 shrink-0 text-(--color-primary)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("home.searchPlaceholder")}
              className="w-full bg-transparent px-3 py-4 text-[16px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint)"
            />
          </div>

          {query.trim() && (
            <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-10 rounded-(--radius-xl) border border-(--color-hairline) bg-(--color-canvas) shadow-(--shadow-level-2)">
              <SearchResults results={results} onNavigate={trackUsage} />
            </div>
          )}
        </form>

        {!query.trim() && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {quickChips.map((doc) =>
              doc ? (
                <Link
                  key={doc.id}
                  to={doc.path}
                  onClick={() => trackUsage(doc)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--color-hairline) bg-white/82 px-3 py-1.5 text-[13px] text-(--color-ink-secondary) shadow-(--shadow-level-1) transition-[border-color,color,transform] duration-200 hover:-translate-y-0.5 hover:border-(--color-primary)/40 hover:text-(--color-secondary)"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CATEGORY_DOT[doc.category] }}
                    aria-hidden
                  />
                  {doc.title}
                </Link>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
