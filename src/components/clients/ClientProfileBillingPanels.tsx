import React, { useCallback, useMemo } from "react";
import { Link, type Location, type NavigateFunction } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowRight,
  CalendarSync,
  Copy,
  ExternalLink,
  FileText,
  MessageSquare,
  Pencil,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import type { CustomerInvoice } from "@/services/customerInvoices";
import type { CrmSubscriptionListItem } from "@/services/crmSubscriptions";
import { CustomerInvoiceStatusBadge, getCustomerInvoiceStatusLabel } from "@/lib/customerInvoiceStatusUi";
import { buildInvoiceLink, sendInvoiceLink } from "@/services/chatFinancialAdapter";

function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function intervalLabelPt(interval: string): string {
  const m: Record<string, string> = {
    monthly: "Mensal",
    quarterly: "Trimestral",
    semi_annual: "Semestral",
    yearly: "Anual",
    weekly: "Semanal",
    daily: "Diário",
  };
  return m[interval] ?? interval;
}

function subscriptionStatusUi(row: CrmSubscriptionListItem): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (row.status === "cancelled") return { label: "Encerrada", variant: "secondary" };
  if (row.status !== "active") return { label: row.status, variant: "outline" };
  if (row.cancel_at_period_end) return { label: "Encerra ao fim do período", variant: "outline" };
  return { label: "Ativa", variant: "default" };
}

export function computeClientBillingSummary(invoices: CustomerInvoice[]) {
  const nonCancelled = invoices.filter((i) => i.status !== "cancelled");
  const paid = invoices.filter((i) => i.status === "paid");
  const openStatuses = new Set(["pending", "waiting_payment", "processing"]);
  const open = invoices.filter((i) => openStatuses.has(i.status));
  const overdue = invoices.filter((i) => i.status === "overdue");
  const cancelled = invoices.filter((i) => i.status === "cancelled");

  const totalInvoicedCents = nonCancelled.reduce((s, i) => s + (i.amount_cents || 0), 0);
  const totalPaidCents = paid.reduce((s, i) => s + (i.amount_cents || 0), 0);
  const openCents = open.reduce((s, i) => s + (i.amount_cents || 0), 0);
  const overdueCents = overdue.reduce((s, i) => s + (i.amount_cents || 0), 0);
  const paidCount = paid.length;
  const ticketMedioCents = paidCount > 0 ? Math.round(totalPaidCents / paidCount) : 0;

  return {
    totalInvoicedCents,
    totalPaidCents,
    openCents,
    overdueCents,
    paidCount,
    ticketMedioCents,
    countsByStatus: {
      paid: paid.length,
      pending: invoices.filter((i) => i.status === "pending" || i.status === "waiting_payment").length,
      overdue: overdue.length,
      cancelled: cancelled.length,
    },
    recentInvoices: [...invoices]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5),
    upcomingCharges: [...open, ...overdue]
      .filter((i) => i.due_date)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 5),
  };
}

function preserveNav(to: string, loc: Location, navigate: NavigateFunction) {
  navigate({ pathname: to, search: loc.search, state: loc.state });
}

type InvoicesProps = {
  clientId: string;
  invoices: CustomerInvoice[];
  loading: boolean;
  location: Location;
  navigate: NavigateFunction;
  conversationId: string | null;
  canCreateBilling: boolean;
  canEditBilling: boolean;
  onReload: () => void;
};

export function ClientProfileInvoicesSection({
  clientId,
  invoices,
  loading,
  location,
  navigate,
  conversationId,
  canCreateBilling,
  canEditBilling,
  onReload,
}: InvoicesProps) {
  const sorted = useMemo(
    () =>
      [...invoices].sort((a, b) => new Date(b.due_date || b.created_at).getTime() - new Date(a.due_date || a.created_at).getTime()),
    [invoices],
  );

  const handleCopyLink = useCallback((inv: CustomerInvoice) => {
    if (!inv.payment_token) {
      toast.error("Esta fatura não tem link de pagamento.");
      return;
    }
    void navigator.clipboard.writeText(buildInvoiceLink(inv.payment_token)).then(
      () => toast.success("Link copiado."),
      () => toast.error("Não foi possível copiar."),
    );
  }, []);

  const handleSend = useCallback(
    async (inv: CustomerInvoice) => {
      if (!conversationId) {
        toast.error("Abra a conversa WhatsApp deste cliente para enviar o link.");
        return;
      }
      if (!inv.payment_token) {
        toast.error("Fatura sem link de pagamento.");
        return;
      }
      try {
        await sendInvoiceLink(conversationId, inv);
        toast.success("Mensagem enviada no WhatsApp.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao enviar");
      }
    },
    [conversationId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Faturas do cliente</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onReload()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
          {canCreateBilling ? (
            <Button type="button" size="sm" asChild>
              <Link
                to={`/customer-invoices/new?client_id=${encodeURIComponent(clientId)}`}
                state={location.state}
              >
                Nova fatura
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar faturas…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem faturas registadas para este cliente.
            {canCreateBilling ? (
              <div className="mt-4">
                <Button asChild size="sm">
                  <Link to={`/customer-invoices/new?client_id=${encodeURIComponent(clientId)}`}>Criar primeira fatura</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden md:block rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Recorrência</TableHead>
                  <TableHead className="text-right w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((inv) => {
                  const recurring = Boolean(inv.subscription_id || inv.origin === "subscription");
                  const due = inv.due_date?.slice(0, 10);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>
                        <CustomerInvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {due ? format(new Date(`${due}T12:00:00`), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatBrl(inv.amount_cents)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {recurring ? (
                          <Badge variant="outline" className="text-xs">
                            Assinatura
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">
                              Ações
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => navigate(`/customer-invoices/${inv.id}`)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Abrir
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyLink(inv)} disabled={!inv.payment_token}>
                              <Copy className="mr-2 h-4 w-4" />
                              Copiar link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleSend(inv)} disabled={!conversationId || !inv.payment_token}>
                              <Send className="mr-2 h-4 w-4" />
                              Enviar no WhatsApp
                            </DropdownMenuItem>
                            {canEditBilling ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate(`/customer-invoices/${inv.id}/edit`)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {sorted.map((inv) => {
              const recurring = Boolean(inv.subscription_id || inv.origin === "subscription");
              const due = inv.due_date?.slice(0, 10);
              return (
                <li key={inv.id}>
                  <Card>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xs text-muted-foreground">{inv.invoice_number || "—"}</p>
                          <p className="text-base font-semibold tabular-nums">{formatBrl(inv.amount_cents)}</p>
                        </div>
                        <CustomerInvoiceStatusBadge status={inv.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Venc.: {due ? formatDateOnlyPtBr(due) : "—"}
                        {recurring ? " · Recorrente" : ""}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button size="sm" variant="secondary" className="flex-1" asChild>
                          <Link to={`/customer-invoices/${inv.id}`}>Abrir</Link>
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" type="button" onClick={() => handleCopyLink(inv)}>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Link
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          type="button"
                          onClick={() => void handleSend(inv)}
                          disabled={!conversationId || !inv.payment_token}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          Enviar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

type SubsProps = {
  subscriptions: CrmSubscriptionListItem[];
  loading: boolean;
  onReload: () => void;
};

export function ClientProfileSubscriptionsSection({
  subscriptions,
  loading,
  onReload,
}: SubsProps) {
  const sorted = useMemo(
    () =>
      [...subscriptions].sort(
        (a, b) => new Date(b.next_billing_date || 0).getTime() - new Date(a.next_billing_date || 0).getTime(),
      ),
    [subscriptions],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Assinaturas</h2>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onReload()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar assinaturas…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem assinaturas CRM ligadas a este cliente.
            <p className="mt-2 text-xs">Crie uma fatura recorrente para gerar uma assinatura.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden md:block rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Periodicidade</TableHead>
                  <TableHead>Próxima cobrança</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => {
                  const st = subscriptionStatusUi(row);
                  const next = row.next_billing_date?.slice(0, 10);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[240px]">
                        <span className="font-medium line-clamp-2">
                          {row.plan_label?.trim() || `Assinatura · ${intervalLabelPt(row.billing_interval)}`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant} className={cn(st.variant === "default" && "bg-crm-primary/12 text-crm-primary border-crm-primary/25")}>
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBrl(row.amount_cents)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{intervalLabelPt(row.billing_interval)}</TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {next ? format(new Date(`${next}T12:00:00`), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/crm-subscriptions/${row.id}`}>
                            Abrir
                            <ArrowRight className="ml-1 h-3 w-3 opacity-60" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {sorted.map((row) => {
              const st = subscriptionStatusUi(row);
              const next = row.next_billing_date?.slice(0, 10);
              return (
                <li key={row.id}>
                  <Card>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">
                          {row.plan_label?.trim() || `Assinatura · ${intervalLabelPt(row.billing_interval)}`}
                        </p>
                        <Badge variant={st.variant} className="shrink-0 text-[10px]">
                          {st.label}
                        </Badge>
                      </div>
                      <p className="text-base font-semibold tabular-nums">{formatBrl(row.amount_cents)}</p>
                      <p className="text-xs text-muted-foreground">
                        {intervalLabelPt(row.billing_interval)}
                        {next ? ` · Próx.: ${formatDateOnlyPtBr(next)}` : ""}
                      </p>
                      <Button size="sm" className="w-full" variant="secondary" asChild>
                        <Link to={`/crm-subscriptions/${row.id}`}>Abrir / histórico</Link>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

type FinanceHubProps = {
  clientId: string;
  clientName: string;
  invoices: CustomerInvoice[];
  loading: boolean;
  location: Location;
  navigate: NavigateFunction;
  canCreateBilling: boolean;
  activeSubscriptionsCount: number;
  onReload: () => void;
};

export function ClientProfileFinanceHubSection({
  clientId,
  clientName,
  invoices,
  loading,
  location,
  navigate,
  canCreateBilling,
  activeSubscriptionsCount,
  onReload,
}: FinanceHubProps) {
  const summary = useMemo(() => computeClientBillingSummary(invoices), [invoices]);

  const statusDistribution = useMemo(() => {
    const total = invoices.length || 1;
    const { paid, pending, overdue, cancelled } = summary.countsByStatus;
    return [
      { key: "paid", label: "Pagas", count: paid, pct: Math.round((paid / total) * 100) },
      { key: "pend", label: "Pendentes", count: pending, pct: Math.round((pending / total) * 100) },
      { key: "over", label: "Vencidas", count: overdue, pct: Math.round((overdue / total) * 100) },
      { key: "canc", label: "Canceladas", count: cancelled, pct: Math.round((cancelled / total) * 100) },
    ];
  }, [invoices.length, summary.countsByStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Financeiro</h2>
          <p className="text-sm text-muted-foreground">Resumo comercial e de cobrança — {clientName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onReload()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
          {canCreateBilling ? (
            <Button size="sm" asChild>
              <Link to={`/customer-invoices/new?client_id=${encodeURIComponent(clientId)}`}>Nova fatura</Link>
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" type="button" onClick={() => preserveNav(`/finance`, location, navigate)}>
            Financeiro global
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A consolidar dados…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total faturado</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <p className="text-lg font-semibold tabular-nums leading-tight">{formatBrl(summary.totalInvoicedCents)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Excl. canceladas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total pago</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatBrl(summary.totalPaidCents)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{summary.paidCount} fatura(s)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Em aberto</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <p className="text-lg font-semibold tabular-nums">{formatBrl(summary.openCents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Vencido</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <p className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">{formatBrl(summary.overdueCents)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Assinaturas ativas</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <p className="text-lg font-semibold tabular-nums">{activeSubscriptionsCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Ticket médio</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <p className="text-lg font-semibold tabular-nums">{summary.paidCount ? formatBrl(summary.ticketMedioCents) : "—"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Sobre faturas pagas</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por estado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {statusDistribution.map((row) => (
                  <div key={row.key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {row.count} ({row.pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(100, row.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Atalhos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" type="button" onClick={() => preserveNav(`/clients/${clientId}/invoices`, location, navigate)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Lista de faturas
                </Button>
                <Button size="sm" variant="outline" type="button" onClick={() => preserveNav(`/clients/${clientId}/subscriptions`, location, navigate)}>
                  <CalendarSync className="mr-2 h-4 w-4" />
                  Assinaturas
                </Button>
                <Button size="sm" variant="outline" type="button" onClick={() => preserveNav(`/clients/${clientId}/messages`, location, navigate)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  WhatsApp
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Últimas faturas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.recentInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem movimento.</p>
                ) : (
                  summary.recentInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground truncate">{inv.invoice_number || inv.id.slice(0, 8)}</p>
                        <p className="font-medium tabular-nums">{formatBrl(inv.amount_cents)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <CustomerInvoiceStatusBadge status={inv.status} />
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/customer-invoices/${inv.id}`}>Ver</Link>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Próximas cobranças (aberto / vencido)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.upcomingCharges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nada em aberto com data.</p>
                ) : (
                  summary.upcomingCharges.map((inv) => {
                    const due = inv.due_date?.slice(0, 10);
                    return (
                      <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">{due ? formatDateOnlyPtBr(due) : "—"}</p>
                          <p className="font-medium tabular-nums">{formatBrl(inv.amount_cents)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{getCustomerInvoiceStatusLabel(inv.status)}</span>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/customer-invoices/${inv.id}`}>Abrir</Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recebimentos recentes (pagas)</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.filter((i) => i.status === "paid" && i.paid_at).length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda sem faturas marcadas como pagas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fatura</TableHead>
                        <TableHead>Pago em</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...invoices]
                        .filter((i) => i.status === "paid" && i.paid_at)
                        .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
                        .slice(0, 8)
                        .map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono text-xs">{inv.invoice_number || "—"}</TableCell>
                            <TableCell className="text-sm">
                              {inv.paid_at ? formatDateOnlyPtBr(inv.paid_at.slice(0, 10)) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{formatBrl(inv.amount_cents)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
