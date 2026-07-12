import { useCallback, useEffect, useRef, type SetStateAction } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
  fetchAllRemoteState,
  getScopedStorageKey,
  pushRemoteValue,
  syncEnabled,
} from "../lib/syncApi";

/**
 * Same interface as useLocalStorage, but also syncs through the Worker/D1 backend when
 * configured: reads localStorage instantly (no loading flicker), then reconciles with
 * the remote copy once it arrives, and pushes local edits back after a short debounce.
 * Last write wins — fine for a handful of front-desk computers, not built for
 * simultaneous conflicting edits.
 */
export function useSyncedStorage<T>(key: string, initialValue: T) {
  const storageKey = getScopedStorageKey(key);
  const [value, setStoredValue] = useLocalStorage<T>(storageKey, initialValue);
  const hydrated = useRef(!syncEnabled);
  const localEditBeforeHydration = useRef(false);
  const latestValue = useRef(value);
  const skipNextPush = useRef(false);

  useEffect(() => {
    hydrated.current = !syncEnabled;
    localEditBeforeHydration.current = false;
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
        if (JSON.stringify(resolved) !== JSON.stringify(prev) && !hydrated.current) {
          localEditBeforeHydration.current = true;
        }
        return resolved;
      });
    },
    [setStoredValue],
  );

  useEffect(() => {
    if (!syncEnabled) return;
    let cancelled = false;
    fetchAllRemoteState().then((remote) => {
      if (cancelled) return;
      hydrated.current = true;
      if (localEditBeforeHydration.current) {
        void pushRemoteValue(key, latestValue.current);
        localEditBeforeHydration.current = false;
        return;
      }
      if (Object.prototype.hasOwnProperty.call(remote, key)) {
        skipNextPush.current = true;
        setStoredValue(remote[key] as T);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, setStoredValue, storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    const timer = setTimeout(() => {
      pushRemoteValue(key, value);
    }, 600);
    return () => clearTimeout(timer);
  }, [key, storageKey, value]);

  return [value, setValue] as const;
}
