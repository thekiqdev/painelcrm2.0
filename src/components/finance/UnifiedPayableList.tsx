import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinancialPayableItemDto } from "@/services/financial";
import type { PayableOperationalStatusDto } from "@/services/financial";
import { cn } from "@/lib/utils";
import { CheckCircle2, Layers, Pencil, Repeat, Wallet } from "lucide-react";
import {
  type GroupedPayableQueue,
  type PayableQueueBucket,
  sumCents,
} from "@/components/finance/accountsPayableGrouping";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";

const BUCKET_META: Record<
  PayableQueueBucket,
  { title: string; accent: string; rowAccent?: string }
> = {
  overdue: {
    title: "Vencidas",
    accent: "text-destructive",
    rowAccent: "border-l-4 border-l-destructive bg-destructive/[0.03]",
  },
  today: {
    title: "Vence hoje",
    accent: "text-orange-600 dark:text-orange-400",
    rowAccent: "border-l-4 border-l-orange-500 bg-orange-500/[0.04]",
  },
  this_week: {
    title: "Esta semana",
    accent: "text-foreground",
    rowAccent: "border-l-4 border-l-muted-foreground/40",
  },
  later: {
    title: "Próximas",
    accent: "text-muted-foreground",
    rowAccent: "border-l-transparent",
  },
};

const BUCKET_ORDER: PayableQueueBucket[] = ["overdue", "today", "this_week", "later"];

export function UnifiedPayableList(props: {
  grouped: GroupedPayableQueue;
  isDesktop: boolean;
  formatBrlCents: (cents: number) => string;
  statusLabel: (s: PayableOperationalStatusDto) => string;
  statusBadgeClass: (s: PayableOperationalStatusDto) => string;
  periodicityOf: (it: FinancialPayableItemDto) => string | null;
  onDetail: (it: FinancialPayableItemDto) => void;
  onPay: (it: FinancialPayableItemDto) => void;
  onEdit: (it: FinancialPayableItemDto) => void;
}) {
  const {
    grouped,
    isDesktop,
    formatBrlCents,
    statusLabel,
    statusBadgeClass,
    periodicityOf,
    onDetail,
    onPay,
    onEdit,
  } = props;

  const totalQueue = BUCKET_ORDER.reduce((s, k) => s + grouped[k].length, 0);

  if (totalQueue === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhuma conta em aberto com estes filtros.
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div className="space-y-6">
        {BUCKET_ORDER.map((bucket) => {
          const items = grouped[bucket];
          if (items.length === 0) return null;
          const meta = BUCKET_META[bucket];
          const subtotal = sumCents(items);
          return (
            <div key={bucket} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                <h4 className={cn("text-sm font-semibold tracking-tight", meta.accent)}>{meta.title}</h4>
                <p className="text-xs tabular-nums text-muted-foreground">
                  Total: <span className="font-medium text-foreground">{formatBrlCents(subtotal)}</span> · {items.length}{" "}
                  item(ns)
                </p>
              </div>
              <div className="rounded-md border border-border/80 overflow-x-auto bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="whitespace-nowrap">Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Conta</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acções</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={`${it.source}-${it.id}`} className={cn(meta.rowAccent)}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateOnlyPtBr(it.due_date)}</TableCell>
                        <TableCell className="font-medium max-w-[220px] truncate">{it.description}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{it.category_name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatBrlCents(it.amount_cents)}</TableCell>
                        <TableCell>
                          {it.source === "recurring_occurrence" ? (
                            <Badge variant="outline" className="gap-1 font-normal">
                              <Repeat className="h-3 w-3" />
                              Recorrente
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 font-normal">
                              <Layers className="h-3 w-3" />
                              Avulsa
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">{it.payment_account_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("font-normal", statusBadgeClass(it.operational_status))}>
                            {statusLabel(it.operational_status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1 whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => onDetail(it)}>
                            Ver
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                            onClick={() => onPay(it)}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1" />
                            Pagar
                          </Button>
                          {it.source === "expense_transaction" ? (
                            <Button variant="outline" size="sm" onClick={() => onEdit(it)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Editar
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ul className="space-y-8">
      {BUCKET_ORDER.map((bucket) => {
        const items = grouped[bucket];
        if (items.length === 0) return null;
        const meta = BUCKET_META[bucket];
        const subtotal = sumCents(items);
        return (
          <li key={bucket} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
              <h4 className={cn("text-sm font-semibold", meta.accent)}>{meta.title}</h4>
              <p className="text-xs tabular-nums text-muted-foreground">
                Total: <span className="font-medium text-foreground">{formatBrlCents(subtotal)}</span>
              </p>
            </div>
            <ul className="space-y-3">
              {items.map((it) => (
                <li
                  key={`${it.source}-${it.id}`}
                  className={cn(
                    "rounded-xl border bg-card p-4 shadow-sm",
                    bucket === "overdue" && "border-destructive/50 bg-destructive/[0.05]",
                    bucket === "today" && "border-orange-500/45 bg-orange-500/[0.07]",
                    bucket === "this_week" && "border-border/80",
                    bucket === "later" && "border-border/80"
                  )}
                >
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{it.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">Venc. {formatDateOnlyPtBr(it.due_date)}</p>
                    </div>
                    <p className="text-lg font-bold tabular-nums shrink-0 text-foreground">{formatBrlCents(it.amount_cents)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary" className={cn("font-normal", statusBadgeClass(it.operational_status))}>
                      {statusLabel(it.operational_status)}
                    </Badge>
                    {it.source === "recurring_occurrence" ? (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Repeat className="h-3 w-3" />
                        Recorrente
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Layers className="h-3 w-3" />
                        Avulsa
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {it.category_name ?? "Sem categoria"}
                    {it.payment_account_name ? <> · {it.payment_account_name}</> : null}
                  </p>
                  {it.source === "recurring_occurrence" && periodicityOf(it) ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Regra: {periodicityOf(it)}</p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="h-11" onClick={() => onDetail(it)}>
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      className="h-11 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                      onClick={() => onPay(it)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5 shrink-0" />
                      Pagar
                    </Button>
                  </div>
                  {it.source === "expense_transaction" ? (
                    <Button variant="ghost" size="sm" className="mt-2 h-10 w-full text-muted-foreground" onClick={() => onEdit(it)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
