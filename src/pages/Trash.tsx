import { Trash2, RotateCcw } from "lucide-react";
import { useTrash } from "../hooks/useTrash";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useToast } from "../components/ToastProvider";
import { useLanguage } from "../components/LanguageProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { daysRemaining, TRASH_RETENTION_DAYS } from "../lib/trash";
import { categoryLabel, CATEGORY_DOT } from "../lib/searchIndex";
import {
  CUSTOM_CATEGORY_DELETIONS_KEY,
  normalizeCategoryTitle,
} from "../lib/customCategories";
import type {
  TrashEntry,
  OACase,
  PaymentEntry,
  ChecklistItem,
  ChecklistSectionMeta,
  CustomCategory,
  CustomEntry,
  DeletedCustomCategory,
} from "../lib/types";

export default function Trash() {
  const { trash, removeFromTrash } = useTrash();
  const { showToast } = useToast();
  const { t, lang } = useLanguage();
  const { confirm } = useConfirm();

  const [, setChecklistHidden] = useSyncedStorage<string[]>("lh-checklist-hidden-items", []);
  const [, setChecklistCustom] = useSyncedStorage<Record<string, ChecklistItem[]>>(
    "lh-checklist-custom-items",
    {},
  );
  const [, setChecklistHiddenSections] = useSyncedStorage<string[]>(
    "lh-checklist-hidden-sections",
    [],
  );
  const [, setChecklistCustomSections] = useSyncedStorage<ChecklistSectionMeta[]>(
    "lh-checklist-custom-sections",
    [],
  );
  const [, setOACasesHidden] = useSyncedStorage<string[]>("lh-oacases-hidden", []);
  const [, setOACasesCustom] = useSyncedStorage<OACase[]>("lh-oacases-custom", []);
  const [, setPaymentsHidden] = useSyncedStorage<string[]>("lh-payments-hidden", []);
  const [, setPaymentsCustom] = useSyncedStorage<PaymentEntry[]>("lh-payments-custom", []);
  const [, setCustomCategories] = useSyncedStorage<CustomCategory[]>("lh-custom-categories", []);
  const [, setCustomEntries] = useSyncedStorage<Record<string, CustomEntry[]>>(
    "lh-custom-entries",
    {},
  );
  const [, setDeletedCategories] = useSyncedStorage<DeletedCustomCategory[]>(
    CUSTOM_CATEGORY_DELETIONS_KEY,
    [],
  );

  function handleRestore(entry: TrashEntry) {
    if (entry.category === "checklist" && entry.entryType === "section") {
      if (entry.wasCustom) {
        setChecklistCustomSections((prev) => [...prev, { id: entry.itemId, title: entry.title }]);
      } else {
        setChecklistHiddenSections((prev) => prev.filter((id) => id !== entry.itemId));
      }
    } else if (entry.category === "checklist") {
      const sectionId = entry.sectionId;
      if (!sectionId) return;
      if (entry.wasCustom) {
        setChecklistCustom((prev) => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? []), entry.snapshot as ChecklistItem],
        }));
      } else {
        setChecklistHidden((prev) => prev.filter((id) => id !== entry.itemId));
      }
    } else if (entry.category === "oa-cases") {
      if (entry.wasCustom) {
        setOACasesCustom((prev) => [...prev, entry.snapshot as OACase]);
      } else {
        setOACasesHidden((prev) => prev.filter((id) => id !== entry.itemId));
      }
    } else if (entry.category === "payments") {
      if (entry.wasCustom) {
        setPaymentsCustom((prev) => [...prev, entry.snapshot as PaymentEntry]);
      } else {
        setPaymentsHidden((prev) => prev.filter((id) => id !== entry.itemId));
      }
    } else if (entry.category === "custom" && entry.entryType === "section") {
      const { category, entries } = entry.snapshot as { category: CustomCategory; entries: CustomEntry[] };
      setCustomCategories((prev) => [...prev, category]);
      setCustomEntries((prev) => ({ ...prev, [category.id]: entries }));
      setDeletedCategories((prev) =>
        prev.filter(
          (deleted) =>
            deleted.id !== category.id &&
            normalizeCategoryTitle(deleted.title) !== normalizeCategoryTitle(category.title),
        ),
      );
    } else if (entry.category === "custom") {
      const categoryId = entry.sectionId;
      if (!categoryId) return;
      setCustomEntries((prev) => ({
        ...prev,
        [categoryId]: [...(prev[categoryId] ?? []), entry.snapshot as CustomEntry],
      }));
    }
    removeFromTrash(entry.trashId);
    showToast(t("trash.restoredToast", { title: entry.title }));
  }

  async function handlePurgeNow(entry: TrashEntry) {
    if (
      !(await confirm({
        title: t("trash.purgeNowAria"),
        message: t("trash.purgeConfirm", { title: entry.title }),
        confirmLabel: t("trash.purgeNowAria"),
      }))
    )
      return;
    removeFromTrash(entry.trashId);
  }

  const sorted = [...trash].sort((a, b) => b.deletedAt - a.deletedAt);

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          {t("trash.title")}
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">
          {t("trash.subtitle", { days: TRASH_RETENTION_DAYS })}
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-(--color-ink-faint)">{t("trash.empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((entry) => (
            <div
              key={entry.trashId}
              className="flex items-center gap-3 rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-4 shadow-(--shadow-level-1)"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_DOT[entry.category] }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-(--color-ink)">
                  {entry.title}
                </p>
                <p className="text-[12px] text-(--color-ink-faint)">
                  {entry.category === "custom"
                    ? (entry.categoryTitle ?? categoryLabel(entry.category, lang))
                    : categoryLabel(entry.category, lang)}
                  {entry.entryType === "section" ? ` ${t("trash.wholeSection")}` : ""} ·{" "}
                  {t("trash.daysLeft", { days: daysRemaining(entry) })}
                </p>
              </div>
              <button
                onClick={() => handleRestore(entry)}
                className="flex shrink-0 items-center gap-1 rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
              >
                <RotateCcw size={13} />
                {t("trash.restore")}
              </button>
              <button
                onClick={() => handlePurgeNow(entry)}
                aria-label={t("trash.purgeNowAria")}
                className="shrink-0 rounded-(--radius-sm) p-1.5 text-(--color-ink-faint) hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
