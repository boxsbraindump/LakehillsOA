import type { CustomCategory, CustomCategoryTemplate, DeletedCustomCategory } from "./types";

export const CUSTOM_CATEGORY_DELETIONS_KEY = "lh-custom-category-deletions";

export function normalizeCategoryTitle(title: string) {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A tombstone identifies one deleted folder instance, so it must match on id only.
 * Matching on title would turn every deletion into a permanent name blocklist, which
 * in turn forced callers to purge Trash just to free a name up again.
 */
export function isDeletedCustomCategory(
  category: CustomCategory,
  deletedCategories: DeletedCustomCategory[],
) {
  return deletedCategories.some((deleted) => deleted.id === category.id);
}

export function filterDeletedCustomCategories(
  categories: CustomCategory[],
  deletedCategories: DeletedCustomCategory[],
) {
  return categories.filter((category) => !isDeletedCustomCategory(category, deletedCategories));
}

/**
 * One-time migration for folders created before templates were stored explicitly.
 * The original "查保险" folder holds payer portal cards, so give it the Payments
 * template *once* and persist it. This must not run as a render-time override:
 * doing so silently ignored the template the user picked, and silently reshaped a
 * folder's data the moment it was renamed to or from "查保险".
 */
export function migrateLegacyCustomCategoryTemplates(categories: CustomCategory[]) {
  let changed = false;
  const next = categories.map((category) => {
    if (category.template) return category;
    changed = true;
    const isLegacyPayerFolder = normalizeCategoryTitle(category.title) === "查保险";
    const template: CustomCategoryTemplate = isLegacyPayerFolder ? "payments" : "oa-case";
    return { ...category, template };
  });

  return changed ? next : categories;
}
