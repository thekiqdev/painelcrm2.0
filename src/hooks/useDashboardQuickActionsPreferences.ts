import { useCallback, useEffect, useState } from "react";
import {
  type DashboardQuickActionsPrefsV1,
  dashboardQuickActionsStorageKey,
  parseDashboardQuickActionsPrefs,
} from "@/lib/dashboardQuickActions";

export function useDashboardQuickActionsPreferences(userId: string | undefined) {
  const [prefs, setPrefsState] = useState<DashboardQuickActionsPrefsV1 | null>(null);

  useEffect(() => {
    if (!userId) {
      setPrefsState(null);
      return;
    }
    try {
      const raw = localStorage.getItem(dashboardQuickActionsStorageKey(userId));
      setPrefsState(parseDashboardQuickActionsPrefs(raw));
    } catch {
      setPrefsState(null);
    }
  }, [userId]);

  const persist = useCallback(
    (next: DashboardQuickActionsPrefsV1 | null) => {
      if (!userId) return;
      const key = dashboardQuickActionsStorageKey(userId);
      if (next == null) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(next));
    },
    [userId],
  );

  const setPrefs = useCallback(
    (next: DashboardQuickActionsPrefsV1 | null) => {
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
