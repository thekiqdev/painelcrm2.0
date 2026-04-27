import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ticketStatusLabels, type TicketStatus } from "@/types/tickets";
import { DashboardQuickActionsPanel } from "@/components/dashboard/DashboardQuickActionsPanel";
import {
  type DashboardQuickActionContext,
  computeOrderedQuickActions,
} from "@/lib/dashboardQuickActions";
import { useDashboardQuickActionsPreferences } from "@/hooks/useDashboardQuickActionsPreferences";
import { useMobileShellChrome } from "@/contexts/MobileShellChromeContext";

const axisTickProps = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
type PeriodPreset = "current_month" | "last_month" | "ytd";

const Dashboard = () => {
  const { user } = useAuth();
  const { setShowMobileGlobalHeader } = useMobileShellChrome();
  const { canView, canCreate, canEdit } = useModulePermissions();
  const hasClients = useFeatureFlag("clients");
  const hasInvoices = useFeatureFlag("invoices");
  const hasProposals = useFeatureFlag("proposals");
  const hasContracts = useFeatureFlag("contracts");
  const hasChat = useFeatureFlag("chat");
  const hasDashboard = useFeatureFlag("dashboard");
  const hasExpenses = useFeatureFlag("expenses");
  const hasLeads = useFeatureFlag("leads");
  const hasProjects = useFeatureFlag("projects");
  const hasTickets = useFeatureFlag("tickets");
  const hasTasks = useFeatureFlag("tasks");
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [chartShowReceived, setChartShowReceived] = useState(true);
  const [chartShowProjected, setChartShowProjected] = useState(true);
  const [queueSort, setQueueSort] = useState<"new" | "old">("new");
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

  useEffect(() => {
    setShowMobileGlobalHeader(true);
    return () => setShowMobileGlobalHeader(false);
  }, [setShowMobileGlobalHeader]);

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

  const sortedAgentPreview = useMemo(() => {
    const list = overview?.agent_attendance?.preview ?? [];
    const copy = [...list];
    const ts = (s: string | null) => (s ? new Date(s).getTime() : 0);
    copy.sort((a, b) => {
      const da = ts(a.last_message_at);
      const db = ts(b.last_message_at);
      return queueSort === "new" ? db - da : da - db;
    });
    return copy;
  }, [overview?.agent_attendance?.preview, queueSort]);

  const attendanceStatusLabel = (s: string | null | undefined): string => {
    const v = (s ?? "").toLowerCase();
    if (v === "in_service" || v === "in-service") return "Em atendimento";
    if (v === "queued") return "Na fila";
    if (v === "unassigned") return "Sem responsável";
    if (v === "closed") return "Encerrada";
    return s ? s.replace(/_/g, " ") : "—";
  };

  const ticketStatusShort = (status: string): string => {
    const k = status as TicketStatus;
    return ticketStatusLabels[k] ?? status;
  };

  const mobileChatDeepLink = useMemo(() => {
    const firstAgent = sortedAgentPreview[0]?.id;
    if (firstAgent) return `/chat/${firstAgent}`;
    const c = overview?.chat_overview?.list?.[0]?.id;
    if (c) return `/chat/${c}`;
    return "/chat";
  }, [sortedAgentPreview, overview?.chat_overview?.list]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };
  const formatPct = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  const formatCurrencyCents = (valueCents: number): string =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format((valueCents ?? 0) / 100);
  const payableTag = (dueDate: string): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${dueDate}T00:00:00`);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) return "Vencida";
    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Amanhã";
    return `Em ${diffDays} dias`;
  };

  const show = (feature: boolean, moduleId: string) => feature && canView(moduleId);
  const canManageFinance = show(hasExpenses, "finance") && (canCreate("finance") || canEdit("finance"));

  const quickActionCtx = useMemo<DashboardQuickActionContext>(
    () => ({
      flags: {
        invoices: hasInvoices,
        clients: hasClients,
        proposals: hasProposals,
        contracts: hasContracts,
        chat: hasChat,
        expenses: hasExpenses,
        dashboard: hasDashboard,
      },
      canView,
      canCreate,
      canEdit,
      canManageFinance,
    }),
    [
      hasInvoices,
      hasClients,
      hasProposals,
      hasContracts,
      hasChat,
      hasExpenses,
      hasDashboard,
      canView,
      canCreate,
      canEdit,
      canManageFinance,
    ],
  );

  const { prefs, setPrefs, reset } = useDashboardQuickActionsPreferences(user?.id);
  const quickActionsForPanel = useMemo(
    () => computeOrderedQuickActions(quickActionCtx, prefs),
    [quickActionCtx, prefs],
  );

  return (
    <div className="space-y-6">
      {quickActionsForPanel.length > 0 ? (
        <DashboardQuickActionsPanel
          ctx={quickActionCtx}
          prefs={prefs}
          setPrefs={setPrefs}
          resetPrefs={reset}
        />
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

      {overview && show(hasExpenses, "finance") ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Contas a pagar</h2>
              <p className="text-xs text-muted-foreground">Próximos 7 dias</p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link to="/finance/accounts-payable?preset=week">Ver contas a pagar</Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
            {(overview.accounts_payable_next_7_days ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta a vencer nos próximos 7 dias.</p>
            ) : (
              <div className="space-y-2.5">
                {(overview.accounts_payable_next_7_days ?? []).map((item) => (
                  <div key={`${item.source}-${item.id}`} className="rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <Badge variant="outline" className="text-[10px]">{payableTag(item.due_date)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Vence em {new Date(`${item.due_date}T00:00:00`).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{formatCurrencyCents(item.amount_cents)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="text-xs text-muted-foreground">Total da semana</span>
              <span className="text-sm font-semibold">
                {formatCurrencyCents(overview.accounts_payable_total_cents ?? 0)}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {overview &&
      show(hasExpenses, "finance") &&
      show(hasInvoices, "billing") &&
      overview.next_7_days ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Próximos 7 dias</h2>
            <span className="text-xs text-muted-foreground">Fluxo previsto</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border p-2.5">
              <p className="text-[11px] text-muted-foreground">A receber</p>
              <p className="mt-1 text-xs font-semibold">{formatCurrencyCents(overview.next_7_days.receivable_cents)}</p>
            </div>
            <div className="rounded-xl border p-2.5">
              <p className="text-[11px] text-muted-foreground">A pagar</p>
              <p className="mt-1 text-xs font-semibold">{formatCurrencyCents(overview.next_7_days.payable_cents)}</p>
            </div>
            <div className="rounded-xl border p-2.5">
              <p className="text-[11px] text-muted-foreground">Saldo</p>
              <p className={`mt-1 text-xs font-semibold ${(overview.next_7_days.balance_cents ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatCurrencyCents(overview.next_7_days.balance_cents)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {overview && show(hasTasks, "tasks") ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Tarefas</h2>
              <p className="text-xs text-muted-foreground">Suas próximas atividades</p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link to="/tasks">Ver tarefas</Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
            {(() => {
              const grouped = overview.tasks_overview;
              const items = grouped
                ? [...grouped.overdue, ...grouped.due_today, ...grouped.upcoming, ...grouped.recent_assigned].slice(0, 5)
                : [];
              if (items.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma tarefa urgente.</p>;
              return (
                <div className="space-y-2.5">
                  {items.map((task) => (
                    <Link
                      key={task.id}
                      to={`/tasks?task=${encodeURIComponent(task.id)}`}
                      className="block rounded-lg border p-2.5 transition-colors active:scale-[0.99]"
                    >
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.due_date ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString("pt-BR") : "Sem data"}
                        {task.priority ? ` · ${task.priority}` : ""}
                      </p>
                    </Link>
                  ))}
                </div>
              );
            })()}
          </div>
        </section>
      ) : null}

      {overview && show(hasProjects, "projects") ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Projetos</h2>
              <p className="text-xs text-muted-foreground">Seus projetos recentes</p>
            </div>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link to="/projects">Ver projetos</Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
            {(overview.projects_overview ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum projeto listado.</p>
            ) : (
              <div className="space-y-2.5">
                {(overview.projects_overview ?? []).slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects?project=${encodeURIComponent(project.id)}`}
                    className="block rounded-lg border p-2.5 transition-colors active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {project.progress_pct}%
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {project.pending_tasks} pendente(s)
                      {project.due_date ? ` · ${new Date(`${project.due_date}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {overview && show(hasTickets, "tickets") ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Tickets</h2>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link to="/support/tickets">Ver todos</Link>
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Abertos</p>
              <p className="mt-1 text-base font-semibold tabular-nums">{overview.tickets_overview?.open ?? 0}</p>
            </div>
            <div className="rounded-xl border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Em andamento</p>
              <p className="mt-1 text-base font-semibold tabular-nums">{overview.tickets_overview?.in_progress ?? 0}</p>
            </div>
            <div className="rounded-xl border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Resolvidos</p>
              <p className="mt-1 text-base font-semibold tabular-nums">{overview.tickets_overview?.resolved ?? 0}</p>
            </div>
          </div>
          {(overview.tickets_overview?.recent ?? []).length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Recentes</p>
              <div className="space-y-2">
                {(overview.tickets_overview?.recent ?? []).slice(0, 4).map((t) => (
                  <Link
                    key={t.id}
                    to={`/support/tickets/${encodeURIComponent(t.id)}`}
                    className="block rounded-lg border p-2.5 text-left transition-colors active:scale-[0.99]"
                  >
                    <p className="text-xs text-muted-foreground">{t.ticket_number}</p>
                    <p className="text-sm font-medium leading-snug">{t.subject}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{ticketStatusShort(t.status)}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {overview && show(hasChat, "chat") ? (
        <section className="space-y-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight">Atendimento</h2>
            <span className="text-xs text-muted-foreground">Resumo rápido</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Em atendimento (você)</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {overview.agent_attendance != null ? overview.agent_attendance.my_in_service : "—"}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Sua fila</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {overview.agent_attendance != null ? overview.agent_attendance.my_queued : "—"}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Não lidas</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{overview.chat_overview?.unread ?? 0}</p>
            </div>
            <div className="rounded-xl border bg-card p-2.5">
              <p className="text-[11px] text-muted-foreground">Tickets abertos</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{overview.operations.open_tickets ?? 0}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className="h-11 rounded-xl">
              <Link to="/chat">Abrir chat</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <Link to={mobileChatDeepLink}>Abrir conversa</Link>
            </Button>
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
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle>Receita realizada vs prevista</CardTitle>
                <CardDescription>Colunas empilhadas: realizada (base) + prevista (topo)</CardDescription>
                </div>
              <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
                <SelectTrigger className="h-9 w-full lg:w-[11rem]" aria-label="Período do gráfico">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Este mês</SelectItem>
                  <SelectItem value="last_month">Mês passado</SelectItem>
                  <SelectItem value="ytd">Ano atual</SelectItem>
                </SelectContent>
              </Select>
                </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Switch id="dash-chart-received" checked={chartShowReceived} onCheckedChange={setChartShowReceived} />
                <Label htmlFor="dash-chart-received" className="cursor-pointer text-sm font-normal">
                  Receita realizada
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="dash-chart-projected" checked={chartShowProjected} onCheckedChange={setChartShowProjected} />
                <Label htmlFor="dash-chart-projected" className="cursor-pointer text-sm font-normal">
                  Receita prevista
                </Label>
              </div>
      </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            <div className="h-80">
              {!chartShowReceived && !chartShowProjected ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Ative ao menos uma série para visualizar o gráfico.
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="name" tick={axisTickProps} />
                    <YAxis tick={axisTickProps} />
                    <Tooltip
                      formatter={(value: number, name: string) => [formatCurrency(Number(value)), name]}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as (typeof chartRows)[number];
                        return (
                          <div className="space-y-1 rounded-md border bg-background p-3 text-xs shadow-sm">
                            <p className="font-medium">{label}</p>
                            {chartShowReceived ? (
                              <p className="text-emerald-700 dark:text-emerald-400">
                                Realizada: {formatCurrency(row.receita_recebida)}
                              </p>
                            ) : null}
                            {chartShowProjected ? (
                              <p className="text-emerald-600/90 dark:text-emerald-300/90">
                                Prevista: {formatCurrency(row.receita_futura)}
                              </p>
                            ) : null}
                            <p className="border-t pt-1 text-muted-foreground">
                              Total: {formatCurrency(row.receita_total_potencial)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    {chartShowReceived ? (
                      <Bar
                        dataKey="receita_recebida"
                        stackId="r"
                        fill="hsl(142 76% 36%)"
                        name="Receita realizada"
                        radius={chartShowProjected ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                      />
                    ) : null}
                    {chartShowProjected ? (
                      <Bar
                        dataKey="receita_futura"
                        stackId="r"
                        fill="hsl(142 55% 52%)"
                        name="Receita prevista"
                        radius={[4, 4, 0, 0]}
                      />
                    ) : null}
                  </BarChart>
              </ResponsiveContainer>
              )}
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

      <div className="hidden gap-6 md:grid md:grid-cols-1 lg:grid-cols-3">
        {show(hasTasks, "tasks") ? (
          <Card>
          <CardHeader>
              <CardTitle>Tarefas</CardTitle>
              <CardDescription>Suas próximas atividades</CardDescription>
          </CardHeader>
            <CardContent className="space-y-2">
              {(() => {
                const grouped = overview?.tasks_overview;
                const items = grouped
                  ? [...grouped.overdue, ...grouped.due_today, ...grouped.upcoming, ...grouped.recent_assigned].slice(0, 5)
                  : [];
                if (items.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma tarefa urgente.</p>;
                return items.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks?task=${encodeURIComponent(task.id)}`}
                    className="block rounded-lg border p-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{task.title}</p>
                      {task.due_date ? (
                        <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                          {new Date(`${task.due_date}T00:00:00`).toLocaleDateString("pt-BR")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          Sem data
                        </Badge>
                      )}
            </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.client_name ? `${task.client_name} · ` : ""}
                      Prioridade: {task.priority ?? "—"}
                    </p>
                  </Link>
                ));
              })()}
            </CardContent>
          </Card>
        ) : null}

        {show(hasProjects, "projects") ? (
          <Card>
            <CardHeader>
              <CardTitle>Projetos</CardTitle>
              <CardDescription>Projetos vinculados a você</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(overview?.projects_overview ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum projeto ativo vinculado a você.</p>
              ) : (
                (overview?.projects_overview ?? []).slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects?project=${encodeURIComponent(project.id)}`}
                    className="block rounded-lg border p-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug">{project.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {project.progress_pct}%
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {project.pending_tasks} pendente(s)
                      {project.due_date ? ` · prazo ${new Date(`${project.due_date}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        {show(hasTickets, "tickets") ? (
          <Card>
            <CardHeader>
              <CardTitle>Tickets</CardTitle>
              <CardDescription>Chamados do tenant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground">Abertos</p>
                  <p className="text-lg font-semibold tabular-nums">{overview?.tickets_overview?.open ?? 0}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground">Em andamento</p>
                  <p className="text-lg font-semibold tabular-nums">{overview?.tickets_overview?.in_progress ?? 0}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground">Resolvidos</p>
                  <p className="text-lg font-semibold tabular-nums">{overview?.tickets_overview?.resolved ?? 0}</p>
                </div>
              </div>
              {(overview?.tickets_overview?.recent ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(overview?.tickets_overview?.recent ?? []).slice(0, 4).map((t) => (
                    <Link
                      key={t.id}
                      to={`/support/tickets/${encodeURIComponent(t.id)}`}
                      className="block rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <p className="text-xs text-muted-foreground">{t.ticket_number}</p>
                      <p className="text-sm font-medium leading-snug">{t.subject}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{ticketStatusShort(t.status)}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum ticket recente.</p>
              )}
              <Button asChild variant="outline" className="w-full">
                <Link to="/support/tickets">Abrir central de tickets</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Operação + Clientes */}
      <div className="hidden gap-6 md:grid md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Atendimento e operação</CardTitle>
            <CardDescription>
              {overview?.agent_attendance
                ? "Sua fila, conversas atribuídas a você e atalhos"
                : "Gargalos que pedem ação rápida"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overview?.agent_attendance ? (
              <>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Em atendimento (você)</p>
                      <p className="text-xl font-semibold tabular-nums">{overview.agent_attendance.my_in_service}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Na sua fila</p>
                      <p className="text-xl font-semibold tabular-nums">{overview.agent_attendance.my_queued}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Resolvidos (7 dias)</p>
                      <p className="text-xl font-semibold tabular-nums">{overview.agent_attendance.my_closed_7d}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Fila sem responsável</p>
                      <p className="text-xl font-semibold tabular-nums">{overview.agent_attendance.queue_unassigned}</p>
                    </div>
                  </div>
                  <div className="flex min-h-[200px] flex-col gap-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium">Suas conversas (até 7)</p>
                      <Select value={queueSort} onValueChange={(v) => setQueueSort(v as "new" | "old")}>
                        <SelectTrigger className="h-8 w-full sm:w-[11rem] text-xs" aria-label="Ordenação da fila">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">Mais novas</SelectItem>
                          <SelectItem value="old">Mais antigas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="max-h-[280px] flex-1 space-y-2 overflow-y-auto pr-1">
                      {sortedAgentPreview.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma conversa ativa atribuída a você.</p>
                      ) : (
                        sortedAgentPreview.map((row) => (
                          <Link
                            key={row.id}
                            to={`/chat/${encodeURIComponent(row.id)}`}
                            className="block rounded-lg border p-2.5 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug">
                                {row.contact_name ?? row.phone_number ?? "Contato"}
                              </p>
                              {row.unread_count > 0 ? (
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                  {row.unread_count} não lidas
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {attendanceStatusLabel(row.attendance_status)}
                              {row.last_message_at
                                ? ` · ${new Date(row.last_message_at).toLocaleString("pt-BR", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                                : ""}
                            </p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button asChild size="sm">
                    <Link to="/chat">Abrir chat</Link>
                  </Button>
                  {show(hasTickets, "tickets") ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/support/tickets">Tickets</Link>
                    </Button>
                  ) : null}
                  {show(hasChat, "chat") ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/chat/kanbam">Kanban</Link>
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {show(hasLeads, "leads") ? (
                  <Link to="/leads" className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <p className="text-xs text-muted-foreground">Leads sem resposta</p>
                    <p className="text-xl font-semibold">{overview?.operations.leads_without_response ?? 0}</p>
                  </Link>
                ) : null}
                {show(hasTickets, "tickets") ? (
                  <Link to="/support/tickets" className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <p className="text-xs text-muted-foreground">Tickets abertos</p>
                    <p className="text-xl font-semibold">{overview?.operations.open_tickets ?? 0}</p>
                  </Link>
                ) : null}
                {show(hasTasks, "tasks") ? (
                  <Link to="/tasks" className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <p className="text-xs text-muted-foreground">Tarefas vencidas</p>
                    <p className="text-xl font-semibold">{overview?.operations.overdue_tasks ?? 0}</p>
                  </Link>
                ) : null}
                {show(hasTasks, "tasks") ? (
                  <Link to="/tasks" className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <p className="text-xs text-muted-foreground">Vencem hoje</p>
                    <p className="text-xl font-semibold">{overview?.operations.today_tasks ?? 0}</p>
                  </Link>
                ) : null}
            </div>
            )}
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
            <CardTitle>Contas a pagar</CardTitle>
            <CardDescription>Próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(overview?.accounts_payable_next_7_days ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta a vencer nos próximos 7 dias.</p>
            ) : (
              (overview?.accounts_payable_next_7_days ?? []).map((item) => (
                <Link
                  key={`${item.source}-${item.id}`}
                  to="/finance/accounts-payable?preset=week"
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${item.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · {payableTag(item.due_date)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatCurrencyCents(item.amount_cents)}</p>
                </Link>
                ))
              )}
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">Total da semana</span>
              <span className="text-sm font-semibold">{formatCurrencyCents(overview?.accounts_payable_total_cents ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
