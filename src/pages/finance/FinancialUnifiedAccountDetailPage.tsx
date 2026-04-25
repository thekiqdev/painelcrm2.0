import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  financialService,
  type FinancialAccountDto,
  type FinancialTransactionDto,
  type FinancialTransactionType,
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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ArrowLeft, Plus } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  bank: "Banco",
  cash: "Caixa",
  wallet: "Carteira",
};

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function monthBounds(y: number, m0: number): { from: string; to: string } {
  const from = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const to = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

const FinancialUnifiedAccountDetailPage = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const [account, setAccount] = useState<FinancialAccountDto | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodPreset, setPeriodPreset] = useState<string>("current_month");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return monthBounds(d.getFullYear(), d.getMonth()).from;
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return monthBounds(d.getFullYear(), d.getMonth()).to;
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formType, setFormType] = useState<FinancialTransactionType>("income");
  const [formAmount, setFormAmount] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCategory, setFormCategory] = useState("");
  const [formStatus, setFormStatus] = useState<"pending" | "completed">("completed");
  const [allAccounts, setAllAccounts] = useState<FinancialAccountDto[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferDesc, setTransferDesc] = useState("");

  const applyPreset = useCallback((preset: string) => {
    const now = new Date();
    const y = now.getFullYear();
    const m0 = now.getMonth();
    const d = now.getDate();
    if (preset === "current_month") {
      const b = monthBounds(y, m0);
      setFrom(b.from);
      setTo(b.to);
    } else if (preset === "last_month") {
      let yy = y;
      let mm = m0 - 1;
      if (mm < 0) {
        yy -= 1;
        mm = 11;
      }
      const b = monthBounds(yy, mm);
      setFrom(b.from);
      setTo(b.to);
    } else if (preset === "ytd") {
      setFrom(`${y}-01-01`);
      setTo(`${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }, []);

  useEffect(() => {
    if (periodPreset !== "custom") applyPreset(periodPreset);
  }, [periodPreset, applyPreset]);

  const load = useCallback(async () => {
    if (!accountId || !from || !to) return;
    setLoading(true);
    try {
      const [accs, cat, tx] = await Promise.all([
        financialService.listAccounts(),
        financialService.listCategories(),
        financialService.listTransactions({
          account_id: accountId,
          from,
          to,
        }),
      ]);
      const acc = accs.find((a) => a.id === accountId) ?? null;
      setAccount(acc);
      setAllAccounts(accs);
      setCategories(cat);
      setTransactions(tx.sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1)));
    } catch {
      toast.error("Erro ao carregar conta");
      setAccount(null);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, from, to]);

  useEffect(() => {
    if (from && to && accountId) load();
  }, [from, to, accountId, load]);

  const totals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of transactions) {
      if (t.status !== "completed") continue;
      if (t.type === "income") inc += t.amount_cents;
      else exp += t.amount_cents;
    }
    return { inc, exp };
  }, [transactions]);

  const openCreate = (type: FinancialTransactionType) => {
    if (!accountId) return;
    setFormType(type);
    setFormAmount("");
    setFormDesc("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCategory(categories[0]?.id ?? "");
    setFormStatus("completed");
    setOpen(true);
  };

  const openTransfer = () => {
    if (!accountId) return;
    setTransferFrom(accountId);
    setTransferTo("");
    setTransferAmount("");
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferDesc("");
    setTransferOpen(true);
  };

  const handleTransfer = async () => {
    const cents = Math.round(parseFloat(transferAmount.replace(",", ".")) * 100);
    if (!transferFrom || !transferTo) {
      toast.error("Selecione origem e destino");
      return;
    }
    if (transferFrom === transferTo) {
      toast.error("Origem e destino devem ser diferentes");
      return;
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      setTransferSaving(true);
      await financialService.createTransfer({
        from_account_id: transferFrom,
        to_account_id: transferTo,
        amount_cents: cents,
        transfer_date: transferDate,
        description: transferDesc.trim() || null,
      });
      toast.success("Transferência registrada");
      setTransferOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao transferir");
    } finally {
      setTransferSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!accountId) return;
    const cents = Math.round(parseFloat(formAmount.replace(",", ".")) * 100);
    if (!formDesc.trim()) {
      toast.error("Descreva o movimento");
      return;
    }
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(true);
    try {
      await financialService.createTransaction({
        account_id: accountId,
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
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  if (!accountId) {
    return <p className="text-sm text-muted-foreground">Conta inválida.</p>;
  }

  if (!loading && !account) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Conta não encontrada.</p>
        <Button variant="outline" size="sm" asChild>
          <NavLink to="/finance/accounts">Voltar às contas</NavLink>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <NavLink to="/finance/accounts" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Bancos e contas
          </NavLink>
        </Button>
      </div>

      {account && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{account.name}</h2>
              <Badge variant={account.is_active ? "secondary" : "outline"}>
                {account.is_active ? "Activa" : "Inactiva"}
              </Badge>
              <span className="text-xs text-muted-foreground rounded-md border px-2 py-0.5">
                {TYPE_LABEL[account.type] ?? account.type}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Saldo inicial {account.initial_balance_date}: {formatBrlCents(account.initial_balance_cents)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => openCreate("income")}>
              <Plus className="h-4 w-4 mr-1" />
              Nova entrada
            </Button>
            <Button type="button" onClick={() => openCreate("expense")}>
              <Plus className="h-4 w-4 mr-1" />
              Nova saída
            </Button>
            <Button type="button" variant="outline" onClick={openTransfer}>
              Transferir
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo actual</CardDescription>
            <CardTitle className="text-xl tabular-nums">{account ? formatBrl(account.balance) : "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entradas no período</CardDescription>
            <CardTitle className="text-xl tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatBrlCents(totals.inc)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Só movimentos concluídos.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saídas no período</CardDescription>
            <CardTitle className="text-xl tabular-nums text-rose-700 dark:text-rose-400">
              {formatBrlCents(totals.exp)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Só movimentos concluídos.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Extrato</CardTitle>
            <CardDescription>Movimentações filtradas por período</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={periodPreset} onValueChange={setPeriodPreset}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Mês actual</SelectItem>
                  <SelectItem value="last_month">Mês anterior</SelectItem>
                  <SelectItem value="ytd">Ano até hoje</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodPreset === "custom" && (
              <>
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
                </div>
              </>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">A carregar…</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem movimentos neste período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => {
                  const cat = categories.find((c) => c.id === t.category_id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{t.transaction_date}</TableCell>
                      <TableCell>
                        {t.transaction_kind === "transfer"
                          ? t.transfer_direction === "in"
                            ? "Transferência recebida"
                            : "Transferência enviada"
                          : t.type === "income"
                            ? "Entrada"
                            : "Saída"}
                      </TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{cat?.name ?? "—"}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          t.type === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                        }`}
                      >
                        {formatBrlCents(t.amount_cents)}
                      </TableCell>
                      <TableCell className="text-sm">{t.status === "completed" ? "Concluído" : "Pendente"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formType === "income" ? "Nova entrada" : "Nova saída"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">Conta: {account?.name}</p>
            <div>
              <Label>Valor (R$)</Label>
              <Input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            {formType === "expense" && (
              <div>
                <Label>Categoria</Label>
                <Select value={formCategory || "__none__"} onValueChange={(v) => setFormCategory(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
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
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir entre contas</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Conta de origem</Label>
              <Select value={transferFrom} onValueChange={setTransferFrom}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {allAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta de destino</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {allAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Data da transferência</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div>
              <Label>Descrição/observação</Label>
              <Input value={transferDesc} onChange={(e) => setTransferDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={transferSaving}>
              {transferSaving ? "Transferindo…" : "Confirmar transferência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinancialUnifiedAccountDetailPage;
