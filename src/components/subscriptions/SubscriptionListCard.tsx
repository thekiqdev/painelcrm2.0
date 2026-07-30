import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientEntityLink } from "@/components/entities";
import type { CrmSubscriptionListItem } from "@/services/crmSubscriptions";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatYmdBr,
  intervalLabel,
  subscriptionStatusUi,
} from "./subscriptionsListUtils";

type Props = {
  row: CrmSubscriptionListItem;
  onOpen: (row: CrmSubscriptionListItem) => void;
  avatarUrl?: string | null;
};

export function SubscriptionListCard({ row, onOpen, avatarUrl }: Props) {
  const st = subscriptionStatusUi(row);
  const plan = row.plan_label?.trim() || "—";

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {row.client_id ? (
            <ClientEntityLink
              clientId={row.client_id}
              name={row.client_name}
              avatarUrl={avatarUrl}
              variant="compact"
              stopPropagationOnClick
              disabledFallbackText="Cliente"
            />
          ) : row.link_checkout ? (
            <Badge variant="secondary" className="font-normal">
              Por link
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">Sem cliente vinculado</span>
          )}
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{plan}</p>
          <p className="mt-0.5 text-xs font-medium text-foreground/80">
            {intervalLabel(row.billing_interval)}
          </p>
        </div>
        <Badge
          variant={st.variant}
          className={cn(
            "shrink-0 text-[10px]",
            st.variant === "default" && "bg-crm-primary/12 text-crm-primary border-crm-primary/25",
            row.status === "paused" && "bg-amber-500/12 text-amber-800 border-amber-500/30 dark:text-amber-300"
          )}
        >
          {st.label}
        </Badge>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">{formatAmount(row.amount_cents)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Próx. cobrança · {formatYmdBr(row.next_billing_date)}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" className="gap-1 shrink-0" onClick={() => onOpen(row)}>
          Abrir
          <ArrowRight className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </div>
    </div>
  );
}
