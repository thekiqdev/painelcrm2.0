import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { customerInvoicesService } from "@/services/customerInvoices";
import type {
  CustomerInvoice,
  CustomerInvoiceRecurrenceInsight,
} from "@/services/customerInvoices";
import { clientsService } from "@/services/clients";
import type { RecurrenceHistoryInvoice } from "@/services/customerInvoices";
import type { Client } from "@/services/clients";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  FileText,
  XCircle,
  Link2,
  Copy,
  Repeat2,
  ChevronDown,
  Pencil,
  Trash2,
  ExternalLink,
  CalendarClock,
} from "lucide-react";
import { formatInvoiceDueDatePtBr } from "@/lib/formatInvoiceDates";
import { CustomerInvoiceStatusBadge } from "@/lib/customerInvoiceStatusUi";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { INVOICE_ACTIONABLE, canDeleteCustomerInvoice, isSubscriptionInvoicePurgeable } from "@/lib/customerInvoiceActions";
import { useAuth } from "@/contexts/AuthContext";
import { InvoiceRecurrenceBlock } from "@/components/invoices/InvoiceRecurrenceBlock";
import {
  effectiveLinkPaymentMethods,
  formatInvoicePaymentMethodLabel,
  invoiceMethodsFromGatewaySlugs,
  type InvoicePaymentMethodUi,
} from "@/lib/crmGatewayPaymentMethods";

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function storedAllowedFromInvoice(inv: CustomerInvoice): InvoicePaymentMethodUi[] | null {
  if (Array.isArray(inv.allowed_payment_methods) && inv.allowed_payment_methods.length > 0) {
    return inv.allowed_payment_methods.filter((m): m is InvoicePaymentMethodUi =>
      m === "PIX" || m === "BOLETO" || m === "CREDIT_CARD"
    );
  }
  const meta = inv.gateway_metadata as { allowed_payment_methods?: unknown } | null | undefined;
  if (Array.isArray(meta?.allowed_payment_methods) && meta.allowed_payment_methods.length > 0) {
    return (meta.allowed_payment_methods as string[]).filter(
      (m): m is InvoicePaymentMethodUi => m === "PIX" || m === "BOLETO" || m === "CREDIT_CARD"
    );
  }
  return null;
}

const CustomerInvoiceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const showRecurrenceOperational = Boolean(
    user?.is_tenant_admin || user?.can_manage_plan || user?.is_super_admin
  );

  useEffect(() => {
    if ((location.state as { fromNewInvoice?: boolean } | null)?.fromNewInvoice) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const [invoice, setInvoice] = useState<CustomerInvoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [recurrenceHistory, setRecurrenceHistory] = useState<RecurrenceHistoryInvoice[]>([]);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [gatewayEnabledMethods, setGatewayEnabledMethods] = useState<InvoicePaymentMethodUi[]>([
    "PIX",
    "BOLETO",
    "CREDIT_CARD",
  ]);
  const [gatewayMethodsLoaded, setGatewayMethodsLoaded] = useState(false);
  const [recurrenceInsight, setRecurrenceInsight] = useState<CustomerInvoiceRecurrenceInsight | null>(null);
  const [recurrenceInsightLoading, setRecurrenceInsightLoading] = useState(false);
  const [recurrenceInsightError, setRecurrenceInsightError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const inv = await customerInvoicesService.getById(id);
        if (cancelled) return;
        setInvoice(inv ?? null);
        if (inv?.subscription_id) {
          try {
            const recurrence = await customerInvoicesService.getRecurrenceHistory(id);
            if (!cancelled) setRecurrenceHistory(recurrence.history ?? []);
          } catch {
            if (!cancelled) setRecurrenceHistory([]);
          }
        } else {
          setRecurrenceHistory([]);
        }
        if (inv?.client_id) {
          try {
            const c = await clientsService.getClientById(inv.client_id);
            if (!cancelled) setClient(c ?? null);
          } catch {
            if (!cancelled) setClient(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erro ao carregar fatura:", err);
          toast.error("Erro ao carregar fatura");
          navigate("/customer-invoices");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate]);

  useEffect(() => {
    if (!id || !invoice?.subscription_id) {
      setRecurrenceInsight(null);
      setRecurrenceInsightError(null);
      setRecurrenceInsightLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setRecurrenceInsightLoading(true);
        setRecurrenceInsightError(null);
        const insight = await customerInvoicesService.getRecurrenceInsight(id);
        if (!cancelled) setRecurrenceInsight(insight);
      } catch (e) {
        if (!cancelled) {
          setRecurrenceInsightError(e instanceof Error ? e.message : "Não foi possível carregar a recorrência.");
          setRecurrenceInsight(null);
        }
      } finally {
        if (!cancelled) setRecurrenceInsightLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, invoice?.subscription_id, location.key]);

  useEffect(() => {
    customerInvoicesService
      .getGatewayStatus()
      .then((s) => {
        setGatewayEnabledMethods(invoiceMethodsFromGatewaySlugs(s.enabled_payment_methods));
        setGatewayMethodsLoaded(true);
      })
      .catch(() => setGatewayMethodsLoaded(true));
  }, []);

  const displayLinkPaymentMethods =
    invoice && gatewayMethodsLoaded
      ? effectiveLinkPaymentMethods(storedAllowedFromInvoice(invoice), gatewayEnabledMethods)
      : [];

  const paymentMethodUi: InvoicePaymentMethodUi | null =
    invoice?.payment_method === "PIX" ||
    invoice?.payment_method === "BOLETO" ||
    invoice?.payment_method === "CREDIT_CARD"
      ? invoice.payment_method
      : null;
  const paymentMethodInactiveAtGateway =
    Boolean(paymentMethodUi && gatewayMethodsLoaded && !gatewayEnabledMethods.includes(paymentMethodUi));

  const handleCancel = async () => {
    if (!id || !invoice || !INVOICE_ACTIONABLE.has(invoice.status)) return;
    try {
      setCancelling(true);
      await customerInvoicesService.cancel(id);
      toast.success("Fatura cancelada no sistema e no provedor de pagamento");
      const refreshed = await customerInvoicesService.getById(id);
      setInvoice(refreshed ?? { ...invoice, status: "cancelled" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao cancelar fatura";
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !invoice) return;
    setDeleteSaving(true);
    try {
      await customerInvoicesService.remove(id);
      toast.success("Fatura excluída");
      navigate("/customer-invoices");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir fatura";
      toast.error(msg);
    } finally {
      setDeleteSaving(false);
    }
  };

  if (loading || !invoice) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/customer-invoices")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex items-center justify-center py-12">
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <p className="text-muted-foreground">Fatura não encontrada.</p>
          )}
        </div>
      </div>
    );
  }

  const clientName = invoice.client_id
    ? (client?.name || client?.company || client?.email || invoice.client_id)
    : "Sem cliente";

  const actionable = INVOICE_ACTIONABLE.has(invoice.status);
  const canDeleteSubscriptionPurge = isSubscriptionInvoicePurgeable(invoice);
  const canDelete = canDeleteCustomerInvoice(invoice);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/customer-invoices")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {actionable && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => id && navigate(`/customer-invoices/${id}/edit`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {invoice.origin === "subscription" ? "Editar cobrança atual" : "Editar"}
            </Button>
          )}
          {invoice.origin === "subscription" &&
            invoice.status === "paid" &&
            Boolean(invoice.subscription_id) && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                title="Altera a próxima data de cobrança da assinatura. Não muda o vencimento desta fatura nem os períodos já emitidos."
                onClick={() => id && navigate(`/customer-invoices/${id}/edit?flow=renewal`)}
              >
                <CalendarClock className="mr-2 h-4 w-4" />
                Alterar próxima cobrança
              </Button>
            )}
          {actionable && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={cancelling}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar fatura
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar fatura?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A cobrança será cancelada no Asaas (ou equivalente) e a fatura ficará como cancelada neste
                    sistema. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Não</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground">
                    Sim, cancelar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/50" disabled={deleteSaving}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir fatura?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {canDeleteSubscriptionPurge ? (
                      <>
                        Esta cobrança de assinatura já está <strong>cancelada ou falhou</strong>. O registro será
                        apagado definitivamente neste sistema (histórico local). Isto não reabre a assinatura nem altera
                        faturas já pagas.
                      </>
                    ) : (
                      <>
                        A cobrança será removida/cancelada no Asaas e o registro da fatura será apagado aqui. Pedidos ou
                        vínculos que apontem para esta fatura podem ser atualizados automaticamente.
                      </>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Não</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Sim, excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {invoice.invoice_number ?? invoice.id}
          </CardTitle>
          <CustomerInvoiceStatusBadge status={invoice.status} />
        </CardHeader>
        <CardContent className="space-y-4">
          {invoice.payment_token && (
            <div className="rounded-lg border-2 border-primary/45 bg-primary/5 dark:bg-primary/10 p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2 text-primary">
                <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                Link de pagamento
              </div>
              <p className="hidden md:block text-xs text-muted-foreground leading-relaxed">
                O cliente abre uma <strong>página de pagamento</strong> deste sistema. Com{" "}
                <strong>PIX</strong>, o pagamento pode ser feito <strong>na própria página</strong> (QR
                Code ou copia e cola). <strong>Boleto</strong> e <strong>cartão</strong> costumam abrir o{" "}
                <strong>provedor de pagamentos</strong> em nova aba (PDF ou checkout seguro), conforme a
                forma escolhida na cobrança.
              </p>
              <Collapsible className="md:hidden">
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border bg-background/80 px-3 py-2 text-left text-xs font-medium">
                  Como o cliente paga por este link
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="text-xs text-muted-foreground leading-relaxed pt-2 px-0.5">
                  O cliente abre uma <strong>página de pagamento</strong> deste sistema. Com{" "}
                  <strong>PIX</strong>, o pagamento pode ser feito <strong>na própria página</strong>.{" "}
                  <strong>Boleto</strong> e <strong>cartão</strong> costumam abrir o{" "}
                  <strong>provedor de pagamentos</strong> em nova aba.
                </CollapsibleContent>
              </Collapsible>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs bg-muted px-2 py-1.5 rounded break-all flex-1 min-w-0">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/pay/${invoice.payment_token}`
                    : `/pay/${invoice.payment_token}`}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    const url =
                      typeof window !== "undefined"
                        ? `${window.location.origin}/pay/${invoice.payment_token}`
                        : `/pay/${invoice.payment_token}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Abrir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    const url =
                      typeof window !== "undefined"
                        ? `${window.location.origin}/pay/${invoice.payment_token}`
                        : `${invoice.payment_token}`;
                    void navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"));
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar
                </Button>
              </div>
            </div>
          )}
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Número</dt>
              <dd className="font-mono">{invoice.invoice_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd><CustomerInvoiceStatusBadge status={invoice.status} /></dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-medium">{formatAmount(invoice.amount_cents)}</dd>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <div>
                <dt className="text-muted-foreground">Vencimento</dt>
                <dd>{formatInvoiceDueDatePtBr(invoice.due_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Criado em</dt>
                <dd>{format(new Date(invoice.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</dd>
              </div>
            </div>
            {invoice.description && (
              <div>
                <dt className="text-muted-foreground">Descrição</dt>
                <dd>{invoice.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Forma de pagamento (cobrança)</dt>
              <dd>
                {formatInvoicePaymentMethodLabel(invoice.payment_method)}
                {paymentMethodInactiveAtGateway && (
                  <span className="block text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    Este método está desativado no gateway agora; a cobrança pode ter sido gerada antes da alteração.
                  </span>
                )}
              </dd>
            </div>
            {displayLinkPaymentMethods.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Métodos no link de pagamento</dt>
                <dd>
                  {displayLinkPaymentMethods.map(formatInvoicePaymentMethodLabel).join(", ")}
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Conforme configuração atual do gateway e o que foi gravado na fatura.
                  </span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Situação no provedor</dt>
              <dd className="text-muted-foreground text-xs">
                {invoice.gateway_status ?? invoice.asaas_status ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cliente</dt>
              <dd>{clientName}</dd>
            </div>
            {invoice.invoice_type === "child" && invoice.parent_invoice_id && (
              <div>
                <dt className="text-muted-foreground">Origem (E2)</dt>
                <dd>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-primary"
                    onClick={() => navigate(`/customer-invoices/${invoice.parent_invoice_id}`)}
                  >
                    Ver fatura pai
                  </Button>
                </dd>
              </div>
            )}
          </dl>
          {invoice.items && invoice.items.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Itens</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1">Descrição</th>
                    <th className="text-right py-1 w-16">Qtd</th>
                    <th className="text-right py-1 w-24">Valor un.</th>
                    <th className="text-right py-1 w-20">Desc.</th>
                    <th className="text-right py-1 w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-1">{item.description}</td>
                      <td className="text-right py-1">{item.quantity}</td>
                      <td className="text-right py-1">{formatAmount(item.unit_price_cents)}</td>
                      <td className="text-right py-1">{formatAmount(item.discount_cents)}</td>
                      <td className="text-right py-1 font-medium">{formatAmount(item.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {invoice.subscription_id && (
            <InvoiceRecurrenceBlock
              insight={recurrenceInsight}
              loading={recurrenceInsightLoading}
              error={recurrenceInsightError}
              showOperational={showRecurrenceOperational}
              currentInvoiceId={invoice.id}
              recurringAmountLabel={formatAmount(invoice.amount_cents)}
              showChangeNextBilling={
                invoice.origin === "subscription" && invoice.status === "paid" && Boolean(invoice.subscription_id)
              }
              onChangeNextBilling={() => id && navigate(`/customer-invoices/${id}/edit?flow=renewal`)}
            />
          )}
          {invoice.subscription_id && (
            <Card className="border-border/80">
              <CardHeader className="py-3 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  Esta cobrança
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Essas informações pertencem somente a esta cobrança e não mudam quando a próxima cobrança da
                  assinatura é alterada.
                </p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground text-xs">Período coberto</dt>
                    <dd className="font-medium">
                      {invoice.period_start && invoice.period_end
                        ? `${formatInvoiceDueDatePtBr(invoice.period_start)} – ${formatInvoiceDueDatePtBr(invoice.period_end)}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Vencimento desta fatura</dt>
                    <dd className="font-medium">{formatInvoiceDueDatePtBr(invoice.due_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Valor</dt>
                    <dd className="font-medium">{formatAmount(invoice.amount_cents)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Status</dt>
                    <dd>
                      <CustomerInvoiceStatusBadge status={invoice.status} />
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}
          {invoice.subscription_id && (
            <Card className="border-dashed border-primary/30">
              <CardHeader className="py-3 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Repeat2 className="h-4 w-4 text-primary shrink-0" aria-hidden />
                  Histórico de cobranças
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 pb-4">
                {recurrenceHistory.length > 0 ? (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="border-b">
                          <th className="text-left font-medium px-2 py-1.5">Fatura</th>
                          <th className="text-left font-medium px-2 py-1.5">Período</th>
                          <th className="text-left font-medium px-2 py-1.5">Vencimento</th>
                          <th className="text-right font-medium px-2 py-1.5">Valor</th>
                          <th className="text-left font-medium px-2 py-1.5">Status</th>
                          <th className="text-right font-medium px-2 py-1.5">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recurrenceHistory.map((h) => {
                          const isCurrent = h.id === invoice.id;
                          const paymentUrl =
                            h.payment_token && typeof window !== "undefined"
                              ? `${window.location.origin}/pay/${h.payment_token}`
                              : null;
                          return (
                            <tr
                              key={h.id}
                              className={`border-b last:border-0 ${isCurrent ? "bg-primary/5" : "bg-card"}`}
                            >
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium tabular-nums">
                                    {h.invoice_number ?? h.id.slice(0, 8)}
                                  </span>
                                  {isCurrent && (
                                    <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary">
                                      Atual
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                                {h.period_start && h.period_end
                                  ? `${formatInvoiceDueDatePtBr(h.period_start)} – ${formatInvoiceDueDatePtBr(h.period_end)}`
                                  : "—"}
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                {formatInvoiceDueDatePtBr(h.due_date)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                                {formatAmount(h.amount_cents)}
                              </td>
                              <td className="px-2 py-1.5">
                                <CustomerInvoiceStatusBadge status={h.status} />
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex justify-end items-center gap-1 flex-wrap">
                                  {!isCurrent && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => navigate(`/customer-invoices/${h.id}`)}
                                    >
                                      Abrir
                                    </Button>
                                  )}
                                  {paymentUrl && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => window.open(paymentUrl, "_blank", "noopener,noreferrer")}
                                    >
                                      Pagar
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ainda não há outras cobranças registadas nesta assinatura.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerInvoiceDetail;
