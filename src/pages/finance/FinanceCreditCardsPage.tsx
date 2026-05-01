import React, { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  financialService,
  type FinancialCreditCardDto,
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
import { toast } from "@/components/ui/sonner";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import { CreditCard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FinanceMobileBottomBar, financeMobilePageBottomPad } from "@/components/finance/FinanceMobileBottomBar";
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

const FinanceCreditCardsPage = () => {
  const [cards, setCards] = useState<FinancialCreditCardDto[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"personal" | "business">("personal");
  const [limitStr, setLimitStr] = useState("");
  const [closingDay, setClosingDay] = useState("20");
  const [dueDay, setDueDay] = useState("25");
  const [defaultAccount, setDefaultAccount] = useState<string>("");

  const load = useCallback(() => {
    financialService
      .listCreditCards()
      .then(setCards)
      .catch(() => toast.error("Não foi possível carregar os cartões"));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      financialService.listAccounts().then(setAccounts).catch(() => []),
      load(),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  useFinanceBottomBarVisibility(open);

  const resetForm = () => {
    setName("");
    setType("personal");
    setLimitStr("");
    setClosingDay("20");
    setDueDay("25");
    setDefaultAccount("");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Indique o nome do cartão");
      return;
    }
    const cd = parseInt(closingDay, 10);
    const dd = parseInt(dueDay, 10);
    if (cd < 1 || cd > 31 || dd < 1 || dd > 31) {
      toast.error("Dias de fechamento e vencimento devem estar entre 1 e 31");
      return;
    }
    setSaving(true);
    try {
      await financialService.createCreditCard({
        name: name.trim(),
        type,
        limit_cents: limitStr.trim() ? brlStringToCents(limitStr) : null,
        closing_day: cd,
        due_day: dd,
        default_payment_account_id: defaultAccount || null,
        is_active: true,
      });
      toast.success("Cartão criado");
      setOpen(false);
      resetForm();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setSaving(false);
    }
  };

  if (loading && cards.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">A carregar cartões…</p>;
  }

  return (
    <div className={cn("space-y-6", financeMobilePageBottomPad)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cartões de crédito</h2>
          <p className="text-sm text-muted-foreground">
            Controle de cartões, compras parceladas e pagamento da fatura a partir de uma conta.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="hidden shrink-0 md:inline-flex"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo cartão
        </Button>
      </div>

      <FinanceMobileBottomBar
        actions={[
          {
            key: "novo-cartao",
            label: "+ Novo cartão",
            variant: "primary",
            icon: Plus,
            onClick: () => {
              resetForm();
              setOpen(true);
            },
            loading: saving && open,
          },
        ]}
      />

      {cards.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ainda não há cartões. Clique em «Novo cartão» para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.id} className={!c.is_active ? "opacity-70" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CreditCard className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-xs rounded-md border px-2 py-0.5 text-muted-foreground">
                    {c.type === "business" ? "Empresa" : "Pessoal"}
                  </span>
                </div>
                <CardTitle className="text-base">
                  <NavLink to={`/finance/credit-cards/${c.id}`} className="hover:underline">
                    {c.name}
                  </NavLink>
                </CardTitle>
                <CardDescription>
                  Fechamento dia {c.closing_day} · Vencimento dia {c.due_day}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Utilizado</span>
                  <span className="tabular-nums font-medium">{formatBrlCents(c.used_cents ?? 0)}</span>
                </div>
                {c.limit_cents != null && c.limit_cents > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Limite</span>
                    <span className="tabular-nums">{formatBrlCents(c.limit_cents)}</span>
                  </div>
                )}
                {c.next_statement_due_date && (
                  <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                    <div className="text-muted-foreground">Próxima fatura</div>
                    <div className="font-medium tabular-nums">
                      Vence {formatDateOnlyPtBr(c.next_statement_due_date)}
                      {c.next_statement_expected_cents != null && (
                        <> · {formatBrlCents(c.next_statement_expected_cents)}</>
                      )}
                    </div>
                  </div>
                )}
                <Button variant="secondary" size="sm" className="w-full mt-2" asChild>
                  <NavLink to={`/finance/credit-cards/${c.id}`}>Abrir cartão</NavLink>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cartão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="cc-name">Nome</Label>
              <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Visa empresarial" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "personal" | "business")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Pessoal</SelectItem>
                  <SelectItem value="business">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cc-limit">Limite (opcional)</Label>
              <Input
                id="cc-limit"
                value={limitStr}
                onChange={(e) => setLimitStr(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cc-close">Dia de fechamento</Label>
                <Input id="cc-close" type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cc-due">Dia de vencimento</Label>
                <Input id="cc-due" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Conta padrão para pagar a fatura (opcional)</Label>
              <Select value={defaultAccount || "__none__"} onValueChange={(v) => setDefaultAccount(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceCreditCardsPage;
