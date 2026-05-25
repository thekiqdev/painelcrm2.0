import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  financialService,
  type FinancialCreditCardDto,
  type FinancialCreditCardPurchaseDto,
  type FinancialCreditCardStatementDto,
  type ExpenseCategoryDto,
  type CreditCardPurchaseAmountModeDto,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { ArrowLeft, Plus, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import {
  FinanceMobileBottomBar,
  financeMobilePageBottomPad,
  type FinanceMobileBottomAction,
} from "@/components/finance/FinanceMobileBottomBar";
import { useFinanceBottomBarVisibility } from "@/contexts/FinanceMobileChromeContext";

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function brlStringToCents(s: string): number {
  const t = s.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function statementLabel(ymd: string): string {
  const [y, m] = ymd.slice(0, 10).split("-");
  const idx = Math.max(0, Math.min(11, parseInt(m ?? "1", 10) - 1));
  const mo = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][idx];
  return `${mo}/${y}`;
}

const FinanceCreditCardDetailPage = () => {
  const navigate = useNavigate();
  const { cardId } = useParams<{ cardId: string }>();
  const [card, setCard] = useState<FinancialCreditCardDto | null>(null);
  const [purchases, setPurchases] = useState<FinancialCreditCardPurchaseDto[]>([]);
  const [statements, setStatements] = useState<FinancialCreditCardStatementDto[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [desc, setDesc] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [installments, setInstallments] = useState("1");
  const [notes, setNotes] = useState("");
  const [amountMode, setAmountMode] = useState<CreditCardPurchaseAmountModeDto>("total");

  const loadAll = useCallback(async () => {
    if (!cardId) return;
    const [c, p, s, cat] = await Promise.all([
      financialService.getCreditCard(cardId),
      financialService.listCreditCardPurchases(cardId),
      financialService.listCreditCardStatements({ card_id: cardId }),
      financialService.listCategories(),
    ]);
    setCard(c);
    setPurchases(p);
    setStatements(s);
    setCategories(cat);
    setCategoryId((prev) => prev || cat[0]?.id || "");
  }, [cardId]);

  useEffect(() => {
    if (!cardId) return;
    setLoading(true);
    loadAll()
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [cardId, loadAll]);

  useFinanceBottomBarVisibility(purchaseOpen);

  const nextOpenStatement = useMemo(() => {
    const opens = statements.filter((x) => x.status === "open");
    opens.sort((a, b) => a.due_date.localeCompare(b.due_date));
    return opens[0] ?? null;
  }, [statements]);

  const upcomingStatements = useMemo(() => {
    const opens = statements.filter((x) => x.status === "open");
    opens.sort((a, b) => a.statement_month.localeCompare(b.statement_month));
    return opens;
  }, [statements]);

  const bottomActions = useMemo((): FinanceMobileBottomAction[] => {
    if (!cardId || !card) return [];
    const list: FinanceMobileBottomAction[] = [
      {
        key: "purchase",
        label: "+ Nova compra",
        variant: "outline",
        icon: Plus,
        onClick: () => setPurchaseOpen(true),
        loading: savingPurchase && purchaseOpen,
      },
    ];
    if (nextOpenStatement) {
      list.push({
        key: "pay",
        label: "Pagar fatura",
        variant: "primary",
        icon: Receipt,
        onClick: () =>
          navigate(`/finance/credit-cards/${cardId}/faturas/${nextOpenStatement.id}`),
      });
    }
    return list;
  }, [card, cardId, navigate, nextOpenStatement, purchaseOpen, savingPurchase]);

  const handlePurchase = async () => {
    if (!cardId) return;
    if (!desc.trim()) {
      toast.error("Indique a descrição");
      return;
    }
    const total = brlStringToCents(amountStr);
    if (total <= 0) {
      toast.error("Valor inválido");
      return;
    }
    const n = Math.max(1, parseInt(installments, 10) || 1);
    setSavingPurchase(true);
    try {
      await financialService.createCreditCardPurchase({
        credit_card_id: cardId,
        category_id: categoryId || null,
        description: desc.trim(),
        purchase_date: purchaseDate,
        total_amount_cents: total,
        installments_count: n,
        amount_mode: amountMode,
        notes: notes.trim() || null,
      });
      toast.success("Compra registada");
      setPurchaseOpen(false);
      setDesc("");
      setAmountStr("");
      setInstallments("1");
      setNotes("");
      setAmountMode("total");
      loadAll().catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingPurchase(false);
    }
  };

  if (!cardId) {
    return <p className="text-sm text-muted-foreground">Cartão inválido.</p>;
  }

  if (loading && !card) {
    return <p className="text-sm text-muted-foreground py-10 text-center">A carregar…</p>;
  }

  if (!card) {
    return <p className="text-sm text-muted-foreground">Cartão não encontrado.</p>;
  }

  return (
    <div className={cn("space-y-6", financeMobilePageBottomPad)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <NavLink to="/finance/credit-cards" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Cartões
          </NavLink>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{card.name}</h2>
          <p className="text-sm text-muted-foreground">
            {card.type === "business" ? "Empresa" : "Pessoal"} · Fechamento dia {card.closing_day} · Vencimento dia{" "}
            {card.due_day}
          </p>
        </div>
        <div className="hidden flex-wrap gap-2 md:flex">
          <Button type="button" variant="secondary" onClick={() => setPurchaseOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova compra
          </Button>
          {nextOpenStatement && (
            <Button type="button" asChild>
              <NavLink to={`/finance/credit-cards/${cardId}/faturas/${nextOpenStatement.id}`}>
                <Receipt className="h-4 w-4 mr-2" />
                Pagar fatura
              </NavLink>
            </Button>
          )}
        </div>
      </div>

      <FinanceMobileBottomBar actions={bottomActions} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Utilizado (parcelas em aberto)</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatBrlCents(card.used_cents ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        {card.limit_cents != null && card.limit_cents > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Limite</CardDescription>
              <CardTitle className="text-xl tabular-nums">{formatBrlCents(card.limit_cents)}</CardTitle>
            </CardHeader>
          </Card>
        )}
        {nextOpenStatement && (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardDescription>Fatura actual</CardDescription>
              <CardTitle className="text-lg">
                {statementLabel(nextOpenStatement.statement_month)} · {formatBrlCents(nextOpenStatement.expected_amount_cents)}
              </CardTitle>
              <CardDescription>Vence {formatDateOnlyPtBr(nextOpenStatement.due_date)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" asChild>
                <NavLink to={`/finance/credit-cards/${cardId}/faturas/${nextOpenStatement.id}`}>Ver fatura</NavLink>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas faturas</CardTitle>
          <CardDescription>Valores previstos com base nas compras registadas.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingStatements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fatura em aberto.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {upcomingStatements.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                  <span>
                    {statementLabel(s.statement_month)} — vence {formatDateOnlyPtBr(s.due_date)}
                  </span>
                  <span className="tabular-nums font-medium">{formatBrlCents(s.expected_amount_cents)}</span>
                  <Button size="sm" variant="ghost" asChild>
                    <NavLink to={`/finance/credit-cards/${cardId}/faturas/${s.id}`}>Abrir</NavLink>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compras recentes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.slice(0, 30).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{formatDateOnlyPtBr(p.purchase_date)}</TableCell>
                  <TableCell>{p.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.amount_mode === "installment" ? "Cada parcela" : "Total"}
                  </TableCell>
                  <TableCell>{p.installments_count}x</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBrlCents(p.total_amount_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {purchases.length === 0 && <p className="text-sm text-muted-foreground py-4">Sem compras ainda.</p>}
        </CardContent>
      </Card>

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descrição</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Supermercado" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de valor</Label>
              <RadioGroup
                value={amountMode}
                onValueChange={(v) => setAmountMode(v as CreditCardPurchaseAmountModeDto)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="total" id="am-total" />
                  <Label htmlFor="am-total" className="font-normal cursor-pointer">
                    Valor total da compra — o sistema divide pelas parcelas
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="installment" id="am-inst" />
                  <Label htmlFor="am-inst" className="font-normal cursor-pointer">
                    Valor de cada parcela — o total será parcelas × valor
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label>{amountMode === "total" ? "Valor total da compra (R$)" : "Valor de cada parcela (R$)"}</Label>
              <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0,00" />
              {amountMode === "installment" && parseInt(installments, 10) > 1 && amountStr.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  Total da compra:{" "}
                  {formatBrlCents(brlStringToCents(amountStr) * Math.max(1, parseInt(installments, 10) || 1))}
                </p>
              )}
            </div>
            <div>
              <Label>Data da compra</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId || "__none__"} onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}>
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
            <div>
              <Label>Número de parcelas</Label>
              <Input type="number" min={1} max={120} value={installments} onChange={(e) => setInstallments(e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setPurchaseOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handlePurchase} disabled={savingPurchase}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceCreditCardDetailPage;
