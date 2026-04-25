
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
  /** Receitas de cobrança (customer_invoices pagas) para o relatório unificado. */
  billingReceipts?: {
    id: string;
    amount: number;
    date: string;
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

export interface FinancialSummaryBarRow {
  name: string;
  income: number;
  expenses: number;
  profit: number;
}

interface FinancialSummaryProps {
  data: FinancialData;
  /** Substitui agregação interna do gráfico de barras (ex.: filtro por ano/mês). */
  barChartData?: FinancialSummaryBarRow[];
  /** Texto curto exibido nos cards (ex.: “Abril/2026”). */
  periodHint?: string;
  /** Totais para os cards principais; se omitido, calcula a partir de `data`. */
  cardTotals?: { revenue: number; expenses: number; profit: number };
}

export function FinancialSummary({ data, barChartData, periodHint, cardTotals }: FinancialSummaryProps) {
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

    // Process billing receipts (customer_invoices paid)
    (data.billingReceipts ?? []).forEach(receipt => {
      const date = new Date(receipt.date);
      const monthIndex = date.getMonth();
      monthlyData[monthIndex].income += receipt.amount;
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
  const monthlyData = barChartData ?? processMonthlyData();
  const categoryData = processCategoryData();
  const statusData = processStatusData();
  
  // Calculate total metrics (receitas = faturas do finance + cobranças pagas)
  const invoicesTotal = data.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const billingReceiptsTotal = (data.billingReceipts ?? []).reduce((sum, r) => sum + r.amount, 0);
  const computedIncome = invoicesTotal + billingReceiptsTotal;
  const computedExpenses = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalIncome = cardTotals?.revenue ?? computedIncome;
  const totalExpenses = cardTotals?.expenses ?? computedExpenses;
  const totalProfit = cardTotals?.profit ?? (computedIncome - computedExpenses);
  
  // Colors for charts
  const COLORS = ["#8B5CF6", "#0EA5E9", "#F97316", "#DC2626", "#10B981"];
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] to-transparent shadow-md">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500/80 to-emerald-400/40" />
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-900/80 dark:text-emerald-100/80">Receita total</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
              R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {periodHint ? <span className="font-medium text-foreground/80">{periodHint}</span> : null}
              {periodHint ? ' · ' : null}
              {data.billingReceipts?.length
                ? `Notas internas + ${data.billingReceipts.length} cobrança(s) paga(s) + entradas do período`
                : `Consolidado do período (${data.invoices.length} nota(s) interna(s) no gráfico)`}
            </p>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden border-orange-500/25 bg-gradient-to-br from-orange-500/[0.08] to-transparent shadow-md">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500/80 to-amber-400/40" />
          <CardHeader className="pb-2">
            <CardDescription className="text-orange-950/75 dark:text-orange-100/80">Despesas</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-orange-600 dark:text-orange-400 tabular-nums">
              R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {periodHint ? <span className="font-medium text-foreground/80">{periodHint}</span> : null}
              {periodHint ? ' · ' : null}
              Total de {data.expenses.length} despesa(s) consideradas no período
            </p>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden border-crm-primary/25 bg-gradient-to-br from-crm-primary/[0.08] to-transparent shadow-md">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-crm-primary/80 to-sky-400/35" />
          <CardHeader className="pb-2">
            <CardDescription className="text-foreground/70">Lucro</CardDescription>
            <CardTitle className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              R$ {totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {totalProfit >= 0 ? 'Receita maior que despesas no período' : 'Despesas superam a receita no período'}
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
                  {/* The React element must be wrapped in a Fragment */}
                  <React.Fragment>
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
                  </React.Fragment>
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
