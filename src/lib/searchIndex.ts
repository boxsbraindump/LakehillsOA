import Fuse from "fuse.js";
import { checklistSections } from "../data/checklist";
import { oaCases } from "../data/oaCases";
import { paymentSections } from "../data/payments";
import type { SearchDoc } from "./types";

export const searchDocs: SearchDoc[] = [
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
  ...paymentSections.map(
    (p): SearchDoc => ({
      id: p.id,
      category: "payments",
      path: `/payments#${p.id}`,
      title: p.title,
      snippet: p.steps[0] ?? "",
      keywords: [p.notes ?? "", ...p.steps],
    }),
  ),
];

export const searchFuse = new Fuse(searchDocs, {
  keys: [
    { name: "title", weight: 3 },
    { name: "snippet", weight: 1.5 },
    { name: "keywords", weight: 1 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
});

export const CATEGORY_LABEL: Record<SearchDoc["category"], string> = {
  checklist: "前台 Checklist",
  "oa-cases": "OA Cases",
  payments: "Payments",
};

export const CATEGORY_DOT: Record<SearchDoc["category"], string> = {
  checklist: "var(--color-accent-teal)",
  "oa-cases": "var(--color-accent-orange)",
  payments: "var(--color-accent-purple)",
};
