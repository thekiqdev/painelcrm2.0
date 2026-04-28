import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import {
  financialService,
  displayFinancialGatewayLabel,
  type FinancialAccountDto,
  type FinancialAccountScope,
  type FinancialAccountType,
  type FinancialGatewayAvailableItem,
  type FinancialGatewayProvider,
  type FinancialTransactionDto,
} from "@/services/financial";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeftRight, Filter, Landmark, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { FinanceMobileBottomBar, financeMobilePageBottomPad } from "@/components/finance/FinanceMobileBottomBar";
import { useFinanceBottomBarVisibility } from "@/contexts/FinanceMobileChromeContext";
import { useIsMobile } from "@/hooks/use-mobile";

const TYPE_LABEL: Record<FinancialAccountType, string> = {
  bank: "Banco",
  cash: "Caixa",
  wallet: "Carteira",
};
const SCOPE_LABEL: Record<FinancialAccountScope, string> = {
  business: "Empresarial",
  personal: "Pessoal",
};

function formatBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function monthBoundsNow(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m0 = d.getMonth();
  const from = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const to = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

const SCOPE_FILTER_OPTIONS: { value: "all" | FinancialAccountScope; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "business", label: "Empresarial" },
  { value: "personal", label: "Pessoal" },
];

const TYPE_FILTER_OPTIONS: { value: "all" | FinancialAccountType; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "bank", label: "Banco" },
  { value: "cash", label: "Caixa" },
  { value: "wallet", label: "Carteira" },
];

type AccountsListFilterContentProps = {
  idPrefix: string;
  scopeFilter: "all" | FinancialAccountScope;
  onScopeFilter: (v: "all" | FinancialAccountScope) => void;
  typeFilter: "all" | FinancialAccountType;
  onTypeFilter: (v: "all" | FinancialAccountType) => void;
  onClear: () => void;
};

function AccountsListFilterContent({
  idPrefix,
  scopeFilter,
  onScopeFilter,
  typeFilter,
  onTypeFilter,
  onClear,
}: AccountsListFilterContentProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <Label className="text-sm font-medium">Âmbito da conta</Label>
        <RadioGroup
          value={scopeFilter}
          onValueChange={(v) => onScopeFilter(v as "all" | FinancialAccountScope)}
          className="grid gap-2.5"
        >
          {SCOPE_FILTER_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-2.5">
              <RadioGroupItem value={o.value} id={`${idPrefix}-scope-${o.value}`} />
              <Label htmlFor={`${idPrefix}-scope-${o.value}`} className="font-normal cursor-pointer">
                {o.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <div className="space-y-2.5">
        <div>
          <Label className="text-sm font-medium">Tipo (Banco / Caixa / Carteira)</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Refina a lista; não altera a API que já filtra por âmbito.</p>
        </div>
        <RadioGroup
          value={typeFilter}
          onValueChange={(v) => onTypeFilter(v as "all" | FinancialAccountType)}
          className="grid gap-2.5"
        >
          {TYPE_FILTER_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-2.5">
              <RadioGroupItem value={o.value} id={`${idPrefix}-type-${o.value}`} />
              <Label htmlFor={`${idPrefix}-type-${o.value}`} className="font-normal cursor-pointer">
                {o.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <div className="pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground h-8 px-2 -ml-2">
          Limpar filtros
        </Button>
      </div>
    </div>
  );
}

const FinancialUnifiedAccountsPage = () => {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [periodTx, setPeriodTx] = useState<FinancialTransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FinancialAccountType>("bank");
  const [scope, setScope] = useState<FinancialAccountScope>("business");
  const [scopeFilter, setScopeFilter] = useState<"all" | FinancialAccountScope>("all");
  /** Filtro de tipo (Banco/Caixa) só no cliente; backend continua a filtrar só por âmbito. */
  const [typeFilter, setTypeFilter] = useState<"all" | FinancialAccountType>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [initialCentsInput, setInitialCentsInput] = useState("0");
  const [initialDate, setInitialDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferDesc, setTransferDesc] = useState("");
  const [gwLinkEnabled, setGwLinkEnabled] = useState(false);
  const [gwProvider, setGwProvider] = useState<FinancialGatewayProvider>("asaas");
  const [gwDefaultReceivables, setGwDefaultReceivables] = useState(false);
  const [availableGw, setAvailableGw] = useState<FinancialGatewayAvailableItem[]>([]);

  const { from: monthFrom, to: monthTo } = useMemo(() => monthBoundsNow(), []);

  useEffect(() => {
    if (!open) return;
    void financialService
      .getAvailableFinancialGateways()
      .then((list) => {
        setAvailableGw(list.length > 0 ? list : [{ key: "asaas", label: "Asaas", enabled: true }]);
      })
      .catch(() => {
        setAvailableGw([{ key: "asaas", label: "Asaas", enabled: true }]);
      });
  }, [open]);

  useEffect(() => {
    if (availableGw.length === 0) return;
    if (!availableGw.some((g) => g.key === gwProvider)) {
      setGwProvider(availableGw[0].key as FinancialGatewayProvider);
    }
  }, [availableGw, gwProvider]);

  const displayedAccounts = useMemo(() => {
    if (typeFilter === "all") return accounts;
    return accounts.filter((a) => a.type === typeFilter);
  }, [accounts, typeFilter]);

  const filterActive = scopeFilter !== "all" || typeFilter !== "all";

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (scopeFilter !== "all") parts.push(SCOPE_LABEL[scopeFilter]);
    if (typeFilter !== "all") parts.push(TYPE_LABEL[typeFilter]);
    return parts.join(" · ");
  }, [scopeFilter, typeFilter]);

  const clearFilters = useCallback(() => {
    setScopeFilter("all");
    setTypeFilter("all");
  }, []);

  const statsByAccount = useMemo(() => {
    const m = new Map<string, { inc: number; exp: number }>();
    for (const t of periodTx) {
      if (t.status !== "completed") continue;
      const cur = m.get(t.account_id) ?? { inc: 0, exp: 0 };
      if (t.type === "income") cur.inc += t.amount_cents;
      else cur.exp += t.amount_cents;
      m.set(t.account_id, cur);
    }
    return m;
  }, [periodTx]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      financialService.listAccounts({ account_scope: scopeFilter === "all" ? undefined : scopeFilter }),
      financialService.listTransactions({ from: monthFrom, to: monthTo, status: "completed" }),
    ])
      .then(([ac, tx]) => {
        setAccounts(ac);
        setPeriodTx(tx);
      })
      .catch(() => {
        toast.error("Erro ao carregar contas");
        setAccounts([]);
        setPeriodTx([]);
      })
      .finally(() => setLoading(false));
  }, [monthFrom, monthTo, scopeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const shouldOpenTransfer = searchParams.get("transfer");
    if (shouldOpenTransfer !== "1") return;
    if (loading) return;
    setTransferOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("transfer");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loading]);

  useFinanceBottomBarVisibility(open || transferOpen || filterOpen);

  const handleCreate = async () => {
    const cents = Math.round(parseFloat(initialCentsInput.replace(",", ".")) * 100);
    if (!name.trim()) {
      toast.error("Indique o nome da conta");
      return;
    }
    if (Number.isNaN(cents)) {
      toast.error("Saldo inicial inválido");
      return;
    }
    try {
      setSaving(true);
      await financialService.createAccount({
        name: name.trim(),
        type,
        account_scope: scope,
        initial_balance_cents: cents,
        initial_balance_date: initialDate,
        gateway_link: gwLinkEnabled
          ? {
              enabled: true,
              gateway: gwProvider,
              is_default_receivables: gwDefaultReceivables,
            }
          : undefined,
      });
      toast.success("Conta criada");
      setOpen(false);
      setName("");
      setScope("business");
      setInitialCentsInput("0");
      setGwLinkEnabled(false);
      setGwProvider("asaas");
      setGwDefaultReceivables(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async () => {
    const cents = Math.round(parseFloat(transferAmount.replace(",", ".")) * 100);
    if (!transferFrom || !transferTo) {
      toast.error("Selecione conta de origem e destino");
      return;
    }
    if (transferFrom === transferTo) {
      toast.error("Origem e destino devem ser diferentes");
      return;
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Valor da transferência inválido");
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
      setTransferAmount("");
      setTransferDesc("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao transferir");
    } finally {
      setTransferSaving(false);
    }
  };

  return (
    <div className={cn("space-y-6", financeMobilePageBottomPad)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bancos e contas</h2>
          <p className="text-sm text-muted-foreground">
            Onde entra e sai o dinheiro da empresa. Entradas e saídas do mês ({monthFrom.slice(0, 7)}): só movimentos
            concluídos.
          </p>
          {filterActive ? (
            <div className="md:hidden flex flex-wrap items-center gap-2 pt-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Filtro</span>
              <Badge variant="secondary" className="text-xs font-normal max-w-full truncate" title={filterSummary}>
                {filterSummary}
              </Badge>
            </div>
          ) : null}
        </div>
        <div className="hidden md:flex flex-wrap items-center justify-end gap-2">
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova conta
          </Button>
          <Button type="button" variant="outline" onClick={() => setTransferOpen(true)}>
            Transferir
          </Button>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 relative"
                aria-label="Filtros da lista"
                aria-pressed={filterOpen}
              >
                <Filter className="h-4 w-4" />
                {filterActive ? (
                  <span
                    className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
                    aria-hidden
                  />
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(20.5rem,calc(100vw-1.5rem))] p-4" align="end" sideOffset={8}>
              <p className="text-sm font-semibold mb-3 pr-2">Filtros</p>
              <AccountsListFilterContent
                idPrefix="fin-ac-desk"
                scopeFilter={scopeFilter}
                onScopeFilter={setScopeFilter}
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
                onClear={clearFilters}
              />
            </PopoverContent>
          </Popover>
          {filterActive && filterSummary ? (
            <Badge
              variant="secondary"
              className="text-xs font-normal max-w-[14rem] truncate"
              title={filterSummary}
            >
              {filterSummary}
            </Badge>
          ) : null}
        </div>
        <Sheet
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) {
              setGwLinkEnabled(false);
              setGwProvider("asaas");
              setGwDefaultReceivables(false);
            }
          }}
        >
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={cn(
              "flex flex-col gap-0 p-0",
              isMobile ? "h-[100dvh] max-h-[100dvh] rounded-t-xl sm:max-w-none w-full" : "sm:max-w-md w-full"
            )}
          >
            <SheetHeader className="px-6 pt-6 pb-2 space-y-1 border-b border-border shrink-0">
              <SheetTitle>Nova conta</SheetTitle>
              <SheetDescription>
                Defina nome, tipo e saldo inicial. Opcionalmente associe um gateway para recebimentos automáticos.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="fa-name">Nome</Label>
                  <Input id="fa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta principal" />
                </div>
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={(v) => setType(v as FinancialAccountType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABEL) as FinancialAccountType[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {TYPE_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Tipo da conta</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as FinancialAccountScope)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Empresarial</SelectItem>
                      <SelectItem value="personal">Pessoal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fa-balance">Saldo inicial (R$)</Label>
                  <Input
                    id="fa-balance"
                    inputMode="decimal"
                    value={initialCentsInput}
                    onChange={(e) => setInitialCentsInput(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fa-date">Data do saldo inicial</Label>
                  <Input id="fa-date" type="date" value={initialDate} onChange={(e) => setInitialDate(e.target.value)} />
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Gateway de pagamento</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pagamentos confirmados pelo gateway serão lançados automaticamente como entrada nesta conta.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Label htmlFor="fa-gw-link" className="text-sm font-normal">
                      Vincular esta conta a um gateway
                    </Label>
                    <Switch id="fa-gw-link" checked={gwLinkEnabled} onCheckedChange={setGwLinkEnabled} />
                  </div>
                  {gwLinkEnabled ? (
                    <>
                      <div className="grid gap-2">
                        <Label>Gateway</Label>
                        <Select value={gwProvider} onValueChange={(v) => setGwProvider(v as FinancialGatewayProvider)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableGw.map((g) => (
                              <SelectItem key={g.key} value={g.key}>
                                {g.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-border/50 bg-background/50 p-3">
                        <Label htmlFor="fa-gw-default" className="text-sm font-normal leading-tight">
                          Usar como conta padrão para recebimentos deste gateway
                        </Label>
                        <Switch
                          id="fa-gw-default"
                          checked={gwDefaultReceivables}
                          onCheckedChange={setGwDefaultReceivables}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t px-6 py-4 flex flex-wrap gap-2 justify-end shrink-0 bg-background">
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleCreate()} disabled={saving}>
                {saving ? "A guardar…" : "Criar"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
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
                    {accounts.map((a) => (
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
                    {accounts.map((a) => (
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
              <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
              <Button onClick={handleTransfer} disabled={transferSaving}>
                {transferSaving ? "Transferindo…" : "Confirmar transferência"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isMobile ? (
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetContent
            side="bottom"
            className={cn(
              "max-h-[88dvh] flex flex-col gap-0 p-0 rounded-t-2xl",
              isMobile ? "h-auto max-w-none w-full" : ""
            )}
          >
            <SheetHeader className="px-5 pt-4 pb-2 text-left space-y-1 border-b">
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>Âmbito, tipo (Banco/Caixa) e limpar.</SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto px-5 py-4 flex-1 min-h-0">
              <AccountsListFilterContent
                idPrefix="fin-ac-mob"
                scopeFilter={scopeFilter}
                onScopeFilter={setScopeFilter}
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
                onClear={clearFilters}
              />
            </div>
            <div className="p-4 pt-2 border-t border-border/60 shrink-0">
              <Button type="button" className="w-full" onClick={() => setFilterOpen(false)}>
                Concluir
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <FinanceMobileBottomBar
        actions={[
          {
            key: "new-account",
            label: "Nova conta",
            variant: "primary",
            icon: Plus,
            onClick: () => setOpen(true),
            loading: saving && open,
          },
          {
            key: "transfer",
            label: "Transferir",
            variant: "outline",
            icon: ArrowLeftRight,
            onClick: () => setTransferOpen(true),
            loading: transferSaving && transferOpen,
          },
          {
            key: "filter",
            label: "Filtro",
            variant: "outline",
            icon: Filter,
            onClick: () => setFilterOpen(true),
          },
        ]}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">A carregar…</p>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Sem contas ainda. Crie a primeira para começar a registar movimentos.
          </CardContent>
        </Card>
      ) : displayedAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm space-y-3 max-w-md mx-auto">
            <p>Nenhuma conta corresponde aos filtros actuais.</p>
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Remover filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedAccounts.map((a) => {
            const st = statsByAccount.get(a.id) ?? { inc: 0, exp: 0 };
            return (
              <NavLink key={a.id} to={`/finance/accounts/${a.id}`} className="block group">
                <Card
                  className={cn(
                    "overflow-hidden border transition-shadow h-full",
                    a.is_active ? "hover:shadow-md group-hover:border-primary/30" : "opacity-70"
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <Landmark className="h-5 w-5 text-muted-foreground" />
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs rounded-full bg-muted px-2 py-0.5">{TYPE_LABEL[a.type]}</span>
                        <span className="text-[10px] rounded-full border px-2 py-0.5">{SCOPE_LABEL[a.account_scope]}</span>
                        <Badge variant={a.is_active ? "secondary" : "outline"} className="text-[10px]">
                          {a.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="text-base font-semibold leading-tight">{a.name}</CardTitle>
                    {a.gateway_link?.is_enabled ? (
                      <Badge variant="secondary" className="text-[10px] font-normal w-fit tabular-nums">
                        Recebimento automático: {displayFinancialGatewayLabel(a.gateway_link.gateway)}
                      </Badge>
                    ) : null}
                    <CardDescription>
                      Saldo actual
                      <span className="block text-lg font-semibold text-foreground tabular-nums mt-1">
                        {formatBrl(a.balance)}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground pt-0 space-y-1">
                    <div className="flex justify-between gap-2">
                      <span>Entradas (mês)</span>
                      <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatBrl(st.inc / 100)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Saídas (mês)</span>
                      <span className="tabular-nums text-rose-700 dark:text-rose-400">
                        {formatBrl(st.exp / 100)}
                      </span>
                    </div>
                    <p className="pt-1 border-t border-border/60">
                      Saldo inicial em {a.initial_balance_date}: {formatBrl(a.initial_balance_cents / 100)}
                    </p>
                  </CardContent>
                </Card>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FinancialUnifiedAccountsPage;
