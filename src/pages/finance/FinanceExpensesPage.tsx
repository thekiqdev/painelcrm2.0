import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  financeModuleService,
  type FinanceAccount,
  type FinanceExpenseCategory,
  type FinanceExpenseEntry,
  type FinanceExpenseStatus,
} from "@/services/financeModule";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const STATUS_LABEL: Record<FinanceExpenseStatus, string> = {
  expected: "Prevista",
  pending: "Pendente",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
};

const FinanceExpensesPage = () => {
  const [searchParams] = useSearchParams();
  const presetAccount = searchParams.get("conta") || "";

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceExpenseCategory[]>([]);
  const [entries, setEntries] = useState<FinanceExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [accountId, setAccountId] = useState<string>(presetAccount || "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<FinanceExpenseStatus>("pending");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [accs, cats, ents] = await Promise.all([
        financeModuleService.listAccounts(),
        financeModuleService.listCategories(),
        financeModuleService.listExpenseEntries(),
      ]);
      setAccounts(accs.filter((a) => a.is_active));
      setCategories(cats);
      setEntries(ents);
      if (presetAccount && accs.some((a) => a.id === presetAccount)) {
        setAccountId(presetAccount);
      }
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (presetAccount) setAccountId(presetAccount);
  }, [presetAccount]);

  const submit = async () => {
    const reais = parseFloat(amount.replace(",", "."));
    if (Number.isNaN(reais) || reais < 0) {
      toast.error("Valor inválido");
      return;
    }
    const cents = Math.round(reais * 100);
    try {
      setSaving(true);
      await financeModuleService.createExpenseEntry({
        finance_account_id: accountId || null,
        category_id: categoryId || null,
        amount_cents: cents,
        expense_date: expenseDate,
        due_date: dueDate,
        paid_at: status === "paid" ? expenseDate : null,
        description: description.trim() || "Despesa",
        status,
        supplier_name: supplier.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Despesa registrada");
      setAmount("");
      setDescription("");
      setSupplier("");
      setNotes("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const togglePaid = async (row: FinanceExpenseEntry) => {
    try {
      const next = row.status === "paid" ? "pending" : "paid";
      await financeModuleService.updateExpenseEntry(row.id, {
        status: next,
        paid_at: next === "paid" ? row.expense_date : null,
      });
      toast.success(next === "paid" ? "Marcada como paga" : "Marcada como pendente");
      void load();
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8">Carregando…</p>;
  }

  const createCategory = async () => {
    if (!newCatName.trim()) {
      toast.error("Informe o nome da categoria");
      return;
    }
    try {
      setCatSaving(true);
      await financeModuleService.createCategory({ name: newCatName.trim() });
      toast.success("Categoria criada");
      setNewCatName("");
      setCatOpen(false);
      const cats = await financeModuleService.listCategories();
      setCategories(cats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar categoria");
    } finally {
      setCatSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Nova despesa</CardTitle>
          <Dialog open={catOpen} onOpenChange={setCatOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                Nova categoria
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Nova categoria</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label>Nome</Label>
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Ex.: Equipe" />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setCatOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" disabled={catSaving} onClick={() => void createCategory()}>
                  {catSaving ? "Salvando…" : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Conta de pagamento (opcional)</Label>
            <Select value={accountId || "__none__"} onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não informado</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Categoria</Label>
            <Select value={categoryId || "__none__"} onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as FinanceExpenseStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as FinanceExpenseStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {STATUS_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data da despesa</Label>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Data de vencimento</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fornecedor (opcional)</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Salvando…" : "Registrar despesa"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Despesas recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma despesa.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.slice(0, 60).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm tabular-nums">
                      {format(new Date(e.expense_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-sm">{STATUS_LABEL[e.status]}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatBrl(e.amount_cents)}</TableCell>
                    <TableCell>
                      {e.status !== "cancelled" && (
                        <Button variant="outline" size="sm" onClick={() => void togglePaid(e)}>
                          {e.status === "paid" ? "Desmarcar" : "Pagar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanceExpensesPage;
