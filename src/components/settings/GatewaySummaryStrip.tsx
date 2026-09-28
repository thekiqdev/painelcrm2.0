import React from "react";
import { CreditCard, LayoutDashboard, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Uma linha por benefício — título curto, sem subtítulo, faixa baixa. */
const ITEMS = [
  { icon: CreditCard, title: "Mais formas de receber" },
  { icon: LayoutDashboard, title: "Gestão centralizada" },
  { icon: RefreshCw, title: "Sincronização automática" },
] as const;

export const GatewaySummaryStrip: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      "rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5 shadow-sm sm:px-4",
      className
    )}
  >
    <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
      {ITEMS.map(({ icon: Icon, title }) => (
        <div key={title} className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/90 text-primary ring-1 ring-border/50">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          <p className="min-w-0 text-xs font-medium leading-tight text-foreground sm:text-[13px]">{title}</p>
        </div>
      ))}
    </div>
  </div>
);
