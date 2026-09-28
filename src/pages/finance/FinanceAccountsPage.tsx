import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financeModuleService, type FinanceAccount, type FinanceAccountType } from "@/services/financeModule";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Plus, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";

const TYPE_LABEL: Record<FinanceAccountType, string> = {
  bank: "Banco",
  cash: "Caixa",
  wallet: "Carteira",
  digital: "Conta digital",
};

function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const FinanceAccountsPage = () => {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<FinanceAccountType>("bank");
  const [openingCents, setOpeningCents] = useState("0");
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  const load = () => {
    setLoading(true);
    financeModuleService
      .listAccounts()
      .then(setAccounts)
      .catch(() => {
        toast.error("Erro ao carregar contas");
        setAccounts([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const cents = Math.round(parseFloat(openingCents.replace(",", ".")) * 100);
    if (!name.trim()) {
      toast.error("Informe o nome da conta");
      return;
    }
    if (Number.isNaN(cents)) {
      toast.error("Saldo inicial inválido");
      return;
    }
    try {
      setSaving(true);
      await financeModuleService.createAccount({
        name: name.trim(),
        account_type: accountType,
        opening_balance_cents: cents,
        opening_balance_date: openingDate,
        description: description.trim() || null,
        is_active: true,
      });
      toast.success("Conta criada");
      setOpen(false);
      setName("");
      setOpeningCents("0");
      setDescription("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar conta");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando contas…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova conta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova conta / caixa</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta principal" />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={accountType} onValueChange={(v) => setAccountType(v as FinanceAccountType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as FinanceAccountType[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {TYPE_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Saldo inicial (R$)</Label>
                  <Input value={openingCents} onChange={(e) => setOpeningCents(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Data do saldo</Label>
                  <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} type="button">
                Cancelar
              </Button>
              <Button onClick={() => void handleCreate()} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma conta cadastrada. Crie a primeira conta para lançar entradas e despesas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Link key={a.id} to={`/finance/contas/${a.id}`} className="block group">
              <Card
                className={cn(
                  "h-full transition-shadow hover:shadow-md border",
                  !a.is_active && "opacity-70"
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Landmark className="h-5 w-5 text-crm-primary shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground">{TYPE_LABEL[a.account_type]}</span>
                  </div>
                  <CardTitle className="text-lg leading-tight">{a.name}</CardTitle>
                  <CardDescription>Saldo atual estimado</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight">
                    {formatBrl(a.current_balance_cents ?? a.opening_balance_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Saldo inicial em {formatDateOnlyPtBr(a.opening_balance_date)}: {formatBrl(a.opening_balance_cents)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default FinanceAccountsPage;
