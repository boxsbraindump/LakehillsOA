import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search } from "lucide-react";
import { searchFuse, searchDocs, CATEGORY_DOT } from "../lib/searchIndex";
import SearchResults from "../components/SearchResults";
import SplitText from "../components/SplitText";

const QUICK_CHIP_IDS = [
  "opening-voicemail",
  "case-secondary-denial",
  "kaiser-permanente",
  "day-copay",
  "case-auth-expired",
  "medicare",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchFuse.search(query, { limit: 8 }).map((r) => r.item);
  }, [query]);

  const quickChips = useMemo(
    () => QUICK_CHIP_IDS.map((id) => searchDocs.find((d) => d.id === id)).filter(Boolean),
    [],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results.length > 0) {
      navigate(results[0].path);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="inline-flex max-w-full items-center rounded-full bg-(--color-canvas) px-3 py-1 text-[12px] font-semibold tracking-[0.005em] text-(--color-primary) shadow-(--shadow-level-1)">
            Lake Hills Acupuncture · Internal
          </span>
          <SplitText
            tag="h1"
            text="有什么想查的？"
            className="mt-4 text-[40px] leading-[1.1] font-bold tracking-(--tracking-heading) text-(--color-ink)"
            splitType="chars"
            delay={50}
            duration={0.6}
            ease="power3.out"
            from={{ opacity: 0, y: 20 }}
            to={{ opacity: 1, y: 0 }}
            textAlign="center"
          />
          <SplitText
            tag="p"
            text="搜索前台 checklist、OA 理赔案例，或付款查询位置"
            className="mt-2 text-[16px] text-(--color-ink-muted)"
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
          <div className="relative flex items-center rounded-full bg-(--color-canvas) shadow-(--shadow-level-1) transition-shadow focus-within:shadow-(--shadow-level-2)">
            <Search size={18} className="ml-5 shrink-0 text-(--color-ink-faint)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="试试「copay」「授权」「ERA」…"
              className="w-full bg-transparent px-3 py-4 text-[16px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint)"
            />
          </div>

          {query.trim() && (
            <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-10 rounded-(--radius-xl) border border-(--color-hairline) bg-(--color-canvas) shadow-(--shadow-level-2)">
              <SearchResults results={results} />
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--color-hairline) bg-(--color-canvas) px-3 py-1.5 text-[13px] text-(--color-ink-secondary) shadow-(--shadow-level-1) transition-colors hover:border-(--color-primary)/40 hover:text-(--color-primary)"
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
