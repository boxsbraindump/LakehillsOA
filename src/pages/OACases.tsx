import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { oaCases } from "../data/oaCases";
import { useHashHighlight } from "../hooks/useHashHighlight";

export default function OACases() {
  useHashHighlight();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return oaCases;
    return oaCases.filter((c) =>
      [c.title, c.payer, c.summary, c.resolution, ...c.tags].join(" ").toLowerCase().includes(q),
    );
  }, [query]);

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
        {filtered.map((c) => (
          <article
            key={c.id}
            id={c.id}
            className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-6 shadow-(--shadow-level-1)"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-bold text-(--color-ink)">{c.title}</h2>
              <span className="rounded-full bg-(--color-canvas-soft) px-2.5 py-0.5 text-[12px] font-medium text-(--color-ink-secondary)">
                {c.payer}
              </span>
            </div>

            <p className="text-[14px] text-(--color-ink-secondary)">{c.summary}</p>

            <div className="mt-3 rounded-(--radius-md) bg-(--color-canvas-soft) p-3.5">
              <p className="mb-1 text-[12px] font-semibold text-(--color-ink-faint)">处理方式</p>
              <p className="text-[14px] text-(--color-ink)">{c.resolution}</p>
            </div>

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
          </article>
        ))}
      </div>
    </div>
  );
}
