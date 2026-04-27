import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FinancialSummary, type FinancialSummaryBarRow } from "@/components/finance/FinancialSummary";
import { financeService, type Invoice as ApiInvoice, type Expense as ApiExpense, type BillingReceipt } from "@/services/finance";
import { financeModuleService, type FinanceIncomeEntry, type FinanceExpenseEntry } from "@/services/financeModule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { chartBuckets, dateInRange, overallRange, type FinancePeriodMode } from "./periodRange";

function aggregateBucket(
  from: string,
  to: string,
  ctx: {
    paidInvoices: ApiInvoice[];
    billing: BillingReceipt[];
    incomes: FinanceIncomeEntry[];
    legacyExpenses: ApiExpense[];
    moduleExpenses: FinanceExpenseEntry[];
  }
): { income: number; expenses: number } {
  let income = 0;
  for (const inv of ctx.paidInvoices) {
    const d = inv.issue_date.slice(0, 10);
    if (dateInRange(d, from, to)) income += inv.total;
  }
  for (const r of ctx.billing) {
    const d = r.paid_at.slice(0, 10);
    if (dateInRange(d, from, to)) income += r.amount_cents / 100;
  }
  for (const e of ctx.incomes) {
    const d = e.received_at.slice(0, 10);
    if (dateInRange(d, from, to)) income += e.amount_cents / 100;
  }
  let expenses = 0;
  for (const ex of ctx.legacyExpenses) {
    const d = ex.date.slice(0, 10);
    if (dateInRange(d, from, to)) expenses += ex.amount;
  }
  for (const ex of ctx.moduleExpenses) {
    if (ex.status === "cancelled") continue;
    const d = ex.expense_date.slice(0, 10);
    if (dateInRange(d, from, to)) expenses += ex.amount_cents / 100;
  }
  return { income, expenses };
}

const FinanceSummaryPage = () => {
  const now = new Date();
  const [mode, setMode] = useState<FinancePeriodMode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  const [loading, setLoading] = useState(true);
  const [paidInvoices, setPaidInvoices] = useState<ApiInvoice[]>([]);
  const [billing, setBilling] = useState<BillingReceipt[]>([]);
  const [incomes, setIncomes] = useState<FinanceIncomeEntry[]>([]);
  const [legacyExpenses, setLegacyExpenses] = useState<ApiExpense[]>([]);
  const [moduleExpenses, setModuleExpenses] = useState<FinanceExpenseEntry[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const range = useMemo(() => overallRange(mode, year, month, quarter), [mode, year, month, quarter]);

  const load = useCallback(async () => {
    const { from, to } = range;
    try {
      setLoading(true);
      const [inv, bill, inc, leg, mod, cats] = await Promise.all([
        financeService.getInvoices({ status: "paid", issue_from: from, issue_to: to }),
        financeService.getBillingReceipts({ from, to }),
        financeModuleService.listIncomeEntries({ from, to }),
        financeService.getExpenses({ start_date: from, end_date: to }),
        financeModuleService.listExpenseEntries({ from, to }),
        financeModuleService.listCategories().catch(() => []),
      ]);
      setPaidInvoices(inv);
      setBilling(bill);
      setIncomes(inc);
      setLegacyExpenses(leg);
      setModuleExpenses(mod);
      setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar resumo financeiro");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const ctx = useMemo(
    () => ({ paidInvoices, billing, incomes, legacyExpenses, moduleExpenses }),
    [paidInvoices, billing, incomes, legacyExpenses, moduleExpenses]
  );

  const barChartData: FinancialSummaryBarRow[] = useMemo(() => {
    const buckets = chartBuckets(mode, year, month, quarter);
    return buckets.map((b) => {
      const { income, expenses } = aggregateBucket(b.from, b.to, ctx);
      return { name: b.label, income, expenses, profit: income - expenses };
    });
  }, [ctx, mode, year, month, quarter]);

  const cardTotals = useMemo(() => {
    const { income, expenses } = aggregateBucket(range.from, range.to, ctx);
    return { revenue: income, expenses, profit: income - expenses };
  }, [ctx, range.from, range.to]);

  const categoryMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => {
      m[c.id] = c.name;
    });
    return m;
  }, [categories]);

  const financialData = useMemo(() => {
    const mergedExpenses = [
      ...legacyExpenses.map((e) => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        date: e.date,
        category: e.category || "—",
        isPaid: e.is_paid,
      })),
      ...moduleExpenses
        .filter((e) => e.status !== "cancelled")
        .map((e) => ({
          id: e.id,
          description: e.description,
          amount: e.amount_cents / 100,
          date: e.expense_date,
          category: e.category_id ? categoryMap[e.category_id] ?? "—" : "—",
          isPaid: e.status === "paid",
        })),
    ];
    return {
      invoices: paidInvoices.map((inv) => ({
        id: inv.id,
        clientName: "",
        amount: inv.total,
        date: inv.issue_date,
        status: inv.status,
      })),
      billingReceipts: billing.map((r) => ({
        id: r.id,
        amount: r.amount_cents / 100,
        date: r.paid_at.slice(0, 10),
      })),
      expenses: mergedExpenses,
    };
  }, [paidInvoices, billing, legacyExpenses, moduleExpenses, categoryMap]);

  const yearOptions = useMemo(() => {
    const y0 = now.getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 3 + i);
  }, [now]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">Carregando resumo…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Período</CardTitle>
          <CardDescription>Filtre o resumo por mês, trimestre ou ano (dados da empresa).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label>Visão</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as FinancePeriodMode)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ano</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === "month" && (
            <div className="space-y-2">
              <Label>Mês</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {String(m).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === "quarter" && (
            <div className="space-y-2">
              <Label>Trimestre</Label>
              <Select value={String(quarter)} onValueChange={(v) => setQuarter(parseInt(v, 10))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">T1</SelectItem>
                  <SelectItem value="2">T2</SelectItem>
                  <SelectItem value="3">T3</SelectItem>
                  <SelectItem value="4">T4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <FinancialSummary
        data={financialData}
        barChartData={barChartData}
        periodHint={range.label}
        cardTotals={cardTotals}
      />
    </div>
  );
};

export default FinanceSummaryPage;
