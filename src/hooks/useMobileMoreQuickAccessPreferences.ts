import { useCallback, useEffect, useState } from "react";
import {
  type MobileMoreQuickAccessPrefsV1,
  mobileMoreQuickAccessStorageKey,
  parseMobileMoreQuickAccessPrefs,
} from "@/lib/mobileMoreQuickAccess";

/** Mesmo padrão que `useDashboardQuickActionsPreferences`: localStorage por utilizador. */
export function useMobileMoreQuickAccessPreferences(userId: string | undefined) {
  const [prefs, setPrefsState] = useState<MobileMoreQuickAccessPrefsV1 | null>(null);

  useEffect(() => {
    if (!userId) {
      setPrefsState(null);
      return;
    }
    try {
      const raw = localStorage.getItem(mobileMoreQuickAccessStorageKey(userId));
      setPrefsState(parseMobileMoreQuickAccessPrefs(raw));
    } catch {
      setPrefsState(null);
    }
  }, [userId]);

  const persist = useCallback(
    (next: MobileMoreQuickAccessPrefsV1 | null) => {
      if (!userId) return;
      const key = mobileMoreQuickAccessStorageKey(userId);
      if (next == null) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(next));
    },
    [userId],
  );

  const setPrefs = useCallback(
    (next: MobileMoreQuickAccessPrefsV1 | null) => {
      setPrefsState(next);
      persist(next);
    },
    [persist],
  );

  const reset = useCallback(() => {
    setPrefs(null);
  }, [setPrefs]);

  return { prefs, setPrefs, reset };
}
