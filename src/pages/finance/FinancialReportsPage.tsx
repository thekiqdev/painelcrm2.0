import React, { useCallback, useEffect, useState } from "react";
import {
  financialService,
  type FinancialEnterpriseReportDto,
} from "@/services/financial";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { Download, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { FinanceMobileBottomBar, financeMobilePageBottomPad } from "@/components/finance/FinanceMobileBottomBar";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";

function formatBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatPct(p: number | null): string {
  if (p === null) return "—";
  if (p === 0) return "0%";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Math.max(0, Math.min(11, parseInt(m ?? "1", 10) - 1));
  const short = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][idx];
  return `${short}/${y ?? ""}`;
}

const EMPTY_SUBS_PROJECTION: NonNullable<FinancialEnterpriseReportDto["subscriptions_projection"]> = {
  active_subscriptions_count: 0,
  projected_subscription_revenue: 0,
  pending_subscription_revenue: 0,
  paid_subscription_revenue: 0,
  projected_cycles_count: 0,
  paid_cycles_count: 0,
  pending_cycles_count: 0,
  potential_subscription_revenue: 0,
  cycles_read_used: false,
  by_month: [],
  rows: [],
};

function subscriptionChartRows(
  monthly: FinancialEnterpriseReportDto["monthly"]
): Array<{
  name: string;
  receita_recebida: number;
  ganhos_previstos: number;
  receita_potencial_total: number;
  despesas_pagas: number;
  despesas_previstas: number;
  despesa_potencial_total: number;
  resultado_previsto: number;
}> {
  return monthly.map((m) => {
    const receita_recebida = m.income_received ?? m.income ?? 0;
    const ganhos_previstos =
      m.income_projected_subscriptions ??
      (m.subscription_revenue_pending ?? 0) + (m.subscription_revenue_projected ?? 0);
    const receita_potencial_total = m.income_total_potential ?? receita_recebida + ganhos_previstos;
    const despesas_pagas = m.expense_paid ?? m.expense ?? 0;
    const despesas_previstas = m.expense_projected ?? Math.max(0, (m.projected_expense ?? despesas_pagas) - despesas_pagas);
    const despesa_potencial_total = m.expense_total_potential ?? m.projected_expense ?? despesas_pagas + despesas_previstas;
    const resultado_previsto = m.projected_result ?? receita_potencial_total - despesa_potencial_total;
    return {
      name: monthLabel(m.month),
      receita_recebida,
      ganhos_previstos,
      receita_potencial_total,
      despesas_pagas,
      despesas_previstas,
      despesa_potencial_total,
      resultado_previsto,
    };
  });
}

function downloadReportCsv(data: FinancialEnterpriseReportDto): void {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const line = (cells: (string | number)[]) => cells.map(esc).join(";");
  const lines: string[] = [];
  lines.push(line(["Relatório financeiro", data.period.from, data.period.to]));
  lines.push(line(["Período anterior (comparação)", data.previous_period.from, data.previous_period.to]));
  lines.push("");
  lines.push(line(["Visão geral"]));
  lines.push(line(["Receita total", data.general.total_income]));
  lines.push(line(["Despesa total", data.general.total_expense]));
  lines.push(line(["Lucro", data.general.total_profit]));
  lines.push(line(["Receita (movimentos)", data.general.transaction_income]));
  lines.push(line(["Receita (faturas de clientes)", data.general.invoice_income]));
  lines.push(line(["Despesas (movimentos)", data.general.transaction_expense]));
  lines.push(line(["Despesas recorrentes previstas", data.general.planned_recurring_expense]));
  lines.push(line(["Cartão — parcelas previstas", data.general.planned_credit_card]));
  lines.push(line(["Despesas previstas (total)", data.general.projected_total_expense]));
  lines.push(line(["Saldo previsto", data.general.projected_balance]));
  lines.push(line(["Variação receita vs período ant.", formatPct(data.comparison.total_income_pct)]));
  lines.push(line(["Variação despesa vs período ant.", formatPct(data.comparison.total_expense_pct)]));
  lines.push(line(["Variação lucro vs período ant.", formatPct(data.comparison.total_profit_pct)]));
  lines.push("");
  lines.push(
    line([
      "Mês",
      "Receita",
      "Despesa",
      "Lucro",
      "Recorrente prev.",
      "Cartão prev.",
      "Assin. realizada",
      "Assin. pendente",
      "Assin. prevista",
    ])
  );
  for (const m of data.monthly) {
    lines.push(
      line([
        m.month,
        m.income,
        m.expense,
        m.profit,
        m.planned_recurring,
        m.planned_credit_card,
        m.subscription_revenue_realized ?? 0,
        m.subscription_revenue_pending ?? 0,
        m.subscription_revenue_projected ?? 0,
      ])
    );
  }
  lines.push("");
  lines.push(line(["Bancos e contas", "Receita período", "Despesa período", "Saldo líquido período", "Saldo estimado"]));
  for (const a of data.by_account) {
    lines.push(line([a.name, a.income, a.expense, a.net, a.estimated_balance]));
  }
  lines.push("");
  lines.push(line(["Despesas por categoria", "Valor"]));
  for (const r of data.expenses_by_category) {
    lines.push(line([r.name, r.amount]));
  }
  lines.push("");
  lines.push(line(["Receitas por categoria (movimentos)", "Valor"]));
  for (const r of data.income_by_category) {
    lines.push(line([r.name, r.amount]));
  }
  lines.push("");
  lines.push(line(["Cobranças pagas por cliente", "Faturas", "Valor"]));
  for (const r of data.billing_by_client) {
    lines.push(line([r.client_name, r.invoice_count, r.amount]));
  }
  lines.push("");
  lines.push(line(["Pagamentos de fatura de cartão (saída da conta)", data.credit_card_bank_payments]));
  lines.push(line(["Recorrentes — em aberto no período (vencimento)", data.recurring_snapshot.due_in_period_still_open]));
  lines.push(line(["Recorrentes — pagas no período", data.recurring_snapshot.paid_in_period]));
  const sp = data.subscriptions_projection ?? EMPTY_SUBS_PROJECTION;
  lines.push("");
  lines.push(line(["Assinaturas — receita realizada (faturas pagas)", sp.paid_subscription_revenue]));
  lines.push(line(["Assinaturas — receita pendente", sp.pending_subscription_revenue]));
  lines.push(line(["Assinaturas — receita prevista (ciclos sem fatura)", sp.projected_subscription_revenue]));
  lines.push(line(["Assinaturas — potencial total do período", sp.potential_subscription_revenue]));
  lines.push(line(["Assinaturas activas", sp.active_subscriptions_count]));
  lines.push("");
  lines.push(
    line([
      "Assinatura (cliente)",
      "Valor recorrente",
      "Periodicidade",
      "Próxima cobrança",
      "Ciclos pagos período",
      "Ciclos pendentes período",
      "Receita prevista período",
      "Limite ciclos",
      "Estado",
    ])
  );
  for (const row of sp.rows) {
    lines.push(
      line([
        row.client_name,
        row.amount_recurring,
        row.periodicity_label_pt,
        row.next_billing_date,
        row.paid_cycles_in_period,
        row.pending_cycles_in_period,
        row.projected_revenue_in_period,
        row.cycles_unlimited ? "Ilimitados" : row.max_cycles ?? "",
        row.status,
      ])
    );
  }
  lines.push("");
  lines.push(line(["Cartão", "Tipo", "Utilizado", "Limite", "Próx. venc.", "Próx. fatura"]));
  for (const c of data.credit_cards) {
    lines.push(
      line([
        c.name,
        c.type,
        c.used,
        c.limit ?? "",
        c.next_due ?? "",
        c.next_expected ?? "",
      ])
    );
  }

  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-financeiro-${data.period.from}_${data.period.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const FinancialReportsPage = () => {
  const navigate = useNavigate();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [preset, setPreset] = useState<string>("current_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>(String(currentMonth).padStart(2, "0"));
  const [yearFilter, setYearFilter] = useState<string>(String(currentYear));
  const [report, setReport] = useState<FinancialEnterpriseReportDto | null>(null);
  const [loading, setLoading] = useState(true);

  const runLoad = useCallback((params: { preset?: string; from?: string; to?: string }) => {
    setLoading(true);
    financialService
      .getEnterpriseReport(params)
      .then(setReport)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar relatório");
        setReport(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const yearCivilRange = useCallback((): { from: string; to: string } | null => {
    const y = Math.trunc(Number(yearFilter));
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return null;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }, [yearFilter]);

  useEffect(() => {
    if (preset === "custom") return;
    if (preset === "full_year") {
      const r = yearCivilRange();
      if (!r) {
        toast.error("Ano inválido para Ano civil");
        return;
      }
      runLoad(r);
      return;
    }
    runLoad({ preset });
  }, [preset, runLoad, yearCivilRange]);

  const load = () => {
    if (preset === "custom") {
      if (!from.trim() || !to.trim()) {
        toast.error("Indique data inicial e final");
        return;
      }
      runLoad({ from: from.trim(), to: to.trim() });
      return;
    }
    if (preset === "full_year") {
      const r = yearCivilRange();
      if (!r) {
        toast.error("Ano inválido para Ano civil");
        return;
      }
      runLoad(r);
      return;
    }
    runLoad({ preset });
  };

  const applyMonthYear = () => {
    const y = Math.trunc(Number(yearFilter));
    const m = Math.trunc(Number(monthFilter));
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      toast.error("Ano inválido");
      return;
    }
    if (!Number.isFinite(m) || m < 1 || m > 12) {
      toast.error("Mês inválido");
      return;
    }
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(y, m, 0).getDate();
    const f = `${y}-${mm}-01`;
    const t = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;
    setPreset("custom");
    setFrom(f);
    setTo(t);
    runLoad({ from: f, to: t });
  };

  const r = report;
  const sp = r?.subscriptions_projection ?? EMPTY_SUBS_PROJECTION;
  const subChartData = r ? subscriptionChartRows(r.monthly) : [];
  const bankTotals = r
    ? r.by_account.reduce(
        (acc, row) => {
          acc.income += row.income;
          acc.expense += row.expense;
          acc.net += row.net;
          acc.balance += row.estimated_balance;
          return acc;
        },
        { income: 0, expense: 0, net: 0, balance: 0 }
      )
    : { income: 0, expense: 0, net: 0, balance: 0 };

  return (
    <div className={cn("space-y-6", financeMobilePageBottomPad)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Relatórios</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Visão consolidada para decisão: contas, categorias, cobranças de clientes, cartões e recorrências. Exporte para
            planilha (CSV) para arquivo ou auditoria.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Período rápido</Label>
            <Select
              value={preset === "custom" ? "custom" : preset}
              onValueChange={(v) => {
                if (v === "custom") {
                  setPreset("custom");
                  if (report) {
                    setFrom(report.period.from);
                    setTo(report.period.to);
                  } else {
                    const d = new Date();
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const last = new Date(y, d.getMonth() + 1, 0).getDate();
                    setFrom(`${y}-${m}-01`);
                    setTo(`${y}-${m}-${String(last).padStart(2, "0")}`);
                  }
                } else {
                  setPreset(v);
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Mês actual</SelectItem>
                <SelectItem value="last_month">Mês anterior</SelectItem>
                <SelectItem value="ytd">Ano até hoje</SelectItem>
                <SelectItem value="full_year">Ano civil (Jan–Dez)</SelectItem>
                <SelectItem value="custom">Datas personalizadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="01">Janeiro</SelectItem>
                <SelectItem value="02">Fevereiro</SelectItem>
                <SelectItem value="03">Março</SelectItem>
                <SelectItem value="04">Abril</SelectItem>
                <SelectItem value="05">Maio</SelectItem>
                <SelectItem value="06">Junho</SelectItem>
                <SelectItem value="07">Julho</SelectItem>
                <SelectItem value="08">Agosto</SelectItem>
                <SelectItem value="09">Setembro</SelectItem>
                <SelectItem value="10">Outubro</SelectItem>
                <SelectItem value="11">Novembro</SelectItem>
                <SelectItem value="12">Dezembro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Input
              type="number"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-[110px]"
              min={2000}
              max={2100}
            />
          </div>
          <Button type="button" variant="secondary" onClick={applyMonthYear}>
            Aplicar mês/ano
          </Button>
          {preset === "custom" && (
            <>
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
              </div>
              <Button type="button" variant="secondary" onClick={load}>
                Aplicar
              </Button>
            </>
          )}
          <Button type="button" variant="outline" size="icon" onClick={load} disabled={loading} title="Actualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {r && (
            <Button type="button" variant="outline" onClick={() => downloadReportCsv(r)}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          )}
        </div>
      </div>

      {loading && !r ? (
        <p className="text-sm text-muted-foreground py-10 text-center">A gerar relatórios…</p>
      ) : !r ? (
        <p className="text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <Tabs defaultValue="geral" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="geral">Visão geral</TabsTrigger>
            <TabsTrigger value="bancos">Bancos</TabsTrigger>
            <TabsTrigger value="despesas">Despesas</TabsTrigger>
            <TabsTrigger value="receitas">Receitas e cobranças</TabsTrigger>
            <TabsTrigger value="cartoes">Cartões e recorrências</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Período: <strong className="text-foreground">{r.period.from}</strong> a{" "}
              <strong className="text-foreground">{r.period.to}</strong> · Comparado com{" "}
              <strong className="text-foreground">{r.previous_period.from}</strong> —{" "}
              <strong className="text-foreground">{r.previous_period.to}</strong>
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-emerald-500/20">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Receita total
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{formatBrl(r.general.total_income)}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Ant.: {formatBrl(r.previous_general.total_income)} ·{" "}
                  <span
                    className={
                      (r.comparison.total_income_pct ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                    }
                  >
                    {formatPct(r.comparison.total_income_pct)}
                  </span>
                </CardContent>
              </Card>
              <Card className="border-rose-500/20">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingDown className="h-4 w-4" />
                    Despesa total
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{formatBrl(r.general.total_expense)}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Ant.: {formatBrl(r.previous_general.total_expense)} ·{" "}
                  <span
                    className={
                      (r.comparison.total_expense_pct ?? 0) <= 0 ? "text-emerald-600" : "text-rose-600"
                    }
                  >
                    {formatPct(r.comparison.total_expense_pct)}
                  </span>
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>Lucro</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{formatBrl(r.general.total_profit)}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Ant.: {formatBrl(r.previous_general.total_profit)} ·{" "}
                  <span
                    className={
                      (r.comparison.total_profit_pct ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                    }
                  >
                    {formatPct(r.comparison.total_profit_pct)}
                  </span>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-emerald-600/15 bg-emerald-500/[0.04]">
                <CardHeader className="pb-2">
                  <CardDescription>Receita realizada</CardDescription>
                  <CardTitle className="text-xl tabular-nums">
                    {formatBrl(r.general.received_income ?? r.general.total_income)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Entradas concluídas + faturas pagas.
                </CardContent>
              </Card>
              <Card className="border-amber-600/20 bg-amber-500/[0.05]">
                <CardHeader className="pb-2">
                  <CardDescription>Receita pendente</CardDescription>
                  <CardTitle className="text-xl tabular-nums">{formatBrl(sp.pending_subscription_revenue)}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Faturas emitidas e não pagas com vencimento no período ({sp.pending_cycles_count}).
                </CardContent>
              </Card>
              <Card className="border-violet-600/20 bg-violet-500/[0.05]">
                <CardHeader className="pb-2">
                  <CardDescription>Receita prevista por assinaturas</CardDescription>
                  <CardTitle className="text-xl tabular-nums">
                    {formatBrl(
                      r.general.projected_subscription_income ??
                        sp.pending_subscription_revenue + sp.projected_subscription_revenue
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Faturas recorrentes pendentes + ciclos futuros de assinaturas ativas.
                  {sp.cycles_read_used ? (
                    <span className="block mt-1 text-[10px]">Dedupe com subscription_cycles.</span>
                  ) : null}
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>Potencial total do período</CardDescription>
                  <CardTitle className="text-xl tabular-nums">
                    {formatBrl(
                      r.general.total_income_potential ??
                        (r.general.received_income ?? r.general.total_income) +
                          (r.general.projected_subscription_income ??
                            sp.pending_subscription_revenue + sp.projected_subscription_revenue)
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Receita recebida + receita prevista por assinaturas.
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Previsão e cartões</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Despesas recorrentes (previstas)</span>
                    <span className="tabular-nums">{formatBrl(r.general.planned_recurring_expense)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parcelas de cartão (previstas)</span>
                    <span className="tabular-nums">{formatBrl(r.general.planned_credit_card)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Despesas previstas (total)</span>
                    <span className="tabular-nums font-medium">{formatBrl(r.general.projected_total_expense)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo previsto</span>
                    <span className="tabular-nums font-medium">{formatBrl(r.general.projected_balance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faturas de cartão em aberto</span>
                    <span className="tabular-nums">{formatBrl(r.general.open_credit_card_statements_expected)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Origem da receita</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Movimentos (entradas)</span>
                    <span className="tabular-nums">{formatBrl(r.general.transaction_income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faturas de clientes pagas</span>
                    <span className="tabular-nums">{formatBrl(r.general.invoice_income)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por mês (no intervalo)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Despesa</TableHead>
                      <TableHead className="text-right">Lucro</TableHead>
                      <TableHead className="text-right">Recorr. prev.</TableHead>
                      <TableHead className="text-right">Cartão prev.</TableHead>
                      <TableHead className="text-right text-emerald-700 dark:text-emerald-400">Realiz. ass.</TableHead>
                      <TableHead className="text-right text-amber-800 dark:text-amber-400">Pend. ass.</TableHead>
                      <TableHead className="text-right text-violet-800 dark:text-violet-300">Prev. ass.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.monthly.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>{monthLabel(m.month)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(m.income)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(m.expense)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(m.profit)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatBrl(m.planned_recurring)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatBrl(m.planned_credit_card)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatBrl(m.subscription_revenue_realized ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-amber-800 dark:text-amber-400">
                          {formatBrl(m.subscription_revenue_pending ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-violet-800 dark:text-violet-300">
                          {formatBrl(m.subscription_revenue_projected ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita e despesas por mês</CardTitle>
                <CardDescription>
                  Realizado e previsto com barras empilhadas, no mesmo padrão visual do resumo geral.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[320px] w-full min-w-[280px]">
                {subChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">Sem meses no intervalo.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subChartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/60" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        tickFormatter={(v) =>
                          new Intl.NumberFormat("pt-BR", {
                            notation: "compact",
                            compactDisplay: "short",
                            maximumFractionDigits: 1,
                          }).format(Number(v))
                        }
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [formatBrl(value), name]}
                        labelStyle={{ color: "inherit" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload as
                            | {
                                receita_recebida: number;
                                ganhos_previstos: number;
                                receita_potencial_total: number;
                                despesas_pagas: number;
                                despesas_previstas: number;
                                despesa_potencial_total: number;
                                resultado_previsto: number;
                              }
                            | undefined;
                          if (!row) return null;
                          return (
                            <div className="rounded-md border bg-background p-3 text-xs shadow-sm space-y-1">
                              <p className="font-medium">{label}</p>
                              <p>Receita recebida: {formatBrl(row.receita_recebida)}</p>
                              <p>Ganhos previstos: {formatBrl(row.ganhos_previstos)}</p>
                              <p>Receita potencial total: {formatBrl(row.receita_potencial_total)}</p>
                              <p>Despesas pagas: {formatBrl(row.despesas_pagas)}</p>
                              <p>Despesas previstas: {formatBrl(row.despesas_previstas)}</p>
                              <p>Despesa potencial total: {formatBrl(row.despesa_potencial_total)}</p>
                              <p className="font-medium">Resultado previsto: {formatBrl(row.resultado_previsto)}</p>
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="receita_recebida"
                        name="Receita recebida"
                        stackId="receita"
                        fill="hsl(142 76% 36%)"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="ganhos_previstos"
                        name="Ganhos previstos"
                        stackId="receita"
                        fill="hsl(142 55% 62%)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="despesas_pagas"
                        name="Despesas pagas"
                        stackId="despesa"
                        fill="hsl(0 84% 60%)"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="despesas_previstas"
                        name="Despesas previstas"
                        stackId="despesa"
                        fill="hsl(16 86% 72%)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bancos" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Contas cadastradas</CardDescription>
                  <CardTitle className="text-xl tabular-nums">{r.by_account.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Saldo total estimado</CardDescription>
                  <CardTitle className="text-xl tabular-nums">{formatBrl(bankTotals.balance)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Receitas nas contas</CardDescription>
                  <CardTitle className="text-xl tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatBrl(bankTotals.income)}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Líquido do período</CardDescription>
                  <CardTitle className="text-xl tabular-nums">{formatBrl(bankTotals.net)}</CardTitle>
                </CardHeader>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Movimento por conta</CardTitle>
                <CardDescription>Entradas e saídas concluídas no período e saldo estimado actual.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead className="text-right">Receitas</TableHead>
                      <TableHead className="text-right">Despesas</TableHead>
                      <TableHead className="text-right">Líquido período</TableHead>
                      <TableHead className="text-right">Saldo estimado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.by_account.map((a) => (
                      <TableRow key={a.account_id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatBrl(a.income)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
                          {formatBrl(a.expense)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(a.net)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(a.estimated_balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="despesas">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Despesas por categoria</CardTitle>
                <CardDescription>Movimentos de despesa concluídos, agrupados por categoria.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.expenses_by_category.map((row, i) => (
                      <TableRow key={`${row.category_id ?? "x"}-${i}`}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {r.expenses_by_category.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Sem despesas no período.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receitas" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receitas por categoria</CardTitle>
                <CardDescription>Movimentos de entrada concluídos.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.income_by_category.map((row, i) => (
                      <TableRow key={`${row.category_id ?? "x"}-${i}`}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {r.income_by_category.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Sem receitas registadas como movimentos.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cobranças pagas por cliente</CardTitle>
                <CardDescription>
                  Faturas de clientes com pagamento confirmado no período.{" "}
                  <NavLink to="/customer-invoices" className="text-primary underline-offset-2 hover:underline">
                    Ver faturas
                  </NavLink>
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">N.º faturas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.billing_by_client.map((row) => (
                      <TableRow key={row.client_id}>
                        <TableCell>{row.client_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.invoice_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {r.billing_by_client.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Sem cobranças pagas no período.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assinaturas</CardTitle>
                <CardDescription>
                  Assinaturas activas e projeção no período.{" "}
                  <NavLink to="/crm-subscriptions" className="text-primary underline-offset-2 hover:underline">
                    Gerir assinaturas
                  </NavLink>
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor recorrente</TableHead>
                      <TableHead>Periodicidade</TableHead>
                      <TableHead>Próxima cobrança</TableHead>
                      <TableHead className="text-right">Ciclos pagos</TableHead>
                      <TableHead className="text-right">Ciclos pendentes</TableHead>
                      <TableHead className="text-right">Receita prevista no período</TableHead>
                      <TableHead>Ciclos (limite)</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sp.rows.map((row) => (
                      <TableRow key={row.subscription_id}>
                        <TableCell className="font-medium">
                          <NavLink
                            to={`/crm-subscriptions/${row.subscription_id}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {row.client_name}
                          </NavLink>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(row.amount_recurring)}</TableCell>
                        <TableCell className="text-sm">{row.periodicity_label_pt}</TableCell>
                        <TableCell className="tabular-nums text-sm">
                          {row.next_billing_date
                            ? row.next_billing_date.split("-").reverse().join("/")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.paid_cycles_in_period}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.pending_cycles_in_period}</TableCell>
                        <TableCell className="text-right tabular-nums text-violet-800 dark:text-violet-300">
                          {formatBrl(row.projected_revenue_in_period)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.cycles_unlimited ? "Ilimitados" : row.max_cycles != null ? `${row.max_cycles} máx.` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{row.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {sp.rows.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">Sem assinaturas activas no período.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cartoes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cartões de crédito</CardTitle>
                <CardDescription>
                  Utilização e próxima fatura.{" "}
                  <NavLink to="/finance/credit-cards" className="text-primary underline-offset-2 hover:underline">
                    Gerir cartões
                  </NavLink>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="text-muted-foreground">Saída da conta para pagar faturas (período)</div>
                    <div className="text-lg font-semibold tabular-nums">{formatBrl(r.credit_card_bank_payments)}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="text-muted-foreground">Faturas em aberto (esperado)</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {formatBrl(r.general.open_credit_card_statements_expected)}
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cartão</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Utilizado</TableHead>
                      <TableHead className="text-right">Limite</TableHead>
                      <TableHead>Próx. vencimento</TableHead>
                      <TableHead className="text-right">Próx. fatura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.credit_cards.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.type === "business" ? "Empresa" : "Pessoal"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBrl(c.used)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.limit != null ? formatBrl(c.limit) : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">
                          {c.next_due ? formatDateOnlyPtBr(c.next_due) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.next_expected != null ? formatBrl(c.next_expected) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {r.credit_cards.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Despesas recorrentes (período)</CardTitle>
                <CardDescription>
                  Valores com vencimento no período ainda em aberto, e valores pagos no período.{" "}
                  <NavLink to="/finance/accounts-payable#hub-regras-recorrencia" className="text-primary underline-offset-2 hover:underline">
                    Gerir recorrências
                  </NavLink>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between max-w-md">
                  <span className="text-muted-foreground">Em aberto (vence no período)</span>
                  <span className="tabular-nums font-medium">
                    {formatBrl(r.recurring_snapshot.due_in_period_still_open)}
                  </span>
                </div>
                <div className="flex justify-between max-w-md">
                  <span className="text-muted-foreground">Pagas (registadas no período)</span>
                  <span className="tabular-nums font-medium">
                    {formatBrl(r.recurring_snapshot.paid_in_period)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

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

export default FinancialReportsPage;
