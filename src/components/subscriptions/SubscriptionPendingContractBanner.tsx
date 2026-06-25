import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CrmSubscriptionDetailPayload } from "@/services/crmSubscriptions";
import {
  billingIntervalLabelPt,
  contractStatusLabelPt,
  formatContractAmount,
} from "./subscriptionContractHistoryDisplay";

function formatYmdBr(ymd: string | null | undefined): string {
  if (!ymd || ymd.length < 10) return "—";
  return format(new Date(`${ymd.slice(0, 10)}T12:00:00`), "dd/MM/yyyy", { locale: ptBR });
}

export function SubscriptionPendingContractBanner({
  pending,
  applicationYmd,
}: {
  pending: NonNullable<CrmSubscriptionDetailPayload["pending_contract"]>;
  applicationYmd: string | null;
}) {
  const isMobile = useIsMobile();

  const body = (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Aplicação</p>
          <p className="font-medium tabular-nums">{formatYmdBr(applicationYmd)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <Badge variant="secondary" className="font-normal">
            {contractStatusLabelPt("pending")}
          </Badge>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Novo contrato</p>
        <p className="font-medium">{pending.description}</p>
        <p className="text-muted-foreground tabular-nums">
          {formatContractAmount(pending.amount_cents)} · {billingIntervalLabelPt(pending.billing_interval)}
        </p>
      </div>
      {pending.reason?.trim() ? (
        <div>
          <p className="text-xs text-muted-foreground">Motivo</p>
          <p className="text-foreground/90">{pending.reason.trim()}</p>
        </div>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <Accordion type="single" collapsible className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-1">
        <AccordionItem value="pending" className="border-0">
          <AccordionTrigger className="px-3 py-3 text-sm font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <span>Mudança agendada</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                Pendente
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4">{body}</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  return (
    <Card className={cn("border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-card shadow-sm")}>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Mudança agendada</p>
          <Badge variant="secondary" className="font-normal">
            {contractStatusLabelPt("pending")}
          </Badge>
        </div>
        {body}
      </CardContent>
    </Card>
  );
}
