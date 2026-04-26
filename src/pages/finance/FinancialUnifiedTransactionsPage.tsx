import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  financialService,
  type FinancialAccountDto,
  type FinancialTransactionDto,
  type FinancialTransactionType,
  type ExpenseCategoryDto,
} from "@/services/financial";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "@/components/ui/sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const FinancialUnifiedTransactionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter: "all" | FinancialTransactionType = useMemo(() => {
    const t = searchParams.get("tipo");
    if (t === "income" || t === "expense") return t;
    return "all";
  }, [searchParams]);
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [rows, setRows] = useState<FinancialTransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formType, setFormType] = useState<FinancialTransactionType>("income");
  const [formAccount, setFormAccount] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCategory, setFormCategory] = useState<string>("");
  const [formStatus, setFormStatus] = useState<"pending" | "completed">("completed");

  const accountName = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [accounts]);

  const categoryName = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [categories]);

  const load = () => {
    setLoading(true);
    Promise.all([
      financialService.listAccounts(),
      financialService.listCategories(),
      financialService.listTransactions({
        type: filter === "all" ? undefined : filter,
      }),
    ])
      .then(([ac, cat, tx]) => {
        setAccounts(ac);
        setCategories(cat);
        setRows(tx);
      })
      .catch(() => {
        toast.error("Erro ao carregar dados");
        setRows([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filter]);

  const changeFilter = (v: "all" | FinancialTransactionType) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("tipo");
    else next.set("tipo", v);
    setSearchParams(next, { replace: true });
  };

  const openCreate = useCallback((preset?: FinancialTransactionType) => {
    setFormType(preset ?? "income");
    setFormAccount(accounts[0]?.id ?? "");
    setFormAmount("");
    setFormDesc("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCategory("");
    setFormStatus("completed");
    setOpen(true);
  }, [accounts]);

  useEffect(() => {
    const preset = searchParams.get("new");
    if (preset !== "income" && preset !== "expense") return;
    if (loading) return;
    openCreate(preset);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loading, openCreate]);

  const handleCreate = async () => {
    const cents = Math.round(parseFloat(formAmount.replace(",", ".")) * 100);
    if (!formAccount) {
      toast.error("Crie uma conta em Bancos e contas primeiro");
      return;
    }
    if (!formDesc.trim()) {
      toast.error("Descreva o movimento");
      return;
    }
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      setSaving(true);
      await financialService.createTransaction({
        account_id: formAccount,
        type: formType,
        amount_cents: cents,
        description: formDesc.trim(),
        transaction_date: formDate,
        status: formStatus,
        category_id: formType === "expense" && formCategory ? formCategory : null,
      });
      toast.success("Movimento registado");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Entradas e saídas</h2>
          <p className="text-sm text-muted-foreground">Todos os movimentos manuais nas suas contas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filter} onValueChange={(v) => changeFilter(v as "all" | FinancialTransactionType)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">Só entradas</SelectItem>
              <SelectItem value="expense">Só despesas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => openCreate("income")}>
            <Plus className="h-4 w-4 mr-1" />
            Entrada
          </Button>
          <Button onClick={() => openCreate("expense")}>
            <Plus className="h-4 w-4 mr-1" />
            Despesa
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lista</CardTitle>
          <CardDescription>Ordenado do mais recente para o mais antigo</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem movimentos com este filtro.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{r.transaction_date}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-xs font-medium rounded-full px-2 py-0.5",
                            r.type === "income"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                          )}
                        >
                          {r.type === "income" ? "Entrada" : "Despesa"}
                        </span>
                      </TableCell>
                      <TableCell>{accountName(r.account_id)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.type === "expense" ? categoryName(r.category_id) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatBrlCents(r.amount_cents)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.status === "completed" ? "Concluído" : "Pendente"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{formType === "income" ? "Nova entrada" : "Nova despesa"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as FinancialTransactionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Entrada</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Conta</Label>
              <Select value={formAccount} onValueChange={setFormAccount}>
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
            {formType === "expense" && (
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={formCategory || "__none__"} onValueChange={(v) => setFormCategory(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
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
            )}
            <div className="grid gap-2">
              <Label htmlFor="tx-val">Valor (R$)</Label>
              <Input id="tx-val" inputMode="decimal" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-desc">Descrição</Label>
              <Input id="tx-desc" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Ex.: Aluguel abril" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-date">Data</Label>
              <Input id="tx-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "pending" | "completed")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinancialUnifiedTransactionsPage;
