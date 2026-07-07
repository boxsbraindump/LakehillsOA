import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Category, SearchDoc } from "../lib/types";

const USAGE_STATS_KEY = "lh-usage-stats";

export interface UsageEntry {
  id: string;
  category: Category;
  categoryTitle?: string;
  path: string;
  title: string;
  count: number;
  lastUsedAt: number;
}

export type UsageTarget = Pick<
  SearchDoc,
  "id" | "category" | "categoryTitle" | "path" | "title"
>;

type UsageStats = Record<string, UsageEntry>;

export function useUsageStats() {
  const [stats, setStats] = useLocalStorage<UsageStats>(USAGE_STATS_KEY, {});

  const trackUsage = useCallback(
    (target: UsageTarget) => {
      const now = Date.now();
      setStats((prev) => {
        const previous = prev[target.path];
        return {
          ...prev,
          [target.path]: {
            id: target.id,
            category: target.category,
            categoryTitle: target.categoryTitle,
            path: target.path,
            title: target.title,
            count: (previous?.count ?? 0) + 1,
            lastUsedAt: now,
          },
        };
      });
    },
    [setStats],
  );

  const usageEntries = useMemo(
    () =>
      Object.values(stats).sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastUsedAt - a.lastUsedAt;
      }),
    [stats],
  );

  return { trackUsage, usageEntries };
}
