import { useEffect } from "react";
import { useSyncedStorage, updateSyncedStorage } from "./useSyncedStorage";
import { purgeExpiredTrash, TRASH_KEY } from "../lib/trash";
import type { TrashEntry } from "../lib/types";

export function useTrash() {
  const [trash, setTrash] = useSyncedStorage<TrashEntry[]>(TRASH_KEY, []);

  // Opportunistically drop entries past their 30-day retention whenever this hook mounts.
  useEffect(() => {
    setTrash((prev) => {
      const purged = purgeExpiredTrash(prev);
      return purged.length === prev.length ? prev : purged;
    });
  }, [setTrash]);

  // Written through storage rather than this hook's state, because these are called from
  // Undo handlers on toasts that outlive the page that raised them — a state setter from
  // an unmounted page is a no-op, which left an undone deletion still sitting in Trash.
  function addToTrash(entry: TrashEntry) {
    updateSyncedStorage<TrashEntry[]>(TRASH_KEY, [], (prev) =>
      prev.some((e) => e.trashId === entry.trashId) ? prev : [...prev, entry],
    );
  }

  function removeFromTrash(trashId: string) {
    updateSyncedStorage<TrashEntry[]>(TRASH_KEY, [], (prev) =>
      prev.filter((e) => e.trashId !== trashId),
    );
  }

  return { trash, setTrash, addToTrash, removeFromTrash };
}
