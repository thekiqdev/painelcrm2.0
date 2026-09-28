import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { SettingsNavItem } from "@/config/settingsNavigation";
import { cn } from "@/lib/utils";

type MobileSettingsListProps = {
  items: SettingsNavItem[];
  resolveHref: (item: SettingsNavItem) => string;
};

export function MobileSettingsList({ items, resolveHref }: MobileSettingsListProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((item, idx) => {
        const Icon = item.icon;
        const href = resolveHref(item);
        return (
          <Link
            key={item.id}
            to={href}
            className={cn(
              "flex min-h-[52px] items-center gap-3 px-4 py-3 transition-colors active:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              idx > 0 && "border-t border-border/70",
            )}
            aria-label={item.title}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-snug text-foreground">{item.title}</p>
              {item.description ? (
                <p className="truncate text-xs text-muted-foreground">{item.description}</p>
              ) : null}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}
