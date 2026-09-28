import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  getSettingsNavItems,
  SETTINGS_MOBILE_CATEGORY_ORDER,
  SETTINGS_MOBILE_VIEW_STORAGE_KEY,
  settingsPathForSection,
  type SettingsMobileViewMode,
  type SettingsNavItem,
} from "@/config/settingsNavigation";
import { MobileSettingsProfileCard } from "./MobileSettingsProfileCard";
import { SettingsViewToggle } from "./SettingsViewToggle";
import { MobileSettingsGrid } from "./MobileSettingsGrid";
import { MobileSettingsList } from "./MobileSettingsList";

function resolveHref(item: SettingsNavItem): string {
  return settingsPathForSection(item.id);
}

export function MobileSettingsHome() {
  const items = useMemo(() => getSettingsNavItems(), []);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SettingsMobileViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    const v = localStorage.getItem(SETTINGS_MOBILE_VIEW_STORAGE_KEY);
    return v === "list" ? "list" : "grid";
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_MOBILE_VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => {
      const hay = `${it.title} ${it.description} ${it.mobileCategory} ${it.sidebarCategory}`.toLowerCase();
      return hay.includes(t);
    });
  }, [items, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, SettingsNavItem[]>();
    for (const cat of SETTINGS_MOBILE_CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const it of filtered) {
      const arr = map.get(it.mobileCategory);
      if (arr) arr.push(it);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] animate-in fade-in duration-200">
      <div className="pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gerencie sua conta e o workspace.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <MobileSettingsProfileCard />

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Buscar configuração..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 rounded-xl border-border bg-muted/30 pl-10"
            aria-label="Buscar configuração"
            autoComplete="off"
          />
        </div>

        <SettingsViewToggle mode={mode} onChange={setMode} />

        {SETTINGS_MOBILE_CATEGORY_ORDER.map((cat) => {
          const group = grouped.get(cat) ?? [];
          if (group.length === 0) return null;
          return (
            <section key={cat} className="space-y-2" aria-labelledby={`settings-cat-${cat}`}>
              <h2
                id={`settings-cat-${cat}`}
                className="px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {cat}
              </h2>
              {mode === "grid" ? (
                <MobileSettingsGrid items={group} resolveHref={resolveHref} />
              ) : (
                <MobileSettingsList items={group} resolveHref={resolveHref} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
