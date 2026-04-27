import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  financialService,
  type FinancialRecurringExpenseDto,
  type FinancialRecurringOccurrenceDto,
  type FinancialAccountDto,
  type ExpenseCategoryDto,
} from "@/services/financial";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Plus, RefreshCw } from "lucide-react";
import { NavLink } from "react-router-dom";

const PERIOD_LABEL: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function statusLabel(s: string): string {
  if (s === "planned") return "Planejada";
  if (s === "pending") return "Em aberto";
  if (s === "paid") return "Paga";
  if (s === "cancelled") return "Cancelada";
  return s;
}

const FinancialRecurringExpensesPage = () => {
  const [recurring, setRecurring] = useState<FinancialRecurringExpenseDto[]>([]);
  const [occurrences, setOccurrences] = useState<FinancialRecurringOccurrenceDto[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<FinancialRecurringExpenseDto | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [periodicity, setPeriodicity] = useState<FinancialRecurringExpenseDto["periodicity"]>("monthly");
  const [dueDay, setDueDay] = useState("10");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [scheduleType, setScheduleType] = useState<"infinite" | "finite">("infinite");
  const [maxOcc, setMaxOcc] = useState("12");
  const [isActive, setIsActive] = useState(true);

  const occMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [filterMonth, setFilterMonth] = useState(occMonth);

  const monthRange = useMemo(() => {
    const [y, m] = filterMonth.split("-").map((x) => parseInt(x, 10));
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const last = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    return { from, to };
  }, [filterMonth]);

  const loadRecurring = useCallback(() => {
    financialService
      .listRecurringExpenses()
      .then(setRecurring)
      .catch(() => toast.error("Erro ao carregar despesas recorrentes"));
  }, []);

  const loadOcc = useCallback(() => {
    financialService
      .listRecurringOccurrences({ from: monthRange.from, to: monthRange.to })
      .then(setOccurrences)
      .catch(() => toast.error("Erro ao carregar ocorrências"));
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    financialService
      .listAccounts()
      .then(setAccounts)
      .catch(() => toast.error("Erro ao carregar contas"));
    financialService
      .listCategories()
      .then(setCategories)
      .catch(() => toast.error("Erro ao carregar categorias"));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadRecurring(), loadOcc()])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadRecurring, loadOcc]);

  const recurringById = useMemo(() => new Map(recurring.map((r) => [r.id, r])), [recurring]);

  const resetForm = () => {
    setEditing(null);
    setDescription("");
    setAmount("");
    setCategoryId(categories[0]?.id ?? "");
    setAccountId(accounts[0]?.id ?? "");
    setPeriodicity("monthly");
    setDueDay("10");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setScheduleType("infinite");
    setMaxOcc("12");
    setIsActive(true);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (r: FinancialRecurringExpenseDto) => {
    setEditing(r);
    setDescription(r.description);
    setAmount(String(r.amount_cents / 100));
    setCategoryId(r.category_id);
    setAccountId(r.default_account_id);
    setPeriodicity(r.periodicity);
    setDueDay(String(r.due_day));
    setStartDate(r.start_date);
    setEndDate(r.end_date ?? "");
    setScheduleType(r.schedule_type);
    setMaxOcc(String(r.max_occurrences ?? 12));
    setIsActive(r.is_active);
    setOpen(true);
  };

  const submit = async () => {
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!description.trim()) {
      toast.error("Indique a descrição");
      return;
    }
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Valor inválido");
      return;
    }
    const dd = parseInt(dueDay, 10);
    if (Number.isNaN(dd)) {
      toast.error("Dia de vencimento inválido");
      return;
    }
    const w = periodicity === "weekly" || periodicity === "biweekly";
    if (w && (dd < 1 || dd > 7)) {
      toast.error("Semanal/quinzenal: use dia 1–7 (1=segunda … 7=domingo)");
      return;
    }
    if (!w && (dd < 1 || dd > 31)) {
      toast.error("Use dia do mês entre 1 e 31");
      return;
    }
    const endTrim = endDate.trim();
    if (endTrim && startDate && endTrim < startDate) {
      toast.error("A data de fim não pode ser anterior à data de início");
      return;
    }
    try {
      setSaving(true);
      const body = {
        description: description.trim(),
        amount_cents: cents,
        category_id: categoryId,
        default_account_id: accountId,
        periodicity,
        due_day: dd,
        start_date: startDate,
        end_date: endDate.trim() || null,
        schedule_type: scheduleType,
        max_occurrences: scheduleType === "finite" ? parseInt(maxOcc, 10) : null,
        is_active: isActive,
      };
      if (editing) {
        await financialService.updateRecurringExpense(editing.id, body);
        toast.success("Guardado");
      } else {
        await financialService.createRecurringExpense(body);
        toast.success("Criado");
      }
      setOpen(false);
      resetForm();
      loadRecurring();
      loadOcc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async (id: string) => {
    try {
      await financialService.regenerateRecurringExpense(id);
      toast.success("Ocorrências futuras atualizadas");
      loadOcc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const handlePay = async (id: string) => {
    try {
      await financialService.payRecurringOccurrence(id, {});
      toast.success("Marcada como paga");
      loadOcc();
      loadRecurring();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao pagar");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Despesas recorrentes</h2>
          <p className="text-sm text-muted-foreground">
            Contas fixas (aluguel, software, etc.) com lembretes de vencimento e registo de pagamento.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nova despesa recorrente
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Regras activas</CardTitle>
          <CardDescription>Edite para regenerar ocorrências futuras ainda não pagas</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">A carregar…</p>
          ) : recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma despesa recorrente ainda.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Periodicidade</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acções</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurring.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.description}</TableCell>
                      <TableCell className="tabular-nums">{formatBrlCents(r.amount_cents)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{PERIOD_LABEL[r.periodicity] ?? r.periodicity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.start_date}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge variant="secondary">Activa</Badge>
                        ) : (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRegenerate(r.id)} title="Regenerar ocorrências futuras">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Próximas despesas</CardTitle>
            <CardDescription>Ocorrências do mês seleccionado</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="occ-m" className="text-xs text-muted-foreground whitespace-nowrap">
              Mês
            </Label>
            <Input
              id="occ-m"
              type="month"
              className="w-[160px]"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {occurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem ocorrências neste mês.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acção</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {occurrences.map((o) => {
                    const rec = recurringById.get(o.recurring_expense_id);
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap">{o.due_date}</TableCell>
                        <TableCell>{rec?.description ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{formatBrlCents(o.amount_cents)}</TableCell>
                        <TableCell>
                          <Badge variant={o.status === "paid" ? "default" : "secondary"}>{statusLabel(o.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {o.status === "planned" || o.status === "pending" ? (
                            <Button size="sm" onClick={() => handlePay(o.id)}>
                              Pagar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        O pagamento cria uma despesa concluída na conta e actualiza o saldo.{" "}
        <NavLink to="/finance" className="text-primary underline-offset-2 hover:underline">
          Voltar ao resumo
        </NavLink>
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar despesa recorrente" : "Nova despesa recorrente"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel escritório" />
            </div>
            <div className="grid gap-2">
              <Label>Valor (R$)</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Conta padrão</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Periodicidade</Label>
              <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as FinancialRecurringExpenseDto["periodicity"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIOD_LABEL).map(([k, lab]) => (
                    <SelectItem key={k} value={k}>
                      {lab}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Dia de vencimento</Label>
              <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Semanal/quinzenal: 1=segunda … 7=domingo. Mensal ou superior: dia do mês (1–31).
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Data de início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Data de fim (opcional)</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <Label>Tipo</Label>
                <p className="text-xs text-muted-foreground">Infinito ou número fixo de vezes</p>
              </div>
              <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as "infinite" | "finite")}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="infinite">Infinito</SelectItem>
                  <SelectItem value="finite">Finito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleType === "finite" && (
              <div className="grid gap-2">
                <Label>Quantidade de ocorrências</Label>
                <Input value={maxOcc} onChange={(e) => setMaxOcc(e.target.value)} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="act">Activa</Label>
              <Switch id="act" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinancialRecurringExpensesPage;
