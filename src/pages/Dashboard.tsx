
import React from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Users, DollarSign, List, FileText, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const salesData = [
  { name: 'Jan', value: 10000 },
  { name: 'Fev', value: 15000 },
  { name: 'Mar', value: 12000 },
  { name: 'Abr', value: 18000 },
  { name: 'Mai', value: 22000 },
  { name: 'Jun', value: 24000 },
  { name: 'Jul', value: 28000 },
];

const leadsData = [
  { name: 'Jan', value: 120 },
  { name: 'Fev', value: 150 },
  { name: 'Mar', value: 180 },
  { name: 'Abr', value: 220 },
  { name: 'Mai', value: 250 },
  { name: 'Jun', value: 300 },
  { name: 'Jul', value: 320 },
];

const funnelData = [
  { name: 'Prospecção', value: 180, color: '#3b82f6' },
  { name: 'Qualificação', value: 120, color: '#10b981' },
  { name: 'Proposta', value: 80, color: '#f59e0b' },
  { name: 'Negociação', value: 40, color: '#ef4444' },
  { name: 'Fechado', value: 25, color: '#8b5cf6' },
];

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
        {[
          { 
            title: "Vendas Totais", 
            value: "R$ 28.450", 
            change: "+12%", 
            changeType: "positive",
            icon: DollarSign,
            color: "bg-blue-100 text-blue-700" 
          },
          { 
            title: "Novos Leads", 
            value: "320", 
            change: "+8%", 
            changeType: "positive",
            icon: Users,
            color: "bg-green-100 text-green-700" 
          },
          { 
            title: "Propostas Enviadas", 
            value: "42", 
            change: "+5%", 
            changeType: "positive",
            icon: FileText,
            color: "bg-amber-100 text-amber-700" 
          },
          { 
            title: "Tarefas Pendentes", 
            value: "18", 
            change: "-3%", 
            changeType: "negative",
            icon: Calendar,
            color: "bg-red-100 text-red-700" 
          }
        ].map((kpi, index) => (
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
              {funnelData.map((item, index) => (
                <div key={index}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></div>
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{item.value}</span>
                  </div>
                  <Progress value={(item.value / funnelData[0].value) * 100} className="h-1.5" />
                </div>
              ))}
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
              {[
                { user: "Carlos Silva", action: "adicionou um novo cliente", time: "5 minutos atrás", color: "bg-blue-100 text-blue-700" },
                { user: "Ana Oliveira", action: "enviou uma proposta", time: "30 minutos atrás", color: "bg-green-100 text-green-700" },
                { user: "Marcos Santos", action: "fechou um negócio", time: "2 horas atrás", color: "bg-purple-100 text-purple-700" },
                { user: "Juliana Lima", action: "adicionou uma tarefa", time: "4 horas atrás", color: "bg-amber-100 text-amber-700" },
                { user: "Roberto Almeida", action: "atualizou um cliente", time: "5 horas atrás", color: "bg-red-100 text-red-700" }
              ].map((activity, index) => (
                <div key={index} className="flex items-start">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activity.color} text-sm font-medium mr-3 mt-0.5`}>
                    {activity.user.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm">
                      <span className="font-medium">{activity.user}</span> {activity.action}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
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
              {[
                { title: "Reunião com XYZ Corp", time: "14:30", priority: "Alta", color: "bg-red-100 text-red-700 border-red-300" },
                { title: "Ligação para Lead #1234", time: "15:45", priority: "Média", color: "bg-amber-100 text-amber-700 border-amber-300" },
                { title: "Enviar proposta comercial", time: "16:30", priority: "Alta", color: "bg-red-100 text-red-700 border-red-300" },
                { title: "Follow-up cliente ABC", time: "17:00", priority: "Baixa", color: "bg-green-100 text-green-700 border-green-300" }
              ].map((task, index) => (
                <div key={index} className="flex items-center p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-gray-500">Hoje às {task.time}</p>
                  </div>
                  <div className={`px-2 py-0.5 text-xs rounded border ${task.color}`}>
                    {task.priority}
                  </div>
                </div>
              ))}
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
