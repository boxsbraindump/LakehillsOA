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
 *
 * Last write wins by default, which is fine for a value one person edits at a time. It is not
 * fine for a list two people work through together: whoever pushed last replaced the whole
 * thing, so marking row 5 while a colleague marked row 20 silently threw their row away.
 *
 * Pass `merge` for those. It is called only when both sides have changed — local edits are
 * pending *and* the server has something different — and its result is what both keep.
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

export function useSyncedStorage<T>(
  key: string,
  initialValue: T,
  merge?: (local: T, remote: T) => T,
) {
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
      if (pendingLocalEdits.has(storageKey)) {
        /*
         * Both sides have moved. Without a merge the only options are to lose one of them, so
         * unsaved local work used to win outright — which is a silent loss for whoever else was
         * working at the time. With one, both are kept and the result goes to the server and
         * the screen together.
         */
        const local = latestValue.current;
        const incoming = Object.prototype.hasOwnProperty.call(remote, key)
          ? (remote[key] as T)
          : null;
        const resolved = merge && incoming !== null ? merge(local, incoming) : local;

        if (JSON.stringify(resolved) !== JSON.stringify(local)) {
          // Pushed explicitly just below, so the debounced effect must not push it again.
          skipNextPush.current = true;
          setStoredValue(resolved);
        }
        void pushRemoteValue(key, resolved).then(() => {
          if (JSON.stringify(latestValue.current) === JSON.stringify(resolved)) {
            pendingLocalEdits.delete(storageKey);
          }
        });
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
  }, [key, setStoredValue, merge]);

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
