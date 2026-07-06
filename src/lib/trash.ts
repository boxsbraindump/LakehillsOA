import type { TrashEntry } from "./types";

export const TRASH_KEY = "lh-trash";
export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function purgeExpiredTrash(entries: TrashEntry[]): TrashEntry[] {
  const now = Date.now();
  return entries.filter((e) => now - e.deletedAt < TRASH_RETENTION_MS);
}

export function daysRemaining(entry: TrashEntry): number {
  const elapsedMs = Date.now() - entry.deletedAt;
  const remainingMs = TRASH_RETENTION_MS - elapsedMs;
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}
