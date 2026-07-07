import { Link } from "react-router-dom";
import type { SearchDoc } from "../lib/types";
import { CATEGORY_DOT, categoryLabel } from "../lib/searchIndex";
import { useLanguage } from "./LanguageProvider";

export default function SearchResults({
  results,
  onNavigate,
}: {
  results: SearchDoc[];
  onNavigate?: () => void;
}) {
  const { t, lang } = useLanguage();

  if (results.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[14px] text-(--color-ink-faint)">
        {t("search.noResults")}
      </div>
    );
  }

  return (
    <ul className="max-h-96 overflow-y-auto py-1.5">
      {results.map((doc) => (
        <li key={doc.id}>
          <Link
            to={doc.path}
            onClick={onNavigate}
            className="flex items-start gap-3 px-4 py-2.5 hover:bg-(--color-canvas-soft)"
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_DOT[doc.category] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-(--color-ink)">
                {doc.title}
              </span>
              <span className="block truncate text-[13px] text-(--color-ink-muted)">
                {doc.category === "custom" ? doc.categoryTitle : categoryLabel(doc.category, lang)} ·{" "}
                {doc.snippet}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
