import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { SettingsNavItem } from "@/config/settingsNavigation";
import { cn } from "@/lib/utils";

type MobileSettingsGridProps = {
  items: SettingsNavItem[];
  resolveHref: (item: SettingsNavItem) => string;
};

export function MobileSettingsGrid({ items, resolveHref }: MobileSettingsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        const href = resolveHref(item);
        return (
          <Link
            key={item.id}
            to={href}
            className={cn(
              "flex min-h-[124px] flex-col rounded-2xl border border-border/80 bg-card p-3 shadow-sm transition-colors active:bg-muted/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            aria-label={item.title}
          >
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden />
            </div>
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{item.title}</span>
            {item.description ? (
              <span className="mt-1 line-clamp-2 flex-1 text-[11px] leading-snug text-muted-foreground">{item.description}</span>
            ) : null}
            <div className="mt-2 flex items-center justify-end text-muted-foreground">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
