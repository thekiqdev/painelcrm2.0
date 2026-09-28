import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { financeModuleService, type FinanceAccount, type FinanceIncomeEntry } from "@/services/financeModule";
import { clientsService } from "@/services/clients";
import type { Client } from "@/services/clients";
import { Button } from "@/components/ui/button";
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

const FinanceIncomesPage = () => {
  const [searchParams] = useSearchParams();
  const presetAccount = searchParams.get("conta") || "";

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<FinanceIncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [accountId, setAccountId] = useState(presetAccount);
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [manualPayee, setManualPayee] = useState("");
  const [categoryTag, setCategoryTag] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const [accs, cls, ents] = await Promise.all([
        financeModuleService.listAccounts(),
        clientsService.getClients().catch(() => []),
        financeModuleService.listIncomeEntries(),
      ]);
      setAccounts(accs.filter((a) => a.is_active));
      setClients(cls);
      setEntries(ents);
      if (presetAccount && accs.some((a) => a.id === presetAccount)) {
        setAccountId(presetAccount);
      } else if (!accountId && accs.length > 0) {
        setAccountId(accs[0].id);
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
    if (!accountId) {
      toast.error("Selecione a conta de destino");
      return;
    }
    const reais = parseFloat(amount.replace(",", "."));
    if (Number.isNaN(reais) || reais < 0) {
      toast.error("Valor inválido");
      return;
    }
    const cents = Math.round(reais * 100);
    try {
      setSaving(true);
      await financeModuleService.createIncomeEntry({
        finance_account_id: accountId,
        amount_cents: cents,
        received_at: receivedAt,
        description: description.trim() || "Entrada",
        client_id: clientId || null,
        manual_payee_name: manualPayee.trim() || null,
        category_tag: categoryTag.trim() || null,
        payment_method: paymentMethod.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Entrada registrada");
      setAmount("");
      setDescription("");
      setManualPayee("");
      setCategoryTag("");
      setPaymentMethod("");
      setNotes("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8">Carregando…</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova entrada manual</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Conta / caixa de destino</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
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
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-2">
            <Label>Data do recebimento</Label>
            <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Serviço avulso" />
          </div>
          <div className="space-y-2">
            <Label>Cliente (opcional)</Label>
            <Select value={clientId || "__none__"} onValueChange={(v) => setClientId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || c.company || c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nome manual (se sem cliente)</Label>
            <Input value={manualPayee} onChange={(e) => setManualPayee(e.target.value)} placeholder="Pagador" />
          </div>
          <div className="space-y-2">
            <Label>Tag / categoria</Label>
            <Input value={categoryTag} onChange={(e) => setCategoryTag(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Forma de recebimento</Label>
            <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="PIX, TED…" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => void submit()} disabled={saving || accounts.length === 0}>
              {saving ? "Salvando…" : "Registrar entrada"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas entradas</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma entrada registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.slice(0, 50).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm tabular-nums">
                      {format(new Date(e.received_at + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatBrl(e.amount_cents)}</TableCell>
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

export default FinanceIncomesPage;
