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
import { useTrash } from "../hooks/useTrash";
import { useToast } from "./ToastProvider";
import { slugify } from "../lib/slugify";
import ProfileMenu from "./ProfileMenu";
import type { CustomCategory, CustomCategoryIcon, CustomEntry } from "../lib/types";

const NAV_ITEMS = [
  { to: "/checklist", key: "sidebar.checklist", icon: ClipboardCheck, dot: "var(--color-accent-teal)" },
  { to: "/oa-cases", key: "sidebar.oaCases", icon: FileSearch, dot: "var(--color-accent-orange)" },
  { to: "/payments", key: "sidebar.payments", icon: CreditCard, dot: "var(--color-accent-purple)" },
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

function navLinkClass({ isActive }: { isActive: boolean }, extra = "") {
  return [
    "group flex shrink-0 items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] whitespace-nowrap transition-colors",
    isActive
      ? "bg-(--color-primary)/8 font-medium text-(--color-primary)"
      : "text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)",
    extra,
  ].join(" ");
}

const inlineInputClass =
  "w-full rounded-(--radius-xs) border border-(--color-hairline) bg-(--color-canvas-soft) px-2 py-1 text-[13px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:shadow-(--shadow-level-1)";

export default function Sidebar() {
  const { syncEnabled } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToTrash, removeFromTrash } = useTrash();
  const { showToast } = useToast();

  const [customCategories, setCustomCategories] = useSyncedStorage<CustomCategory[]>(
    "lh-custom-categories",
    [],
  );
  const [customEntries, setCustomEntries] = useSyncedStorage<Record<string, CustomEntry[]>>(
    "lh-custom-entries",
    {},
  );

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState<CustomCategoryIcon>("folder");

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
    setCustomCategories((prev) => [...prev, { id, title: newCategoryTitle.trim(), icon: newCategoryIcon }]);
    setIsAddingCategory(false);
    setNewCategoryTitle("");
    setNewCategoryIcon("folder");
  }

  function handleDeleteCategory(category: CustomCategory) {
    const entries = customEntries[category.id] ?? [];
    if (!window.confirm(t("sidebar.deleteCategoryConfirm", { title: category.title, count: entries.length })))
      return;

    const trashId = `custom-category:${category.id}`;
    setCustomCategories((prev) => prev.filter((c) => c.id !== category.id));
    setCustomEntries((prev) => {
      const next = { ...prev };
      delete next[category.id];
      return next;
    });

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
        removeFromTrash(trashId);
      },
    });

    if (decodeURIComponent(location.pathname) === `/custom/${category.id}`) navigate("/");
  }

  return (
    <aside className="flex shrink-0 flex-col border-b border-(--color-hairline) bg-(--color-canvas) px-3 py-3 md:h-svh md:w-64 md:border-r md:border-b-0 md:py-4">
      <NavLink
        to="/"
        className="flex items-center gap-2 rounded-(--radius-md) px-2 py-1.5 text-[15px] font-semibold text-(--color-ink) hover:bg-(--color-canvas-soft)"
      >
        <Sparkles size={18} className="text-(--color-primary)" strokeWidth={2.25} />
        Lake Hills OA
      </NavLink>

      <div className="hidden px-2 pb-4 text-[12px] text-(--color-ink-faint) md:block">
        Lake Hills Acupuncture · Internal
      </div>

      <nav className="flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV_ITEMS.map(({ to, key, icon: Icon, dot }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{t(key)}</span>
            <span
              className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full md:block"
              style={{ backgroundColor: dot }}
              aria-hidden
            />
          </NavLink>
        ))}
      </nav>

      <nav className="mt-2 flex flex-col gap-0.5">
        {customCategories.map((category) => {
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
                <button type="submit" aria-label={t("common.save")} className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-primary) hover:bg-(--color-canvas-soft)">
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCategoryId(null)}
                  aria-label={t("common.cancel")}
                  className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:bg-(--color-canvas-soft)"
                >
                  <X size={14} />
                </button>
              </form>
            );
          }
          return (
            <div key={category.id} className="group/cat flex items-center">
              <NavLink
                to={`/custom/${category.id}`}
                className={(props) => navLinkClass(props, "min-w-0 flex-1")}
              >
                <Icon size={16} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{category.title}</span>
                <span
                  className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full md:block"
                  style={{ backgroundColor: "var(--color-accent-green)" }}
                  aria-hidden
                />
              </NavLink>
              <button
                onClick={() => startRename(category)}
                aria-label={t("common.edit")}
                className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover/cat:opacity-100 hover:text-(--color-primary)"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleDeleteCategory(category)}
                aria-label={t("common.delete")}
                className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-0 transition-opacity group-hover/cat:opacity-100 hover:text-red-500"
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
                        ? "bg-(--color-primary)/10 text-(--color-primary)"
                        : "text-(--color-ink-faint) hover:bg-(--color-canvas-soft)",
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
                }}
                className="rounded-(--radius-sm) border border-(--color-hairline) px-2 py-1 text-[12px] font-medium text-(--color-ink-secondary) hover:bg-(--color-canvas-soft)"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="rounded-(--radius-sm) bg-(--color-primary) px-2 py-1 text-[12px] font-medium text-(--color-on-primary) hover:bg-(--color-primary-active)"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="flex items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] text-(--color-ink-faint) transition-colors hover:bg-(--color-canvas-soft) hover:text-(--color-primary)"
          >
            <Plus size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{t("sidebar.addCategory")}</span>
          </button>
        )}
      </nav>

      <nav className="mt-auto flex gap-0.5 overflow-x-auto border-(--color-hairline) pt-2 md:flex-col md:overflow-visible md:border-t">
        {UTILITY_NAV_ITEMS.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      {syncEnabled && (
        <div className="mt-2 border-t border-(--color-hairline) pt-2 md:mt-2">
          <ProfileMenu />
        </div>
      )}
    </aside>
  );
}
