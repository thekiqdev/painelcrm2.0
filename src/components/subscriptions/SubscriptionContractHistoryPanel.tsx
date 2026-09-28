import React, { useCallback, useEffect, useState } from "react";
import { formatDateTimeBrSafe } from "@/lib/billingSafeDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  crmSubscriptionsService,
  type CrmSubscriptionContractHistoryRow,
} from "@/services/crmSubscriptions";
import {
  billingIntervalLabelPt,
  contractChangeTypeLabelPt,
  contractEffectiveAtLabelPt,
  contractStatusLabelPt,
  formatContractAmount,
  isLifecycleHistoryChangeType,
} from "./subscriptionContractHistoryDisplay";
import { formatYmdBr } from "./subscriptionsListUtils";

function formatCreatedAt(iso: string): string {
  return formatDateTimeBrSafe(iso).replace(" às ", " ").slice(0, 10);
}

function statusBadgeVariant(
  status: CrmSubscriptionContractHistoryRow["status"]
): "default" | "secondary" | "outline" {
  if (status === "applied") return "default";
  if (status === "pending") return "secondary";
  return "outline";
}

function HistoryEntryBody({ row }: { row: CrmSubscriptionContractHistoryRow }) {
  if (isLifecycleHistoryChangeType(row.change_type)) {
    return (
      <div className="space-y-2 text-sm">
        {row.change_type === "resume" || row.change_type === "reactivate" ? (
          <p>
            <span className="text-muted-foreground">Próxima cobrança: </span>
            {formatYmdBr(row.next_billing_date)}
          </p>
        ) : null}
        {row.reason?.trim() ? (
          <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
            <span className="font-medium text-foreground/80">Motivo:</span> {row.reason.trim()}
          </p>
        ) : null}
      </div>
    );
  }

  const prev = row.previous_payload;
  const next = row.new_payload;
  if (!next) return null;
  const amountChanged = prev != null && prev.amount_cents !== next.amount_cents;
  const intervalChanged = prev != null && prev.billing_interval !== next.billing_interval;
  const descriptionChanged = prev != null && prev.description !== next.description;

  return (
    <div className="space-y-2 text-sm">
      {amountChanged ? (
        <p>
          <span className="text-muted-foreground">Valor: </span>
          {formatContractAmount(prev!.amount_cents)} → {formatContractAmount(next.amount_cents)}
        </p>
      ) : null}
      {intervalChanged ? (
        <p>
          <span className="text-muted-foreground">Periodicidade: </span>
          {billingIntervalLabelPt(prev!.billing_interval)} → {billingIntervalLabelPt(next.billing_interval)}
        </p>
      ) : null}
      {descriptionChanged ? (
        <p>
          <span className="text-muted-foreground">Descrição: </span>
          {prev!.description} → {next.description}
        </p>
      ) : null}
      {!prev ? (
        <p className="text-muted-foreground">
          Novo contrato: {formatContractAmount(next.amount_cents)} · {billingIntervalLabelPt(next.billing_interval)} ·{" "}
          {next.description}
        </p>
      ) : null}
      <div className="grid gap-1 pt-1 text-xs text-muted-foreground sm:grid-cols-2">
        {row.effective_at ? (
          <p>
            <span className="font-medium text-foreground/80">Vigência:</span>{" "}
            {contractEffectiveAtLabelPt(row.effective_at)}
          </p>
        ) : null}
        <p>
          <span className="font-medium text-foreground/80">Status:</span>{" "}
          {contractStatusLabelPt(row.status)}
        </p>
      </div>
      {row.reason?.trim() ? (
        <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
          <span className="font-medium text-foreground/80">Motivo:</span> {row.reason.trim()}
        </p>
      ) : null}
    </div>
  );
}

function HistoryCard({ row }: { row: CrmSubscriptionContractHistoryRow }) {
  return (
    <Card className="border shadow-sm md:hidden">
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium tabular-nums">{formatCreatedAt(row.created_at)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {row.actor_name?.trim() || "Sistema"}
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-normal">
            {contractChangeTypeLabelPt(row.change_type)}
          </Badge>
        </div>
        <HistoryEntryBody row={row} />
        <Badge variant={statusBadgeVariant(row.status)} className="text-[10px] font-normal">
          {contractStatusLabelPt(row.status)}
        </Badge>
      </CardContent>
    </Card>
  );
}

function HistoryTimelineItem({ row, isLast }: { row: CrmSubscriptionContractHistoryRow; isLast: boolean }) {
  return (
    <div className="relative hidden md:flex gap-4 pb-8">
      {!isLast ? (
        <span
          className="absolute left-[11px] top-6 bottom-0 w-px bg-border"
          aria-hidden
        />
      ) : null}
      <div className="relative z-[1] mt-1 h-6 w-6 shrink-0 rounded-full border-2 border-crm-primary/40 bg-background flex items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-crm-primary/70" />
      </div>
      <div className="flex-1 min-w-0 rounded-lg border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold tabular-nums">{formatCreatedAt(row.created_at)}</p>
            <p className="text-sm text-muted-foreground">{row.actor_name?.trim() || "Sistema"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs font-normal">
              {contractChangeTypeLabelPt(row.change_type)}
            </Badge>
            <Badge variant={statusBadgeVariant(row.status)} className="text-xs font-normal">
              {contractStatusLabelPt(row.status)}
            </Badge>
          </div>
        </div>
        <HistoryEntryBody row={row} />
      </div>
    </div>
  );
}

export function SubscriptionContractHistoryPanel({
  subscriptionId,
  refreshKey = 0,
}: {
  subscriptionId: string;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<CrmSubscriptionContractHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const history = await crmSubscriptionsService.getContractHistory(subscriptionId);
      setRows(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar histórico");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Carregando histórico…</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="py-12 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/30 border-b py-4">
          <CardTitle className="text-base font-medium">Histórico de alterações</CardTitle>
        </CardHeader>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma alteração de contrato registrada ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/30 border-b py-4">
        <CardTitle className="text-base font-medium">Histórico de alterações</CardTitle>
      </CardHeader>
      <CardContent className={cn("pt-6", "md:pt-8")}>
        <div className="md:hidden space-y-3">
          {rows.map((row) => (
            <HistoryCard key={row.id} row={row} />
          ))}
        </div>
        <div className="hidden md:block">
          {rows.map((row, idx) => (
            <HistoryTimelineItem key={row.id} row={row} isLast={idx === rows.length - 1} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
