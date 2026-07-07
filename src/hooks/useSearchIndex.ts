import { useMemo } from "react";
import Fuse from "fuse.js";
import { useSyncedStorage } from "./useSyncedStorage";
import { buildSeedSearchDocs, buildCustomSearchDocs, FUSE_OPTIONS } from "../lib/searchIndex";
import {
  CUSTOM_CATEGORY_DELETIONS_KEY,
  filterDeletedCustomCategories,
} from "../lib/customCategories";
import type { CustomCategory, CustomEntry, DeletedCustomCategory } from "../lib/types";

const seedDocs = buildSeedSearchDocs();

/** Rebuilds the search index whenever custom categories/entries change, so newly-added custom entries are searchable right away. */
export function useSearchIndex() {
  const [customCategories] = useSyncedStorage<CustomCategory[]>("lh-custom-categories", []);
  const [customEntries] = useSyncedStorage<Record<string, CustomEntry[]>>("lh-custom-entries", {});
  const [deletedCategories] = useSyncedStorage<DeletedCustomCategory[]>(
    CUSTOM_CATEGORY_DELETIONS_KEY,
    [],
  );

  return useMemo(() => {
    const visibleCategories = filterDeletedCustomCategories(customCategories, deletedCategories);
    const docs = [...seedDocs, ...buildCustomSearchDocs(visibleCategories, customEntries)];
    return { docs, fuse: new Fuse(docs, FUSE_OPTIONS) };
  }, [customCategories, customEntries, deletedCategories]);
}
