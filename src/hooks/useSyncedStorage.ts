import { useCallback, useEffect, useRef, type SetStateAction } from "react";
import { useLocalStorage, LOCAL_STORAGE_CHANGE_EVENT } from "./useLocalStorage";
import {
  fetchAllRemoteState,
  getScopedStorageKey,
  pushRemoteValue,
  subscribeRemoteRefresh,
  syncEnabled,
} from "../lib/syncApi";

/**
 * Same interface as useLocalStorage, but also syncs through the Worker/D1 backend when
 * configured: reads localStorage instantly (no loading flicker), then reconciles with
 * the remote copy once it arrives, and pushes local edits back after a short debounce.
 * Last write wins — fine for a handful of front-desk computers, not built for
 * simultaneous conflicting edits.
 */
/**
 * Tracked per storage key, not per hook instance: the same key is read by several
 * components at once (a page, the sidebar, the search index). Each instance runs its own
 * reconcile on mount, so an instance mounting moments after another one's edit would pull
 * the server's older copy and broadcast it over the edit that hadn't been pushed yet.
 */
const pendingLocalEdits = new Set<string>();

/**
 * Write a synced key without going through a mounted component.
 *
 * A toast outlives the page that raised it, but its Undo handler closed over React state
 * setters — once that page unmounted the setter was a no-op, so undoing after navigating
 * away silently did nothing. Writing storage directly and announcing it lets whichever
 * components are mounted pick the change up, and the push still happens either way.
 */
export function updateSyncedStorage<T>(key: string, fallback: T, updater: (prev: T) => T) {
  const storageKey = getScopedStorageKey(key);
  let current = fallback;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) current = JSON.parse(stored) as T;
  } catch {
    // unreadable storage — fall back to the caller's default
  }

  const next = updater(current);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // storage unavailable; the remote push below is still worth attempting
  }
  window.dispatchEvent(
    new CustomEvent(LOCAL_STORAGE_CHANGE_EVENT, { detail: { key: storageKey, value: next } }),
  );

  if (!syncEnabled) return;
  pendingLocalEdits.add(storageKey);
  void pushRemoteValue(key, next).then(() => pendingLocalEdits.delete(storageKey));
}

export function useSyncedStorage<T>(key: string, initialValue: T) {
  const storageKey = getScopedStorageKey(key);
  const [value, setStoredValue] = useLocalStorage<T>(storageKey, initialValue);
  const hydrated = useRef(!syncEnabled);
  const latestValue = useRef(value);
  const skipNextPush = useRef(false);

  useEffect(() => {
    hydrated.current = !syncEnabled;
    skipNextPush.current = false;
  }, [storageKey]);

  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      setStoredValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (previous: T) => T)(prev) : next;
        if (JSON.stringify(resolved) !== JSON.stringify(prev)) {
          // Stays set until this edit is confirmed on the server. Pushes are debounced,
          // so without it a reconcile landing in that window would pull the server's older
          // copy over what was just typed — and never push it back.
          pendingLocalEdits.add(storageKey);
        }
        return resolved;
      });
    },
    [setStoredValue],
  );

  const reconcile = useCallback(() => {
    if (!syncEnabled) return () => {};
    let cancelled = false;
    fetchAllRemoteState().then((remote) => {
      if (cancelled) return;
      hydrated.current = true;
      // Unsaved local work always wins over the server copy; send it instead of losing it.
      if (pendingLocalEdits.has(storageKey)) {
        void pushRemoteValue(key, latestValue.current);
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(remote, key)) return;
      // Only take the server's copy when it actually differs, so a routine refresh
      // doesn't churn state or bounce an identical value straight back.
      if (JSON.stringify(remote[key]) === JSON.stringify(latestValue.current)) return;
      skipNextPush.current = true;
      setStoredValue(remote[key] as T);
    });
    return () => {
      cancelled = true;
    };
  }, [key, setStoredValue]);

  useEffect(() => reconcile(), [reconcile, storageKey]);

  // Re-check the server when the tab regains focus, comes back online, or on a timer —
  // otherwise a tab left open all day never sees another machine's edits.
  useEffect(() => {
    if (!syncEnabled) return;
    let cancelPending: (() => void) | undefined;
    const unsubscribe = subscribeRemoteRefresh(() => {
      cancelPending?.();
      cancelPending = reconcile();
    });
    return () => {
      cancelPending?.();
      unsubscribe();
    };
  }, [reconcile]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const pushed = value;
      void pushRemoteValue(key, pushed).then(() => {
        // Only stop protecting this edit once the server has it and nothing newer
        // has been typed since.
        if (JSON.stringify(latestValue.current) === JSON.stringify(pushed)) {
          pendingLocalEdits.delete(storageKey);
        }
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [key, storageKey, value]);

  return [value, setValue] as const;
}
