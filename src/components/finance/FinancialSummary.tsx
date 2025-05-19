
import React from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectFinanceItem } from "@/components/projects/types";
import { 
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChartBarIcon, FileText, FileTextIcon } from "lucide-react";

interface FinancialData {
  invoices: {
    id: string;
    clientName: string;
    amount: number;
    date: string;
    status: string;
  }[];
  expenses: {
    id: string;
    description: string;
    amount: number;
    date: string;
    category: string;
    isPaid: boolean;
  }[];
}

interface FinancialSummaryProps {
  data: FinancialData;
}

export function FinancialSummary({ data }: FinancialSummaryProps) {
  // Process data for charts
  const processMonthlyData = () => {
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const monthlyData = months.map(month => ({
      name: month,
      income: 0,
      expenses: 0,
      profit: 0
    }));
    
    // Process invoices
    data.invoices.forEach(invoice => {
      const date = new Date(invoice.date);
      const monthIndex = date.getMonth();
      monthlyData[monthIndex].income += invoice.amount;
    });
    
    // Process expenses
    data.expenses.forEach(expense => {
      const date = new Date(expense.date);
      const monthIndex = date.getMonth();
      monthlyData[monthIndex].expenses += expense.amount;
    });
    
    // Calculate profit
    monthlyData.forEach(month => {
      month.profit = month.income - month.expenses;
    });
    
    return monthlyData;
  };
  
  const processCategoryData = () => {
    const categoriesMap: Record<string, number> = {};
    
    data.expenses.forEach(expense => {
      if (categoriesMap[expense.category]) {
        categoriesMap[expense.category] += expense.amount;
      } else {
        categoriesMap[expense.category] = expense.amount;
      }
    });
    
    return Object.entries(categoriesMap).map(([name, value]) => ({ name, value }));
  };
  
  const processStatusData = () => {
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    
    data.invoices.forEach(invoice => {
      if (invoice.status === "paid") {
        paid += invoice.amount;
      } else if (invoice.status === "pending") {
        pending += invoice.amount;
      } else if (invoice.status === "overdue") {
        overdue += invoice.amount;
      }
    });
    
    return [
      { name: "Pagas", value: paid },
      { name: "Pendentes", value: pending },
      { name: "Vencidas", value: overdue },
    ];
  };
  
  // Chart data
  const monthlyData = processMonthlyData();
  const categoryData = processCategoryData();
  const statusData = processStatusData();
  
  // Calculate total metrics
  const totalIncome = data.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalExpenses = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalProfit = totalIncome - totalExpenses;
  
  // Colors for charts
  const COLORS = ["#8B5CF6", "#0EA5E9", "#F97316", "#DC2626", "#10B981"];
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Receitas</CardDescription>
            <CardTitle className="text-2xl text-primary">
              R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Total de {data.invoices.length} faturas
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Despesas</CardDescription>
            <CardTitle className="text-2xl text-orange-500">
              R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Total de {data.expenses.length} despesas
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lucro</CardDescription>
            <CardTitle className={`text-2xl ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              R$ {totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {totalProfit >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts */}
      <div>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
            <TabsTrigger value="invoices">Faturas</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Receitas x Despesas</CardTitle>
                <CardDescription>Comparativo mensal de receitas e despesas</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ChartContainer
                  config={{
                    income: {
                      label: "Receitas",
                      color: "#8B5CF6",
                    },
                    expenses: {
                      label: "Despesas",
                      color: "#F97316",
                    },
                    profit: {
                      label: "Lucro",
                      color: "#10B981",
                    },
                  }}
                >
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                        />
                        <Bar
                          dataKey="income"
                          fill="var(--color-income)"
                          radius={4}
                          barSize={8}
                        />
                        <Bar
                          dataKey="expenses"
                          fill="var(--color-expenses)"
                          radius={4}
                          barSize={8}
                        />
                        <Bar
                          dataKey="profit"
                          fill="var(--color-profit)"
                          radius={4}
                          barSize={8}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <ChartLegend content={<ChartLegendContent />} />
                  </>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="expenses">
            <Card>
              <CardHeader>
                <CardTitle>Despesas por Categoria</CardTitle>
                <CardDescription>Distribuição de gastos por categoria</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Faturas por Status</CardTitle>
                <CardDescription>Distribuição de faturas por status</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      <Cell key="cell-0" fill="#10B981" />
                      <Cell key="cell-1" fill="#F59E0B" />
                      <Cell key="cell-2" fill="#DC2626" />
                    </Pie>
                    <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
