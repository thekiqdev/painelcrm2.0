import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  crmSubscriptionsService,
  type CrmSubscriptionsAnalyticsPayload,
  type CrmSubscriptionListItem,
} from "@/services/crmSubscriptions";
import { toast } from "@/components/ui/sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowRight,
  CalendarClock,
  CalendarSync,
  Eye,
  EyeOff,
  Filter,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { cn } from "@/lib/utils";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ClientEntityLink } from "@/components/entities";
import { SubscriptionsPeriodFilter } from "@/components/subscriptions/SubscriptionsPeriodFilter";
import { SubscriptionsChartsPanel } from "@/components/subscriptions/SubscriptionsChartsPanel";
import { SubscriptionListCard } from "@/components/subscriptions/SubscriptionListCard";
import { SubscriptionActionsSheet } from "@/components/subscriptions/SubscriptionActionsSheet";
import {
  formatAmount,
  formatAmountPerMonth,
  formatAmountPerYear,
  formatYmdBr,
  HIDE_ENDED_STORAGE_KEY,
  intervalLabel,
  isSubscriptionEnded,
  matchesSubscriptionSearch,
  matchesSubscriptionStatusFilter,
  monthLabel,
  readStoredHideEnded,
  subscriptionStatusUi,
  type SubscriptionStatusFilter,
} from "@/components/subscriptions/subscriptionsListUtils";

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-0.5 px-0.5">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function KpiCard({
  title,
  value,
  loading,
  className,
  valueClassName,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  loading: boolean;
  className?: string;
  valueClassName?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardHeader className="pb-1.5 pt-3 px-3 md:px-6 md:pt-6 md:pb-2">
        <CardTitle className="text-[11px] md:text-xs font-medium text-muted-foreground flex items-center gap-1">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
        <div className={cn("text-xl md:text-2xl font-semibold tabular-nums", valueClassName)}>
          {loading ? "…" : value}
        </div>
      </CardContent>
    </Card>
  );
}

const SubscriptionsList = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasPermissionKey, loading: permLoading } = useModulePermissions();
  const canCreateInvoice = hasPermissionKey("billing.create_invoice") && !permLoading;
  const canEditSubscription = hasPermissionKey("billing.edit_subscription") && !permLoading;
  const canCancelSubscription = hasPermissionKey("billing.cancel_subscription") && !permLoading;
  const canViewInvoices = hasPermissionKey("billing.view_invoices") && !permLoading;

  const [rows, setRows] = useState<CrmSubscriptionListItem[]>([]);
  const [analytics, setAnalytics] = useState<CrmSubscriptionsAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [hideEnded, setHideEnded] = useState<boolean>(readStoredHideEnded);
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatusFilter>("all");
  const [search, setSearch] = useState("");

  const [preset, setPreset] = useState("current_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [sheetRow, setSheetRow] = useState<CrmSubscriptionListItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_ENDED_STORAGE_KEY, hideEnded ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, [hideEnded]);

  const baseRows = useMemo(() => {
    let list = rows;
    if (hideEnded) {
      list = list.filter((r) => !isSubscriptionEnded(r));
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => matchesSubscriptionStatusFilter(r, statusFilter));
    }
    return list;
  }, [rows, hideEnded, statusFilter]);

  const displayedRows = useMemo(() => {
    const q = search.trim();
    if (!q) return baseRows;
    return baseRows.filter((r) => matchesSubscriptionSearch(r, q));
  }, [baseRows, search]);

  const endedCount = useMemo(() => rows.filter(isSubscriptionEnded).length, [rows]);

  const loadAnalytics = useCallback(async (params: { preset?: string; from?: string; to?: string }) => {
    try {
      setAnalyticsLoading(true);
      const data = await crmSubscriptionsService.getAnalytics(params);
      setAnalytics(data);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar métricas");
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
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

  const reloadAll = useCallback(
    (params: { preset?: string; from?: string; to?: string }) => {
      void loadList();
      void loadAnalytics(params);
    },
    [loadAnalytics, loadList]
  );

  useEffect(() => {
    if (preset === "custom") return;
    reloadAll({ preset });
  }, [preset, reloadAll]);

  const handlePresetChange = (next: string) => {
    if (next === "custom") {
      setPreset("custom");
      if (analytics?.period) {
        setFrom(analytics.period.from);
        setTo(analytics.period.to);
      }
      return;
    }
    setPreset(next);
  };

  const applyCustomRange = () => {
    if (!from.trim() || !to.trim()) {
      toast.error("Indique data inicial e final");
      return;
    }
    reloadAll({ from: from.trim(), to: to.trim() });
  };

  const openMobileSheet = (row: CrmSubscriptionListItem) => {
    setSheetRow(row);
    setSheetOpen(true);
  };

  const growthChartData = useMemo(
    () =>
      (analytics?.growth_by_month ?? []).map((m) => ({
        name: monthLabel(m.month),
        novas: m.new_count,
        canceladas: m.cancelled_count,
      })),
    [analytics?.growth_by_month]
  );

  const intervalChartData = useMemo(
    () =>
      (analytics?.by_interval ?? []).map((b) => ({
        name: b.label_pt,
        assinaturas: b.count,
        mrr: b.mrr_cents / 100,
      })),
    [analytics?.by_interval]
  );

  const topClientsChartData = useMemo(
    () =>
      (analytics?.top_clients ?? []).map((c) => ({
        name: c.client_name.length > 22 ? `${c.client_name.slice(0, 20)}…` : c.client_name,
        mrr: c.mrr_cents / 100,
      })),
    [analytics?.top_clients]
  );

  const projection12ChartData = useMemo(
    () =>
      (analytics?.projection_12m?.by_month ?? []).map((m) => ({
        name: monthLabel(m.month),
        prevista: (m.subscription_revenue_pending ?? 0) + (m.subscription_revenue_projected ?? 0),
      })),
    [analytics?.projection_12m?.by_month]
  );

  const lastPaymentRelative = analytics?.last_payment?.paid_at
    ? formatDistanceToNow(new Date(analytics.last_payment.paid_at), { addSuffix: true, locale: ptBR })
    : null;

  const chartsPanel = (
    <SubscriptionsChartsPanel
      growthChartData={growthChartData}
      intervalChartData={intervalChartData}
      topClientsChartData={topClientsChartData}
      projection12ChartData={projection12ChartData}
      layout={isMobile ? "carousel" : "grid"}
    />
  );

  const listToolbar = (
    <div className="flex flex-col gap-2 w-full md:w-auto">
      <div className="flex flex-wrap items-center gap-2 w-full">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: "all", label: "Todos" },
              { key: "active", label: "Ativas" },
              { key: "paused", label: "Pausadas" },
              { key: "cancelled", label: "Canceladas" },
            ] as const
          ).map((opt) => (
            <Button
              key={opt.key}
              type="button"
              size="sm"
              variant={statusFilter === opt.key ? "secondary" : "outline"}
              className="h-8 text-xs"
              onClick={() => setStatusFilter(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 w-full">
      <div className="relative flex-1 min-w-[140px] md:min-w-[200px] md:max-w-[280px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente, plano…"
          className="h-9 pl-9 pr-3"
          aria-label="Buscar assinaturas"
        />
      </div>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={hideEnded ? "secondary" : "outline"}
              size="sm"
              className={cn("gap-2 shrink-0 h-9", hideEnded && "border-transparent")}
              onClick={() => setHideEnded((v) => !v)}
              aria-pressed={hideEnded}
            >
              {hideEnded ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              <span className="hidden sm:inline">{hideEnded ? "Mostrar encerradas" : "Ocultar encerradas"}</span>
              <span className="sm:hidden sr-only">{hideEnded ? "Mostrar encerradas" : "Ocultar encerradas"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            Preferência guardada neste navegador.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {hideEnded && endedCount > 0 && (
        <span className="text-xs text-muted-foreground w-full md:w-auto">
          {endedCount} encerrada{endedCount !== 1 ? "s" : ""} oculta{endedCount !== 1 ? "s" : ""}
        </span>
      )}
      </div>
    </div>
  );

  const listEmpty = (message: React.ReactNode) => (
    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );

  const listContentMobile = loading ? (
    listEmpty("Carregando…")
  ) : rows.length === 0 ? (
    listEmpty("Nenhuma assinatura ainda. Crie uma fatura recorrente para gerar a primeira assinatura.")
  ) : baseRows.length === 0 ? (
    listEmpty(
      <>
        <p className="font-medium text-foreground mb-1">Só há assinaturas encerradas</p>
        <p className="text-sm">Ative <strong className="text-foreground">Mostrar encerradas</strong> nos filtros.</p>
      </>
    )
  ) : displayedRows.length === 0 ? (
    listEmpty(
      <>
        <p className="font-medium text-foreground mb-1">Nenhum resultado</p>
        <p className="text-sm">Nenhuma assinatura corresponde a &quot;{search.trim()}&quot;.</p>
      </>
    )
  ) : (
    <div className="space-y-3">
      {displayedRows.map((row) => (
        <SubscriptionListCard key={row.id} row={row} onOpen={openMobileSheet} />
      ))}
    </div>
  );

  const listContentDesktop = (
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
          ) : baseRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Só há assinaturas encerradas</p>
                <p className="text-sm max-w-md mx-auto">Ative <strong className="text-foreground">Mostrar encerradas</strong> nos filtros acima.</p>
              </TableCell>
            </TableRow>
          ) : displayedRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Nenhum resultado</p>
                <p className="text-sm max-w-md mx-auto">
                  Nenhuma assinatura corresponde a &quot;{search.trim()}&quot;.
                </p>
              </TableCell>
            </TableRow>
          ) : (
            displayedRows.map((row) => {
              const st = subscriptionStatusUi(row);
              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer group"
                  onClick={() => navigate(`/crm-subscriptions/${row.id}`)}
                >
                  <TableCell className="font-medium">
                    {row.client_id ? (
                      <ClientEntityLink
                        clientId={row.client_id}
                        name={row.client_name}
                        variant="table"
                        stopPropagationOnClick
                        disabledFallbackText="Abrir cliente"
                      />
                    ) : row.link_checkout ? (
                      <Badge variant="secondary" className="font-normal">
                        Por link
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Sem cliente vinculado</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {row.plan_label?.trim() || `Assinatura · ${intervalLabel(row.billing_interval)}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(row.amount_cents)}</TableCell>
                  <TableCell className="tabular-nums text-sm">{formatYmdBr(row.next_billing_date)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={st.variant}
                      className={cn(
                        st.variant === "default" && "bg-crm-primary/12 text-crm-primary border-crm-primary/25",
                        row.status === "paused" && "bg-amber-500/12 text-amber-800 border-amber-500/30 dark:text-amber-300"
                      )}
                    >
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
  );

  return (
    <div className="space-y-4 md:space-y-6 max-w-[1280px] pb-6">
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
            Visão gerencial da receita recorrente e acompanhamento operacional das cobranças automáticas por cliente.
          </p>
        </div>
        {canCreateInvoice ? (
          <Button variant="outline" asChild className="shrink-0">
            <Link to="/customer-invoices/new">Nova fatura ou assinatura</Link>
          </Button>
        ) : null}
      </div>

      <SubscriptionsPeriodFilter
        preset={preset}
        from={from}
        to={to}
        period={analytics?.period}
        onPresetChange={handlePresetChange}
        onFromChange={setFrom}
        onToChange={setTo}
        onApplyCustom={applyCustomRange}
      />

      {/* Resumo atual */}
      <section className="space-y-2.5">
        <SectionHeader title="Resumo atual" description="Snapshot da base ativa — não varia com o período." />
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
          <KpiCard
            title="MRR atual"
            loading={analyticsLoading}
            value={formatAmountPerMonth(analytics?.mrr_cents ?? 0)}
            className="border-violet-500/25 bg-gradient-to-br from-card to-violet-500/5"
          />
          <KpiCard
            title="MRR após mudanças agendadas"
            loading={analyticsLoading}
            value={formatAmountPerMonth(analytics?.mrr_after_pending_cents ?? analytics?.mrr_cents ?? 0)}
            className="border-indigo-500/25 bg-gradient-to-br from-card to-indigo-500/5"
          />
          <KpiCard
            title="Variação prevista"
            loading={analyticsLoading}
            value={
              <>
                {(analytics?.mrr_pending_delta_cents ?? 0) >= 0 ? "+" : ""}
                {formatAmountPerMonth(Math.abs(analytics?.mrr_pending_delta_cents ?? 0))}
              </>
            }
            valueClassName={
              (analytics?.mrr_pending_delta_cents ?? 0) >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            }
            icon={
              (analytics?.mrr_pending_delta_cents ?? 0) >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
              )
            }
          />
          <KpiCard
            title="ARR"
            loading={analyticsLoading}
            value={formatAmountPerYear(analytics?.arr_cents ?? 0)}
            className="border-sky-500/20 bg-gradient-to-br from-card to-sky-500/5"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
          <KpiCard
            title="Assinaturas ativas"
            loading={analyticsLoading}
            value={analytics?.active_count ?? 0}
            className="border-emerald-500/20 bg-gradient-to-br from-card to-emerald-500/5"
          />
          <KpiCard
            title="Assinaturas pausadas"
            loading={analyticsLoading}
            value={analytics?.paused_count ?? 0}
            className="border-amber-500/20 bg-gradient-to-br from-card to-amber-500/5"
          />
          <KpiCard
            title="MRR pausado"
            loading={analyticsLoading}
            value={formatAmountPerMonth(analytics?.paused_mrr_cents ?? 0)}
            className="border-amber-500/15 bg-gradient-to-br from-card to-amber-500/5"
          />
          <KpiCard
            title="Ticket médio (MRR)"
            loading={analyticsLoading}
            value={formatAmount(analytics?.average_ticket_cents ?? 0)}
            className="border-sky-500/20 bg-gradient-to-br from-card to-sky-500/5"
          />
        </div>
      </section>

      {/* Movimento no período */}
      <section className="space-y-2.5">
        <SectionHeader title="Movimento no período" description="Novas assinaturas e cancelamentos no intervalo selecionado." />
        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
          <KpiCard
            title="Novas no período"
            loading={analyticsLoading}
            value={`+${analytics?.new_count ?? 0}`}
            valueClassName="text-emerald-700 dark:text-emerald-400"
            icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
          />
          <KpiCard
            title="Canceladas"
            loading={analyticsLoading}
            value={`-${analytics?.cancelled_count ?? 0}`}
            valueClassName="text-rose-700 dark:text-rose-400"
            icon={<TrendingDown className="h-3.5 w-3.5 text-rose-600" />}
          />
          <KpiCard
            title="Crescimento líquido"
            loading={analyticsLoading}
            value={`${(analytics?.net_growth ?? 0) >= 0 ? "+" : ""}${analytics?.net_growth ?? 0}`}
            valueClassName={
              (analytics?.net_growth ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }
          />
          <KpiCard
            title="Recebimentos próx. 7 dias"
            loading={analyticsLoading}
            value={formatAmount(analytics?.upcoming_7d_cents ?? 0)}
            className="border-amber-500/20"
            icon={<CalendarClock className="h-3.5 w-3.5" />}
          />
        </div>
      </section>

      {/* Último pagamento + Projeção anual */}
      <section className="grid gap-2 md:gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <SectionHeader title="Último pagamento" />
          <Card className="border shadow-sm h-[calc(100%-1.75rem)]">
            <CardContent className="pt-4 md:pt-6">
              {analyticsLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : analytics?.last_payment ? (
                <div>
                  <p className="font-medium">{analytics.last_payment.client_name}</p>
                  <p className="text-lg font-semibold tabular-nums mt-1">
                    {formatAmount(analytics.last_payment.amount_cents)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{lastPaymentRelative}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum pagamento de assinatura registado ainda.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-2">
          <SectionHeader title="Projeção anual" description="Próximos 12 meses — independente do filtro." />
          <Card className="border-violet-500/15 shadow-sm h-[calc(100%-1.75rem)]">
            <CardHeader className="pb-2 pt-4 md:pt-6">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-violet-600" />
                Receita prevista
              </CardTitle>
              <CardDescription className="text-xs">Pendente + ciclos projetados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">
                {analyticsLoading ? "…" : formatAmount(analytics?.annual_projection_cents ?? 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Gráficos — mobile accordion (fechado) / desktop aberto */}
      {isMobile ? (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Accordion type="single" collapsible defaultValue="">
            <AccordionItem value="charts" className="border-0 px-3">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3.5">
                Gráficos e análises avançadas
              </AccordionTrigger>
              <AccordionContent className="pb-4">{chartsPanel}</AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      ) : (
        <section className="space-y-3">
          <SectionHeader title="Gráficos e análises avançadas" />
          {chartsPanel}
        </section>
      )}

      {/* Lista — mobile accordion (fechado) / desktop aberto */}
      {isMobile ? (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Accordion type="single" collapsible defaultValue="">
            <AccordionItem value="list" className="border-0 px-3">
              <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3.5">
                <span className="flex items-center gap-2">
                  Lista de assinaturas
                  {!loading && displayedRows.length > 0 ? (
                    <Badge variant="secondary" className="font-normal text-[10px] px-1.5 py-0">
                      {displayedRows.length}
                    </Badge>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-3">
                {listToolbar}
                {listContentMobile}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeader title="Lista de assinaturas" description="Acompanhamento operacional por cliente." />
            <div className="rounded-xl border bg-card shadow-sm px-3 py-2 flex flex-wrap items-center gap-2 md:min-w-[min(100%,28rem)]">
              {listToolbar}
            </div>
          </div>
          {listContentDesktop}
        </section>
      )}

      <SubscriptionActionsSheet
        row={sheetRow}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        canCreateInvoice={canCreateInvoice}
        canEditSubscription={canEditSubscription}
        canCancelSubscription={canCancelSubscription}
        canViewInvoices={canViewInvoices}
      />
    </div>
  );
};

export default SubscriptionsList;
