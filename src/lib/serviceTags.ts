/**
 * What part of the body a visit treated — shoulders-and-neck, head, and whatever else the
 * clinic decides it needs.
 *
 * Deliberately a Notion-style select rather than a fixed list in the code: the clinic renames
 * these themselves, and a rename has to reach every visit already tagged. So a visit stores the
 * option's id and never its label, which is the whole trick — editing the word changes it
 * everywhere at once, and nothing has to be migrated.
 */

export interface ServiceTag {
  id: string;
  label: string;
  /** An index into {@link TAG_COLORS}, so a renamed tag keeps its colour. */
  color: number;
}

/** Muted on purpose: a column of these sits next to the status colours and must not shout. */
export const TAG_COLORS = [
  "border-slate-300 bg-slate-100 text-slate-700",
  "border-violet-300 bg-violet-100 text-violet-800",
  "border-teal-300 bg-teal-100 text-teal-800",
  "border-orange-300 bg-orange-100 text-orange-800",
  "border-pink-300 bg-pink-100 text-pink-800",
  "border-lime-300 bg-lime-100 text-lime-800",
  "border-cyan-300 bg-cyan-100 text-cyan-800",
];

export function newTagId(): string {
  return `tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A starting point, not a taxonomy — every one of these is meant to be renamed or deleted. */
export const DEFAULT_SERVICE_TAGS: ServiceTag[] = [
  { id: "tag-seed-neck", label: "肩颈", color: 1 },
  { id: "tag-seed-head", label: "头", color: 2 },
  { id: "tag-seed-back", label: "背腰", color: 3 },
  { id: "tag-seed-leg", label: "腿", color: 4 },
];

export function tagById(tags: ServiceTag[], id: string | undefined): ServiceTag | null {
  if (!id) return null;
  return tags.find((tag) => tag.id === id) ?? null;
}

function normalise(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "");
}

export function tagByLabel(tags: ServiceTag[], label: string): ServiceTag | null {
  const key = normalise(label);
  if (!key) return null;
  return tags.find((tag) => normalise(tag.label) === key) ?? null;
}

/**
 * Resolve labels coming in from a spreadsheet, inventing options for the ones that are new.
 *
 * Their sheet already has a column for this, so an import that ignored it would leave the
 * clinic re-entering by hand what they had already written down. Unknown labels become new
 * options rather than being dropped — renaming or deleting one afterwards is a click.
 */
export function resolveImportedTags(
  tags: ServiceTag[],
  labels: (string | undefined)[],
): { tags: ServiceTag[]; idFor: Map<string, string> } {
  const next = [...tags];
  const idFor = new Map<string, string>();

  for (const label of labels) {
    if (!label || !label.trim()) continue;
    const key = normalise(label);
    if (idFor.has(key)) continue;

    const existing = tagByLabel(next, label);
    if (existing) {
      idFor.set(key, existing.id);
      continue;
    }
    const created: ServiceTag = {
      id: newTagId() + next.length,
      label: label.trim(),
      color: next.length % TAG_COLORS.length,
    };
    next.push(created);
    idFor.set(key, created.id);
  }

  return { tags: next, idFor };
}
