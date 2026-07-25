import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
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

interface CategoryDragState {
  id: string;
  pointerId: number;
  startY: number;
  currentY: number;
  offsetY: number;
  hasMoved: boolean;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

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
  const [categoryDrag, setCategoryDrag] = useState<CategoryDragState | null>(null);
  const [categoryDropTargetId, setCategoryDropTargetId] = useState<string | null>(null);
  const categoryRefs = useRef(new Map<string, HTMLDivElement>());
  const dragClickBlocked = useRef(false);

  const normalizedCustomCategories = normalizeCustomCategoryTemplates(customCategories);
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
    () => filterDeletedCustomCategories(normalizedCustomCategories, deletedCategoriesForSidebar),
    [deletedCategoriesForSidebar, normalizedCustomCategories],
  );
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
    if (!renameValue.trim()) return;
    const normalizedTitle = normalizeCategoryTitle(renameValue);
    const hasDuplicateName = [
      ...visibleCustomCategories
        .filter((category) => category.id !== categoryId)
        .map((category) => category.title),
      ...deletedCategoriesForSidebar
        .filter((category) => category.id !== categoryId)
        .map((category) => category.title),
    ].some((title) => normalizeCategoryTitle(title) === normalizedTitle);
    if (hasDuplicateName) {
      showToast(t("sidebar.duplicateCategoryName"));
      return;
    }
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
    const hasDuplicateName = [
      ...visibleCustomCategories.map((category) => category.title),
      ...deletedCategoriesForSidebar.map((category) => category.title),
    ].some((title) => normalizeCategoryTitle(title) === normalizedTitle);
    if (hasDuplicateName) {
      showToast(t("sidebar.duplicateCategoryName"));
      return;
    }
    setCustomCategories((prev) => [
      ...prev,
      {
        id,
        title: newCategoryTitle.trim(),
        icon: newCategoryIcon,
        template: newCategoryTemplate,
      },
    ]);
    setDeletedCategories((prev) => prev.filter((deleted) => deleted.id !== id));
    setIsAddingCategory(false);
    setNewCategoryTitle("");
    setNewCategoryIcon("folder");
    setNewCategoryTemplate("checklist");
  }

  const moveCategoryBefore = useCallback((draggedId: string, beforeId: string) => {
    if (draggedId === beforeId) return;
    setCustomCategories((prev) => {
      const visible = filterDeletedCustomCategories(prev, deletedCategoriesForSidebar);
      const dragged = visible.find((category) => category.id === draggedId);
      if (!dragged || !visible.some((category) => category.id === beforeId)) return prev;

      const hidden = prev.filter((category) => !visible.some((item) => item.id === category.id));
      const withoutDragged = visible.filter((category) => category.id !== draggedId);
      const targetIndex = withoutDragged.findIndex((category) => category.id === beforeId);
      if (targetIndex < 0) return prev;

      return [
        ...withoutDragged.slice(0, targetIndex),
        dragged,
        ...withoutDragged.slice(targetIndex),
        ...hidden,
      ];
    });
  }, [deletedCategoriesForSidebar, setCustomCategories]);

  const moveCategoryToEnd = useCallback((draggedId: string) => {
    setCustomCategories((prev) => {
      const visible = filterDeletedCustomCategories(prev, deletedCategoriesForSidebar);
      const dragged = visible.find((category) => category.id === draggedId);
      if (!dragged) return prev;
      const hidden = prev.filter((category) => !visible.some((item) => item.id === category.id));
      return [...visible.filter((category) => category.id !== draggedId), dragged, ...hidden];
    });
  }, [deletedCategoriesForSidebar, setCustomCategories]);

  function categoryDropPreview(category: CustomCategory) {
    if (
      !categoryDrag?.hasMoved ||
      categoryDropTargetId !== category.id ||
      categoryDrag.id === category.id
    ) {
      return null;
    }

    return (
      <div className="relative h-2">
        <span className="absolute top-1/2 right-1 left-1 h-[2px] -translate-y-1/2 rounded-full bg-(--color-primary) shadow-[0_0_0_3px_rgba(40,175,165,0.10)]" />
      </div>
    );
  }

  const calculateCategoryDropTarget = useCallback((pointerY: number, draggingId: string) => {
    const visibleIds = visibleCustomCategories.map((category) => category.id);
    for (const id of visibleIds) {
      if (id === draggingId) continue;
      const node = categoryRefs.current.get(id);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) return id;
    }
    return "__end__";
  }, [visibleCustomCategories]);

  function startCategoryPointerDrag(event: PointerEvent<HTMLDivElement>, category: CustomCategory) {
    if (event.button !== 0 || editingCategoryId === category.id) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea,select")) return;

    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCategoryDrag({
      id: category.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      currentY: event.clientY,
      offsetY: event.clientY - rect.top,
      hasMoved: false,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
    setCategoryDropTargetId(null);
  }

  useEffect(() => {
    if (!categoryDrag) return;
    const activeDrag = categoryDrag;

    function handlePointerMove(event: globalThis.PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) return;
      const distance = Math.abs(event.clientY - activeDrag.startY);
      const hasMoved = distance > 4;
      if (hasMoved) dragClickBlocked.current = true;
      setCategoryDrag((current) =>
        current ? { ...current, currentY: event.clientY, hasMoved: current.hasMoved || hasMoved } : current,
      );
      if (hasMoved) setCategoryDropTargetId(calculateCategoryDropTarget(event.clientY, activeDrag.id));
    }

    function handlePointerUp(event: globalThis.PointerEvent) {
      if (event.pointerId !== activeDrag.pointerId) return;
      if (activeDrag.hasMoved || Math.abs(event.clientY - activeDrag.startY) > 4) {
        const targetId = calculateCategoryDropTarget(event.clientY, activeDrag.id);
        if (targetId === "__end__") {
          moveCategoryToEnd(activeDrag.id);
        } else if (targetId && targetId !== activeDrag.id) {
          moveCategoryBefore(activeDrag.id, targetId);
        }
      }
      setCategoryDrag(null);
      setCategoryDropTargetId(null);
      window.setTimeout(() => {
        dragClickBlocked.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [calculateCategoryDropTarget, categoryDrag, moveCategoryBefore, moveCategoryToEnd]);

  async function handleDeleteCategory(category: CustomCategory) {
    const normalizedTitle = normalizeCategoryTitle(category.title);
    const matchingCategories = normalizedCustomCategories.filter(
      (c) => c.id === category.id || normalizeCategoryTitle(c.title) === normalizedTitle,
    );
    const categoriesToDelete = matchingCategories.length > 0 ? matchingCategories : [category];
    const idsToDelete = new Set(categoriesToDelete.map((c) => c.id));
    const entries = categoriesToDelete.flatMap((c) => customEntries[c.id] ?? []);
    if (
      !(await confirm({
        message: t("sidebar.deleteCategoryConfirm", { title: category.title, count: entries.length }),
      }))
    )
      return;

    const trashId = `custom-category:${category.id}`;
    setCustomCategories((prev) =>
      prev.filter(
        (c) => !idsToDelete.has(c.id) && normalizeCategoryTitle(c.title) !== normalizedTitle,
      ),
    );
    setCustomEntries((prev) => {
      const next = { ...prev };
      for (const id of idsToDelete) delete next[id];
      for (const c of Object.values(customCategories)) {
        if (normalizeCategoryTitle(c.title) === normalizedTitle) delete next[c.id];
      }
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
        setCustomCategories((prev) => [
          ...prev.filter(
            (item) =>
              item.id !== category.id &&
              normalizeCategoryTitle(item.title) !== normalizeCategoryTitle(category.title),
          ),
          category,
        ]);
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

  const draggedCategory = categoryDrag
    ? visibleCustomCategories.find((category) => category.id === categoryDrag.id)
    : null;

  return (
    <aside className="flex max-h-[46svh] shrink-0 flex-col overflow-y-auto border-b border-(--color-sidebar-border) bg-(--color-sidebar) px-3 py-3 md:h-svh md:max-h-none md:w-64 md:border-r md:border-b-0 md:overflow-visible md:py-4">
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
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-[15px] font-semibold text-(--color-ink)"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-white shadow-[0_6px_18px_rgba(40,175,165,0.28)]">
              <Sparkles size={15} strokeWidth={2.25} />
            </span>
            <span className="truncate">{workspace?.name ?? "Lake Hills OA"}</span>
          </NavLink>
          {canRenameWorkspace && (
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

      <div className="hidden px-2 pb-4 text-[12px] text-(--color-ink-muted) md:block">
        {isPersonalWorkspace ? t("workspace.personalSubtitle") : "Lake Hills Acupuncture · Internal"}
      </div>

      <nav className="no-scrollbar flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
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
            className={navLinkClass}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      <nav className="no-scrollbar mt-2 flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible">
        {visibleCustomCategories.map((category) => {
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
              {categoryDropPreview(category)}
              <div
                ref={(node) => {
                  if (node) categoryRefs.current.set(category.id, node);
                  else categoryRefs.current.delete(category.id);
                }}
                className={[
                  "group/cat flex shrink-0 cursor-grab touch-none select-none items-center rounded-(--radius-md) transition-[background-color,color,box-shadow,opacity] active:cursor-grabbing md:shrink",
                  categoryDrag?.hasMoved && categoryDrag.id === category.id ? "opacity-0" : "",
                  isCategoryActive
                    ? "bg-(--color-sidebar-active) font-medium text-white shadow-[0_6px_16px_rgba(40,175,165,0.18)]"
                    : "text-(--color-ink-secondary) hover:bg-(--color-sidebar-hover) hover:text-(--color-secondary)",
                ].join(" ")}
                onPointerDown={(event) => startCategoryPointerDrag(event, category)}
                onClickCapture={(event) => {
                  if (!dragClickBlocked.current) return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
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
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-[14px] whitespace-nowrap text-inherit"
              >
                <Icon size={16} strokeWidth={2} className="shrink-0" />
                <span className="truncate">{category.title}</span>
              </NavLink>
              <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/cat:opacity-100">
                <button
                  type="button"
                  onDragStart={(event) => event.preventDefault()}
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
                  onDragStart={(event) => event.preventDefault()}
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

        {categoryDrag?.hasMoved && (
          <div
            className="relative h-3"
          >
            {categoryDropTargetId === "__end__" && (
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

      {categoryDrag?.hasMoved && draggedCategory && (() => {
        const Icon = ICON_MAP[draggedCategory.icon];
        const isDraggedActive =
          decodeURIComponent(location.pathname) === `/custom/${draggedCategory.id}`;
        return (
          <div
            className={[
              "pointer-events-none fixed z-50 flex items-center gap-2.5 rounded-(--radius-md) px-2 py-2 text-[14px] whitespace-nowrap shadow-(--shadow-level-2) ring-1 ring-(--color-primary)/20",
              isDraggedActive
                ? "bg-(--color-sidebar-active) font-medium text-white"
                : "bg-white text-(--color-ink-secondary)",
            ].join(" ")}
            style={{
              left: categoryDrag.rect.left,
              top: categoryDrag.currentY - categoryDrag.offsetY,
              width: categoryDrag.rect.width,
              minHeight: categoryDrag.rect.height,
              transform: "scale(1.02)",
            }}
          >
            <Icon size={16} strokeWidth={2} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{draggedCategory.title}</span>
          </div>
        );
      })()}

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
