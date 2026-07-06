import { useEffect } from "react";
import { useSyncedStorage } from "./useSyncedStorage";
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

  function addToTrash(entry: TrashEntry) {
    setTrash((prev) => [...prev, entry]);
  }

  function removeFromTrash(trashId: string) {
    setTrash((prev) => prev.filter((e) => e.trashId !== trashId));
  }

  return { trash, setTrash, addToTrash, removeFromTrash };
}
