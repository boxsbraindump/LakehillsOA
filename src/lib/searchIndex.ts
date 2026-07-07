import type { IFuseOptions } from "fuse.js";
import { checklistSections } from "../data/checklist";
import { oaCases } from "../data/oaCases";
import { paymentEntries } from "../data/payments";
import { translations, type Lang } from "./translations";
import type { SearchDoc, CustomCategory, CustomEntry } from "./types";

/**
 * Seed-data-only docs (checklist/OA cases/payments as shipped with the app). Known gap: this
 * does NOT include user-added/edited items in those three categories, since they live in
 * synced storage rather than these static imports — left as-is for now, only custom
 * categories (built entirely from synced storage) are made reactively searchable below.
 */
export function buildSeedSearchDocs(): SearchDoc[] {
  return [
    ...checklistSections.flatMap((section) =>
      section.items.map(
        (item): SearchDoc => ({
          id: item.id,
          category: "checklist",
          path: `/checklist#${item.id}`,
          title: item.label,
          snippet: `前台工作 Checklist · ${section.title}`,
          keywords: [section.title, item.detail ?? ""],
        }),
      ),
    ),
    ...oaCases.map(
      (c): SearchDoc => ({
        id: c.id,
        category: "oa-cases",
        path: `/oa-cases#${c.id}`,
        title: c.title,
        snippet: c.summary,
        keywords: [c.payer, ...c.tags],
      }),
    ),
    ...paymentEntries.map(
      (p): SearchDoc => ({
        id: p.id,
        category: "payments",
        path: `/payments#${p.id}`,
        title: p.payer,
        snippet: p.portals.map((portal) => portal.name).join(" · "),
        keywords: [p.notes ?? "", ...p.portals.map((portal) => portal.name)],
      }),
    ),
  ];
}

export function buildCustomSearchDocs(
  customCategories: CustomCategory[],
  customEntries: Record<string, CustomEntry[]>,
): SearchDoc[] {
  return customCategories.flatMap((cat) =>
    (customEntries[cat.id] ?? []).map(
      (entry): SearchDoc => {
        const portalText = (entry.portals ?? []).flatMap((portal) => [portal.name, portal.url]);
        return {
          id: entry.id,
          category: "custom",
          categoryTitle: cat.title,
          path: `/custom/${cat.id}#${entry.id}`,
          title: entry.title,
          snippet:
            entry.summary ??
            entry.notes ??
            entry.detail ??
            (entry.portals ?? []).map((portal) => portal.name).join(" · ") ??
            cat.title,
          keywords: [
            cat.title,
            entry.detail ?? "",
            entry.payer ?? "",
            entry.resolution ?? "",
            ...entry.tags,
            ...portalText,
          ],
        };
      },
    ),
  );
}

export const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  keys: [
    { name: "title", weight: 3 },
    { name: "snippet", weight: 1.5 },
    { name: "keywords", weight: 1 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
};

const CATEGORY_LABEL_KEY: Record<
  SearchDoc["category"],
  "category.checklist" | "category.oaCases" | "category.payments" | "category.custom"
> = {
  checklist: "category.checklist",
  "oa-cases": "category.oaCases",
  payments: "category.payments",
  custom: "category.custom",
};

export function categoryLabel(category: SearchDoc["category"], lang: Lang): string {
  return translations[CATEGORY_LABEL_KEY[category]][lang];
}

export const CATEGORY_DOT: Record<SearchDoc["category"], string> = {
  checklist: "var(--color-accent-teal)",
  "oa-cases": "var(--color-accent-orange)",
  payments: "var(--color-accent-purple)",
  custom: "var(--color-accent-green)",
};
