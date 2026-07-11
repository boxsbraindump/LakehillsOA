import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  FileSearch,
  CreditCard,
  Sparkles,
  Trash2,
  Folder,
  Shield,
  BookOpen,
  Landmark,
  HelpCircle,
  Pencil,
  Plus,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useUsageStats } from "../hooks/useUsageStats";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "./ToastProvider";
import { useConfirm } from "./ConfirmProvider";
import { slugify } from "../lib/slugify";
import {
  CUSTOM_CATEGORY_DELETIONS_KEY,
  filterDeletedCustomCategories,
  normalizeCustomCategoryTemplates,
  normalizeCategoryTitle,
} from "../lib/customCategories";
import ProfileMenu from "./ProfileMenu";
import SyncStatusBadge from "./SyncStatusBadge";
import type {
  CustomCategory,
  CustomCategoryIcon,
  CustomCategoryTemplate,
  CustomEntry,
  DeletedCustomCategory,
} from "../lib/types";

const NAV_ITEMS = [
  {
    to: "/checklist",
    key: "sidebar.checklist",
    category: "checklist",
    icon: ClipboardCheck,
    dot: "var(--color-accent-teal)",
  },
  {
    to: "/oa-cases",
    key: "sidebar.oaCases",
    category: "oa-cases",
    icon: FileSearch,
    dot: "var(--color-accent-orange)",
  },
  {
    to: "/payments",
    key: "sidebar.payments",
    category: "payments",
    icon: CreditCard,
    dot: "var(--color-accent-purple)",
  },
] as const;

const UTILITY_NAV_ITEMS = [{ to: "/trash", key: "sidebar.trash", icon: Trash2 }] as const;

const ICON_CHOICES: CustomCategoryIcon[] = ["folder", "shield", "book-open", "landmark", "help-circle"];
const ICON_MAP: Record<CustomCategoryIcon, typeof Folder> = {
  folder: Folder,
  shield: Shield,
  "book-open": BookOpen,
  landmark: Landmark,
  "help-circle": HelpCircle,
};
const TEMPLATE_CHOICES: CustomCategoryTemplate[] = ["checklist", "oa-case", "payments"];
const TEMPLATE_ICON_MAP: Record<CustomCategoryTemplate, typeof Folder> = {
  checklist: ClipboardCheck,
  "oa-case": FileSearch,
  payments: CreditCard,
};
const TEMPLATE_LABEL_KEY: Record<
  CustomCategoryTemplate,
  "template.checklist" | "template.oaCase" | "template.payments"
> = {
  checklist: "template.checklist",
  "oa-case": "template.oaCase",
  payments: "template.payments",
};

function navLinkClass({ isActive }: { isActive: boolean }, extra = "") {
  return [
    "group flex shrink-0 items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] whitespace-nowrap transition-colors",
    isActive
      ? "active bg-(--color-sidebar-active) font-medium text-white shadow-[0_6px_16px_rgba(40,175,165,0.18)]"
      : "text-(--color-ink-secondary) hover:bg-(--color-sidebar-hover) hover:text-(--color-secondary)",
    extra,
  ].join(" ");
}

const inlineInputClass =
  "w-full rounded-(--radius-xs) border border-(--color-sidebar-border) bg-white/80 px-2 py-1 text-[13px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary) focus:shadow-(--shadow-level-1)";

export default function Sidebar() {
  const { syncEnabled } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { trackUsage } = useUsageStats();

  const [customCategories, setCustomCategories] = useSyncedStorage<CustomCategory[]>(
    "lh-custom-categories",
    [],
  );
  const [customEntries, setCustomEntries] = useSyncedStorage<Record<string, CustomEntry[]>>(
    "lh-custom-entries",
    {},
  );
  const [deletedCategories, setDeletedCategories] = useSyncedStorage<DeletedCustomCategory[]>(
    CUSTOM_CATEGORY_DELETIONS_KEY,
    [],
  );

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState<CustomCategoryIcon>("folder");
  const [newCategoryTemplate, setNewCategoryTemplate] =
    useState<CustomCategoryTemplate>("checklist");

  const normalizedCustomCategories = normalizeCustomCategoryTemplates(customCategories);

  function startRename(category: CustomCategory) {
    setEditingCategoryId(category.id);
    setRenameValue(category.title);
  }

  function handleRenameSubmit(e: React.FormEvent, categoryId: string) {
    e.preventDefault();
    if (!renameValue.trim()) return;
    setCustomCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, title: renameValue.trim() } : c)),
    );
    setEditingCategoryId(null);
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryTitle.trim()) return;
    const id = slugify(newCategoryTitle, "category");
    const normalizedTitle = normalizeCategoryTitle(newCategoryTitle);
    const sameTitleIds = new Set(
      normalizedCustomCategories
        .filter((category) => normalizeCategoryTitle(category.title) === normalizedTitle)
        .map((category) => category.id),
    );
    setDeletedCategories((prev) =>
      prev.filter((deleted) => normalizeCategoryTitle(deleted.title) !== normalizedTitle),
    );
    setCustomCategories((prev) => [
      ...prev.filter((category) => normalizeCategoryTitle(category.title) !== normalizedTitle),
      {
        id,
        title: newCategoryTitle.trim(),
        icon: newCategoryIcon,
        template: newCategoryTemplate,
      },
    ]);
    if (sameTitleIds.size > 0) {
      setCustomEntries((prev) => {
        const next = { ...prev };
        for (const oldId of sameTitleIds) delete next[oldId];
        return next;
      });
    }
    setIsAddingCategory(false);
    setNewCategoryTitle("");
    setNewCategoryIcon("folder");
    setNewCategoryTemplate("checklist");
  }

  async function handleDeleteCategory(category: CustomCategory) {
    const normalizedTitle = normalizeCategoryTitle(category.title);
    const categoriesToDelete = normalizedCustomCategories.filter(
      (c) => c.id === category.id || normalizeCategoryTitle(c.title) === normalizedTitle,
    );
    const idsToDelete = new Set(categoriesToDelete.map((c) => c.id));
    const entries = categoriesToDelete.flatMap((c) => customEntries[c.id] ?? []);
    if (
      !(await confirm({
        message: t("sidebar.deleteCategoryConfirm", { title: category.title, count: entries.length }),
      }))
    )
      return;

    const trashId = `custom-category:${category.id}`;
    setCustomCategories((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
    setCustomEntries((prev) => {
      const next = { ...prev };
      for (const id of idsToDelete) delete next[id];
      return next;
    });
    setDeletedCategories((prev) => [
      ...prev.filter(
        (deleted) =>
          !idsToDelete.has(deleted.id) && normalizeCategoryTitle(deleted.title) !== normalizedTitle,
      ),
      ...categoriesToDelete.map((deleted) => ({
        id: deleted.id,
        title: deleted.title,
        deletedAt: Date.now(),
      })),
    ]);

    addToTrash({
      trashId,
      category: "custom",
      entryType: "section",
      itemId: category.id,
      categoryTitle: category.title,
      wasCustom: true,
      deletedAt: Date.now(),
      title: category.title,
      snapshot: { category, entries },
    });

    showToast(t("sidebar.deletedCategoryToast", { title: category.title }), {
      label: t("common.undo"),
      onClick: () => {
        setCustomCategories((prev) => [...prev, category]);
        setCustomEntries((prev) => ({ ...prev, [category.id]: entries }));
        setDeletedCategories((prev) =>
          prev.filter(
            (deleted) =>
              deleted.id !== category.id && normalizeCategoryTitle(deleted.title) !== normalizedTitle,
          ),
        );
        removeFromTrash(trashId);
      },
    });

    if (decodeURIComponent(location.pathname) === `/custom/${category.id}`) navigate("/");
  }

  return (
    <aside className="flex max-h-[46svh] shrink-0 flex-col overflow-y-auto border-b border-(--color-sidebar-border) bg-(--color-sidebar) px-3 py-3 md:h-svh md:max-h-none md:w-64 md:border-r md:border-b-0 md:overflow-visible md:py-4">
      <NavLink
        to="/"
        className="flex items-center gap-2 rounded-(--radius-md) px-2 py-1.5 text-[15px] font-semibold text-(--color-ink) hover:bg-(--color-sidebar-hover)"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-white shadow-[0_6px_18px_rgba(40,175,165,0.28)]">
          <Sparkles size={15} strokeWidth={2.25} />
        </span>
        Lake Hills OA
      </NavLink>

      <div className="hidden px-2 pb-4 text-[12px] text-(--color-ink-muted) md:block">
        Lake Hills Acupuncture · Internal
      </div>

      <nav className="no-scrollbar flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV_ITEMS.map(({ to, key, category, icon: Icon, dot }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() =>
              trackUsage({
                id: category,
                category,
                path: to,
                title: t(key),
              })
            }
            className={navLinkClass}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{t(key)}</span>
            <span
              className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full group-[.active]:opacity-0 md:block"
              style={{ backgroundColor: dot }}
              aria-hidden
            />
          </NavLink>
        ))}
      </nav>

      <nav className="no-scrollbar mt-2 flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
        {filterDeletedCustomCategories(normalizedCustomCategories, deletedCategories).map((category) => {
          const Icon = ICON_MAP[category.icon];
          if (editingCategoryId === category.id) {
            return (
              <form
                key={category.id}
                onSubmit={(e) => handleRenameSubmit(e, category.id)}
                className="flex items-center gap-1 px-2 py-1"
              >
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className={inlineInputClass}
                />
                <button type="submit" aria-label={t("common.save")} className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-secondary) hover:bg-(--color-sidebar-hover)">
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategoryId(null)}
                  aria-label={t("common.cancel")}
                  className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:bg-(--color-sidebar-hover)"
                >
                  <X size={14} />
                </button>
              </form>
            );
          }
          return (
            <div key={category.id} className="group/cat flex shrink-0 items-center md:shrink">
              <NavLink
                to={`/custom/${category.id}`}
                onClick={() =>
                  trackUsage({
                    id: category.id,
                    category: "custom",
                    categoryTitle: category.title,
                    path: `/custom/${category.id}`,
                    title: category.title,
                  })
                }
                className={(props) => navLinkClass(props, "min-w-0 flex-1")}
              >
                <Icon size={16} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{category.title}</span>
                <span
                  className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full group-[.active]:opacity-0 md:block"
                  style={{ backgroundColor: "var(--color-primary)" }}
                  aria-hidden
                />
              </NavLink>
              <button
                onClick={() => startRename(category)}
                aria-label={t("common.edit")}
                className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-100 transition-opacity hover:text-(--color-secondary) md:opacity-0 md:group-hover/cat:opacity-100"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleDeleteCategory(category)}
                aria-label={t("common.delete")}
                className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-100 transition-opacity hover:text-red-500 md:opacity-0 md:group-hover/cat:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        {isAddingCategory ? (
          <form
            onSubmit={handleAddCategory}
            className="fade-in-up flex flex-col gap-1.5 rounded-(--radius-md) border border-(--color-hairline) p-2"
          >
            <input
              autoFocus
              value={newCategoryTitle}
              onChange={(e) => setNewCategoryTitle(e.target.value)}
              placeholder={t("sidebar.categoryNamePlaceholder")}
              className={inlineInputClass}
            />
            <div className="grid grid-cols-3 gap-1">
              {TEMPLATE_CHOICES.map((template) => {
                const Icon = TEMPLATE_ICON_MAP[template];
                return (
                  <button
                    key={template}
                    type="button"
                    onClick={() => setNewCategoryTemplate(template)}
                    className={[
                      "flex min-h-12 flex-col items-center justify-center gap-1 rounded-(--radius-sm) border px-1.5 py-1 text-[11px] font-medium",
                      newCategoryTemplate === template
                        ? "border-white/20 bg-(--color-sidebar-active) text-white"
                        : "border-(--color-sidebar-border) text-(--color-ink-muted) hover:bg-(--color-sidebar-hover)",
                    ].join(" ")}
                  >
                    <Icon size={14} />
                    <span className="truncate">{t(TEMPLATE_LABEL_KEY[template])}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1">
              {ICON_CHOICES.map((iconKey) => {
                const Icon = ICON_MAP[iconKey];
                return (
                  <button
                    key={iconKey}
                    type="button"
                    onClick={() => setNewCategoryIcon(iconKey)}
                    className={[
                      "rounded-(--radius-sm) p-1.5",
                      newCategoryIcon === iconKey
                        ? "bg-(--color-sidebar-active) text-white"
                        : "text-(--color-ink-faint) hover:bg-(--color-sidebar-hover)",
                    ].join(" ")}
                  >
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsAddingCategory(false);
                  setNewCategoryTitle("");
                  setNewCategoryTemplate("checklist");
                }}
                className="rounded-(--radius-sm) border border-(--color-sidebar-border) px-2 py-1 text-[12px] font-medium text-(--color-ink-secondary) hover:bg-(--color-sidebar-hover)"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="rounded-(--radius-sm) bg-(--color-primary) px-2 py-1 text-[12px] font-medium text-white hover:bg-(--color-primary-active)"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="flex items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] text-(--color-ink-muted) transition-colors hover:bg-(--color-sidebar-hover) hover:text-(--color-secondary)"
          >
            <Plus size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{t("sidebar.addCategory")}</span>
          </button>
        )}
      </nav>

      <nav className="no-scrollbar mt-2 flex gap-0.5 overflow-x-auto border-(--color-sidebar-border) pt-2 md:mt-auto md:flex-col md:overflow-visible md:border-t">
        {UTILITY_NAV_ITEMS.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      {syncEnabled && (
        <div className="mt-2 space-y-1.5 border-t border-(--color-sidebar-border) pt-2 md:mt-2">
          <SyncStatusBadge />
          <ProfileMenu />
        </div>
      )}
    </aside>
  );
}
