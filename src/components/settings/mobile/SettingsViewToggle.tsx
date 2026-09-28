import React from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SettingsMobileViewMode } from "@/config/settingsNavigation";

type SettingsViewToggleProps = {
  mode: SettingsMobileViewMode;
  onChange: (mode: SettingsMobileViewMode) => void;
};

export function SettingsViewToggle({ mode, onChange }: SettingsViewToggleProps) {
  return (
    <div className="flex rounded-xl border border-border bg-muted/40 p-1" role="group" aria-label="Modo de visualização">
      <Button
        type="button"
        variant={mode === "grid" ? "secondary" : "ghost"}
        size="sm"
        className={cn("flex-1 gap-2 rounded-lg", mode === "grid" && "shadow-sm")}
        onClick={() => onChange("grid")}
        aria-pressed={mode === "grid"}
        aria-label="Visualização em grade"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        Grid
      </Button>
      <Button
        type="button"
        variant={mode === "list" ? "secondary" : "ghost"}
        size="sm"
        className={cn("flex-1 gap-2 rounded-lg", mode === "list" && "shadow-sm")}
        onClick={() => onChange("list")}
        aria-pressed={mode === "list"}
        aria-label="Visualização em lista"
      >
        <List className="h-4 w-4" aria-hidden />
        Lista
      </Button>
    </div>
  );
}
