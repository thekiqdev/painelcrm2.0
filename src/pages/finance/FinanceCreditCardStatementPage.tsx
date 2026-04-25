import React, { useCallback, useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  financialService,
  type FinancialCreditCardStatementDto,
  type FinancialCreditCardInstallmentDto,
  type FinancialAccountDto,
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
import { ArrowLeft } from "lucide-react";

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function brlStringToCents(s: string): string {
  const t = s.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  if (Number.isNaN(n) || n < 0) return "";
  return String(Math.round(n * 100));
}

function monthTitle(ymd: string): string {
  const [y, m] = ymd.slice(0, 10).split("-");
  const idx = Math.max(0, Math.min(11, parseInt(m ?? "1", 10) - 1));
  const mo = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][idx];
  return `${mo} de ${y}`;
}

function instStatusPt(s: string): string {
  if (s === "planned") return "A pagar";
  if (s === "paid") return "Paga";
  if (s === "cancelled") return "Cancelada";
  return s;
}

const FinanceCreditCardStatementPage = () => {
  const { cardId, statementId } = useParams<{ cardId: string; statementId: string }>();
  const [statement, setStatement] = useState<(FinancialCreditCardStatementDto & { card_name?: string }) | null>(null);
  const [installments, setInstallments] = useState<FinancialCreditCardInstallmentDto[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payAccount, setPayAccount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualBrl, setManualBrl] = useState("");

  const load = useCallback(async () => {
    if (!statementId) return;
    const d = await financialService.getCreditCardStatement(statementId);
    setStatement(d.statement as FinancialCreditCardStatementDto & { card_name?: string });
    setInstallments(d.installments);
  }, [statementId]);

  useEffect(() => {
    if (!statementId || !cardId) return;
    setLoading(true);
    Promise.all([
      load(),
      financialService.listAccounts().then(setAccounts).catch(() => []),
    ])
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [statementId, cardId, load]);

  const mismatch = statement && statement.credit_card_id !== cardId;

  const handlePay = async () => {
    if (!statementId || !payAccount) {
      toast.error("Seleccione a conta para debitar o pagamento");
      return;
    }
    const manualCentsStr = manualBrl.trim() ? brlStringToCents(manualBrl) : "";
    setPaying(true);
    try {
      await financialService.payCreditCardStatement(statementId, {
        payment_account_id: payAccount,
        paid_at: paidAt || null,
        manual_amount_cents: manualCentsStr ? parseInt(manualCentsStr, 10) : null,
      });
      toast.success("Fatura paga");
      setPayOpen(false);
      load().catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao pagar");
    } finally {
      setPaying(false);
    }
  };

  if (!statementId || !cardId) {
    return <p className="text-sm text-muted-foreground">Ligação inválida.</p>;
  }

  if (loading && !statement) {
    return <p className="text-sm text-muted-foreground py-10 text-center">A carregar fatura…</p>;
  }

  if (!statement || mismatch) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Fatura não encontrada ou não pertence a este cartão.</p>
        <Button variant="outline" size="sm" asChild>
          <NavLink to={`/finance/credit-cards/${cardId}`}>Voltar ao cartão</NavLink>
        </Button>
      </div>
    );
  }

  const canPay = statement.status === "open";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <NavLink to={`/finance/credit-cards/${cardId}`} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Cartão
          </NavLink>
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Fatura do cartão</h2>
        <p className="text-sm text-muted-foreground">
          {statement.card_name ?? "Cartão"} · {monthTitle(statement.statement_month)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fechamento</CardDescription>
            <CardTitle className="text-base tabular-nums">{statement.closing_date.slice(0, 10).split("-").reverse().join("/")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vencimento</CardDescription>
            <CardTitle className="text-base tabular-nums">{statement.due_date.slice(0, 10).split("-").reverse().join("/")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total esperado</CardDescription>
            <CardTitle className="text-base tabular-nums">{formatBrlCents(statement.expected_amount_cents)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estado</CardDescription>
            <CardTitle className="text-base">
              {statement.status === "open" ? "Em aberto" : statement.status === "paid" ? "Paga" : "Fechada"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {statement.status === "paid" && statement.difference_amount_cents != null && statement.difference_amount_cents !== 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ajuste na fatura</CardTitle>
            <CardDescription>
              Diferença registada: {formatBrlCents(Math.abs(statement.difference_amount_cents))}
              {statement.difference_amount_cents > 0
                ? " (valor real maior — foi criada despesa «Despesas não cadastradas»)."
                : " (valor pago inferior ao esperado)."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Compras e parcelas</CardTitle>
            <CardDescription>Itens que entram nesta fatura.</CardDescription>
          </div>
          {canPay && (
            <Button type="button" onClick={() => setPayOpen(true)}>
              Pagar fatura
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Compra</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento parcela</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installments.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.description}</TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {(i as { purchase_date?: string }).purchase_date ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBrlCents(i.amount_cents)}</TableCell>
                  <TableCell className="whitespace-nowrap">{i.due_date.slice(0, 10).split("-").reverse().join("/")}</TableCell>
                  <TableCell>{instStatusPt(i.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {installments.length === 0 && <p className="text-sm text-muted-foreground py-4">Sem parcelas nesta fatura.</p>}
        </CardContent>
      </Card>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Será debitada a conta escolhida. O total esperado é{" "}
              <strong className="text-foreground">{formatBrlCents(statement.expected_amount_cents)}</strong>.
            </p>
            <div>
              <Label>Conta / banco</Label>
              <Select value={payAccount || "__none__"} onValueChange={(v) => setPayAccount(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seleccione…</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data do pagamento</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div>
              <Label>Valor real da fatura (opcional)</Label>
              <Input
                value={manualBrl}
                onChange={(e) => setManualBrl(e.target.value)}
                placeholder={`Deixe vazio para ${formatBrlCents(statement.expected_amount_cents)}`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se o banco cobrou mais, indique o valor total: a diferença será registada como «Despesas não cadastradas».
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setPayOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handlePay} disabled={paying}>
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceCreditCardStatementPage;
