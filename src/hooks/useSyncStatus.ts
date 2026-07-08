import { useEffect, useState } from "react";
import { getSyncStatus, subscribeSyncStatus } from "../lib/syncApi";

export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus());

  useEffect(() => subscribeSyncStatus(setSyncStatus), []);

  return syncStatus;
}
