import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, MessageCircle, Receipt, Ticket, UserPlus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ENTITY_QUICK_VIEW_PAD } from "./entityQuickViewLayout";
import {
  buildRecentActivities,
  formatActivityDate,
  type EntityRecentActivitySource,
  type RecentActivityKind,
} from "./entityRecentActivityUtils";

const ACTIVITY_ICONS: Record<RecentActivityKind, LucideIcon> = {
  message: MessageCircle,
  ticket: Ticket,
  invoice: Receipt,
  created: UserPlus,
};

type Props = EntityRecentActivitySource & {
  className?: string;
  showEmptyMessage?: boolean;
};

export function EntityRecentActivity({ className, showEmptyMessage = false, ...source }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const items = buildRecentActivities(source);
  const count = items.length;

  if (count === 0) {
    if (!showEmptyMessage) return null;
    return (
      <section className={cn("border-b border-border/40 pb-3 pt-1", ENTITY_QUICK_VIEW_PAD, className)}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Atividade recente (0)
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma atividade recente</p>
      </section>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("border-b border-border/40 pb-3 pt-1", ENTITY_QUICK_VIEW_PAD, className)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left transition-colors hover:bg-muted/50">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {isOpen ? "Atividade recente" : `Atividade recente (${count})`}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 space-y-0.5">
          {items.map((item) => {
            const when = formatActivityDate(item.date);
            const Icon = ACTIVITY_ICONS[item.kind];
            return (
              <li key={`${item.kind}-${item.label}-${item.date}`}>
                <div className="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-foreground">{item.label}</p>
                    {when ? <p className="text-xs text-muted-foreground">{when}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
