import { useMemo } from "react";
import Fuse from "fuse.js";
import { oaCases as seedCases } from "../data/oaCases";
import { paymentEntries as seedPaymentEntries } from "../data/payments";
import { useSyncedStorage } from "./useSyncedStorage";
import { useAuth } from "../components/AuthProvider";
import {
  buildChecklistSearchDocs,
  buildCustomSearchDocs,
  buildOACaseSearchDocs,
  buildPaymentSearchDocs,
  FUSE_OPTIONS,
} from "../lib/searchIndex";
import {
  CUSTOM_CATEGORY_DELETIONS_KEY,
  filterDeletedCustomCategories,
} from "../lib/customCategories";
import type {
  ChecklistItem,
  ChecklistSection,
  ChecklistSectionMeta,
  CustomCategory,
  CustomEntry,
  DeletedCustomCategory,
  OACase,
  PaymentEntry,
} from "../lib/types";

function latestChecklistDateByItemId(dayItemIds: Record<string, string[]>) {
  const result: Record<string, string> = {};
  for (const date of Object.keys(dayItemIds).sort()) {
    for (const itemId of dayItemIds[date] ?? []) {
      result[itemId] = date;
    }
  }
  return result;
}

/** Rebuilds the search index whenever synced workspace data changes. */
export function useSearchIndex() {
  const { syncEnabled, workspace } = useAuth();
  const includeSeedData = !syncEnabled || !workspace || workspace.isPrimary;
  const [customCategories] = useSyncedStorage<CustomCategory[]>("lh-custom-categories", []);
  const [customEntries] = useSyncedStorage<Record<string, CustomEntry[]>>("lh-custom-entries", {});
  const [deletedCategories] = useSyncedStorage<DeletedCustomCategory[]>(
    CUSTOM_CATEGORY_DELETIONS_KEY,
    [],
  );

  const [checklistItems] = useSyncedStorage<Record<string, ChecklistItem[]>>(
    "lh-checklist-custom-items",
    {},
  );
  const [checklistSections] = useSyncedStorage<ChecklistSectionMeta[]>(
    "lh-checklist-custom-sections",
    [],
  );
  const [checklistDayItemIds] = useSyncedStorage<Record<string, string[]>>(
    "lh-checklist-day-item-ids",
    {},
  );

  const [oaCaseOverrides] = useSyncedStorage<Record<string, OACase>>(
    "lh-oacases-overrides",
    {},
  );
  const [customOACases] = useSyncedStorage<OACase[]>("lh-oacases-custom", []);
  const [hiddenOACaseIds] = useSyncedStorage<string[]>("lh-oacases-hidden", []);

  const [paymentOverrides] = useSyncedStorage<Record<string, PaymentEntry>>(
    "lh-payments-overrides",
    {},
  );
  const [customPayments] = useSyncedStorage<PaymentEntry[]>("lh-payments-custom", []);
  const [hiddenPaymentIds] = useSyncedStorage<string[]>("lh-payments-hidden", []);

  return useMemo(() => {
    const visibleCategories = filterDeletedCustomCategories(customCategories, deletedCategories);
    const liveChecklistSections: ChecklistSection[] = checklistSections.map((section) => ({
      id: section.id,
      title: section.title,
      items: checklistItems[section.id] ?? [],
    }));
    const visibleOACases = [
      ...(includeSeedData ? seedCases.map((item) => oaCaseOverrides[item.id] ?? item) : []),
      ...customOACases,
    ].filter((item) => !hiddenOACaseIds.includes(item.id));
    const visiblePayments = [
      ...(includeSeedData
        ? seedPaymentEntries.map((item) => paymentOverrides[item.id] ?? item)
        : []),
      ...customPayments,
    ].filter((item) => !hiddenPaymentIds.includes(item.id));

    const docs = [
      ...buildChecklistSearchDocs(
        liveChecklistSections,
        latestChecklistDateByItemId(checklistDayItemIds),
      ),
      ...buildOACaseSearchDocs(visibleOACases),
      ...buildPaymentSearchDocs(visiblePayments),
      ...buildCustomSearchDocs(visibleCategories, customEntries),
    ];
    return { docs, fuse: new Fuse(docs, FUSE_OPTIONS) };
  }, [
    checklistDayItemIds,
    checklistItems,
    checklistSections,
    customCategories,
    customEntries,
    customOACases,
    customPayments,
    deletedCategories,
    hiddenOACaseIds,
    hiddenPaymentIds,
    includeSeedData,
    oaCaseOverrides,
    paymentOverrides,
  ]);
}
