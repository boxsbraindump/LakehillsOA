import { useEffect, useState } from "react";

const LOCAL_STORAGE_CHANGE_EVENT = "lh-local-storage-change";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const serialized = JSON.stringify(value);
      const previous = window.localStorage.getItem(key);
      window.localStorage.setItem(key, serialized);
      if (previous !== serialized) {
        window.dispatchEvent(
          new CustomEvent(LOCAL_STORAGE_CHANGE_EVENT, { detail: { key, value } }),
        );
      }
    } catch {
      // storage unavailable; preference/data just won't persist locally
    }
  }, [key, value]);

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== key || event.newValue === null) return;
      try {
        setValue(JSON.parse(event.newValue) as T);
      } catch {
        setValue(initialValue);
      }
    }

    function handleSameTabChange(event: Event) {
      const detail = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (!detail || detail.key !== key) return;
      setValue(detail.value);
    }

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleSameTabChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleSameTabChange);
    };
  }, [initialValue, key]);

  return [value, setValue] as const;
}
