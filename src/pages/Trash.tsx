import { Trash2, RotateCcw } from "lucide-react";
import { useTrash } from "../hooks/useTrash";
import { useSyncedStorage } from "../hooks/useSyncedStorage";
import { useToast } from "../components/ToastProvider";
import { daysRemaining, TRASH_RETENTION_DAYS } from "../lib/trash";
import { CATEGORY_LABEL, CATEGORY_DOT } from "../lib/searchIndex";
import type {
  TrashEntry,
  OACase,
  PaymentEntry,
  ChecklistItem,
  ChecklistSectionMeta,
} from "../lib/types";

export default function Trash() {
  const { trash, removeFromTrash } = useTrash();
  const { showToast } = useToast();

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
    } else {
      if (entry.wasCustom) {
        setPaymentsCustom((prev) => [...prev, entry.snapshot as PaymentEntry]);
      } else {
        setPaymentsHidden((prev) => prev.filter((id) => id !== entry.itemId));
      }
    }
    removeFromTrash(entry.trashId);
    showToast(`已恢复「${entry.title}」`);
  }

  function handlePurgeNow(entry: TrashEntry) {
    if (!window.confirm(`彻底删除「${entry.title}」？此操作无法撤销。`)) return;
    removeFromTrash(entry.trashId);
  }

  const sorted = [...trash].sort((a, b) => b.deletedAt - a.deletedAt);

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-(--tracking-heading) text-(--color-ink)">
          垃圾桶
        </h1>
        <p className="mt-1 text-[15px] text-(--color-ink-muted)">
          删除的内容会在这里保留 {TRASH_RETENTION_DAYS} 天，之后自动清除
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-(--color-ink-faint)">垃圾桶是空的</p>
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
                  {CATEGORY_LABEL[entry.category]}
                  {entry.entryType === "section" ? " · 整个 Section" : ""} · 剩余{" "}
                  {daysRemaining(entry)} 天
                </p>
              </div>
              <button
                onClick={() => handleRestore(entry)}
                className="flex shrink-0 items-center gap-1 rounded-(--radius-md) border border-(--color-hairline) px-2.5 py-1.5 text-[13px] font-medium text-(--color-ink-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary)"
              >
                <RotateCcw size={13} />
                恢复
              </button>
              <button
                onClick={() => handlePurgeNow(entry)}
                aria-label="彻底删除"
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
