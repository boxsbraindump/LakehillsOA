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
} from "../lib/customCategories";
import type {
  TrashEntry,
  OACase,
  PaymentEntry,
  ChecklistItem,
  ChecklistSection,
  ChecklistSectionMeta,
  ClearedChecklistDay,
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
  const [checklistCustomSections, setChecklistCustomSections] = useSyncedStorage<ChecklistSectionMeta[]>(
    "lh-checklist-custom-sections",
    [],
  );
  const [, setChecklistDayItemIds] = useSyncedStorage<Record<string, string[]>>(
    "lh-checklist-day-item-ids",
    {},
  );
  const [, setChecklistDaySectionIds] = useSyncedStorage<Record<string, string[]>>(
    "lh-checklist-day-section-ids",
    {},
  );
  const [, setChecklistState] = useSyncedStorage<
    Record<string, Record<string, { checked: boolean; note: string }>>
  >("lh-checklist-state", {});
  const [, setOACasesHidden] = useSyncedStorage<string[]>("lh-oacases-hidden", []);
  const [, setOACasesCustom] = useSyncedStorage<OACase[]>("lh-oacases-custom", []);
  const [, setPaymentsHidden] = useSyncedStorage<string[]>("lh-payments-hidden", []);
  const [, setPaymentsCustom] = useSyncedStorage<PaymentEntry[]>("lh-payments-custom", []);
  const [customCategories, setCustomCategories] = useSyncedStorage<CustomCategory[]>(
    "lh-custom-categories",
    [],
  );
  const [, setCustomEntries] = useSyncedStorage<Record<string, CustomEntry[]>>(
    "lh-custom-entries",
    {},
  );
  const [, setDeletedCategories] = useSyncedStorage<DeletedCustomCategory[]>(
    CUSTOM_CATEGORY_DELETIONS_KEY,
    [],
  );

  /** Put restored content back on the day it was removed from, so it's actually visible again. */
  function addToDay(date: string | undefined, sectionIds: string[], itemIds: string[]) {
    if (!date) return;
    if (sectionIds.length) {
      setChecklistDaySectionIds((prev) => ({
        ...prev,
        [date]: Array.from(new Set([...(prev[date] ?? []), ...sectionIds])),
      }));
    }
    if (itemIds.length) {
      setChecklistDayItemIds((prev) => ({
        ...prev,
        [date]: Array.from(new Set([...(prev[date] ?? []), ...itemIds])),
      }));
    }
  }

  function handleRestore(entry: TrashEntry) {
    if (entry.category === "checklist" && entry.entryType === "day") {
      const day = entry.snapshot as ClearedChecklistDay;
      // Merge rather than overwrite. This used to assign the snapshot straight onto the
      // date, so restoring a day that had since been rebuilt destroyed the rebuilt work
      // with no confirmation and nothing to undo it with.
      const merge = (restored: string[], current: string[] = []) =>
        Array.from(new Set([...restored, ...current]));
      setChecklistDayItemIds((prev) => ({ ...prev, [day.date]: merge(day.itemIds, prev[day.date]) }));
      setChecklistDaySectionIds((prev) => ({
        ...prev,
        [day.date]: merge(day.sectionIds, prev[day.date]),
      }));
      // Anything ticked or noted on the date today wins over the restored copy.
      setChecklistState((prev) => ({
        ...prev,
        [day.date]: { ...day.state, ...(prev[day.date] ?? {}) },
      }));
    } else if (entry.category === "checklist" && entry.entryType === "section") {
      const section = entry.snapshot as ChecklistSection;
      if (entry.wasCustom) {
        setChecklistCustomSections((prev) =>
          prev.some((s) => s.id === entry.itemId)
            ? prev
            : [...prev, { id: entry.itemId, title: entry.title }],
        );
      } else {
        setChecklistHiddenSections((prev) => prev.filter((id) => id !== entry.itemId));
      }
      addToDay(entry.date, [entry.itemId], (section.items ?? []).map((i) => i.id));
    } else if (entry.category === "checklist") {
      const sectionId = entry.sectionId;
      if (!sectionId) {
        showToast(t("trash.restoreMissingSection"));
        return;
      }
      // Refuse when the section is gone, instead of writing the item back somewhere no
      // page renders and consuming its only Trash record while reporting success.
      if (!checklistCustomSections.some((s) => s.id === sectionId)) {
        showToast(t("trash.restoreMissingSection"));
        return;
      }
      if (entry.wasCustom) {
        setChecklistCustom((prev) =>
          (prev[sectionId] ?? []).some((i) => i.id === entry.itemId)
            ? prev
            : { ...prev, [sectionId]: [...(prev[sectionId] ?? []), entry.snapshot as ChecklistItem] },
        );
      } else {
        setChecklistHidden((prev) => prev.filter((id) => id !== entry.itemId));
      }
      addToDay(entry.date, [sectionId], [entry.itemId]);
    } else if (entry.category === "oa-cases") {
      if (entry.wasCustom) {
        // Guard against a double restore — undo on the toast, or the same record restored
        // from a second machine — which otherwise produced two cards sharing one id that
        // could only ever be edited together.
        setOACasesCustom((prev) =>
          prev.some((c) => c.id === entry.itemId) ? prev : [...prev, entry.snapshot as OACase],
        );
      } else {
        setOACasesHidden((prev) => prev.filter((id) => id !== entry.itemId));
      }
    } else if (entry.category === "payments") {
      if (entry.wasCustom) {
        setPaymentsCustom((prev) =>
          prev.some((p) => p.id === entry.itemId) ? prev : [...prev, entry.snapshot as PaymentEntry],
        );
      } else {
        setPaymentsHidden((prev) => prev.filter((id) => id !== entry.itemId));
      }
    } else if (entry.category === "custom" && entry.entryType === "section") {
      const { category, entries } = entry.snapshot as { category: CustomCategory; entries: CustomEntry[] };
      // Restore only this folder; a live folder that merely shares its name is a
      // different folder and must be left alone.
      setCustomCategories((prev) => [...prev.filter((item) => item.id !== category.id), category]);
      // Merge, so entries restored individually before the folder aren't wiped.
      setCustomEntries((prev) => {
        const existing = prev[category.id] ?? [];
        const restored = entries.filter((e) => !existing.some((item) => item.id === e.id));
        return { ...prev, [category.id]: [...existing, ...restored] };
      });
      setDeletedCategories((prev) => prev.filter((deleted) => deleted.id !== category.id));
    } else if (entry.category === "custom") {
      const categoryId = entry.sectionId;
      if (!categoryId) return;
      // Refuse to restore into a folder that no longer exists — it would vanish
      // from the sidebar and from search with no way back.
      if (!customCategories.some((category) => category.id === categoryId)) {
        showToast(t("trash.restoreMissingCategory"));
        return;
      }
      setCustomEntries((prev) => {
        const existing = prev[categoryId] ?? [];
        if (existing.some((e) => e.id === entry.itemId)) return prev;
        return { ...prev, [categoryId]: [...existing, entry.snapshot as CustomEntry] };
      });
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
    if (entry.category === "custom" && entry.entryType === "section") {
      // Purging a trashed folder must not touch a live folder that shares its name.
      setCustomCategories((prev) => prev.filter((category) => category.id !== entry.itemId));
      setCustomEntries((prev) => {
        const next = { ...prev };
        delete next[entry.itemId];
        return next;
      });
      setDeletedCategories((prev) => prev.filter((deleted) => deleted.id !== entry.itemId));
    }
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
                  {entry.entryType === "section" ? ` ${t("trash.wholeSection")}` : ""}
                  {entry.entryType === "day" ? ` ${t("trash.wholeDay")}` : ""} ·{" "}
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
