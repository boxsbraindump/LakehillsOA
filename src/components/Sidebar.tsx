import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
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
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useUsageStats } from "../hooks/useUsageStats";
import { useTrash } from "../hooks/useTrash";
import { useToast } from "./ToastProvider";
import { useConfirm } from "./ConfirmProvider";
import { slugify } from "../lib/slugify";
import {
  CUSTOM_CATEGORY_DELETIONS_KEY,
  filterDeletedCustomCategories,
  migrateLegacyCustomCategoryTemplates,
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
  },
  {
    to: "/oa-cases",
    key: "sidebar.oaCases",
    category: "oa-cases",
    icon: FileSearch,
  },
  {
    to: "/payments",
    key: "sidebar.payments",
    category: "payments",
    icon: CreditCard,
  },
] as const;

const PERSONAL_NAV_ITEMS = [
  {
    to: "/checklist",
    key: "sidebar.personalChecklist",
    category: "checklist",
    icon: ClipboardCheck,
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
const PERSONAL_TEMPLATE_LABEL_KEY: Record<
  CustomCategoryTemplate,
  "template.checklist" | "template.knowledgeCard" | "template.linkDirectory"
> = {
  checklist: "template.checklist",
  "oa-case": "template.knowledgeCard",
  payments: "template.linkDirectory",
};

function navLinkClass({ isActive }: { isActive: boolean }, extra = "", collapsed = false) {
  return [
    "group flex shrink-0 items-center rounded-(--radius-md) text-[14px] whitespace-nowrap transition-colors",
    // On the rail the row is a centred square, not a full-width bar with a left-hugging
    // icon — otherwise the highlight is far wider than the thing it is highlighting.
    collapsed ? "md:h-10 md:w-10 md:justify-center md:gap-0 md:p-0 gap-2.5 px-2 py-2" : "gap-2.5 px-2 py-2",
    isActive
      ? "active bg-(--color-sidebar-active) font-medium text-white shadow-[0_6px_16px_rgba(40,175,165,0.18)]"
      : "text-(--color-ink-secondary) hover:bg-(--color-sidebar-hover) hover:text-(--color-secondary)",
    extra,
  ].join(" ");
}

const inlineInputClass =
  "w-full rounded-(--radius-xs) border border-(--color-sidebar-border) bg-white/80 px-2 py-1 text-[13px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary) focus:shadow-(--shadow-level-1)";

export default function Sidebar() {
  const { syncEnabled, workspace, renameWorkspace } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { trash, addToTrash, removeFromTrash } = useTrash();
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
  const [isEditingWorkspaceName, setIsEditingWorkspaceName] = useState(false);
  const [workspaceNameValue, setWorkspaceNameValue] = useState("");
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragOverAfter, setDragOverAfter] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  // Kept out of the synced payload: which width one person prefers on one screen isn't
  // something the rest of the team should inherit — same reasoning as the language choice.
  const [isCollapsed, setIsCollapsed] = useLocalStorage("lh-sidebar-collapsed", false);
  /** Set while the pointer is held on a row's icons, so pressing one can't start a drag. */
  const pointerOnControlRef = useRef(false);

  // Backfill templates for folders created before templates were stored, once, in storage —
  // so nothing has to guess a folder's shape from its title at render time.
  useEffect(() => {
    setCustomCategories((prev) => migrateLegacyCustomCategoryTemplates(prev));
  }, [setCustomCategories]);

  const deletedCategoriesForSidebar = useMemo(
    () => [
      ...deletedCategories,
      ...trash
        .filter((entry) => entry.category === "custom" && entry.entryType === "section")
        .map((entry) => ({
          id: entry.itemId,
          title: entry.title,
          deletedAt: entry.deletedAt,
        })),
    ],
    [deletedCategories, trash],
  );
  const isPersonalWorkspace = Boolean(syncEnabled && workspace && !workspace.isPrimary);
  const canRenameWorkspace = Boolean(workspace?.id.startsWith("workspace-"));
  const visibleCustomCategories = useMemo(
    () => filterDeletedCustomCategories(customCategories, deletedCategoriesForSidebar),
    [deletedCategoriesForSidebar, customCategories],
  );
  const filteredCustomCategories = useMemo(() => {
    const q = folderQuery.trim().toLowerCase();
    if (!q) return visibleCustomCategories;
    return visibleCustomCategories.filter((category) => category.title.toLowerCase().includes(q));
  }, [folderQuery, visibleCustomCategories]);

  const templateLabels = isPersonalWorkspace ? PERSONAL_TEMPLATE_LABEL_KEY : TEMPLATE_LABEL_KEY;
  const categoryNamePlaceholder = isPersonalWorkspace
    ? t("sidebar.personalCategoryNamePlaceholder")
    : t("sidebar.categoryNamePlaceholder");

  function startRename(category: CustomCategory) {
    setEditingCategoryId(category.id);
    setRenameValue(category.title);
  }

  function startWorkspaceRename() {
    if (!workspace) return;
    setWorkspaceNameValue(workspace.name);
    setIsEditingWorkspaceName(true);
  }

  async function handleWorkspaceRenameSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    const nextName = workspaceNameValue.trim();
    if (!nextName) return;
    const result = await renameWorkspace(workspace.id, nextName);
    if (!result.ok) {
      showToast(t("workspace.renameError"));
      return;
    }
    setIsEditingWorkspaceName(false);
  }

  function handleRenameSubmit(e: React.FormEvent, categoryId: string) {
    e.preventDefault();
    // A duplicate name already explained itself; a blank one said nothing at all.
    if (!renameValue.trim()) {
      showToast(t("sidebar.categoryNameRequired"));
      return;
    }
    const normalizedTitle = normalizeCategoryTitle(renameValue);
    const hasDuplicateName = visibleCustomCategories
      .filter((category) => category.id !== categoryId)
      .some((category) => normalizeCategoryTitle(category.title) === normalizedTitle);
    if (hasDuplicateName) {
      showToast(t("sidebar.duplicateCategoryName"));
      return;
    }
    // Rename only renames. It must never remove another folder, and never purge a
    // Trash record — a trashed folder keeps its own id, so reusing its name is safe.
    setCustomCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, title: renameValue.trim() } : c)),
    );
    setEditingCategoryId(null);
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryTitle.trim()) {
      showToast(t("sidebar.categoryNameRequired"));
      return;
    }
    const id = slugify(newCategoryTitle, "category");
    const normalizedTitle = normalizeCategoryTitle(newCategoryTitle);
    const hasDuplicateName = visibleCustomCategories.some(
      (category) => normalizeCategoryTitle(category.title) === normalizedTitle,
    );
    if (hasDuplicateName) {
      showToast(t("sidebar.duplicateCategoryName"));
      return;
    }
    // A fresh folder gets a fresh id, so it can never collide with a trashed one.
    // Creating it must not delete anything — least of all a 30-day Trash backup.
    setCustomCategories((prev) => [
      ...prev.filter((category) => category.id !== id),
      {
        id,
        title: newCategoryTitle.trim(),
        icon: newCategoryIcon,
        template: newCategoryTemplate,
      },
    ]);
    setCustomEntries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setIsAddingCategory(false);
    setNewCategoryTitle("");
    setNewCategoryIcon("folder");
    setNewCategoryTemplate("checklist");
  }

  /**
   * `placeAfter` comes from which half of the target row the pointer is over. Without it
   * every drop inserted before the target, so dragging a folder onto the row directly
   * below it put it back exactly where it started — dragging downwards looked broken.
   */
  const moveCategoryRelativeTo = useCallback(
    (draggedId: string, targetId: string, placeAfter: boolean) => {
      if (draggedId === targetId) return;
      setCustomCategories((prev) => {
        const visible = filterDeletedCustomCategories(prev, deletedCategoriesForSidebar);
        const dragged = visible.find((category) => category.id === draggedId);
        if (!dragged || !visible.some((category) => category.id === targetId)) return prev;

        const hidden = prev.filter((category) => !visible.some((item) => item.id === category.id));
        const withoutDragged = visible.filter((category) => category.id !== draggedId);
        const targetIndex = withoutDragged.findIndex((category) => category.id === targetId);
        if (targetIndex < 0) return prev;

        const insertAt = placeAfter ? targetIndex + 1 : targetIndex;
        return [
          ...withoutDragged.slice(0, insertAt),
          dragged,
          ...withoutDragged.slice(insertAt),
          ...hidden,
        ];
      });
    },
    [deletedCategoriesForSidebar, setCustomCategories],
  );

  const moveCategoryToEnd = useCallback((draggedId: string) => {
    setCustomCategories((prev) => {
      const visible = filterDeletedCustomCategories(prev, deletedCategoriesForSidebar);
      const dragged = visible.find((category) => category.id === draggedId);
      if (!dragged) return prev;
      const hidden = prev.filter((category) => !visible.some((item) => item.id === category.id));
      return [...visible.filter((category) => category.id !== draggedId), dragged, ...hidden];
    });
  }, [deletedCategoriesForSidebar, setCustomCategories]);

  function isAfterMidpoint(event: DragEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  }

  function categoryDropProps(category: CustomCategory) {
    return {
      draggable: editingCategoryId !== category.id,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        // The row is the drag source, so a dragstart from the pencil/trash icons is
        // dispatched here, not on the button — their own handlers never ran. Pressing an
        // icon and moving a few pixels used to start a drag and swallow the click.
        if (editingCategoryId === category.id || pointerOnControlRef.current) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", category.id);
        setDraggedCategoryId(category.id);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!draggedCategoryId || draggedCategoryId === category.id) return;
        event.preventDefault();
        setDragOverCategoryId(category.id);
        setDragOverAfter(isAfterMidpoint(event));
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        // Without this the insertion line stayed painted over areas that can't accept a drop.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragOverCategoryId((current) => (current === category.id ? null : current));
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (draggedCategoryId && draggedCategoryId !== category.id) {
          moveCategoryRelativeTo(draggedCategoryId, category.id, isAfterMidpoint(event));
        }
        setDraggedCategoryId(null);
        setDragOverCategoryId(null);
      },
      onDragEnd: () => {
        setDraggedCategoryId(null);
        setDragOverCategoryId(null);
      },
    };
  }

  /**
   * Drawn as an overlay on the row itself. It used to be a spacer element rendered above
   * the row, which pushed the row down under the cursor and, having no drop handlers of
   * its own, silently refused the drop the user was aiming at.
   */
  function categoryDropIndicator(category: CustomCategory) {
    if (!draggedCategoryId || dragOverCategoryId !== category.id || draggedCategoryId === category.id) {
      return null;
    }

    return (
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute right-1 left-1 h-[2px] rounded-full bg-(--color-primary) shadow-[0_0_0_3px_rgba(40,175,165,0.10)]",
          dragOverAfter ? "-bottom-px" : "-top-px",
        ].join(" ")}
      />
    );
  }

  async function handleDeleteCategory(category: CustomCategory) {
    // Delete exactly the folder that was clicked — never every folder that happens
    // to share its name.
    const entries = customEntries[category.id] ?? [];
    if (
      !(await confirm({
        message: t("sidebar.deleteCategoryConfirm", { title: category.title, count: entries.length }),
      }))
    )
      return;

    const trashId = `custom-category:${category.id}`;
    setCustomCategories((prev) => prev.filter((c) => c.id !== category.id));
    setCustomEntries((prev) => {
      const next = { ...prev };
      delete next[category.id];
      return next;
    });
    setDeletedCategories((prev) => [
      ...prev.filter((deleted) => deleted.id !== category.id),
      { id: category.id, title: category.title, deletedAt: Date.now() },
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
        setCustomCategories((prev) => [...prev.filter((item) => item.id !== category.id), category]);
        setCustomEntries((prev) => ({ ...prev, [category.id]: entries }));
        setDeletedCategories((prev) => prev.filter((deleted) => deleted.id !== category.id));
        removeFromTrash(trashId);
      },
    });

    if (decodeURIComponent(location.pathname) === `/custom/${category.id}`) navigate("/");
  }

  return (
    // The nav list below scrolls while the workspace header and the trash/profile footer
    // stay put. The whole sidebar used to be `md:overflow-visible` at a fixed `md:h-svh`,
    // so once there were enough folders the footer simply ran off-screen with no scrollbar
    // and "add folder" and Trash became unreachable.
    <aside
      className={[
        "flex max-h-[46svh] shrink-0 flex-col overflow-y-auto border-b border-(--color-sidebar-border) bg-(--color-sidebar) px-3 py-3 md:h-svh md:max-h-none md:overflow-hidden md:border-r md:border-b-0 md:py-4",
        // Collapsing only applies from md up; the narrow layout is a horizontal bar, where
        // there is no width to reclaim.
        isCollapsed ? "md:w-[68px] md:px-2" : "md:w-64",
      ].join(" ")}
    >
      {isEditingWorkspaceName ? (
        <form onSubmit={handleWorkspaceRenameSubmit} className="flex items-center gap-1 px-2 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-white shadow-[0_6px_18px_rgba(40,175,165,0.28)]">
            <Sparkles size={15} strokeWidth={2.25} />
          </span>
          <input
            autoFocus
            value={workspaceNameValue}
            onChange={(e) => setWorkspaceNameValue(e.target.value)}
            className={inlineInputClass}
          />
          <button
            type="submit"
            aria-label={t("common.save")}
            className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-secondary) hover:bg-(--color-sidebar-hover)"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsEditingWorkspaceName(false)}
            aria-label={t("common.cancel")}
            className="shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) hover:bg-(--color-sidebar-hover)"
          >
            <X size={14} />
          </button>
        </form>
      ) : (
        <div className="group/workspace flex items-center rounded-(--radius-md) hover:bg-(--color-sidebar-hover)">
          <NavLink
            to="/"
            title={workspace?.name ?? "Lake Hills OA"}
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-[15px] font-semibold text-(--color-ink)"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-white shadow-[0_6px_18px_rgba(40,175,165,0.28)]">
              <Sparkles size={15} strokeWidth={2.25} />
            </span>
            <span className={["truncate", isCollapsed ? "md:hidden" : ""].join(" ")}>
              {workspace?.name ?? "Lake Hills OA"}
            </span>
          </NavLink>
          {canRenameWorkspace && !isCollapsed && (
            <button
              type="button"
              onClick={startWorkspaceRename}
              aria-label={t("workspace.rename")}
              className="mr-1 shrink-0 rounded-(--radius-sm) p-1 text-(--color-ink-faint) opacity-100 transition hover:text-(--color-secondary) md:opacity-0 md:group-hover/workspace:opacity-100"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      )}

      {!isCollapsed && (
        <div className="hidden px-2 pb-4 text-[12px] text-(--color-ink-muted) md:block">
          {isPersonalWorkspace ? t("workspace.personalSubtitle") : "Lake Hills Acupuncture · Internal"}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsCollapsed((open) => !open)}
        aria-label={t(isCollapsed ? "sidebar.expand" : "sidebar.collapse")}
        title={t(isCollapsed ? "sidebar.expand" : "sidebar.collapse")}
        className={[
          "mb-2 hidden items-center rounded-(--radius-md) text-(--color-ink-faint) transition-colors hover:bg-(--color-sidebar-hover) hover:text-(--color-secondary) md:flex",
          isCollapsed ? "h-10 w-10 justify-center self-center" : "gap-2 self-start p-1.5",
        ].join(" ")}
      >
        {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>

      {/* Stands in for the group headings, which are hidden on the rail — without it the
          fixed sections and the folders run together as one undifferentiated column. */}
      {isCollapsed && <div className="mb-1 hidden h-px bg-(--color-sidebar-border) md:block" />}

      {!isCollapsed && (
        <p className="hidden px-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-(--color-ink-faint) uppercase md:block">
          {t("sidebar.groupDaily")}
        </p>
      )}
      <nav
        className={[
          "no-scrollbar flex shrink-0 gap-0.5 overflow-x-auto md:flex-col md:overflow-visible",
          isCollapsed ? "md:items-center" : "",
        ].join(" ")}
      >
        {(isPersonalWorkspace ? PERSONAL_NAV_ITEMS : NAV_ITEMS).map(({ to, key, category, icon: Icon }) => (
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
            title={t(key)}
            className={(props) => navLinkClass(props, "", isCollapsed)}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className={["truncate", isCollapsed ? "md:hidden" : ""].join(" ")}>{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      {!isCollapsed && (
        <p className="mt-4 hidden px-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-(--color-ink-faint) uppercase md:block">
          {t("sidebar.groupFolders")}
        </p>
      )}

      {/* Only worth the space once scanning the list by eye stops being quick. */}
      {!isCollapsed && visibleCustomCategories.length >= 8 && (
        <div className="relative mb-1 hidden md:block">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-(--color-ink-faint)"
          />
          <input
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
            placeholder={t("sidebar.filterFolders")}
            aria-label={t("sidebar.filterFolders")}
            className="w-full rounded-(--radius-sm) border border-(--color-sidebar-border) bg-(--color-canvas) py-1 pr-2 pl-7 text-[12px] text-(--color-ink) outline-none placeholder:text-(--color-ink-faint) focus:border-(--color-primary)/40"
          />
        </div>
      )}
      {isCollapsed && <div className="my-1 hidden h-px bg-(--color-sidebar-border) md:block" />}
      {/* The only region allowed to grow: it takes the leftover height and scrolls, which
          is what keeps the trash/profile footer on screen no matter how many folders exist. */}
      <nav
        className={[
          "no-scrollbar mt-2 flex gap-0.5 overflow-x-auto md:mt-0 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto",
          isCollapsed ? "md:items-center" : "",
        ].join(" ")}
      >
        {filteredCustomCategories.map((category) => {
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
          const isCategoryActive = decodeURIComponent(location.pathname) === `/custom/${category.id}`;
          return (
            <Fragment key={category.id}>
              <div
                {...categoryDropProps(category)}
                className={[
                  "group/cat relative flex shrink-0 cursor-grab items-center rounded-(--radius-md) transition-[background-color,color,box-shadow,opacity] active:cursor-grabbing md:shrink",
                  isCollapsed ? "md:h-10 md:w-10 md:justify-center" : "",
                  draggedCategoryId === category.id ? "opacity-60" : "",
                  isCategoryActive
                    ? "bg-(--color-sidebar-active) font-medium text-white shadow-[0_6px_16px_rgba(40,175,165,0.18)]"
                    : "text-(--color-ink-secondary) hover:bg-(--color-sidebar-hover) hover:text-(--color-secondary)",
                ].join(" ")}
              >
              {categoryDropIndicator(category)}
              <NavLink
                to={`/custom/${category.id}`}
                draggable={false}
                onClick={() =>
                  trackUsage({
                    id: category.id,
                    category: "custom",
                    categoryTitle: category.title,
                    path: `/custom/${category.id}`,
                    title: category.title,
                  })
                }
                title={category.title}
                className={[
                  "flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-[14px] whitespace-nowrap text-inherit",
                  isCollapsed ? "md:h-10 md:w-10 md:flex-none md:justify-center md:gap-0 md:p-0" : "",
                ].join(" ")}
              >
                {isCollapsed && category.icon === "folder" ? (
                  <>
                    {/* Most folders keep the default icon, so a rail of them was six
                        identical shapes with no way to tell which was which. Fall back to
                        the first character of the name; a chosen icon still wins. The rail
                        only exists from md up, so the narrow layout keeps the icon. */}
                    <span className="hidden text-[13px] font-semibold md:inline">
                      {[...category.title.trim()][0] ?? "?"}
                    </span>
                    <Icon size={16} strokeWidth={2} className="shrink-0 md:hidden" />
                  </>
                ) : (
                  <Icon size={16} strokeWidth={2} className="shrink-0" />
                )}
                <span className={["truncate", isCollapsed ? "md:hidden" : ""].join(" ")}>
                  {category.title}
                </span>
              </NavLink>
              <div
                className={[
                  "flex shrink-0 items-center gap-0.5 pr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/cat:opacity-100",
                  // No room for hover actions on the icon rail; expand to rename or delete.
                  isCollapsed ? "md:hidden" : "",
                ].join(" ")}
                onPointerDown={() => {
                  pointerOnControlRef.current = true;
                }}
                onPointerUp={() => {
                  pointerOnControlRef.current = false;
                }}
                onPointerLeave={() => {
                  pointerOnControlRef.current = false;
                }}
              >
                <button
                  type="button"
                  draggable={false}
                  onClick={() => startRename(category)}
                  aria-label={t("common.edit")}
                  className={[
                    "shrink-0 rounded-(--radius-sm) p-1",
                    isCategoryActive
                      ? "text-white/75 hover:text-white"
                      : "text-(--color-ink-faint) hover:text-(--color-secondary)",
                  ].join(" ")}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  draggable={false}
                  onClick={() => handleDeleteCategory(category)}
                  aria-label={t("common.delete")}
                  className={[
                    "shrink-0 rounded-(--radius-sm) p-1",
                    isCategoryActive
                      ? "text-white/75 hover:text-white"
                      : "text-(--color-ink-faint) hover:text-red-500",
                  ].join(" ")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              </div>
            </Fragment>
          );
        })}

        {draggedCategoryId && (
          <div
            className="relative h-3"
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverCategoryId("__end__");
            }}
            onDrop={(event) => {
              event.preventDefault();
              moveCategoryToEnd(draggedCategoryId);
              setDraggedCategoryId(null);
              setDragOverCategoryId(null);
            }}
          >
            {dragOverCategoryId === "__end__" && (
              <span className="absolute top-1/2 right-1 left-1 h-[2px] -translate-y-1/2 rounded-full bg-(--color-primary) shadow-[0_0_0_3px_rgba(40,175,165,0.10)]" />
            )}
          </div>
        )}

        {isAddingCategory ? (
          <form
            onSubmit={handleAddCategory}
            className="fade-in-up flex flex-col gap-1.5 rounded-(--radius-md) border border-(--color-hairline) p-2"
          >
            <input
              autoFocus
              value={newCategoryTitle}
              onChange={(e) => setNewCategoryTitle(e.target.value)}
              placeholder={categoryNamePlaceholder}
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
                    <span className="truncate">{t(templateLabels[template])}</span>
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
        ) : folderQuery.trim() && filteredCustomCategories.length === 0 ? (
          <p className="px-2 py-2 text-[12px] text-(--color-ink-faint)">
            {t("sidebar.noFolderMatches")}
          </p>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            title={t("sidebar.addCategory")}
            className={[
              "flex items-center rounded-(--radius-md) text-[14px] text-(--color-ink-muted) transition-colors hover:bg-(--color-sidebar-hover) hover:text-(--color-secondary)",
              isCollapsed
                ? "gap-2.5 px-2 py-2 md:h-10 md:w-10 md:justify-center md:gap-0 md:p-0"
                : "gap-2.5 px-2 py-2",
            ].join(" ")}
          >
            <Plus size={16} strokeWidth={2} className="shrink-0" />
            <span className={["truncate", isCollapsed ? "md:hidden" : ""].join(" ")}>
              {t("sidebar.addCategory")}
            </span>
          </button>
        )}
      </nav>

      <nav
        className={[
          "no-scrollbar mt-2 flex shrink-0 gap-0.5 overflow-x-auto border-(--color-sidebar-border) pt-2 md:mt-2 md:flex-col md:overflow-visible md:border-t",
          isCollapsed ? "md:items-center" : "",
        ].join(" ")}
      >
        {UTILITY_NAV_ITEMS.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={t(key)}
            className={(props) => navLinkClass(props, "", isCollapsed)}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className={["truncate", isCollapsed ? "md:hidden" : ""].join(" ")}>{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      {syncEnabled && (
        <div className="mt-2 shrink-0 space-y-1.5 border-t border-(--color-sidebar-border) pt-2 md:mt-2">
          <SyncStatusBadge />
          <ProfileMenu />
        </div>
      )}
    </aside>
  );
}
