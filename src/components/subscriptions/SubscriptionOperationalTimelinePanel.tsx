import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  crmSubscriptionsService,
  type CrmSubscriptionContractHistoryRow,
  type CrmSubscriptionDetailPayload,
  type CrmSubscriptionTimelineRow,
} from "@/services/crmSubscriptions";
import {
  billingIntervalLabelPt,
  contractChangeTypeLabelPt,
  contractEffectiveAtLabelPt,
  contractStatusLabelPt,
  formatContractAmount,
  isLifecycleHistoryChangeType,
} from "./subscriptionContractHistoryDisplay";
import { SubscriptionRecurringStatusBadge } from "./SubscriptionRecurringStatusBadge";
import { SubscriptionTimelineStateDot } from "./SubscriptionTimelineStateDot";
import { resolveTimelineRecurringDisplay } from "@/lib/subscriptionRecurringDisplay";

function formatYmdBr(ymd: string | null | undefined): string {
  if (!ymd || ymd.length < 10) return "—";
  return format(new Date(`${ymd.slice(0, 10)}T12:00:00`), "dd/MM/yyyy", { locale: ptBR });
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}

type UnifiedItem =
  | { kind: "contract"; sortKey: string; contract: CrmSubscriptionContractHistoryRow }
  | { kind: "cycle"; sortKey: string; cycle: CrmSubscriptionTimelineRow }
  | { kind: "lifecycle"; sortKey: string; cycle: CrmSubscriptionTimelineRow };

function contractApplicationLabel(
  row: CrmSubscriptionContractHistoryRow,
  nextBillingYmd: string | null
): string {
  if (row.status === "applied" && row.effective_at === "immediate") {
    return "Aplicado imediatamente";
  }
  if (row.status === "pending" && row.effective_at === "next_cycle") {
    return `Aplicado em ${formatYmdBr(nextBillingYmd)}`;
  }
  if (row.status === "applied" && row.effective_at === "next_cycle") {
    return "Aplicado no próximo ciclo";
  }
  return contractStatusLabelPt(row.status);
}

function ContractTimelineCard({
  row,
  nextBillingYmd,
}: {
  row: CrmSubscriptionContractHistoryRow;
  nextBillingYmd: string | null;
}) {
  const prev = row.previous_payload;
  const next = row.new_payload;
  if (!next) return null;
  const headline =
    row.status === "pending" && row.effective_at === "next_cycle"
      ? `${contractChangeTypeLabelPt(row.change_type)} agendado`
      : "Contrato alterado";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground tabular-nums">{formatCreatedAt(row.created_at)}</p>
          <p className="font-medium text-sm">{headline}</p>
        </div>
        <Badge variant="outline" className="text-[10px] font-normal">
          {contractChangeTypeLabelPt(row.change_type)}
        </Badge>
      </div>
      {prev ? (
        <p className="text-sm tabular-nums">
          {formatContractAmount(prev.amount_cents)} → {formatContractAmount(next.amount_cents)}
        </p>
      ) : (
        <p className="text-sm tabular-nums">{formatContractAmount(next.amount_cents)}</p>
      )}
      {prev && prev.billing_interval !== next.billing_interval ? (
        <p className="text-xs text-muted-foreground">
          {billingIntervalLabelPt(prev.billing_interval)} → {billingIntervalLabelPt(next.billing_interval)}
        </p>
      ) : null}
      {prev && prev.description !== next.description ? (
        <p className="text-xs text-muted-foreground">
          {prev.description} → {next.description}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{contractApplicationLabel(row, nextBillingYmd)}</p>
      {row.reason?.trim() ? (
        <p className="text-xs text-muted-foreground border-t pt-2">{row.reason.trim()}</p>
      ) : null}
    </div>
  );
}

function LifecycleTimelineCard({ row }: { row: CrmSubscriptionTimelineRow }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatYmdBr(row.cycle_date ?? row.processed_at?.slice(0, 10))}
          </p>
          <p className="font-medium text-sm">{row.cycle_label}</p>
        </div>
        {row.lifecycle_event ? (
          <Badge variant="outline" className="text-[10px] font-normal">
            {contractChangeTypeLabelPt(row.lifecycle_event)}
          </Badge>
        ) : null}
      </div>
      {row.lifecycle_actor_name?.trim() ? (
        <p className="text-xs text-muted-foreground">Por {row.lifecycle_actor_name.trim()}</p>
      ) : null}
      {row.lifecycle_next_billing_date ? (
        <p className="text-xs text-muted-foreground">
          Próxima cobrança: {formatYmdBr(row.lifecycle_next_billing_date)}
        </p>
      ) : null}
      {row.lifecycle_reason?.trim() || row.generation_note?.trim() ? (
        <p className="text-xs text-muted-foreground border-t pt-2">
          {row.lifecycle_reason?.trim() || row.generation_note?.trim()}
        </p>
      ) : null}
    </div>
  );
}

function CycleTimelineCard({
  row,
  detail,
}: {
  row: CrmSubscriptionTimelineRow;
  detail: CrmSubscriptionDetailPayload;
}) {
  const display = resolveTimelineRecurringDisplay(row, detail.recent_jobs, detail.tenant_billing);
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {row.operational_state ? (
            <SubscriptionTimelineStateDot state={row.operational_state} className="mt-1" title={row.operational_state_pt} />
          ) : null}
          <div>
            <p className="font-medium text-sm">{row.cycle_label ?? row.month_ref}</p>
            <p className="text-xs text-muted-foreground">{row.period_label}</p>
          </div>
        </div>
        <SubscriptionRecurringStatusBadge display={display} showDetail />
      </div>
      {row.generation_note ? <p className="text-xs text-muted-foreground">{row.generation_note}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {row.due_date ? <span>Vencimento: {formatYmdBr(row.due_date)}</span> : null}
        {row.amount_cents != null ? (
          <span className="tabular-nums">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.amount_cents / 100)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function SubscriptionOperationalTimelinePanel({
  subscriptionId,
  detail,
  refreshKey = 0,
}: {
  subscriptionId: string;
  detail: CrmSubscriptionDetailPayload;
  refreshKey?: number;
}) {
  const [contractRows, setContractRows] = useState<CrmSubscriptionContractHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const history = await crmSubscriptionsService.getContractHistory(subscriptionId);
      setContractRows(history);
    } catch {
      setContractRows([]);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const nextBillingYmd = detail.subscription.next_billing_date?.slice(0, 10) ?? null;
  const { timeline } = detail;

  const unified = useMemo(() => {
    const items: UnifiedItem[] = [];
    for (const c of contractRows) {
      if (isLifecycleHistoryChangeType(c.change_type)) continue;
      items.push({ kind: "contract", sortKey: c.created_at, contract: c });
    }
    timeline.forEach((cycle, idx) => {
      if (cycle.merge_source === "lifecycle") {
        const sortKey = cycle.processed_at ?? cycle.cycle_date ?? `lifecycle-${idx}`;
        items.push({ kind: "lifecycle", sortKey, cycle });
        return;
      }
      const sortKey =
        cycle.due_date?.slice(0, 10) ??
        cycle.cycle_date?.slice(0, 10) ??
        cycle.invoice_created_at ??
        `cycle-${idx}`;
      items.push({ kind: "cycle", sortKey, cycle });
    });
    return items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
  }, [contractRows, timeline]);

  if (loading) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Carregando timeline…</CardContent>
      </Card>
    );
  }

  if (unified.length === 0) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b py-4">
          <CardTitle className="text-base font-medium">Timeline operacional</CardTitle>
        </CardHeader>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhum evento registrado ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/30 border-b py-4">
        <CardTitle className="text-base font-medium">Timeline operacional</CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="md:hidden space-y-3">
          {unified.map((item, idx) =>
            item.kind === "contract" ? (
              <ContractTimelineCard key={`c-${item.contract.id}`} row={item.contract} nextBillingYmd={nextBillingYmd} />
            ) : item.kind === "lifecycle" ? (
              <LifecycleTimelineCard key={`lc-${item.cycle.processed_at ?? idx}`} row={item.cycle} />
            ) : (
              <CycleTimelineCard
                key={`cy-${item.cycle.invoice_id ?? item.cycle.cycle_id ?? idx}`}
                row={item.cycle}
                detail={detail}
              />
            )
          )}
        </div>
        <div className="hidden md:block">
          {unified.map((item, idx) => {
            const isLast = idx === unified.length - 1;
            return (
              <div key={item.kind === "contract" ? `c-${item.contract.id}` : `cy-${idx}`} className="relative flex gap-4 pb-6">
                {!isLast ? <span className="absolute left-[11px] top-6 bottom-0 w-px bg-border" aria-hidden /> : null}
                <div className="relative z-[1] mt-1 h-6 w-6 shrink-0 flex items-center justify-center">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      item.kind === "contract"
                        ? "bg-amber-500/80"
                        : item.kind === "lifecycle"
                          ? "bg-orange-500/80"
                          : "bg-crm-primary/70"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  {item.kind === "contract" ? (
                    <ContractTimelineCard row={item.contract} nextBillingYmd={nextBillingYmd} />
                  ) : item.kind === "lifecycle" ? (
                    <LifecycleTimelineCard row={item.cycle} />
                  ) : (
                    <CycleTimelineCard row={item.cycle} detail={detail} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
