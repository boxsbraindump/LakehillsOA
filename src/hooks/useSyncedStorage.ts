import { useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { fetchAllRemoteState, pushRemoteValue, syncEnabled } from "../lib/syncApi";

/**
 * Same interface as useLocalStorage, but also syncs through the Worker/D1 backend when
 * configured: reads localStorage instantly (no loading flicker), then reconciles with
 * the remote copy once it arrives, and pushes local edits back after a short debounce.
 * Last write wins — fine for a handful of front-desk computers, not built for
 * simultaneous conflicting edits.
 */
export function useSyncedStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useLocalStorage<T>(key, initialValue);
  const hydrated = useRef(!syncEnabled);
  const skipNextPush = useRef(false);

  useEffect(() => {
    if (!syncEnabled) return;
    let cancelled = false;
    fetchAllRemoteState().then((remote) => {
      if (cancelled) return;
      if (Object.prototype.hasOwnProperty.call(remote, key)) {
        skipNextPush.current = true;
        setValue(remote[key] as T);
      }
      hydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [key, setValue]);

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
  }, [key, value]);

  return [value, setValue] as const;
}
