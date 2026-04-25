import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CreditCard,
  DollarSign,
  FileSignature,
  FileText,
  MessageSquare,
  Target,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { dashboardService, type DashboardOverviewResponse } from "@/services/dashboard";
import { toast } from "@/components/ui/sonner";
import { DashboardActivationBlock } from "@/components/dashboard/DashboardActivationBlock";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const axisTickProps = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
type PeriodPreset = "current_month" | "last_month" | "ytd";

const Dashboard = () => {
  const { user } = useAuth();
  const { canView } = useModulePermissions();
  const hasClients = useFeatureFlag("clients");
  const hasInvoices = useFeatureFlag("invoices");
  const hasProposals = useFeatureFlag("proposals");
  const hasContracts = useFeatureFlag("contracts");
  const hasChat = useFeatureFlag("chat");
  const hasDashboard = useFeatureFlag("dashboard");
  const hasExpenses = useFeatureFlag("expenses");
  const hasLeads = useFeatureFlag("leads");
  const hasTickets = useFeatureFlag("tickets");
  const hasTasks = useFeatureFlag("tasks");
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const trialEndsAt =
    user?.tenant_status === 'trial' && user?.trial_ends_at
      ? new Date(user.trial_ends_at)
      : null;
  const trialActive = trialEndsAt != null && !Number.isNaN(trialEndsAt.getTime()) && trialEndsAt.getTime() > Date.now();

  const { data, isPending, error } = useQuery({
    queryKey: ["dashboard-overview", preset],
    queryFn: () => dashboardService.getOverview({ preset }),
  });

  const overview = data ?? null;

  useEffect(() => {
    if (error) toast.error("Erro ao carregar dados do dashboard");
  }, [error]);

  const monthLabel = (ym: string): string => {
    const [y, m] = ym.split("-");
    const idx = Math.max(0, Math.min(11, parseInt(m ?? "1", 10) - 1));
    const short = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][idx];
    return `${short}/${y ?? ""}`;
  };

  const chartRows = useMemo(() => {
    if (!overview?.monthly?.length) return [];
    return overview.monthly.map((m) => {
      const totalPotential = m.revenue_received + m.revenue_projected;
      const expenseTotal = m.expenses_paid + m.expenses_projected;
      return {
        name: monthLabel(m.month),
        receita_recebida: m.revenue_received,
        receita_futura: m.revenue_projected,
        receita_total_potencial: totalPotential,
        despesas_pagas: m.expenses_paid,
        despesas_futuras: m.expenses_projected,
        despesas_totais: expenseTotal,
        resultado_previsto: totalPotential - expenseTotal,
      };
    });
  }, [overview]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };
  const formatPct = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

  const show = (feature: boolean, moduleId: string) => feature && canView(moduleId);
  const mobileShortcuts = [
    show(hasInvoices, "billing")
      ? { label: "Nova cobrança", to: "/customer-invoices/new", icon: FileText, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-200" }
      : null,
    show(hasInvoices, "billing")
      ? { label: "Cobranças", to: "/customer-charges", icon: CreditCard, tone: "bg-sky-500/10 text-sky-800 dark:text-sky-200" }
      : null,
    show(hasClients, "clients")
      ? { label: "Clientes", to: "/clients", icon: UserPlus, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" }
      : null,
    show(hasProposals, "proposals")
      ? { label: "Nova proposta", to: "/proposals/new", icon: FileText, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-200" }
      : null,
    show(hasContracts, "contracts")
      ? { label: "Novo contrato", to: "/contracts/new", icon: FileSignature, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-200" }
      : null,
    show(hasChat, "chat")
      ? { label: "Chat", to: "/chat", icon: MessageSquare, tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-200" }
      : null,
    show(hasExpenses, "finance")
      ? { label: "Financeiro", to: "/finance", icon: DollarSign, tone: "bg-teal-500/10 text-teal-700 dark:text-teal-200" }
      : show(hasDashboard, "dashboard")
        ? { label: "Métricas", to: "/dashboard", icon: DollarSign, tone: "bg-teal-500/10 text-teal-700 dark:text-teal-200" }
        : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="space-y-6">
      {mobileShortcuts.length > 0 ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Atalhos rápidos</h2>
            <span className="shrink-0 text-xs text-muted-foreground">Ações frequentes</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {mobileShortcuts.map((shortcut) => (
              <Link
                key={shortcut.label}
                to={shortcut.to}
                className="group min-h-[4.5rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98] md:hover:-translate-y-0.5 md:hover:shadow-md"
              >
                <div className={`inline-flex rounded-xl p-2 ${shortcut.tone}`}>
                  <shortcut.icon className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-2 text-sm font-medium leading-snug">{shortcut.label}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {overview && show(hasDashboard, "dashboard") ? (
        <section className="space-y-3 md:hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold tracking-tight">Indicadores do período</h2>
            <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
              <SelectTrigger className="h-9 w-full sm:w-[11rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="ytd">Ano atual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
              <p className="text-xs text-muted-foreground">Receita recebida</p>
              <p className="mt-1 text-lg font-semibold tabular-nums leading-tight">
                {formatCurrency(overview.sales.received_revenue)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatPct(overview.sales.received_revenue_change_pct)} vs anterior</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
              <p className="text-xs text-muted-foreground">Receita futura</p>
              <p className="mt-1 text-lg font-semibold tabular-nums leading-tight">
                {formatCurrency(overview.sales.future_revenue)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">A receber</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
              <p className="text-xs text-muted-foreground">Conversão</p>
              <p className="mt-1 text-lg font-semibold tabular-nums leading-tight">
                {(overview.sales.conversion_rate ?? 0).toFixed(1)}%
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatPct(overview.sales.conversion_rate_change_pct)} vs anterior</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
              <p className="text-xs text-muted-foreground">Ticket médio</p>
              <p className="mt-1 text-lg font-semibold tabular-nums leading-tight">
                {overview.sales.average_ticket != null ? formatCurrency(overview.sales.average_ticket) : "—"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Vendas pagas</p>
            </div>
          </div>
        </section>
      ) : null}

      {overview &&
      (show(hasLeads, "leads") || show(hasTickets, "tickets") || show(hasTasks, "tasks")) ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Resumo operacional</h2>
            <span className="shrink-0 text-xs text-muted-foreground">Pendências</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {show(hasLeads, "leads") ? (
              <Link
                to="/leads"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Leads sem resposta</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{overview.operations.leads_without_response}</p>
              </Link>
            ) : null}
            {show(hasTickets, "tickets") ? (
              <Link
                to="/support/tickets"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Tickets abertos</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{overview.operations.open_tickets}</p>
              </Link>
            ) : null}
            {show(hasTasks, "tasks") ? (
              <Link
                to="/tasks"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Tarefas vencidas</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{overview.operations.overdue_tasks}</p>
              </Link>
            ) : null}
            {show(hasTasks, "tasks") ? (
              <Link
                to="/tasks"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Vencem hoje</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{overview.operations.today_tasks}</p>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {overview && (show(hasClients, "clients") || show(hasInvoices, "billing")) ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Clientes e cobranças</h2>
            <span className="shrink-0 text-xs text-muted-foreground">Base</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {show(hasClients, "clients") ? (
              <Link
                to="/clients"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Clientes ativos</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{overview.clients.active_clients}</p>
              </Link>
            ) : null}
            {show(hasInvoices, "billing") ? (
              <Link
                to="/customer-invoices?status=overdue"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Com fatura vencida</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{overview.clients.clients_with_overdue_invoices}</p>
              </Link>
            ) : null}
            {show(hasInvoices, "billing") ? (
              <Link
                to="/crm-subscriptions"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Assinaturas ativas</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{overview.clients.active_subscriptions}</p>
              </Link>
            ) : null}
            {show(hasChat, "chat") ? (
              <Link
                to="/chat"
                className="min-h-[4.25rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98]"
              >
                <p className="text-xs text-muted-foreground">Mensagens</p>
                <p className="mt-1 text-sm font-medium leading-snug">Abrir chat</p>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {trialActive && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p className="font-medium">Período de avaliação ativo</p>
          <p className="mt-1 text-muted-foreground dark:text-amber-200/90">
            Acesso de trial até{' '}
            <strong>{trialEndsAt!.toLocaleDateString('pt-BR')}</strong>. Após essa data será necessário concluir o
            pagamento para continuar usando o sistema.{' '}
            <Link to="/meu-plano" className="underline font-medium text-foreground">
              Plano e pagamento
            </Link>
          </p>
        </div>
      )}
      <DashboardActivationBlock />

      <div className="hidden gap-3 md:flex md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold">Dashboard Executivo</h1>
        <div className="flex gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Este mês</SelectItem>
              <SelectItem value="last_month">Mês passado</SelectItem>
              <SelectItem value="ytd">Ano atual</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">Exportar</Button>
        </div>
      </div>

      {/* Linha principal */}
      <div className="hidden gap-6 md:grid md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-600" />Receita recebida</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(overview?.sales.received_revenue ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatPct(overview?.sales.received_revenue_change_pct ?? 0)} vs período anterior · <Link to="/customer-invoices" className="underline">Ver faturas</Link>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-600" />Receita futura</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(overview?.sales.future_revenue ?? 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Assinaturas e cobranças ainda não pagas · <Link to="/crm-subscriptions" className="underline">Assinaturas</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><Target className="h-4 w-4 text-sky-600" />Taxa de conversão</CardDescription>
            <CardTitle className="text-2xl">{(overview?.sales.conversion_rate ?? 0).toFixed(1)}%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatPct(overview?.sales.conversion_rate_change_pct ?? 0)} vs período anterior
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-amber-600" />Ticket médio</CardDescription>
            <CardTitle className="text-2xl">
              {overview?.sales.average_ticket != null ? formatCurrency(overview.sales.average_ticket) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Receita recebida / vendas pagas.</CardContent>
        </Card>
      </div>

      {/* Gráfico receita vs prevista e funil */}
      <div className="hidden gap-6 md:grid md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receita realizada vs prevista</CardTitle>
            <CardDescription>Visão consolidada mensal para decisão</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="name" tick={axisTickProps} />
                  <YAxis tick={axisTickProps} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(Number(value)), name]}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as any;
                      return (
                        <div className="rounded-md border bg-background p-3 text-xs shadow-sm space-y-1">
                          <p className="font-medium">{label}</p>
                          <p>Receita recebida: {formatCurrency(row.receita_recebida)}</p>
                          <p>Receita futura: {formatCurrency(row.receita_futura)}</p>
                          <p>Total potencial: {formatCurrency(row.receita_total_potencial)}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Bar dataKey="receita_recebida" stackId="r" fill="hsl(142 76% 36%)" name="Receita recebida" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="receita_futura" stackId="r" fill="hsl(142 55% 62%)" name="Receita prevista" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Funil de vendas</CardTitle>
            <CardDescription>Etapas com quantidade e valor estimado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(overview?.funnel ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há dados neste período.</p>
            ) : (
              overview!.funnel.map((f) => {
                const total = overview!.funnel.reduce((acc, row) => acc + row.count, 0);
                const pct = total > 0 ? (f.count / total) * 100 : 0;
                return (
                  <div key={`${f.stage_id}-${f.stage_name}`} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{f.stage_name}</p>
                      <p className="text-xs text-muted-foreground">{pct.toFixed(0)}%</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {f.count} {f.count === 1 ? "lead" : "leads"}{f.amount > 0 ? ` | ${formatCurrency(f.amount)}` : ""}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operação + Clientes */}
      <div className="hidden gap-6 md:grid md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atendimento e operação</CardTitle>
            <CardDescription>Gargalos que pedem ação rápida</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/leads" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Leads sem resposta</p>
              <p className="text-xl font-semibold">{overview?.operations.leads_without_response ?? 0}</p>
            </Link>
            <Link to="/support/tickets" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Tickets abertos</p>
              <p className="text-xl font-semibold">{overview?.operations.open_tickets ?? 0}</p>
            </Link>
            <Link to="/tasks" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Tarefas vencidas</p>
              <p className="text-xl font-semibold">{overview?.operations.overdue_tasks ?? 0}</p>
            </Link>
            <Link to="/tasks" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Vencem hoje</p>
              <p className="text-xl font-semibold">{overview?.operations.today_tasks ?? 0}</p>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
            <CardDescription>Base ativa e riscos de receita</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/clients" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Clientes ativos</p>
              <p className="text-xl font-semibold">{overview?.clients.active_clients ?? 0}</p>
            </Link>
            <Link to="/clients" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Novos no período</p>
              <p className="text-xl font-semibold">{overview?.clients.new_clients ?? 0}</p>
            </Link>
            <Link to="/crm-subscriptions" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Com assinatura ativa</p>
              <p className="text-xl font-semibold">{overview?.clients.active_subscriptions ?? 0}</p>
            </Link>
            <Link to="/customer-invoices?status=overdue" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <p className="text-xs text-muted-foreground">Com fatura vencida</p>
              <p className="text-xl font-semibold">{overview?.clients.clients_with_overdue_invoices ?? 0}</p>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Financeiro resumido + alertas */}
      <div className="hidden gap-6 md:grid md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Financeiro resumido</CardTitle>
            <CardDescription>Saúde financeira consolidada</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Receita recebida</p>
              <p className="text-lg font-semibold">{formatCurrency(overview?.finance.income_received ?? 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Receita futura</p>
              <p className="text-lg font-semibold">{formatCurrency(overview?.finance.income_projected ?? 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Despesas</p>
              <p className="text-lg font-semibold">
                {formatCurrency((overview?.finance.expense_paid ?? 0) + (overview?.finance.expense_projected ?? 0))}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Caixa disponível</p>
              <p className="text-lg font-semibold">{formatCurrency(overview?.finance.cash_available ?? 0)}</p>
            </div>
            <div className="rounded-lg border p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Resultado previsto</p>
              <p className={`text-xl font-semibold ${(overview?.finance.result_projected ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatCurrency(overview?.finance.result_projected ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atenção necessária</CardTitle>
            <CardDescription>Alertas inteligentes do período</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(overview?.alerts ?? []).length === 0 ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">Tudo certo por enquanto.</p>
            ) : (
              overview!.alerts.map((a) => (
                <Link key={`${a.type}-${a.href}`} to={a.href} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 ${a.severity === "critical" ? "text-rose-600" : "text-amber-600"}`} />
                  <div>
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
