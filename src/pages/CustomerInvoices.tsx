import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientEntityLink } from "@/components/entities";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { customerInvoicesService } from "@/services/customerInvoices";
import type { CustomerInvoicesSummary, ListCustomerInvoicesParams } from "@/services/customerInvoices";
import { clientsService } from "@/services/clients";
import type { CustomerInvoice } from "@/services/customerInvoices";
import type { Client } from "@/services/clients";
import { toast } from "@/components/ui/sonner";
import { chatAvatarUrlForImgSrc } from "@/lib/chatAvatarUrl";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  ExternalLink,
  AlertTriangle,
  MoreHorizontal,
  Pencil,
  XCircle,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommercialListingPageShell } from "@/components/listing/CommercialListingPageShell";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import {
  COMMERCIAL_FILTERS_PANEL,
  COMMERCIAL_SUMMARY_ACTIVE_RING,
  COMMERCIAL_SUMMARY_CARD_CLASS,
  COMMERCIAL_SUMMARY_GRID_4,
} from "@/lib/commercialListUi";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { CustomerInvoiceStatusBadge } from "@/lib/customerInvoiceStatusUi";
import {
  canDeleteCustomerInvoice,
  isInvoiceActionable,
  isSubscriptionInvoicePurgeable,
} from "@/lib/customerInvoiceActions";

const PAGE_SIZE = 20;
/** Filtro agrupado: pendente + aguardando pagamento (alinhado ao card e ao resumo). */
const PENDING_OPEN_FILTER = "pending_open";

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function isSubscriptionRecurringListItem(inv: CustomerInvoice): boolean {
  return Boolean(inv.subscription_id && inv.origin === "subscription");
}

function ymdFromApi(d: string | null | undefined): string | null {
  if (d == null || typeof d !== "string") return null;
  const t = d.trim();
  return t.length >= 10 ? t.slice(0, 10) : null;
}

type ListRowModel = { kind: "standalone"; inv: CustomerInvoice; sortTs: number };

function buildInvoiceListRows(invoices: CustomerInvoice[]): ListRowModel[] {
  return [...invoices]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((inv) => ({ kind: "standalone" as const, inv, sortTs: new Date(inv.created_at).getTime() }));
}

const CustomerInvoices = () => {
  const navigate = useNavigate();
  const { hasPermissionKey, loading: permLoading } = useModulePermissions();
  const canCreateInvoice = hasPermissionKey("billing.create_invoice") && !permLoading;
  const canEditInvoice = hasPermissionKey("billing.edit_invoice");
  const canCancelInvoice = hasPermissionKey("billing.cancel_invoice");
  const canDeleteInvoice = hasPermissionKey("billing.delete_invoice");
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [crmGatewayActive, setCrmGatewayActive] = useState<boolean | null>(null);
  const [invoiceToCancel, setInvoiceToCancel] = useState<CustomerInvoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<CustomerInvoice | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<CustomerInvoicesSummary | null>(null);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const refreshSummary = useCallback(() => {
    customerInvoicesService.getSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    customerInvoicesService
      .getGatewayStatus()
      .then((s) => setCrmGatewayActive(s.gatewayConfigured))
      .catch(() => setCrmGatewayActive(null));
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params: ListCustomerInvoicesParams = { limit: PAGE_SIZE, offset };
      if (statusFilter === PENDING_OPEN_FILTER) {
        params.status_in = ["pending", "waiting_payment"];
      } else if (statusFilter) {
        params.status = statusFilter;
      }
      const data = await customerInvoicesService.list(params);
      setInvoices(data);
    } catch (err) {
      console.error("Erro ao carregar faturas:", err);
      toast.error("Erro ao carregar faturas");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    setOffset(0);
  }, [statusFilter]);

  useEffect(() => {
    clientsService.getClients().then(setClients).catch(() => setClients([]));
  }, []);

  const clientMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach((c) => { m[c.id] = c.name || c.company || c.id; });
    return m;
  }, [clients]);

  const clientAvatarById = React.useMemo(() => {
    const m: Record<string, string | null> = {};
    clients.forEach((c) => {
      m[c.id] = chatAvatarUrlForImgSrc(c.whatsapp_avatar_url ?? null);
    });
    return m;
  }, [clients]);

  const listRows = React.useMemo(() => buildInvoiceListRows(invoices), [invoices]);
  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const inDays = (dateIso: string, days: number) => {
      const due = new Date(dateIso);
      const diffMs = due.getTime() - now.getTime();
      return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
    };
    const inCurrentMonth = (dateIso: string) => {
      const due = new Date(dateIso);
      return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
    };

    const out = listRows.filter((row) => {
      const inv = row.inv;
      const clientName = inv.client_id ? clientMap[inv.client_id] ?? "Cliente" : "Sem cliente";
      const matchesSearch =
        !q ||
        (inv.invoice_number ?? "").toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q) ||
        (inv.description ?? "").toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (clientFilter !== "all" && inv.client_id !== clientFilter) return false;

      if (periodFilter === "overdue" && inv.status !== "overdue") return false;
      if (periodFilter === "due_7" && !inDays(inv.due_date, 7)) return false;
      if (periodFilter === "due_30" && !inDays(inv.due_date, 30)) return false;
      if (periodFilter === "this_month" && !inCurrentMonth(inv.due_date)) return false;

      return true;
    });

    out.sort((a, b) => {
      if (sortBy === "due_soon") return new Date(a.inv.due_date).getTime() - new Date(b.inv.due_date).getTime();
      if (sortBy === "amount_desc") return b.inv.amount_cents - a.inv.amount_cents;
      return new Date(b.inv.created_at).getTime() - new Date(a.inv.created_at).getTime();
    });
    return out;
  }, [listRows, search, clientFilter, periodFilter, sortBy, clientMap]);

  const handleConfirmCancel = async () => {
    if (!invoiceToCancel) return;
    try {
      setCancellingId(invoiceToCancel.id);
      await customerInvoicesService.cancel(invoiceToCancel.id);
      toast.success("Fatura cancelada no sistema e no provedor de pagamento");
      setInvoiceToCancel(null);
      await loadInvoices();
      refreshSummary();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao cancelar fatura";
      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete) return;
    try {
      setDeletingId(invoiceToDelete.id);
      await customerInvoicesService.remove(invoiceToDelete.id);
      toast.success("Fatura excluída");
      setInvoiceToDelete(null);
      await loadInvoices();
      refreshSummary();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir fatura";
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <CommercialListingPageShell>
      {crmGatewayActive === false && (
        <Alert className="border-orange-500/60 bg-orange-50 text-orange-950 dark:bg-orange-950/30 dark:text-orange-100 dark:border-orange-500/50">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription>
            Para emitir faturas com cobrança, configure o <strong>provedor de pagamentos</strong> (CRM) com status{" "}
            <strong>ativo</strong> em Configurações.{" "}
            <Link to="/settings/payments" className="font-medium text-primary underline hover:no-underline">
              Configurar pagamentos <ExternalLink className="inline h-3 w-3 ml-0.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title="Faturas"
          secondarySlot={
            canCreateInvoice ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label="Mais ações">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/customer-invoices/new?by_link=1&billing=subscription">Assinatura por link</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/customer-invoices/new?by_link=1&billing=one_off">Fatura por link</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null
          }
          primaryAction={
            canCreateInvoice
              ? { label: "Nova fatura", icon: <Plus className="h-4 w-4" aria-hidden />, href: "/customer-invoices/new" }
              : undefined
          }
        />
      </div>
      <div className="hidden md:flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Faturas</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Operação rápida de cobranças e acompanhamento.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateInvoice ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Mais ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/customer-invoices/new?by_link=1&billing=subscription">Assinatura por link</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/customer-invoices/new?by_link=1&billing=one_off">Fatura por link</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canCreateInvoice ? (
            <Button asChild>
              <Link to="/customer-invoices/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova fatura
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {summary && (
        <div className={COMMERCIAL_SUMMARY_GRID_4}>
          <Card
            className={cn(
              COMMERCIAL_SUMMARY_CARD_CLASS,
              statusFilter === "paid" && COMMERCIAL_SUMMARY_ACTIVE_RING,
            )}
            onClick={() => setStatusFilter("paid")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStatusFilter("paid");
              }
            }}
          >
            <CardContent className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">Pagas</p>
                <CheckCircle2 className="h-4 w-4 text-emerald-600/80 shrink-0" aria-hidden />
              </div>
              <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{summary.paid_count}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatAmount(summary.paid_amount_cents)}</p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              COMMERCIAL_SUMMARY_CARD_CLASS,
              statusFilter === PENDING_OPEN_FILTER && COMMERCIAL_SUMMARY_ACTIVE_RING,
            )}
            onClick={() => setStatusFilter(PENDING_OPEN_FILTER)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStatusFilter(PENDING_OPEN_FILTER);
              }
            }}
          >
            <CardContent className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
                <Clock className="h-4 w-4 text-amber-600/85 shrink-0" aria-hidden />
              </div>
              <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{summary.pending_count}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatAmount(summary.pending_amount_cents)}</p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              COMMERCIAL_SUMMARY_CARD_CLASS,
              statusFilter === "overdue" && COMMERCIAL_SUMMARY_ACTIVE_RING,
            )}
            onClick={() => setStatusFilter("overdue")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStatusFilter("overdue");
              }
            }}
          >
            <CardContent className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">Vencidas</p>
                <AlertCircle className="h-4 w-4 text-red-600/75 shrink-0" aria-hidden />
              </div>
              <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{summary.overdue_count}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatAmount(summary.overdue_amount_cents)}</p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              COMMERCIAL_SUMMARY_CARD_CLASS,
              statusFilter === "" && COMMERCIAL_SUMMARY_ACTIVE_RING,
            )}
            onClick={() => setStatusFilter("")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStatusFilter("");
              }
            }}
          >
            <CardContent className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <Layers className="h-4 w-4 text-muted-foreground shrink-0 opacity-70" aria-hidden />
              </div>
              <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{summary.total_count}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatAmount(summary.total_amount_cents)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className={cn(COMMERCIAL_FILTERS_PANEL, "space-y-2")}>
        <p className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">
          Busca e filtros da listagem
        </p>
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, número ou descrição"
            className="h-10"
          />
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="md:hidden h-10 px-3">
                <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                Filtros
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Filtros da listagem</SheetTitle>
                <SheetDescription>Ajuste rapidamente a visualização das faturas.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Todos os status</option>
                  <option value="paid">Pagas</option>
                  <option value={PENDING_OPEN_FILTER}>Pendentes</option>
                  <option value="overdue">Vencidas</option>
                </select>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                >
                  <option value="all">Período: todos</option>
                  <option value="due_7">Vencimento em 7 dias</option>
                  <option value="due_30">Vencimento em 30 dias</option>
                  <option value="this_month">Vence neste mês</option>
                  <option value="overdue">Somente vencidas</option>
                </select>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                >
                  <option value="all">Todos os clientes</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.company || c.id}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="newest">Mais novas</option>
                  <option value="due_soon">Vencimento mais próximo</option>
                  <option value="amount_desc">Maior valor</option>
                </select>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden md:grid md:grid-cols-4 md:gap-2">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos os status</option>
            <option value="paid">Pagas</option>
            <option value={PENDING_OPEN_FILTER}>Pendentes</option>
            <option value="overdue">Vencidas</option>
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          >
            <option value="all">Período: todos</option>
            <option value="due_7">Vencimento em 7 dias</option>
            <option value="due_30">Vencimento em 30 dias</option>
            <option value="this_month">Vence neste mês</option>
            <option value="overdue">Somente vencidas</option>
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="all">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.company || c.id}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="newest">Mais novas</option>
            <option value="due_soon">Vencimento mais próximo</option>
            <option value="amount_desc">Maior valor</option>
          </select>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Fatura</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[110px]">Recorrência</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="w-[200px] text-right">Ações rápidas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <span className="block font-medium text-foreground mb-1">Nenhuma fatura encontrada</span>
                  Crie uma nova fatura ou use os cards acima para outro status.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => {
                const inv = row.inv;
                const nextBill = ymdFromApi(inv.subscription_next_billing_date);
                return (
                  <TableRow
                    key={inv.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer hover:bg-muted/60"
                    onClick={() => navigate(`/customer-invoices/${inv.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/customer-invoices/${inv.id}`);
                      }
                    }}
                  >
                    <TableCell className="font-mono text-sm">
                      {inv.invoice_number ?? inv.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <ClientEntityLink
                        clientId={inv.client_id}
                        name={inv.client_id ? clientMap[inv.client_id] ?? inv.client_id.slice(0, 8) : null}
                        avatarUrl={inv.client_id ? clientAvatarById[inv.client_id] ?? null : null}
                        disabledFallbackText="Sem cliente"
                        variant="table"
                        stopPropagationOnClick
                      />
                    </TableCell>
                    <TableCell>{formatAmount(inv.amount_cents)}</TableCell>
                    <TableCell>
                      <CustomerInvoiceStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {isSubscriptionRecurringListItem(inv) && inv.subscription_id ? (
                        <Link
                          to={`/crm-subscriptions/${inv.subscription_id}`}
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          Assinatura
                          {nextBill ? (
                            <span className="block text-[10px] text-muted-foreground font-normal tabular-nums mt-0.5">
                              Próx.: {format(new Date(nextBill + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(inv.due_date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            aria-label="Ações rápidas"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="hidden sm:inline text-xs">Ações</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            Ações rápidas
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={() => navigate(`/customer-invoices/${inv.id}`)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalhes
                          </DropdownMenuItem>
                          {isInvoiceActionable(inv.status) && canEditInvoice && (
                            <DropdownMenuItem
                              onSelect={() =>
                                navigate(`/customer-invoices/${inv.id}/edit`)
                              }
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {isInvoiceActionable(inv.status) && canCancelInvoice && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setInvoiceToCancel(inv);
                                }}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancelar fatura
                              </DropdownMenuItem>
                            </>
                          )}
                          {canDeleteCustomerInvoice(inv) && canDeleteInvoice && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                setInvoiceToDelete(inv);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {!loading && (filteredRows.length > 0 || offset > 0) && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
            <p className="text-sm text-muted-foreground tabular-nums">
              {filteredRows.length > 0 ? (
                <>
                  Página {Math.floor(offset / PAGE_SIZE) + 1}
                  <span className="mx-1.5 text-border">·</span>
                  {offset + 1}–{offset + filteredRows.length}
                </>
              ) : (
                <>Nenhum resultado nesta página</>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(0)}
              >
                Início
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={filteredRows.length < PAGE_SIZE}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
        {loading ? (
          <div className="flex min-h-[10rem] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/50 py-10 text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : null}
        {!loading && filteredRows.length > 0
          ? filteredRows.map((row) => {
              const inv = row.inv;
              const nextBill = ymdFromApi(inv.subscription_next_billing_date);
              return (
                <div
                  key={`m-${inv.id}`}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => navigate(`/customer-invoices/${inv.id}`)}
                  >
                    <p className="font-mono text-xs text-muted-foreground">
                      {inv.invoice_number ?? inv.id.slice(0, 8)}
                    </p>
                    <div className="mt-1 font-semibold leading-snug">
                      <ClientEntityLink
                        clientId={inv.client_id}
                        name={inv.client_id ? clientMap[inv.client_id] ?? "Cliente" : null}
                        avatarUrl={inv.client_id ? clientAvatarById[inv.client_id] ?? null : null}
                        disabledFallbackText="Sem cliente"
                        variant="compact"
                        className="font-semibold"
                        stopPropagationOnClick
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <CustomerInvoiceStatusBadge status={inv.status} />
                      <span className="text-base font-semibold tabular-nums">{formatAmount(inv.amount_cents)}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Venc. {format(new Date(inv.due_date), "dd/MM/yyyy", { locale: ptBR })}
                      {isSubscriptionRecurringListItem(inv) ? " · Assinatura" : " · Avulsa"}
                    </p>
                    {isSubscriptionRecurringListItem(inv) && inv.subscription_id && nextBill ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Próx. cobrança {format(new Date(nextBill + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    ) : null}
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <Button type="button" size="sm" variant="default" onClick={() => navigate(`/customer-invoices/${inv.id}`)}>
                      Abrir
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="outline">
                          <MoreHorizontal className="h-4 w-4 mr-1" />
                          Ações
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onSelect={() => navigate(`/customer-invoices/${inv.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Abrir
                        </DropdownMenuItem>
                        {isInvoiceActionable(inv.status) && canEditInvoice ? (
                          <DropdownMenuItem onSelect={() => navigate(`/customer-invoices/${inv.id}/edit`)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                        ) : null}
                        {isInvoiceActionable(inv.status) && canCancelInvoice ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                setInvoiceToCancel(inv);
                              }}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancelar fatura
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {canDeleteCustomerInvoice(inv) && canDeleteInvoice ? (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(e) => {
                              e.preventDefault();
                              setInvoiceToDelete(inv);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })
          : null}
        {!loading && filteredRows.length === 0 ? (
          <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma fatura nesta vista. Ajuste os filtros ou crie uma nova.
          </div>
        ) : null}
      </div>

      <AlertDialog open={invoiceToCancel !== null} onOpenChange={(open) => !open && setInvoiceToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A cobrança será cancelada no provedor (ex.: Asaas) e a fatura ficará como cancelada. Número:{" "}
              <span className="font-mono">{invoiceToCancel?.invoice_number ?? invoiceToCancel?.id.slice(0, 8)}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingId !== null}>Não</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmCancel();
              }}
              disabled={cancellingId !== null}
            >
              {cancellingId ? "Cancelando…" : "Sim, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={invoiceToDelete !== null} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              {invoiceToDelete && isSubscriptionInvoicePurgeable(invoiceToDelete) ? (
                <>
                  Esta cobrança de assinatura já está encerrada (cancelada ou falhou). O registro será removido
                  definitivamente aqui. Número:{" "}
                  <span className="font-mono">{invoiceToDelete.invoice_number ?? invoiceToDelete.id.slice(0, 8)}</span>
                </>
              ) : (
                <>
                  A cobrança será removida no provedor e o registro será apagado. Número:{" "}
                  <span className="font-mono">{invoiceToDelete?.invoice_number ?? invoiceToDelete?.id.slice(0, 8)}</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Não</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={deletingId !== null}
            >
              {deletingId ? "Excluindo…" : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CommercialListingPageShell>
  );
};

export default CustomerInvoices;
