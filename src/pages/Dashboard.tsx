
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Users, DollarSign, List, FileText, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { dashboardService, KPIData, ChartData, FunnelData, Activity, UpcomingTask } from "@/services/dashboard";
import { toast } from "sonner";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 shadow-md border rounded">
        <p className="font-medium">{`${label}`}</p>
        <p className="text-sm">{`${payload[0].name}: R$ ${payload[0].value.toLocaleString('pt-BR')}`}</p>
      </div>
    );
  }
  return null;
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [salesData, setSalesData] = useState<ChartData[]>([]);
  const [leadsData, setLeadsData] = useState<ChartData[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelData[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<UpcomingTask[]>([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [kpisData, salesChart, leadsChart, funnel, activitiesData, tasksData] = await Promise.all([
          dashboardService.getKPIs(),
          dashboardService.getSalesChart(),
          dashboardService.getLeadsChart(),
          dashboardService.getFunnelData(),
          dashboardService.getRecentActivities(),
          dashboardService.getUpcomingTasks(),
        ]);

        setKpis(kpisData);
        setSalesData(salesChart);
        setLeadsData(leadsChart);
        setFunnelData(funnel);
        setActivities(activitiesData);
        setTasks(tasksData);
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
        toast.error("Erro ao carregar dados do dashboard");
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

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
      color: "bg-blue-100 text-blue-700" 
    },
    { 
      title: "Novos Leads", 
      value: kpis.leads.value.toString(), 
      change: formatChange(kpis.leads.change), 
      changeType: kpis.leads.changeType,
      icon: Users,
      color: "bg-green-100 text-green-700" 
    },
    { 
      title: "Propostas Enviadas", 
      value: kpis.proposals.value.toString(), 
      change: formatChange(kpis.proposals.change), 
      changeType: kpis.proposals.changeType,
      icon: FileText,
      color: "bg-amber-100 text-amber-700" 
    },
    { 
      title: "Tarefas Pendentes", 
      value: kpis.tasks.value.toString(), 
      change: formatChange(kpis.tasks.change), 
      changeType: kpis.tasks.changeType,
      icon: Calendar,
      color: "bg-red-100 text-red-700" 
    }
  ] : [];

  return (
    <div className="space-y-6">
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
                  <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                ) : (
                  <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                )}
                <span className={`text-sm ${kpi.changeType === "positive" ? "text-green-500" : "text-red-500"}`}>
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
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.2}
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
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
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
                  <Tooltip />
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
                      <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
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
                  <div key={task.id} className="flex items-center p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-gray-500">{task.time}</p>
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
