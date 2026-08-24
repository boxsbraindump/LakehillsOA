import type Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import { checklistSections } from "../data/checklist";
import { oaCases } from "../data/oaCases";
import { paymentEntries } from "../data/payments";
import { translations, type Lang } from "./translations";
import type {
  ChecklistSection,
  CustomCategory,
  CustomEntry,
  OACase,
  PaymentEntry,
  SearchDoc,
} from "./types";

/**
 * Lowercased with all whitespace removed. A name typed "PanZhongjuan" and the same name
 * stored "Pan Zhongjuan" are the same name to the person searching, but a plain substring
 * test misses across that space — which made records impossible to find by name.
 */
export function compactForSearch(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

/** Substring match that ignores where the spaces fall on either side. */
export function matchesSearch(haystack: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (haystack.toLowerCase().includes(q)) return true;
  return compactForSearch(haystack).includes(compactForSearch(query));
}

export function buildSeedSearchDocs(): SearchDoc[] {
  return [
    ...buildChecklistSearchDocs(checklistSections),
    ...buildOACaseSearchDocs(oaCases),
    ...buildPaymentSearchDocs(paymentEntries),
  ];
}

export function buildChecklistSearchDocs(
  sections: ChecklistSection[],
  dateByItemId: Record<string, string> = {},
): SearchDoc[] {
  return sections.flatMap((section) =>
    section.items.map((item): SearchDoc => {
      const date = dateByItemId[item.id];
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      return {
        id: item.id,
        body: joinBody([item.detail]),
        category: "checklist",
        path: `/checklist${query}#${item.id}`,
        title: item.label,
        snippet: item.detail?.trim() || `Checklist · ${section.title}`,
        keywords: [section.title, item.detail ?? ""],
      };
    }),
  );
}

export function buildOACaseSearchDocs(cases: OACase[]): SearchDoc[] {
  return cases.map(
    (c): SearchDoc => ({
      id: c.id,
      body: joinBody([c.payer, c.summary, c.resolution]),
      category: "oa-cases",
      path: `/oa-cases#${c.id}`,
      title: c.title,
      snippet: c.summary || c.resolution || c.payer,
      keywords: [c.payer, c.resolution, ...c.tags],
    }),
  );
}

export function buildPaymentSearchDocs(entries: PaymentEntry[]): SearchDoc[] {
  return entries.map(
    (p): SearchDoc => {
      const portalText = p.portals.flatMap((portal) => [portal.name, portal.url]);
      const body = joinBody([
        p.portals.map((portal) => [portal.name, portal.url].filter(Boolean).join(": ")).join("\n"),
        p.notes,
      ]);
      return {
        id: p.id,
        body,
        category: "payments",
        path: `/payments#${p.id}`,
        title: p.payer,
        snippet: p.portals.map((portal) => portal.name).filter(Boolean).join(" · ") || p.notes || "",
        keywords: [p.notes ?? "", ...portalText],
      };
    },
  );
}

/** Non-empty parts, in reading order, as one block of text. */
function joinBody(parts: (string | undefined)[]) {
  return parts.map((part) => part?.trim()).filter(Boolean).join("\n");
}

export function buildCustomSearchDocs(
  customCategories: CustomCategory[],
  customEntries: Record<string, CustomEntry[]>,
): SearchDoc[] {
  return customCategories.flatMap((cat) =>
    (customEntries[cat.id] ?? []).map(
      (entry): SearchDoc => {
        const portalText = (entry.portals ?? []).flatMap((portal) => [portal.name, portal.url]);
        // Everything readable, in the order it appears on the card. `resolution` was
        // missing from the preview chain below, and it is where these entries actually
        // keep their contents — so anything written there looked blank outside its folder.
        const body = joinBody([
          entry.payer,
          entry.summary,
          entry.resolution,
          entry.detail,
          entry.notes,
          (entry.portals ?? [])
            .map((portal) => [portal.name, portal.url].filter(Boolean).join(": "))
            .filter(Boolean)
            .join("\n"),
        ]);
        return {
          id: entry.id,
          body,
          category: "custom",
          categoryTitle: cat.title,
          path: `/custom/${cat.id}#${entry.id}`,
          title: entry.title,
          snippet: body.split("\n")[0] || cat.title,
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
    // Space-stripped copy of the text above, so a query typed without spaces still lands.
    { name: "compact", weight: 2, getFn: (doc) => compactForSearch(searchableText(doc)) },
  ],
  threshold: 0.35,
  ignoreLocation: true,
};

function searchableText(doc: SearchDoc) {
  return [doc.title, doc.snippet, ...doc.keywords].join(" ");
}

/**
 * Runs the query as typed and with its spaces removed, so the same record is found
 * whether the name was stored "Pan Zhongjuan" and searched "PanZhongjuan" or the reverse.
 */
export function searchDocs(fuse: Fuse<SearchDoc>, query: string, limit = 8): SearchDoc[] {
  const results = fuse.search(query, { limit }).map((r) => r.item);
  const compact = compactForSearch(query);
  if (compact === query.trim().toLowerCase()) return results;

  const seen = new Set(results.map((doc) => doc.id));
  for (const { item } of fuse.search(compact, { limit })) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    results.push(item);
  }
  return results.slice(0, limit);
}

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
