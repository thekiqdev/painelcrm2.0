import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  financialService,
  type FinancialAccountDto,
  type FinancialTransactionDto,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { Plus } from "lucide-react";

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const FinancialUnifiedExpensesPage = () => {
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [rows, setRows] = useState<FinancialTransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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
      financialService.listTransactions({ type: "expense" }),
    ])
      .then(([ac, cat, tx]) => {
        setAccounts(ac);
        setCategories(cat);
        setRows(tx);
        if (!formAccount && ac[0]) setFormAccount(ac[0].id);
      })
      .catch(() => {
        toast.error("Erro ao carregar despesas");
        setRows([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const cents = Math.round(parseFloat(formAmount.replace(",", ".")) * 100);
    if (!formAccount) {
      toast.error("Crie uma conta primeiro");
      return;
    }
    if (!formDesc.trim()) {
      toast.error("Descreva a despesa");
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
        type: "expense",
        amount_cents: cents,
        description: formDesc.trim(),
        transaction_date: formDate,
        status: formStatus,
        category_id: formCategory || null,
      });
      toast.success("Despesa registada");
      setOpen(false);
      setFormAmount("");
      setFormDesc("");
      setFormCategory("");
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
          <h2 className="text-lg font-semibold">Despesas</h2>
          <p className="text-sm text-muted-foreground">Lista só de saídas de dinheiro.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/finance/transactions">Ver todas as movimentações</Link>
          </Button>
          <Button
            onClick={() => {
              setFormAccount(accounts[0]?.id ?? "");
              setFormDate(new Date().toISOString().slice(0, 10));
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nova despesa
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Despesas registadas</CardTitle>
          <CardDescription>Inclui pendentes e concluídas</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Ainda não há despesas.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
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
                      <TableCell>{accountName(r.account_id)}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{r.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{categoryName(r.category_id)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatBrlCents(r.amount_cents)}</TableCell>
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
            <DialogTitle>Nova despesa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
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
            <div className="grid gap-2">
              <Label htmlFor="ex-val">Valor (R$)</Label>
              <Input id="ex-val" inputMode="decimal" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ex-desc">Descrição</Label>
              <Input id="ex-desc" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ex-date">Data</Label>
              <Input id="ex-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
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

export default FinancialUnifiedExpensesPage;
