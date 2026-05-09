import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { crmSubscriptionsService, type CrmSubscriptionListItem } from "@/services/crmSubscriptions";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarSync, CheckCircle2, Eye, EyeOff, Filter, Plus, Wallet } from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { cn } from "@/lib/utils";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";

const HIDE_ENDED_STORAGE_KEY = "crm_subscriptions_hide_ended";

function readStoredHideEnded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(HIDE_ENDED_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function isSubscriptionEnded(row: CrmSubscriptionListItem): boolean {
  return row.status === "cancelled";
}

function isProblemStatus(status: string): boolean {
  const s = (status || "").trim().toLowerCase();
  return s === "overdue" || s === "failed" || s === "pending" || s === "waiting_payment" || s === "processing";
}

function parseYmdDate(value: string | null | undefined): Date | null {
  if (!value || value.length < 10) return null;
  const ymd = value.slice(0, 10);
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function intervalLabel(interval: string): string {
  const m: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semi_annual: "Semestral",
    yearly: "Anual",
  };
  return m[interval] ?? interval;
}

function subscriptionStatusUi(row: CrmSubscriptionListItem): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (row.status === "cancelled") return { label: "Encerrada", variant: "secondary" };
  if (row.status !== "active") return { label: row.status, variant: "outline" };
  if (row.cancel_at_period_end) return { label: "Encerra ao fim do período", variant: "outline" };
  return { label: "Ativa", variant: "default" };
}

const SubscriptionsList = () => {
  const navigate = useNavigate();
  const { hasPermissionKey, loading: permLoading } = useModulePermissions();
  const canCreateInvoice = hasPermissionKey("billing.create_invoice") && !permLoading;
  const [rows, setRows] = useState<CrmSubscriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideEnded, setHideEnded] = useState<boolean>(readStoredHideEnded);

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_ENDED_STORAGE_KEY, hideEnded ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [hideEnded]);

  const displayedRows = useMemo(() => {
    if (!hideEnded) return rows;
    return rows.filter((r) => !isSubscriptionEnded(r));
  }, [rows, hideEnded]);

  const summary = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    let activeCount = 0;
    let endedCountLocal = 0;
    let pendingOrFailedCount = 0;
    let upcoming7DaysCount = 0;
    let recurringRevenueCents = 0;

    for (const row of rows) {
      const ended = isSubscriptionEnded(row);
      if (ended) {
        endedCountLocal += 1;
      } else {
        activeCount += 1;
        recurringRevenueCents += Number(row.amount_cents || 0);
        const next = parseYmdDate(row.next_billing_date);
        if (next && next >= start && next <= end) {
          upcoming7DaysCount += 1;
        }
      }

      if (isProblemStatus(row.status)) {
        pendingOrFailedCount += 1;
      }
    }

    return {
      activeCount,
      endedCount: endedCountLocal,
      pendingOrFailedCount,
      upcoming7DaysCount,
      recurringRevenueCents,
    };
  }, [rows]);

  const endedCount = useMemo(() => rows.filter(isSubscriptionEnded).length, [rows]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await crmSubscriptionsService.list();
      setRows(data);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar assinaturas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title="Assinaturas"
          secondaryActions={[
            {
              icon: hideEnded ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />,
              ariaLabel: hideEnded ? "Mostrar assinaturas encerradas" : "Ocultar assinaturas encerradas",
              onClick: () => setHideEnded((v) => !v),
            },
          ]}
          primaryAction={
            canCreateInvoice
              ? {
                  label: "Nova cobrança",
                  icon: <Plus className="h-4 w-4" aria-hidden />,
                  href: "/customer-invoices/new",
                }
              : undefined
          }
        />
      </div>

      <div className="hidden md:flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CalendarSync className="h-4 w-4" />
            <span>Financeiro</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Assinaturas</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cobranças automáticas por cliente: valor, periodicidade e próxima data. O histórico de faturas fica no detalhe
            de cada assinatura.
          </p>
        </div>
        {canCreateInvoice ? (
          <Button variant="outline" asChild className="shrink-0">
            <Link to="/customer-invoices/new">Nova fatura ou assinatura</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="border-emerald-500/20 bg-gradient-to-br from-card to-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Assinaturas ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{summary.activeCount}</div>
          </CardContent>
        </Card>

        <Card className="border-violet-500/20 bg-gradient-to-br from-card to-violet-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-violet-600" />
              Receita recorrente prevista
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{formatAmount(summary.recurringRevenueCents)}</div>
          </CardContent>
        </Card>

        <Card className="border-sky-500/20 bg-gradient-to-br from-card to-sky-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-sky-600" />
              Próximas cobranças (7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{summary.upcoming7DaysCount}</div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-gradient-to-br from-card to-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5" />
              Assinaturas encerradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{summary.endedCount}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-gradient-to-br from-card to-amber-500/10 col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Em atraso / falha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{summary.pendingOrFailedCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border bg-card shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
          <Filter className="h-4 w-4" aria-hidden />
          <span>Filtros</span>
        </div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={hideEnded ? "secondary" : "outline"}
                size="sm"
                className={cn("gap-2 shrink-0", hideEnded && "border-transparent")}
                onClick={() => setHideEnded((v) => !v)}
                aria-pressed={hideEnded}
                aria-label={hideEnded ? "Mostrar assinaturas encerradas" : "Ocultar assinaturas encerradas"}
              >
                {hideEnded ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
                <span>{hideEnded ? "Mostrar encerradas" : "Ocultar encerradas"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {hideEnded
                ? "Assinaturas encerradas estão ocultas. Clique para exibir (a preferência fica guardada neste navegador)."
                : "Todas as assinaturas visíveis. Clique para ocultar as encerradas."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {hideEnded && endedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {endedCount} encerrada{endedCount !== 1 ? "s" : ""} oculta{endedCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/40">
              <TableHead>Cliente</TableHead>
              <TableHead>Plano / descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Próxima cobrança</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-[140px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Nenhuma assinatura ainda. Crie uma fatura recorrente para gerar a primeira assinatura.
                </TableCell>
              </TableRow>
            ) : displayedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Só há assinaturas encerradas</p>
                  <p className="text-sm max-w-md mx-auto">
                    Ative <strong className="text-foreground">Mostrar encerradas</strong> nos filtros acima para vê-las
                    (a opção é lembrada neste navegador).
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              displayedRows.map((row) => {
                const st = subscriptionStatusUi(row);
                const next = row.next_billing_date?.slice(0, 10);
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer group"
                    onClick={() => navigate(`/crm-subscriptions/${row.id}`)}
                  >
                    <TableCell className="font-medium">
                      {row.client_name ?? (row.client_id ? "Cliente" : "Sem cliente")}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2 text-sm text-muted-foreground">
                        {row.plan_label?.trim() || `Assinatura · ${intervalLabel(row.billing_interval)}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(row.amount_cents)}</TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {next
                        ? format(new Date(`${next}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant} className={cn(st.variant === "default" && "bg-crm-primary/12 text-crm-primary border-crm-primary/25")}>
                        {st.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="gap-1" asChild>
                        <Link to={`/crm-subscriptions/${row.id}`}>
                          <Eye className="h-4 w-4" />
                          Abrir
                          <ArrowRight className="h-3 w-3 opacity-60" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SubscriptionsList;
