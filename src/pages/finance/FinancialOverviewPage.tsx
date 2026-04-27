import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  financialService,
  type FinancialEnterpriseReportDto,
  type FinancialSummaryDto,
  type FinancialRecurringOccurrenceDto,
} from "@/services/financial";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { TrendingDown, TrendingUp, Wallet, CalendarClock, Target } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FinanceMobileBottomBar, financeMobilePageBottomPad } from "@/components/finance/FinanceMobileBottomBar";

function formatBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Math.max(0, Math.min(11, parseInt(m ?? "1", 10) - 1));
  const short = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][idx];
  return `${short}/${y ?? ""}`;
}

type OverviewChartRow = {
  name: string;
  receita_recebida: number;
  ganhos_previstos: number;
  receita_potencial_total: number;
  despesas_pagas: number;
  despesas_previstas: number;
  despesa_potencial_total: number;
  lucro_realizado: number;
  resultado_previsto: number;
};

const FinancialOverviewPage = () => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const defaultMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummaryDto | null>(null);
  const [report, setReport] = useState<FinancialEnterpriseReportDto | null>(null);
  const [upcomingMonth, setUpcomingMonth] = useState(defaultMonth);
  const [occurrences, setOccurrences] = useState<FinancialRecurringOccurrenceDto[]>([]);
  const [occLoading, setOccLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    Promise.all([financialService.getSummary({ from, to }), financialService.getEnterpriseReport({ from, to })])
      .then(([sum, rep]) => {
        setSummary(sum);
        setReport(rep);
      })
      .catch(() => {
        toast.error("Não foi possível carregar o resumo");
        setSummary(null);
        setReport(null);
      })
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const upcomingRange = useMemo(() => {
    const [y, m] = upcomingMonth.split("-").map((x) => parseInt(x, 10));
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const last = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    return { from, to };
  }, [upcomingMonth]);

  useEffect(() => {
    setOccLoading(true);
    financialService
      .listRecurringOccurrences({ from: upcomingRange.from, to: upcomingRange.to })
      .then(setOccurrences)
      .catch(() => setOccurrences([]))
      .finally(() => setOccLoading(false));
  }, [upcomingRange.from, upcomingRange.to]);

  const chartData = useMemo<OverviewChartRow[]>(() => {
    if (report?.monthly?.length) {
      return report.monthly.map((row) => {
        const incomeReceived = row.income_received ?? row.income ?? 0;
        const incomeProjected =
          row.income_projected_subscriptions ??
          (row.subscription_revenue_pending ?? 0) + (row.subscription_revenue_projected ?? 0);
        const incomePotential = row.income_total_potential ?? incomeReceived + incomeProjected;
        const expensePaid = row.expense_paid ?? row.expense ?? 0;
        const expenseProjected = row.expense_projected ?? Math.max(0, (row.projected_expense ?? expensePaid) - expensePaid);
        const expensePotential = row.expense_total_potential ?? row.projected_expense ?? expensePaid + expenseProjected;
        const realizedProfit = row.realized_profit ?? row.profit ?? incomeReceived - expensePaid;
        const projectedResult = row.projected_result ?? incomePotential - expensePotential;
        return {
          name: monthLabel(row.month),
          receita_recebida: incomeReceived,
          ganhos_previstos: incomeProjected,
          receita_potencial_total: incomePotential,
          despesas_pagas: expensePaid,
          despesas_previstas: expenseProjected,
          despesa_potencial_total: expensePotential,
          lucro_realizado: realizedProfit,
          resultado_previsto: projectedResult,
        };
      });
    }
    return (summary?.monthly ?? []).map((row) => ({
      name: monthLabel(row.month),
      receita_recebida: row.income,
      ganhos_previstos: 0,
      receita_potencial_total: row.income,
      despesas_pagas: row.expense,
      despesas_previstas: Math.max(0, (row.projected_expense ?? row.expense) - row.expense),
      despesa_potencial_total: row.projected_expense ?? row.expense,
      lucro_realizado: row.profit,
      resultado_previsto: row.projected_profit ?? row.profit,
    }));
  }, [summary, report]);

  const overview = useMemo(() => {
    const received = report?.general.received_income ?? summary?.total_income ?? 0;
    const futureIncome = report?.general.projected_subscription_income ?? 0;
    const expensePaid = report?.general.expense_paid ?? summary?.total_expense ?? 0;
    const expenseFuture =
      report?.general.expense_projected ??
      Math.max(0, (summary?.projected_total_expense ?? expensePaid) - expensePaid);
    const totalExpense = expensePaid + expenseFuture;
    const realizedProfit = report?.general.realized_profit ?? summary?.total_profit ?? received - expensePaid;
    const projectedResult =
      report?.general.projected_result ??
      received + futureIncome - (report?.general.expense_total_potential ?? summary?.projected_total_expense ?? expensePaid);
    const cashAvailable = (summary?.accounts ?? []).reduce((acc, a) => acc + (a.balance ?? 0), 0);
    const pendingRevenue = report?.subscriptions_projection?.pending_subscription_revenue ?? 0;
    const futureCommitments = expenseFuture;
    return {
      received,
      futureIncome,
      expensePaid,
      expenseFuture,
      totalExpense,
      realizedProfit,
      projectedResult,
      cashAvailable,
      pendingRevenue,
      futureCommitments,
    };
  }, [report, summary]);

  const handlePayOcc = async (id: string) => {
    try {
      await financialService.payRecurringOccurrence(id, {});
      toast.success("Marcada como paga");
      financialService.listRecurringOccurrences(upcomingRange).then(setOccurrences).catch(() => {});
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  if (loading && !summary) {
    return <p className="text-sm text-muted-foreground py-10 text-center">A carregar resumo…</p>;
  }

  return (
    <div className={cn("space-y-6", financeMobilePageBottomPad)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Visão geral</h2>
          <p className="text-sm text-muted-foreground">
            Receita inclui valores recebidos aqui e faturas de clientes já pagas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ano</span>
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-500/20 bg-gradient-to-br from-card to-emerald-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Receita recebida
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatBrl(overview.received)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Entradas concluídas + faturas/cobranças pagas.</CardContent>
        </Card>
        <Card className="border-violet-500/20 bg-gradient-to-br from-card to-violet-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-violet-600" />
              Receita futura
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatBrl(overview.futureIncome)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Valores esperados de assinaturas, recorrências e cobranças abertas.
          </CardContent>
        </Card>
        <Card className="border-rose-500/20 bg-gradient-to-br from-card to-rose-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-rose-600" />
              Despesas
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatBrl(overview.totalExpense)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <span>Pagas: {formatBrl(overview.expensePaid)}</span> · <span>Futuras: {formatBrl(overview.expenseFuture)}</span>
          </CardContent>
        </Card>
        <Card
          className={`${
            overview.projectedResult >= 0
              ? "border-emerald-500/30 bg-gradient-to-br from-card to-emerald-500/10"
              : "border-rose-500/30 bg-gradient-to-br from-card to-rose-500/10"
          }`}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Target className={overview.projectedResult >= 0 ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-rose-600"} />
              Resultado previsto
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{formatBrl(overview.projectedResult)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Receita recebida + receita futura menos despesas do período.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-sky-500/20 bg-gradient-to-br from-card to-sky-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-sky-600" />
              Caixa disponível
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatBrl(overview.cashAvailable)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Soma atual das contas cadastradas.</CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-gradient-to-br from-card to-amber-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              Receita pendente
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatBrl(overview.pendingRevenue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Cobranças em aberto aguardando pagamento.</CardContent>
        </Card>
        <Card className="border-orange-500/20 bg-gradient-to-br from-card to-orange-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-orange-600" />
              Compromissos futuros
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatBrl(overview.futureCommitments)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Despesas recorrentes, parcelas de cartão e contas previstas.
          </CardContent>
        </Card>
      </div>

      <Card className={overview.projectedResult >= 0 ? "border-emerald-500/20" : "border-rose-500/20"}>
        <CardContent className="py-4">
          <p
            className={`text-sm font-medium ${
              overview.projectedResult >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {overview.projectedResult >= 0
              ? "Resultado previsto positivo para o período."
              : "Atenção: suas despesas previstas superam sua receita esperada para este período."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Próximas despesas</CardTitle>
              <CardDescription>Recorrentes do mês — pode pagar a partir daqui</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="up-m" className="text-xs text-muted-foreground">
              Mês
            </Label>
            <Input
              id="up-m"
              type="month"
              className="w-[160px]"
              value={upcomingMonth}
              onChange={(e) => setUpcomingMonth(e.target.value)}
            />
            <Button variant="outline" size="sm" asChild>
              <NavLink to="/finance/accounts-payable#hub-regras-recorrencia">Gerir recorrentes</NavLink>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {occLoading ? (
            <p className="text-sm text-muted-foreground py-6">A carregar…</p>
          ) : occurrences.filter((o) => o.status === "planned" || o.status === "pending").length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nada em aberto neste mês.{" "}
              <NavLink to="/finance/accounts-payable#hub-regras-recorrencia" className="text-primary underline-offset-2 hover:underline">
                Criar despesa recorrente
              </NavLink>
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {occurrences
                .filter((o) => o.status === "planned" || o.status === "pending")
                .map((o) => (
                  <li key={o.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium tabular-nums">{o.due_date}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatBrl(o.amount_cents / 100)} · {o.status === "planned" ? "Planejada" : "Em aberto"}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => handlePayOcc(o.id)}>
                      Pagar
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receita e despesas por mês</CardTitle>
          <CardDescription>Realizado e previsto com barras empilhadas</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px] w-full pt-2">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">Sem dados para este ano.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                      compactDisplay: "short",
                      maximumFractionDigits: 1,
                    }).format(Number(v))
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatBrl(Number(value)), name]}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as OverviewChartRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-md border bg-background p-3 text-xs shadow-sm space-y-1">
                        <p className="font-medium">{label}</p>
                        <p>Receita recebida: {formatBrl(row.receita_recebida)}</p>
                        <p>Receita futura: {formatBrl(row.ganhos_previstos)}</p>
                        <p>Receita potencial total: {formatBrl(row.receita_potencial_total)}</p>
                        <p>Despesas pagas: {formatBrl(row.despesas_pagas)}</p>
                        <p>Despesas futuras: {formatBrl(row.despesas_previstas)}</p>
                        <p>Despesas totais: {formatBrl(row.despesa_potencial_total)}</p>
                        <p className="font-medium">Resultado previsto: {formatBrl(row.resultado_previsto)}</p>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar
                  dataKey="receita_recebida"
                  fill="hsl(142 76% 36%)"
                  radius={[0, 0, 0, 0]}
                  stackId="receita"
                  name="Receita recebida"
                />
                <Bar
                  dataKey="ganhos_previstos"
                  fill="hsl(142 55% 62%)"
                  radius={[4, 4, 0, 0]}
                  stackId="receita"
                  name="Receita futura"
                />
                <Bar
                  dataKey="despesas_pagas"
                  fill="hsl(0 84% 60%)"
                  radius={[0, 0, 0, 0]}
                  stackId="despesa"
                  name="Despesas pagas"
                />
                <Bar
                  dataKey="despesas_previstas"
                  fill="hsl(16 86% 72%)"
                  radius={[4, 4, 0, 0]}
                  stackId="despesa"
                  name="Despesas futuras"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparativo no ano selecionado</CardTitle>
          <CardDescription>Mesmo padrão visual de realizado + previsto</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px] w-full pt-2">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">Sem dados para este ano.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                      compactDisplay: "short",
                      maximumFractionDigits: 1,
                    }).format(Number(v))
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatBrl(Number(value)), name]}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as OverviewChartRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-md border bg-background p-3 text-xs shadow-sm space-y-1">
                        <p className="font-medium">{label}</p>
                        <p>Receita recebida: {formatBrl(row.receita_recebida)}</p>
                        <p>Receita futura: {formatBrl(row.ganhos_previstos)}</p>
                        <p>Receita potencial total: {formatBrl(row.receita_potencial_total)}</p>
                        <p>Despesas pagas: {formatBrl(row.despesas_pagas)}</p>
                        <p>Despesas futuras: {formatBrl(row.despesas_previstas)}</p>
                        <p>Despesas totais: {formatBrl(row.despesa_potencial_total)}</p>
                        <p className="font-medium">Resultado previsto: {formatBrl(row.resultado_previsto)}</p>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar dataKey="receita_recebida" fill="hsl(142 76% 36%)" radius={[0, 0, 0, 0]} stackId="receita" name="Receita recebida" />
                <Bar dataKey="ganhos_previstos" fill="hsl(142 55% 62%)" radius={[4, 4, 0, 0]} stackId="receita" name="Receita futura" />
                <Bar dataKey="despesas_pagas" fill="hsl(0 84% 60%)" radius={[0, 0, 0, 0]} stackId="despesa" name="Despesas pagas" />
                <Bar dataKey="despesas_previstas" fill="hsl(16 86% 72%)" radius={[4, 4, 0, 0]} stackId="despesa" name="Despesas futuras" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo por conta</CardTitle>
          <CardDescription>Com base no saldo inicial e movimentos concluídos</CardDescription>
        </CardHeader>
        <CardContent>
          {(summary?.accounts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há contas.{" "}
              <NavLink to="/finance/accounts" className="text-primary underline-offset-2 hover:underline">
                Criar uma conta
              </NavLink>
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {summary!.accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border bg-card/60 px-4 py-3"
                >
                  <span className="font-medium">{a.name}</span>
                  <span className="tabular-nums text-sm">{formatBrl(a.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Para o relatório detalhado antigo (várias fontes combinadas), use{" "}
        <NavLink to="/finance/resumo" className="text-primary underline-offset-2 hover:underline">
          relatório avançado
        </NavLink>
        .
      </p>

      <FinanceMobileBottomBar
        actions={[
          {
            key: "income",
            label: "+ Entrada",
            variant: "success",
            icon: TrendingUp,
            onClick: () => navigate("/finance/transactions?new=income"),
          },
          {
            key: "expense",
            label: "+ Saída",
            variant: "danger",
            icon: TrendingDown,
            onClick: () => navigate("/finance/transactions?new=expense"),
          },
        ]}
      />
    </div>
  );
};

export default FinancialOverviewPage;
