import { useCallback, useEffect, useRef, type SetStateAction } from "react";
import { useLocalStorage } from "./useLocalStorage";
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
