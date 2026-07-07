import type { CustomCategory, DeletedCustomCategory } from "./types";

export const CUSTOM_CATEGORY_DELETIONS_KEY = "lh-custom-category-deletions";

export function normalizeCategoryTitle(title: string) {
  return title.trim().toLowerCase();
}

export function isDeletedCustomCategory(
  category: CustomCategory,
  deletedCategories: DeletedCustomCategory[],
) {
  const title = normalizeCategoryTitle(category.title);
  return deletedCategories.some(
    (deleted) => deleted.id === category.id || normalizeCategoryTitle(deleted.title) === title,
  );
}

export function filterDeletedCustomCategories(
  categories: CustomCategory[],
  deletedCategories: DeletedCustomCategory[],
) {
  return categories.filter((category) => !isDeletedCustomCategory(category, deletedCategories));
}

export function normalizeCustomCategoryTemplates(categories: CustomCategory[]) {
  let changed = false;
  const next = categories.map((category) => {
    // The "查保险" workspace uses payer portal cards, so keep it on the Payments shape.
    if (normalizeCategoryTitle(category.title) === "查保险" && category.template !== "payments") {
      changed = true;
      return { ...category, template: "payments" as const };
    }
    return category;
  });

  return changed ? next : categories;
}
