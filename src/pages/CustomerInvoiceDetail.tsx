import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { customerInvoicesService } from "@/services/customerInvoices";
import { apiClient } from "@/integrations/api/client";
import type {
  CustomerInvoice,
  CustomerInvoiceRecurrenceInsight,
  UpdateCustomerInvoiceBody,
} from "@/services/customerInvoices";
import { clientsService } from "@/services/clients";
import type { RecurrenceHistoryInvoice } from "@/services/customerInvoices";
import type { Client } from "@/services/clients";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  XCircle,
  AlertTriangle,
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
import { CustomerInvoiceStatusBadge, getCustomerInvoiceStatusLabel } from "@/lib/customerInvoiceStatusUi";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { INVOICE_ACTIONABLE, canDeleteCustomerInvoice, isSubscriptionInvoicePurgeable } from "@/lib/customerInvoiceActions";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { ClientEntityLink } from "@/components/entities";
import { InvoiceRecurrenceBlock } from "@/components/invoices/InvoiceRecurrenceBlock";
import {
  effectiveLinkPaymentMethods,
  formatInvoicePaymentMethodLabel,
  invoiceMethodsFromGatewaySlugs,
  type InvoicePaymentMethodUi,
} from "@/lib/crmGatewayPaymentMethods";
import { financialService, type FinancialAccountDto } from "@/services/financial";

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** URL da preferência MP já gravada em `gateway_metadata` (Checkout Pro). */
function mercadoPagoPaymentUrlFromInvoice(inv: CustomerInvoice): string | null {
  const m = inv.gateway_metadata as Record<string, unknown> | null | undefined;
  if (!m) return null;
  const direct = typeof m.mercado_pago_payment_url === "string" ? m.mercado_pago_payment_url.trim() : "";
  if (direct) return direct;
  const block = m.mercado_pago_checkout as Record<string, unknown> | undefined;
  if (!block || typeof block !== "object") return null;
  const env = block.oauth_environment === "sandbox" ? "sandbox" : "production";
  const sandbox = typeof block.sandbox_init_point === "string" ? block.sandbox_init_point.trim() : "";
  const prod = typeof block.init_point === "string" ? block.init_point.trim() : "";
  const url = env === "sandbox" && sandbox ? sandbox : prod;
  return url || null;
}

function formatPrimaryGatewayLabel(inv: CustomerInvoice): string {
  const g = (inv.gateway ?? "").trim().toLowerCase();
  if (g === "asaas") return "Asaas";
  if (g === "mercado_pago" || g === "mercadopago") return "Mercado Pago";
  return inv.gateway?.trim() ? inv.gateway : "—";
}

function paidByGatewayLabel(inv: CustomerInvoice): string | null {
  const m = inv.gateway_metadata as { paid_by_gateway?: unknown } | null | undefined;
  const p = typeof m?.paid_by_gateway === "string" ? m.paid_by_gateway.trim().toLowerCase() : "";
  if (p === "mercado_pago" || p === "mercadopago") return "Mercado Pago";
  if (p === "asaas") return "Asaas";
  return null;
}

function mercadoPagoPaymentSnapshotStatus(inv: CustomerInvoice): string | null {
  const m = inv.gateway_metadata as { mercado_pago_payment?: { status?: unknown } } | null | undefined;
  const s = m?.mercado_pago_payment?.status;
  return typeof s === "string" && s.trim() ? s : null;
}

function mercadoPagoGatewayStatusFromMeta(inv: CustomerInvoice): string | null {
  const m = inv.gateway_metadata as { mercado_pago_gateway_status?: unknown } | null | undefined;
  const s = m?.mercado_pago_gateway_status;
  return typeof s === "string" && s.trim() ? s : null;
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
  const { hasPermissionKey } = useModulePermissions();
  const canEditInvoice = hasPermissionKey("billing.edit_invoice");
  const canCancelInvoice = hasPermissionKey("billing.cancel_invoice");
  const canDeleteInvoicePerm = hasPermissionKey("billing.delete_invoice");
  const canSendInvoice = hasPermissionKey("billing.send_invoice");
  const canEditSubscription = hasPermissionKey("billing.edit_subscription");
  const showRecurrenceOperational = Boolean(
    user?.is_tenant_admin || user?.can_manage_plan || user?.is_super_admin
  );

  const [chatReturnTo, setChatReturnTo] = useState<string | null>(null);

  useEffect(() => {
    const st = location.state as { fromNewInvoice?: boolean; chatReturnTo?: string } | null;
    if (!st) return;
    const rt = typeof st.chatReturnTo === "string" ? st.chatReturnTo.trim() : "";
    if (rt) setChatReturnTo(rt);
    if (st.fromNewInvoice || rt) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const [invoice, setInvoice] = useState<CustomerInvoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [manualConfirmOpen, setManualConfirmOpen] = useState(false);
  const [manualConfirmSaving, setManualConfirmSaving] = useState(false);
  const [manualConfirmAccountId, setManualConfirmAccountId] = useState<string>("__none__");
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccountDto[]>([]);
  const [financialAccountsLoaded, setFinancialAccountsLoaded] = useState(false);
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
  const [mpFeatureOn, setMpFeatureOn] = useState(false);
  const [mpConnected, setMpConnected] = useState(false);
  const [mpIntegrationLoading, setMpIntegrationLoading] = useState(true);
  const [mpGenerating, setMpGenerating] = useState(false);

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

  useEffect(() => {
    if (!canEditInvoice || financialAccountsLoaded) return;
    financialService
      .listAccounts({ account_scope: "business" })
      .then((rows) => setFinancialAccounts(rows.filter((account) => account.is_active)))
      .catch(() => setFinancialAccounts([]))
      .finally(() => setFinancialAccountsLoaded(true));
  }, [canEditInvoice, financialAccountsLoaded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMpIntegrationLoading(true);
      try {
        const av = await apiClient.get<{ enabled?: boolean }>("/api/integrations/mercado-pago/availability");
        if (cancelled) return;
        if (!av.data?.enabled) {
          setMpFeatureOn(false);
          setMpConnected(false);
          return;
        }
        setMpFeatureOn(true);
        const st = await apiClient.get<{ connected?: boolean }>("/api/integrations/mercado-pago/status");
        if (cancelled) return;
        const code = (st as { details?: { status?: number } }).details?.status;
        if (code === 404) {
          setMpConnected(false);
          return;
        }
        if (st.error) {
          setMpConnected(false);
          return;
        }
        setMpConnected(Boolean(st.data?.connected));
      } catch {
        if (!cancelled) {
          setMpFeatureOn(false);
          setMpConnected(false);
        }
      } finally {
        if (!cancelled) setMpIntegrationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  const handleManualStatusChange = async (nextStatus: UpdateCustomerInvoiceBody["status"]) => {
    if (!id || !invoice || !nextStatus || nextStatus === invoice.status) return;
    setStatusSaving(true);
    try {
      const updated = await customerInvoicesService.update(id, { status: nextStatus });
      setInvoice(updated ?? { ...invoice, status: nextStatus });
      toast.success("Status da fatura atualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar status da fatura");
    } finally {
      setStatusSaving(false);
    }
  };

  const handleConfirmManualPayment = async () => {
    if (!id || !invoice) return;
    setManualConfirmSaving(true);
    try {
      const accountId = manualConfirmAccountId === "__none__" ? null : manualConfirmAccountId;
      const result = await customerInvoicesService.confirmManualPayment(id, {
        financial_account_id: accountId,
      });
      setInvoice(result.invoice);
      setManualConfirmOpen(false);
      toast.success(
        result.financial_transaction
          ? "Pagamento confirmado e recebimento lançado no financeiro."
          : "Pagamento confirmado manualmente."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar pagamento manual");
    } finally {
      setManualConfirmSaving(false);
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

  const handleMercadoPagoGenerate = async (regenerate: boolean) => {
    if (!id) return;
    setMpGenerating(true);
    try {
      const r = await customerInvoicesService.createMercadoPagoCheckoutPayment(id, { regenerate });
      const refreshed = await customerInvoicesService.getById(id);
      setInvoice(refreshed ?? null);
      if (r.cached && !regenerate) {
        toast.success("Link Mercado Pago já existente — reutilizado.");
      } else {
        toast.success(regenerate ? "Nova preferência Mercado Pago gerada." : "Cobrança Mercado Pago gerada.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar cobrança Mercado Pago");
    } finally {
      setMpGenerating(false);
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
  const paymentUrl =
    invoice.payment_token && typeof window !== "undefined"
      ? `${window.location.origin}/pay/${invoice.payment_token}`
      : invoice.payment_token
        ? `/pay/${invoice.payment_token}`
        : null;
  const invoiceTypeLabel = invoice.subscription_id ? "Recorrente" : "Avulsa";
  const existingMpUrl = mercadoPagoPaymentUrlFromInvoice(invoice);
  const primaryGatewayLabel = formatPrimaryGatewayLabel(invoice);
  const paidByGatewayResolved = paidByGatewayLabel(invoice);
  const mpPaymentSnapshotStatus = mercadoPagoPaymentSnapshotStatus(invoice);
  const mpGatewayStatusMeta = mercadoPagoGatewayStatusFromMeta(invoice);
  const meta = invoice.gateway_metadata as Record<string, unknown> | null | undefined;
  const hybridAsaasMercadoPago =
    (invoice.gateway ?? "").trim().toLowerCase() === "asaas" &&
    Boolean(meta?.mercado_pago_checkout || meta?.mercado_pago_payment_url || existingMpUrl);
  const showMercadoPagoPaidSummary =
    invoice.status === "paid" && Boolean(existingMpUrl || meta?.mercado_pago_checkout);
  const showMercadoPagoPanel =
    mpFeatureOn &&
    mpConnected &&
    !mpIntegrationLoading &&
    invoice.status !== "paid" &&
    (Boolean(existingMpUrl) || (actionable && canSendInvoice));
  const manualPaymentAllowed =
    canEditInvoice && invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "refunded";

  return (
    <div className="space-y-6">
      {chatReturnTo ? (
        <Alert className="border-primary/35 bg-primary/5">
          <Link2 className="h-4 w-4 text-primary" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-foreground/90">
              Fatura criada a partir do chat. Pode voltar à conversa para continuar o atendimento.
            </span>
            <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => navigate(chatReturnTo)}>
              Voltar para conversa
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Card className="border-border/70">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/customer-invoices")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <CustomerInvoiceStatusBadge status={invoice.status} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Detalhe da fatura</p>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <FileText className="h-5 w-5 text-muted-foreground" />
                {invoice.invoice_number ?? invoice.id.slice(0, 8)}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Criada em {format(new Date(invoice.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              {actionable && canEditInvoice && (
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
              {canEditInvoice && (
                <Select
                  value={invoice.status}
                  onValueChange={(value) =>
                    handleManualStatusChange(value as UpdateCustomerInvoiceBody["status"])
                  }
                  disabled={statusSaving}
                >
                  <SelectTrigger className="h-9 w-[190px]">
                    <SelectValue placeholder="Alterar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="waiting_payment">Aguardando pagamento</SelectItem>
                    <SelectItem value="processing">Processando</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                    <SelectItem value="failed">Falhou</SelectItem>
                    <SelectItem value="refunded">Reembolsado</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {manualPaymentAllowed && (
                <Button
                  variant="default"
                  size="sm"
                  type="button"
                  onClick={() => setManualConfirmOpen(true)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirmar pagamento
                </Button>
              )}
              {invoice.origin === "subscription" &&
                invoice.status === "paid" &&
                Boolean(invoice.subscription_id) &&
                canEditSubscription && (
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
              {actionable && canCancelInvoice && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={cancelling}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancelar
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
              {canDelete && canDeleteInvoicePerm && (
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
        </CardHeader>
      </Card>

      <Dialog open={manualConfirmOpen} onOpenChange={setManualConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento manualmente</DialogTitle>
            <DialogDescription>
              Use quando o cliente pagou fora do gateway, por exemplo por Pix direto. A fatura será marcada como paga.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Banco / conta financeira (opcional)</Label>
            <Select
              value={manualConfirmAccountId}
              onValueChange={setManualConfirmAccountId}
              disabled={manualConfirmSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Não lançar no financeiro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não lançar no financeiro</SelectItem>
                {financialAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se uma conta for selecionada, será criado um recebimento concluído vinculado a esta fatura.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setManualConfirmOpen(false)}
              disabled={manualConfirmSaving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirmManualPayment} disabled={manualConfirmSaving}>
              {manualConfirmSaving ? "Confirmando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo da fatura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hybridAsaasMercadoPago ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              <AlertDescription className="text-sm text-foreground">
                Esta fatura tem cobrança principal no <strong>Asaas</strong> e também um{" "}
                <strong>checkout Mercado Pago</strong>. Somente um pagamento deve ser usado para quitar; confira qual
                método foi reconhecido em &quot;Pagamento quitado via&quot; abaixo e ignore o link duplicado se já estiver
                pago.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="mt-1 text-xl font-semibold">{formatAmount(invoice.amount_cents)}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Vencimento</p>
              <p className="mt-1 font-medium">{formatInvoiceDueDatePtBr(invoice.due_date)}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Cliente</p>
              <ClientEntityLink
                clientId={invoice.client_id}
                name={clientName}
                disabledFallbackText="Sem cliente"
                variant="inline"
                className="mt-1 font-medium"
              />
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Tipo</p>
              <p className="mt-1 font-medium">{invoiceTypeLabel}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cobrança e gateways
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Situação atual</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CustomerInvoiceStatusBadge status={invoice.status} />
                  <span className="text-sm text-foreground">{getCustomerInvoiceStatusLabel(invoice.status)}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Gateway principal</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{primaryGatewayLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Quitado via</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{paidByGatewayResolved ?? "—"}</p>
                {invoice.status !== "paid" ? (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    Atualiza automaticamente após confirmação no provedor.
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {invoice.gateway === "asaas" ? "Status no Asaas" : "Status no gateway"}
                </p>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {invoice.gateway === "asaas"
                    ? invoice.gateway_status ?? invoice.asaas_status ?? "—"
                    : invoice.gateway_status ?? "—"}
                </p>
              </div>
            </div>
            {(mpPaymentSnapshotStatus || mpGatewayStatusMeta) && (
              <div className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Mercado Pago</span>
                {mpPaymentSnapshotStatus ? (
                  <>
                    {" "}
                    — último status do pagamento:{" "}
                    <span className="font-mono text-foreground">{mpPaymentSnapshotStatus}</span>
                  </>
                ) : null}
                {mpGatewayStatusMeta ? (
                  <>
                    {mpPaymentSnapshotStatus ? " · " : " — "}
                    sincronizado: <span className="font-mono text-foreground">{mpGatewayStatusMeta}</span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Número da fatura</dt>
              <dd className="font-mono">{invoice.invoice_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Método na fatura</dt>
              <dd>
                {formatInvoicePaymentMethodLabel(invoice.payment_method)}
                {paymentMethodInactiveAtGateway && (
                  <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">
                    Método desativado no gateway atualmente; esta fatura pode ter sido gerada antes da alteração.
                  </span>
                )}
              </dd>
            </div>
            {displayLinkPaymentMethods.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground">Métodos aceitos</dt>
                <dd>
                  {displayLinkPaymentMethods.map(formatInvoicePaymentMethodLabel).join(", ")}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Conforme configuração do gateway e métodos gravados nesta fatura.
                  </span>
                </dd>
              </div>
            )}
            {invoice.description && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground">Descrição</dt>
                <dd>{invoice.description}</dd>
              </div>
            )}
            {invoice.invoice_type === "child" && invoice.parent_invoice_id && (
              <div>
                <dt className="text-muted-foreground">Origem</dt>
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
        </CardContent>
      </Card>

      {paymentUrl && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />
              Pagamento e compartilhamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {invoice.status === "paid"
                ? "Cobrança quitada. O link abaixo serve para comprovação ou envio ao cliente, sem nova cobrança."
                : "Compartilhe este link com o cliente para concluir o pagamento pelos métodos habilitados."}
            </p>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground">
              <span className="block truncate">{paymentUrl}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {invoice.status !== "paid" ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(paymentUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir link público
                  </Button>
                  <Button size="sm" onClick={() => window.open(paymentUrl, "_blank", "noopener,noreferrer")}>
                    Pagar agora
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(paymentUrl).then(() => toast.success("Link copiado"));
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar link
              </Button>
            </div>
            <Collapsible className="pt-1">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-xs font-medium">
                Como este link funciona
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-1 pt-2 text-xs leading-relaxed text-muted-foreground">
                PIX pode ser pago diretamente na página. Boleto e cartão podem abrir o checkout seguro do provedor em nova aba.
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {showMercadoPagoPanel ? (
        <Card className="border-sky-500/25">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ExternalLink className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Mercado Pago (Checkout Pro)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Checkout único neste link. Se a cobrança principal for Asaas, este fluxo é paralelo — use só um meio para
              quitar.
            </p>
            {existingMpUrl ? (
              <>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                  {existingMpUrl}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mpGenerating}
                    onClick={() => window.open(existingMpUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir checkout
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mpGenerating}
                    onClick={() => {
                      void navigator.clipboard.writeText(existingMpUrl).then(() => toast.success("Link copiado"));
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar link
                  </Button>
                  {canSendInvoice ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" size="sm" variant="secondary" disabled={mpGenerating}>
                          Gerar nova preferência
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Gerar nova preferência?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Será criada outra preferência no Mercado Pago. O link anterior pode deixar de ser a referência
                            principal; use se precisar atualizar valor ou descrição após alterar a fatura.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void handleMercadoPagoGenerate(true)}>
                            Gerar nova
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </>
            ) : actionable && canSendInvoice ? (
              <Button
                type="button"
                size="sm"
                disabled={mpGenerating}
                onClick={() => void handleMercadoPagoGenerate(false)}
              >
                {mpGenerating ? "Gerando…" : "Gerar pagamento Mercado Pago"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showMercadoPagoPaidSummary ? (
        <Card className="border-sky-500/25 bg-sky-500/[0.04] dark:bg-sky-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ExternalLink className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Mercado Pago — cobrança encerrada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {paidByGatewayResolved === "Mercado Pago"
                ? "Pagamento registrado via Mercado Pago. O link abaixo é o checkout utilizado (referência / suporte)."
                : "Um checkout Mercado Pago foi gerado nesta fatura. Conservamos o link para referência."}
            </p>
            {existingMpUrl ? (
              <>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                  {existingMpUrl}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(existingMpUrl).then(() => toast.success("Link copiado"));
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar link do checkout
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {invoice.items && invoice.items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Itens cobrados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1 text-left">Descrição</th>
                    <th className="w-16 py-1 text-right">Qtd</th>
                    <th className="w-24 py-1 text-right">Valor un.</th>
                    <th className="w-20 py-1 text-right">Desc.</th>
                    <th className="w-24 py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{formatAmount(item.unit_price_cents)}</td>
                      <td className="py-2 text-right">{formatAmount(item.discount_cents)}</td>
                      <td className="py-2 text-right font-medium">{formatAmount(item.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {invoice.items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <p className="font-medium">{item.description}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Quantidade</p>
                      <p>{item.quantity}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Valor unitário</p>
                      <p>{formatAmount(item.unit_price_cents)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Desconto</p>
                      <p>{formatAmount(item.discount_cents)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-medium">{formatAmount(item.total_cents)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {invoice.subscription_id && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat2 className="h-4 w-4 text-primary" />
              Recorrência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceRecurrenceBlock
              insight={recurrenceInsight}
              loading={recurrenceInsightLoading}
              error={recurrenceInsightError}
              showOperational={showRecurrenceOperational}
              currentInvoiceId={invoice.id}
              recurringAmountLabel={formatAmount(invoice.amount_cents)}
              showChangeNextBilling={
                canEditSubscription &&
                invoice.origin === "subscription" &&
                invoice.status === "paid" &&
                Boolean(invoice.subscription_id)
              }
              onChangeNextBilling={() => id && navigate(`/customer-invoices/${id}/edit?flow=renewal`)}
            />
          </CardContent>
        </Card>
      )}

      {invoice.subscription_id && (
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhes desta cobrança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Estes dados pertencem apenas a esta cobrança e não mudam quando a próxima cobrança da assinatura é alterada.
            </p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Período coberto</dt>
                <dd className="font-medium">
                  {invoice.period_start && invoice.period_end
                    ? `${formatInvoiceDueDatePtBr(invoice.period_start)} – ${formatInvoiceDueDatePtBr(invoice.period_end)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vencimento</dt>
                <dd className="font-medium">{formatInvoiceDueDatePtBr(invoice.due_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valor</dt>
                <dd className="font-medium">{formatAmount(invoice.amount_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
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
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Histórico de cobranças</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recurrenceHistory.length > 0 ? (
              <>
                <div className="hidden overflow-x-auto rounded-md border md:block">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-2 py-1.5 text-left font-medium">Fatura</th>
                        <th className="px-2 py-1.5 text-left font-medium">Período</th>
                        <th className="px-2 py-1.5 text-left font-medium">Vencimento</th>
                        <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                        <th className="px-2 py-1.5 text-left font-medium">Status</th>
                        <th className="px-2 py-1.5 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recurrenceHistory.map((h) => {
                        const isCurrent = h.id === invoice.id;
                        const rowPaymentUrl =
                          h.payment_token && typeof window !== "undefined"
                            ? `${window.location.origin}/pay/${h.payment_token}`
                            : null;
                        return (
                          <tr key={h.id} className={`border-b last:border-0 ${isCurrent ? "bg-primary/5" : "bg-card"}`}>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium tabular-nums">{h.invoice_number ?? h.id.slice(0, 8)}</span>
                                {isCurrent && (
                                  <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary">
                                    Atual
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                              {h.period_start && h.period_end
                                ? `${formatInvoiceDueDatePtBr(h.period_start)} – ${formatInvoiceDueDatePtBr(h.period_end)}`
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5">{formatInvoiceDueDatePtBr(h.due_date)}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium">{formatAmount(h.amount_cents)}</td>
                            <td className="px-2 py-1.5">
                              <CustomerInvoiceStatusBadge status={h.status} />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex flex-wrap items-center justify-end gap-1">
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
                                {rowPaymentUrl && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => window.open(rowPaymentUrl, "_blank", "noopener,noreferrer")}
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
                <div className="space-y-2 md:hidden">
                  {recurrenceHistory.map((h) => {
                    const isCurrent = h.id === invoice.id;
                    const rowPaymentUrl =
                      h.payment_token && typeof window !== "undefined"
                        ? `${window.location.origin}/pay/${h.payment_token}`
                        : null;
                    return (
                      <div key={h.id} className={`rounded-lg border p-3 ${isCurrent ? "border-primary/40 bg-primary/5" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{h.invoice_number ?? h.id.slice(0, 8)}</p>
                          <CustomerInvoiceStatusBadge status={h.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {h.period_start && h.period_end
                            ? `${formatInvoiceDueDatePtBr(h.period_start)} – ${formatInvoiceDueDatePtBr(h.period_end)}`
                            : "Período não informado"}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Vencimento {formatInvoiceDueDatePtBr(h.due_date)}</span>
                          <span className="font-medium">{formatAmount(h.amount_cents)}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {!isCurrent && (
                            <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/customer-invoices/${h.id}`)}>
                              Abrir
                            </Button>
                          )}
                          {rowPaymentUrl && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(rowPaymentUrl, "_blank", "noopener,noreferrer")}
                            >
                              Pagar
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ainda não há outras cobranças registadas nesta assinatura.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CustomerInvoiceDetail;
