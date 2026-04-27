import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerChargesService } from "@/services/customerCharges";
import { clientsService } from "@/services/clients";
import type { CustomerChargeWithSummary } from "@/services/customerCharges";
import type { Client } from "@/services/clients";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, CreditCard, Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyUrlPatch, readInt } from "@/lib/listFiltersUrl";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";

const PAGE_SIZE = 50;
const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Aberta" },
  { value: "partial", label: "Parcial" },
  { value: "paid", label: "Quitada" },
];

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    open: "border-amber-400/60 bg-amber-500/15 text-amber-900 dark:border-amber-700/50 dark:text-amber-200",
    partial: "border-orange-400/60 bg-orange-500/15 text-orange-900 dark:border-orange-700/50 dark:text-orange-200",
    paid: "border-emerald-400/60 bg-emerald-500/15 text-emerald-900 dark:border-emerald-700/50 dark:text-emerald-200",
  };
  const labels: Record<string, string> = {
    open: "Aberta",
    partial: "Parcial",
    paid: "Quitada",
  };
  return (
    <Badge className={cn("border font-medium", variants[status] ?? "bg-muted")} variant="secondary">
      {labels[status] ?? status}
    </Badge>
  );
}

const STATUS_URL_VALUES = new Set(["", "open", "partial", "paid"]);

const CustomerCharges = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [charges, setCharges] = useState<CustomerChargeWithSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(() => {
    const s = searchParams.get("status") ?? "";
    return STATUS_URL_VALUES.has(s) ? s : "";
  });
  const [offset, setOffset] = useState(() => {
    const page = readInt(searchParams, "page", 1, { min: 1, max: 500 });
    return (page - 1) * PAGE_SIZE;
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createDescription, setCreateDescription] = useState("");
  const [createClientId, setCreateClientId] = useState<string>("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(() => searchParams.get("q") ?? "");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const loadCharges = useCallback(async () => {
    try {
      setLoading(true);
      const data = await customerChargesService.list({
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset,
        q: debouncedQ || undefined,
      });
      setCharges(data);
    } catch (err) {
      console.error("Erro ao carregar cobranças:", err);
      toast.error("Erro ao carregar cobranças");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset, debouncedQ]);

  useEffect(() => {
    loadCharges();
  }, [loadCharges]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, statusFilter]);

  useEffect(() => {
    clientsService.getClients().then(setClients).catch(() => setClients([]));
  }, []);

  /** Atalho a partir da lista de clientes: `?forClient=<uuid>&create=1` abre o diálogo com cliente pré-selecionado. */
  useEffect(() => {
    const forClient = searchParams.get('forClient')?.trim();
    const wantCreate = searchParams.get('create') === '1';
    if (!forClient || !wantCreate) return;
    if (!/^[0-9a-f-]{36}$/i.test(forClient)) return;
    setCreateClientId(forClient);
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('forClient');
    next.delete('create');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const s = searchParams.get("status") ?? "";
    const nextStatus = STATUS_URL_VALUES.has(s) ? s : "";
    const page = readInt(searchParams, "page", 1, { min: 1, max: 500 });
    const nextOffset = (page - 1) * PAGE_SIZE;
    const q = searchParams.get("q") ?? "";
    setStatusFilter((prev) => (prev !== nextStatus ? nextStatus : prev));
    setOffset((prev) => (prev !== nextOffset ? nextOffset : prev));
    setSearchInput((prev) => (prev !== q ? q : prev));
    setDebouncedQ((prev) => (prev !== q ? q : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const page = Math.floor(offset / PAGE_SIZE) + 1;
    setSearchParams(
      (prev) =>
        applyUrlPatch(prev, {
          q: debouncedQ.trim() || null,
          status: statusFilter || null,
          page: page > 1 ? page : null,
        }),
      { replace: true },
    );
  }, [debouncedQ, statusFilter, offset, setSearchParams]);

  const clientMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach((c) => { m[c.id] = c.name || c.company || c.id; });
    return m;
  }, [clients]);

  const handleCreate = async () => {
    try {
      setCreateLoading(true);
      await customerChargesService.create({
        description: createDescription.trim() || null,
        client_id: createClientId || null,
      });
      toast.success("Cobrança criada");
      setCreateOpen(false);
      setCreateDescription("");
      setCreateClientId("");
      loadCharges();
    } catch (err) {
      console.error("Erro ao criar cobrança:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao criar cobrança");
    } finally {
      setCreateLoading(false);
    }
  };

  const filterSummary =
    (statusFilter ? STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label : "Todos") +
    (debouncedQ ? ` · “${debouncedQ}”` : "");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Cobranças</h1>
        <div className="flex flex-wrap gap-2">
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="md:hidden gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden">
              <SheetHeader className="text-left">
                <SheetTitle>Filtros e busca</SheetTitle>
                <SheetDescription>Status, texto e paginação da lista.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-1 pb-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Descrição, cliente..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOffset(0)}>
                    1ª página
                  </Button>
                  {offset >= PAGE_SIZE && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                      Anterior
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                    Próxima
                  </Button>
                </div>
                <SheetClose asChild>
                  <Button type="button" className="w-full">
                    Aplicar e fechar
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
          <Button onClick={() => setCreateOpen(true)} className="sm:ml-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nova Cobrança
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground md:hidden">{filterSummary}</p>

      <div className="hidden space-y-4 rounded-lg border bg-card p-4 md:block">
        <div className="mb-2 flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filtros</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)}>
            Primeira página
          </Button>
          {offset >= PAGE_SIZE && (
            <Button variant="outline" size="sm" onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
              Anterior
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            Próxima
          </Button>
        </div>
      </div>

      <div className="hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Faturas</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : charges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhuma cobrança encontrada. Crie uma cobrança e vincule faturas ao criá-las.
                </TableCell>
              </TableRow>
            ) : (
              charges.map((ch) => (
                <TableRow key={ch.id}>
                  <TableCell className="max-w-[200px] truncate">
                    {ch.description || "—"}
                  </TableCell>
                  <TableCell>
                    {ch.client_id ? (clientMap[ch.client_id] ?? ch.client_id.slice(0, 8)) : "—"}
                  </TableCell>
                  <TableCell>{ch.invoice_count}</TableCell>
                  <TableCell>{formatAmount(ch.total_cents)}</TableCell>
                  <TableCell>{formatAmount(ch.paid_cents)}</TableCell>
                  <TableCell>
                    <StatusBadge status={ch.status} />
                  </TableCell>
                  <TableCell>{format(new Date(ch.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/customer-charges/${ch.id}`)}
                    >
                      <CreditCard className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
        {loading ? (
          <div className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center">
            <CreditCard className="h-7 w-7 text-muted-foreground/80" aria-hidden />
            <p className="text-sm font-medium text-foreground">Carregando cobranças</p>
            <p className="text-xs text-muted-foreground">Aguarde um instante.</p>
          </div>
        ) : charges.length === 0 ? (
          <div className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center">
            <CreditCard className="h-7 w-7 text-muted-foreground/80" aria-hidden />
            <p className="text-sm font-medium text-foreground">Nenhuma cobrança encontrada</p>
            <p className="text-xs text-muted-foreground">
              Crie uma cobrança e vincule as faturas ao registrar os lançamentos.
            </p>
          </div>
        ) : (
          charges.map((ch) => {
            const clientLabel = ch.client_id ? clientMap[ch.client_id] ?? ch.client_id.slice(0, 8) : "Sem cliente";
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => navigate(`/customer-charges/${ch.id}`)}
                className="w-full min-h-[8.5rem] rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors active:bg-muted/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{ch.description || "Cobrança sem descrição"}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{clientLabel}</p>
                  </div>
                  <StatusBadge status={ch.status} />
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-bold tabular-nums">{formatAmount(ch.total_cents)}</span>
                  <span className="text-xs text-muted-foreground">{ch.invoice_count} fatura(s)</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  <span>Pago {formatAmount(ch.paid_cents)}</span>
                  <span>Criada {format(new Date(ch.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                </div>
                <div className="mt-3 flex justify-end border-t border-border/60 pt-2">
                  <span className="text-xs font-medium text-primary">Abrir detalhe →</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova cobrança</DialogTitle>
            <DialogDescription>
              Agrupe faturas em uma cobrança. Ao criar faturas, você poderá vinculá-las a esta cobrança.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="charge-desc">Descrição (opcional)</Label>
              <Input
                id="charge-desc"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Ex: Cobrança Janeiro 2025"
              />
            </div>
            <div className="grid gap-2">
              <ClientSearchCombobox
                id="charge-create-client"
                label="Cliente (opcional)"
                placeholderTrigger="Nenhum — busque para vincular"
                remoteSearch
                value={createClientId || null}
                onChange={(id) => setCreateClientId(id ?? "")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerCharges;
