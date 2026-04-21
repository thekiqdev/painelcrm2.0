import React from "react";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Users, DollarSign, List, FileText, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { dashboardService, KPIData, ChartData, FunnelData, Activity, UpcomingTask } from "@/services/dashboard";
import { toast } from "@/components/ui/sonner";
import { DashboardActivationBlock } from "@/components/dashboard/DashboardActivationBlock";
import { useAuth } from "@/contexts/AuthContext";

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  label?: string;
  valueMode?: "currency" | "number";
};

const ChartTooltip = ({ active, payload, label, valueMode = "number" }: ChartTooltipProps) => {
  if (active && payload && payload.length) {
    const v = Number(payload[0].value);
    const formatted =
      valueMode === "currency"
        ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
        : v.toLocaleString("pt-BR");
    return (
      <div className="rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground shadow-md">
        <p className="font-medium text-foreground">{`${label ?? ""}`}</p>
        <p className="text-muted-foreground">
          {payload[0].name ? `${payload[0].name}: ` : ""}
          {formatted}
        </p>
      </div>
    );
  }
  return null;
};

const PieFunnelTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; percent?: number }>;
}) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = typeof p.percent === "number" ? `${(p.percent * 100).toFixed(0)}%` : "";
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium text-foreground">{p.name}</p>
      <p className="text-muted-foreground">
        {Number(p.value).toLocaleString("pt-BR")}
        {pct ? ` · ${pct}` : ""}
      </p>
    </div>
  );
};

const axisTickProps = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

async function loadDashboardData() {
  const [kpisData, salesChart, leadsChart, funnel, activitiesData, tasksData] = await Promise.all([
    dashboardService.getKPIs(),
    dashboardService.getSalesChart(),
    dashboardService.getLeadsChart(),
    dashboardService.getFunnelData(),
    dashboardService.getRecentActivities(),
    dashboardService.getUpcomingTasks(),
  ]);
  return {
    kpis: kpisData,
    salesData: salesChart,
    leadsData: leadsChart,
    funnelData: funnel,
    activities: activitiesData,
    tasks: tasksData,
  };
}

const Dashboard = () => {
  const { resolvedTheme } = useTheme();
  const { user } = useAuth();
  const chartPrimary = "hsl(var(--primary))";
  const chartPrimaryFill = "hsl(var(--primary) / 0.22)";
  const chartLeadsFill =
    resolvedTheme === "dark" ? "hsl(152 55% 42%)" : "hsl(152 60% 40%)";
  const trialEndsAt =
    user?.tenant_status === 'trial' && user?.trial_ends_at
      ? new Date(user.trial_ends_at)
      : null;
  const trialActive = trialEndsAt != null && !Number.isNaN(trialEndsAt.getTime()) && trialEndsAt.getTime() > Date.now();

  const { data, isPending, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: loadDashboardData,
  });

  if (error) {
    toast.error("Erro ao carregar dados do dashboard");
  }

  // Só mostra loading na primeira vez; com cache os dados aparecem na hora
  if (isPending && !data) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis ?? null;
  const salesData = data?.salesData ?? [];
  const leadsData = data?.leadsData ?? [];
  const funnelData = data?.funnelData ?? [];
  const activities = data?.activities ?? [];
  const tasks = data?.tasks ?? [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(0)}%`;
  };

  const kpiCards = kpis ? [
    { 
      title: "Vendas Totais", 
      value: formatCurrency(kpis.sales.value), 
      change: formatChange(kpis.sales.change), 
      changeType: kpis.sales.changeType,
      icon: DollarSign,
      color:
        "bg-blue-500/10 text-blue-800 ring-1 ring-blue-500/15 dark:bg-blue-950/45 dark:text-blue-200 dark:ring-blue-400/20",
    },
    {
      title: "Novos Leads",
      value: kpis.leads.value.toString(),
      change: formatChange(kpis.leads.change),
      changeType: kpis.leads.changeType,
      icon: Users,
      color:
        "bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/15 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/20",
    },
    {
      title: "Propostas Enviadas",
      value: kpis.proposals.value.toString(),
      change: formatChange(kpis.proposals.change),
      changeType: kpis.proposals.changeType,
      icon: FileText,
      color:
        "bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-400/20",
    },
    {
      title: "Tarefas Pendentes",
      value: kpis.tasks.value.toString(),
      change: formatChange(kpis.tasks.change),
      changeType: kpis.tasks.changeType,
      icon: Calendar,
      color:
        "bg-red-500/10 text-red-800 ring-1 ring-red-500/15 dark:bg-red-950/45 dark:text-red-200 dark:ring-red-400/20",
    },
  ] : [];

  return (
    <div className="space-y-6">
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

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline">Este Mês</Button>
          <Button variant="outline">Exportar</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardDescription>{kpi.title}</CardDescription>
                  <CardTitle className="text-2xl mt-1">{kpi.value}</CardTitle>
                </div>
                <div className={`p-2 rounded-lg ${kpi.color}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                {kpi.changeType === "positive" ? (
                  <ArrowUp className="mr-1 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDown className="mr-1 h-4 w-4 text-red-600 dark:text-red-400" />
                )}
                <span
                  className={`text-sm ${
                    kpi.changeType === "positive"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {kpi.change} em relação ao mês anterior
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Vendas Mensais</CardTitle>
            <CardDescription>Faturamento nos últimos 7 meses</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={salesData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={axisTickProps} />
                  <YAxis tick={axisTickProps} width={36} />
                  <Tooltip content={<ChartTooltip valueMode="currency" />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={chartPrimary}
                    fill={chartPrimaryFill}
                    fillOpacity={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Leads Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Captação de Leads</CardTitle>
            <CardDescription>Novos leads por mês</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={leadsData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={axisTickProps} />
                  <YAxis tick={axisTickProps} width={36} />
                  <Tooltip content={<ChartTooltip valueMode="number" />} />
                  <Bar dataKey="value" fill={chartLeadsFill} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Funil de Vendas</CardTitle>
            <CardDescription>Distribuição de leads por etapa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={funnelData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieFunnelTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-3">
              {funnelData.length > 0 ? (
                funnelData.map((item, index) => {
                  const maxValue = Math.max(...funnelData.map(f => f.value));
                  return (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center">
                          <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></div>
                          <span className="text-sm">{item.name}</span>
                        </div>
                        <span className="text-sm font-medium">{item.value}</span>
                      </div>
                      <Progress value={maxValue > 0 ? (item.value / maxValue) * 100 : 0} className="h-1.5" />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado do funil disponível
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
            <CardDescription>Últimas ações no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activities.length > 0 ? (
                activities.map((activity, index) => (
                  <div key={index} className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activity.color} text-sm font-medium mr-3 mt-0.5`}>
                      {activity.user.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{activity.user}</span> {activity.action}
                        {activity.entity && <span className="text-muted-foreground">: {activity.entity}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma atividade recente
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" className="w-full">Ver todas as atividades</Button>
          </CardFooter>
        </Card>

        {/* Upcoming Tasks */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Próximas Tarefas</CardTitle>
            <CardDescription>Tarefas agendadas para hoje</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tasks.length > 0 ? (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">{task.time}</p>
                    </div>
                    <div className={`px-2 py-0.5 text-xs rounded border ${task.color}`}>
                      {task.priority}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma tarefa pendente
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" className="w-full">Ver todas as tarefas</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
