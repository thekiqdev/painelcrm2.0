/**
 * Página pública de pagamento por link único (Fase 6 + Fase 10).
 * PIX inline; boleto com linha/PDF; cartão com formulário seguro na coluna direita (Desenho A: payWithCreditCard).
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiClient } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ExternalLink,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  QrCode,
  CreditCard,
  FileText,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatInvoiceDueDatePtBr } from "@/lib/formatInvoiceDates";
import { formatPhoneBrDigits, formatCpfCnpjDigits } from "@/lib/brazilInputMasks";
import {
  customerInvoicePublicStatusTextClass,
  getCustomerInvoiceStatusLabel,
} from "@/lib/customerInvoiceStatusUi";
import { cn } from "@/lib/utils";

export interface PayInvoiceResponse {
  invoice_number: string | null;
  description: string | null;
  amount_cents: number;
  due_date: string;
  status: string;
  payment_method: string | null;
  allowed_payment_methods?: Array<"PIX" | "BOLETO" | "CREDIT_CARD"> | null;
  active_attempt?: {
    id: string;
    payment_method: "PIX" | "BOLETO" | "CREDIT_CARD";
    status: string;
    is_active: boolean;
    created_at: string;
  } | null;
  attempts_summary?: Array<{
    id: string;
    payment_method: "PIX" | "BOLETO" | "CREDIT_CARD";
    status: string;
    is_active: boolean;
    created_at: string;
  }>;
  items: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    discount_cents: number;
    total_cents: number;
  }>;
  payment_urls: {
    invoiceUrl?: string;
    bankSlipUrl?: string;
    /** Linha digitável (ex.: Asaas), quando o gateway expõe. */
    bankSlipDigitableLine?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
  };
  client_name: string | null;
  tenant_branding?: {
    name?: string | null;
    logo_url?: string | null;
    billing_phone?: string | null;
    billing_email?: string | null;
  };
  needs_customer?: boolean;
  /** Fase 10: se há PIX ou link de cobrança no metadata. */
  has_payment_payload?: boolean;
  payment_options_summary?: "none" | "pix" | "hosted" | "pix_and_hosted";
  /** Quando o backend passar a expor na API pública, exibe data/hora na tela de confirmação. */
  paid_at?: string | null;
}

const fetchPayData = (t: string) =>
  apiClient.get<PayInvoiceResponse>(`/api/public/customer-invoices/pay/${t}`);
const switchPayMethod = (
  t: string,
  payment_method: "PIX" | "BOLETO" | "CREDIT_CARD",
  idempotency_key?: string
) =>
  apiClient.post<{
    payment_urls: PayInvoiceResponse["payment_urls"];
    payment_method?: PayInvoiceResponse["payment_method"];
    active_attempt?: PayInvoiceResponse["active_attempt"];
    allowed_payment_methods?: PayInvoiceResponse["allowed_payment_methods"];
  }>(`/api/public/customer-invoices/pay/${t}/switch-method`, {
    payment_method,
    idempotency_key,
  });

type PayWithCardResponse = {
  ok: boolean;
  invoice_status?: string;
  attempt?: {
    id: string;
    payment_method: string;
    status: string;
    gateway_status?: string;
    gateway_reference_id?: string;
  };
  has_payment_payload?: boolean;
  payment_options_summary?: PayInvoiceResponse["payment_options_summary"];
  error?: string;
  code?: string;
};

const postPayWithCard = (
  t: string,
  body: {
    idempotency_key: string;
    credit_card: {
      holder_name: string;
      number: string;
      expiry_month: string;
      expiry_year: string;
      cvv: string;
    };
    cardholder: {
      name: string;
      email: string;
      cpf_cnpj: string;
      postal_code: string;
      address_number: string;
      phone: string;
      address_complement?: string | null;
      mobile_phone?: string | null;
    };
  }
) => apiClient.post<PayWithCardResponse>(`/api/public/customer-invoices/pay/${t}/pay-with-card`, body);

/** Estados em que o webhook pode ainda confirmar o pagamento — mantém polling leve. */
const POLLABLE_STATUSES = new Set(["pending", "waiting_payment", "processing", "overdue"]);
const STATUS_POLL_MS = 5000;

function resolveHasPaymentPayload(d: PayInvoiceResponse): boolean {
  if (typeof d.has_payment_payload === "boolean") return d.has_payment_payload;
  const u = d.payment_urls;
  return Boolean(
    (u.pixCopyPaste ?? "").trim() ||
      (u.pixQrCode ?? "").trim() ||
      (u.invoiceUrl ?? "").trim() ||
      (u.bankSlipUrl ?? "").trim() ||
      (u.bankSlipDigitableLine ?? "").trim()
  );
}

function toPixImageSrc(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("data:image/")) {
    // Normaliza data URL com eventuais quebras no base64.
    return value.replace(/\s+/g, "");
  }
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  // Alguns provedores podem retornar SVG bruto.
  if (value.startsWith("<svg")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(value)}`;
  }
  const compactBase64 = value.replace(/\s+/g, "");
  // Alguns gateways retornam apenas o base64 puro do PNG.
  if (/^[A-Za-z0-9+/=]+$/.test(compactBase64) && compactBase64.length > 120) {
    return `data:image/png;base64,${compactBase64}`;
  }
  return null;
}

const CustomerInvoicePay = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PayInvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [switchingMethod, setSwitchingMethod] = useState<"PIX" | "BOLETO" | "CREDIT_CARD" | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<"PIX" | "BOLETO" | "CREDIT_CARD" | null>(null);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    cpf_cnpj: "",
  });
  const [cardForm, setCardForm] = useState({
    holder_name: "",
    number: "",
    expiry_month: "",
    expiry_year: "",
    cvv: "",
    ch_name: "",
    ch_email: "",
    ch_cpf_cnpj: "",
    ch_postal_code: "",
    ch_address_number: "",
    ch_phone: "",
    ch_complement: "",
    ch_mobile: "",
  });
  const [payingCard, setPayingCard] = useState(false);

  const mergePayData = useCallback((next: PayInvoiceResponse) => {
    setData((prev) => {
      if (!prev) return next;
      if (prev.status !== "paid" && next.status === "paid") {
        toast.success("Pagamento confirmado!");
      }
      return next;
    });
  }, []);

  const load = (t: string) => {
    fetchPayData(t)
      .then((res) => {
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.data) setData(res.data);
        else setError("Fatura não encontrada");
      })
      .catch(() => setError("Erro ao carregar a fatura"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) {
      setError("Link inválido");
      setLoading(false);
      return;
    }
    load(token);
  }, [token]);

  useEffect(() => {
    if (!data?.client_name) return;
    setCardForm((f) => ({
      ...f,
      ch_name: f.ch_name || data.client_name || "",
    }));
  }, [data?.client_name]);

  /** Atualização automática do status a cada 5s, até confirmar pagamento. */
  useEffect(() => {
    if (!token || !data) return;
    if (data.needs_customer) return;
    if (!POLLABLE_STATUSES.has(data.status)) return;

    const id = window.setInterval(() => {
      fetchPayData(token).then((res) => {
        if (res.error || !res.data) return;
        mergePayData(res.data);
      });
    }, STATUS_POLL_MS);

    return () => window.clearInterval(id);
  }, [token, data?.needs_customer, data?.status, mergePayData]);

  const handleRefreshStatus = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const res = await fetchPayData(token);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data) mergePayData(res.data);
    } finally {
      setRefreshing(false);
    }
  }, [token, mergePayData]);

  const handleSwitchMethod = useCallback(
    async (method: "PIX" | "BOLETO" | "CREDIT_CARD") => {
      if (!token || !data || switchingMethod) return;
      setSelectedMethod(method);
      setSwitchingMethod(method);
      try {
        // Chave estável por link + método: permite idempotência no backend e reuso correto da cobrança.
        const res = await switchPayMethod(token, method, `ui_switch_${token}_${method}`);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (res.data) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  payment_urls: res.data!.payment_urls ?? prev.payment_urls,
                  payment_method:
                    (res.data as { payment_method?: string | null }).payment_method ?? prev.payment_method,
                  active_attempt: res.data!.active_attempt ?? prev.active_attempt,
                  allowed_payment_methods: res.data!.allowed_payment_methods ?? prev.allowed_payment_methods,
                  has_payment_payload:
                    typeof (res.data as { has_payment_payload?: boolean }).has_payment_payload === "boolean"
                      ? (res.data as { has_payment_payload?: boolean }).has_payment_payload
                      : prev.has_payment_payload,
                  payment_options_summary:
                    (res.data as { payment_options_summary?: PayInvoiceResponse["payment_options_summary"] })
                      .payment_options_summary ?? prev.payment_options_summary,
                }
              : prev
          );
        }
      } finally {
        setSwitchingMethod(null);
      }
    },
    [token, data, switchingMethod]
  );

  const handlePayWithCard = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!token || payingCard) return;
      setPayingCard(true);
      const idempotency_key = crypto.randomUUID();
      try {
        const res = await postPayWithCard(token, {
          idempotency_key,
          credit_card: {
            holder_name: cardForm.holder_name.trim(),
            number: cardForm.number.replace(/\D/g, ""),
            expiry_month: cardForm.expiry_month.replace(/\D/g, "").slice(0, 2).padStart(2, "0"),
            expiry_year: cardForm.expiry_year.replace(/\D/g, "").slice(0, 4),
            cvv: cardForm.cvv.trim(),
          },
          cardholder: {
            name: cardForm.ch_name.trim(),
            email: cardForm.ch_email.trim(),
            cpf_cnpj: cardForm.ch_cpf_cnpj.replace(/\D/g, ""),
            postal_code: cardForm.ch_postal_code.replace(/\D/g, ""),
            address_number: cardForm.ch_address_number.trim(),
            phone: cardForm.ch_phone.replace(/\D/g, ""),
            address_complement: cardForm.ch_complement.trim() || null,
            mobile_phone: cardForm.ch_mobile.replace(/\D/g, "") || null,
          },
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (res.data?.ok) {
          toast.success("Pagamento processado.");
          const fresh = await fetchPayData(token);
          if (fresh.data) mergePayData(fresh.data);
        }
      } finally {
        setPayingCard(false);
      }
    },
    [token, payingCard, cardForm, mergePayData]
  );

  const handleCompleteCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !data?.needs_customer) return;
    const name = customerForm.name.trim();
    if (!name) {
      toast.error("Nome é obrigatório");
      return;
    }
    const cpfCnpjDigits = customerForm.cpf_cnpj.replace(/\D/g, "");
    if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
      toast.error("Informe um CPF/CNPJ válido");
      return;
    }
    setCompleting(true);
    try {
      const res = await apiClient.post<{
        payment_urls: PayInvoiceResponse["payment_urls"];
        has_payment_payload?: boolean;
        payment_options_summary?: PayInvoiceResponse["payment_options_summary"];
      }>(
        `/api/public/customer-invoices/pay/${token}/complete`,
        {
          name,
          email: customerForm.email.trim() || null,
          phone: customerForm.phone.replace(/\D/g, "") || null,
          company: customerForm.company.trim() || null,
          cpf_cnpj: cpfCnpjDigits,
        }
      );
      if (res.error) throw new Error(res.error);
      if (res.data?.payment_urls) {
        const urls = res.data.payment_urls;
        setData((prev) =>
          prev
            ? {
                ...prev,
                payment_urls: urls,
                needs_customer: false,
                client_name: name,
                has_payment_payload:
                  typeof res.data!.has_payment_payload === "boolean"
                    ? res.data!.has_payment_payload
                    : resolveHasPaymentPayload({ ...prev, payment_urls: urls }),
                payment_options_summary: res.data!.payment_options_summary ?? prev.payment_options_summary,
              }
            : null
        );
        toast.success("Dados salvos. Você já pode pagar.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar dados");
    } finally {
      setCompleting(false);
    }
  };

  /** Fonte de verdade: tentativa ativa; senão coluna payment_method da fatura; fallback PIX quando permitido. */
  useEffect(() => {
    if (!data) return;
    if (switchingMethod) return;
    const normalizedAllowedMethods = (
      Array.isArray(data.allowed_payment_methods) && data.allowed_payment_methods.length > 0
        ? data.allowed_payment_methods
        : ["PIX", "BOLETO", "CREDIT_CARD"]
    ) as Array<"PIX" | "BOLETO" | "CREDIT_CARD">;
    const preferredDefaultMethod: "PIX" | "BOLETO" | "CREDIT_CARD" | null = normalizedAllowedMethods.includes(
      "PIX"
    )
      ? "PIX"
      : normalizedAllowedMethods.includes("BOLETO")
        ? "BOLETO"
        : normalizedAllowedMethods.includes("CREDIT_CARD")
          ? "CREDIT_CARD"
          : null;
    const fromAttempt = data.active_attempt?.payment_method;
    const inv = data.payment_method;
    const fromInvoice =
      inv === "PIX" || inv === "BOLETO" || inv === "CREDIT_CARD" ? inv : null;
    const pick =
      fromAttempt && normalizedAllowedMethods.includes(fromAttempt)
        ? fromAttempt
        : fromInvoice && normalizedAllowedMethods.includes(fromInvoice)
          ? fromInvoice
          : null;
    if (pick) {
      setSelectedMethod(pick);
      return;
    }
    setSelectedMethod((prev) => {
      if (prev && normalizedAllowedMethods.includes(prev)) return prev;
      return preferredDefaultMethod;
    });
  }, [data, data?.active_attempt?.id, data?.active_attempt?.payment_method, data?.payment_method, switchingMethod]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando fatura...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5 shrink-0" />
              <p>{error || "Fatura não encontrada ou link inválido."}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canPay = ["pending", "waiting_payment", "overdue"].includes(data.status);
  const isPaid = data.status === "paid";
  const tenantName = data.tenant_branding?.name?.trim() || "PainelCRM";
  const tenantLogo = data.tenant_branding?.logo_url?.trim() || "";
  const tenantContact = [data.tenant_branding?.billing_email, data.tenant_branding?.billing_phone]
    .filter(Boolean)
    .join(" • ");
  const totalBrl = (data.amount_cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  });
  const pixImageSrc = toPixImageSrc(data.payment_urls.pixQrCode);
  const normalizedAllowedMethods = (
    Array.isArray(data.allowed_payment_methods) && data.allowed_payment_methods.length > 0
      ? data.allowed_payment_methods
      : ["PIX", "BOLETO", "CREDIT_CARD"]
  ) as Array<"PIX" | "BOLETO" | "CREDIT_CARD">;
  const allowPix = normalizedAllowedMethods.includes("PIX");
  const allowBoleto = normalizedAllowedMethods.includes("BOLETO");
  const allowCard = normalizedAllowedMethods.includes("CREDIT_CARD");
  const preferredDefaultMethod: "PIX" | "BOLETO" | "CREDIT_CARD" | null = allowPix
    ? "PIX"
    : allowBoleto
      ? "BOLETO"
      : allowCard
        ? "CREDIT_CARD"
        : null;
  const currentMethod = selectedMethod ?? preferredDefaultMethod;
  const isPixSelected = currentMethod === "PIX";
  const isBoletoSelected = currentMethod === "BOLETO";
  const isCardSelected = currentMethod === "CREDIT_CARD";
  const hasPix = allowPix && Boolean(data.payment_urls.pixCopyPaste || pixImageSrc);
  const bankSlipUrl = (data.payment_urls.bankSlipUrl ?? "").trim();
  const bankSlipDigitableLine = (data.payment_urls.bankSlipDigitableLine ?? "").trim();
  const hostedCheckoutUrl = (data.payment_urls.invoiceUrl ?? "").trim();
  const hasBoletoDigitable = allowBoleto && isBoletoSelected && bankSlipDigitableLine.length > 0;
  const hasBankSlipPdf = allowBoleto && isBoletoSelected && bankSlipUrl.length > 0;
  const hasBoletoHosted = allowBoleto && isBoletoSelected && Boolean(hostedCheckoutUrl);
  /** Cobrança cartão válida para o formulário inline (tentativa ou coluna da fatura após switch). */
  const invoiceMethodIsCard = data.payment_method === "CREDIT_CARD";
  const showCardChargeReady =
    isCardSelected &&
    allowCard &&
    (data.active_attempt?.payment_method === "CREDIT_CARD" || invoiceMethodIsCard);
  /** Durante o switch ou com método já alinhado, a coluna direita deve existir (evita sumir o bloco inteiro). */
  const showCardSection =
    isCardSelected && allowCard && (switchingMethod === "CREDIT_CARD" || showCardChargeReady);
  const showCardFormFields = showCardChargeReady && !switchingMethod;
  const showBoletoSection =
    isBoletoSelected && allowBoleto && (hasBoletoDigitable || hasBankSlipPdf || hasBoletoHosted);
  const hasSecondaryMethods = showBoletoSection || showCardSection;
  const awaitingGatewayPayload =
    canPay &&
    !data.needs_customer &&
    (allowPix || allowBoleto || allowCard) &&
    !(
      (isPixSelected && hasPix) ||
      showBoletoSection ||
      showCardChargeReady ||
      (isCardSelected && allowCard && switchingMethod === "CREDIT_CARD")
    );

  const pixCopyPaste = (data.payment_urls.pixCopyPaste ?? "").trim();
  const canCopyPix = pixCopyPaste.length > 0;

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3 sm:px-5 lg:px-8">
      <div className="w-full space-y-6">
        <Card className="shadow-md border-border/80">
          <CardHeader className="pb-2 border-b bg-card/80 rounded-t-xl">
            <div className="flex items-center justify-between gap-3 pb-3 border-b">
              <div className="flex items-center gap-3 min-w-0">
                {tenantLogo ? (
                  <img
                    src={tenantLogo}
                    alt={`Logo ${tenantName}`}
                    className="h-10 w-10 rounded object-contain border bg-white p-1"
                  />
                ) : (
                  <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center text-xs font-semibold">
                    {tenantName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{tenantName}</p>
                  {tenantContact ? (
                    <p className="text-xs text-muted-foreground truncate">{tenantContact}</p>
                  ) : null}
                </div>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-[10px] font-medium text-muted-foreground leading-tight">Pagamento seguro</p>
                <p className="text-[10px] text-muted-foreground/75 leading-tight max-w-[140px] sm:max-w-none">
                  Processado por parceiro de pagamento
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-xl">
                {data.invoice_number || "Fatura"}
              </CardTitle>
              <span
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium",
                  customerInvoicePublicStatusTextClass(data.status, isPaid, canPay)
                )}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {isPaid ? (
                  <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
                ) : data.status === "overdue" ? (
                  <Clock className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                )}
                {getCustomerInvoiceStatusLabel(data.status)}
              </span>
            </div>
            {data.client_name && (
              <p className="text-sm text-muted-foreground">
                Cliente: {data.client_name}
              </p>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              {data.description && (
              <p className="text-sm text-muted-foreground">{data.description}</p>
              )}
              {data.items && data.items.length > 0 && (
              <div className="rounded-md border text-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Descrição</th>
                      <th className="text-right p-2">Qtd</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">
                          R${" "}
                          {(item.total_cents / 100).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              <p className="text-right font-semibold">
                Total: R$ {totalBrl}
              </p>
              <p className="text-xs text-muted-foreground">
                Vencimento: {formatInvoiceDueDatePtBr(data.due_date)}
              </p>
              {!data.needs_customer && canPay && (
                <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
                  <p className="text-sm font-semibold">Métodos de pagamento</p>
                  {normalizedAllowedMethods.map((method) => {
                    const isSelected = currentMethod === method;
                    const isLoading = switchingMethod === method;
                    const label =
                      method === "PIX" ? "PIX" : method === "BOLETO" ? "Boleto" : "Cartão";
                    return (
                      <Button
                        key={method}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        className="w-full justify-between"
                        disabled={!!switchingMethod}
                        onClick={() => void handleSwitchMethod(method)}
                      >
                        <span>{label}</span>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {!data.needs_customer && isPaid && (
              <div
                className="rounded-xl border-2 border-emerald-500/35 bg-emerald-50/90 dark:bg-emerald-950/30 p-6 sm:p-8 text-center space-y-3 shadow-sm"
                role="status"
                aria-live="polite"
              >
                <CheckCircle
                  className="h-14 w-14 sm:h-16 sm:w-16 text-emerald-600 dark:text-emerald-400 mx-auto"
                  strokeWidth={1.35}
                  aria-hidden
                />
                <h2 className="text-lg sm:text-xl font-semibold text-emerald-900 dark:text-emerald-100">
                  Pagamento confirmado
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Obrigado. Esta fatura está quitada e não requer nenhuma ação adicional.
                </p>
                {data.paid_at ? (
                  <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90 font-medium pt-1">
                    Confirmado em{" "}
                    {format(new Date(data.paid_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                ) : null}
              </div>
              )}

              {data.needs_customer && (
              <form onSubmit={handleCompleteCustomer} className="space-y-4 pt-4 border-t">
                <p className="text-sm font-medium leading-snug">
                  Preencha seus dados para liberar as opções de pagamento nesta página
                </p>
                <p className="text-xs text-muted-foreground">
                  Em seguida você poderá pagar com <strong>PIX</strong> aqui mesmo; <strong>boleto</strong> e{" "}
                  <strong>cartão</strong> também seguem nesta página após a cobrança ser gerada.
                </p>
                <div>
                  <Label htmlFor="pay_name">Nome *</Label>
                  <Input
                    id="pay_name"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Seu nome"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pay_email">E-mail</Label>
                  <Input
                    id="pay_email"
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pay_company">Empresa (opcional)</Label>
                  <Input
                    id="pay_company"
                    value={customerForm.company}
                    onChange={(e) => setCustomerForm((f) => ({ ...f, company: e.target.value }))}
                    placeholder="Razão social ou nome fantasia"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pay_phone">Telefone</Label>
                  <Input
                    id="pay_phone"
                    inputMode="tel"
                    autoComplete="tel"
                    value={formatPhoneBrDigits(customerForm.phone)}
                    onChange={(e) =>
                      setCustomerForm((f) => ({
                        ...f,
                        phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                      }))
                    }
                    placeholder="(11) 99999-9999"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pay_cpf">CPF/CNPJ *</Label>
                  <Input
                    id="pay_cpf"
                    inputMode="numeric"
                    value={formatCpfCnpjDigits(customerForm.cpf_cnpj)}
                    onChange={(e) =>
                      setCustomerForm((f) => ({
                        ...f,
                        cpf_cnpj: e.target.value.replace(/\D/g, "").slice(0, 14),
                      }))
                    }
                    placeholder="000.000.000-00 ou CNPJ"
                    className="mt-1"
                    required
                  />
                </div>
                <Button type="submit" disabled={completing}>
                  {completing ? "Gerando link..." : "Continuar para pagamento"}
                </Button>
              </form>
              )}

              {!data.needs_customer && canPay && (
              <div className="space-y-5 pt-4 border-t">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold">Pagamento</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {POLLABLE_STATUSES.has(data.status) && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden />
                        Verificando pagamento automaticamente a cada 5s
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRefreshStatus()}
                      disabled={refreshing}
                    >
                      {refreshing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Atualizando…
                        </>
                      ) : (
                        "Atualizar status"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                {isPixSelected && hasPix && (
                  <div className="rounded-xl border-2 border-primary/40 bg-primary/5 dark:bg-primary/10 p-5 space-y-3 shadow-lg ring-2 ring-primary/20">
                    <div className="flex items-center gap-2 text-base font-semibold text-primary">
                      <QrCode className="h-5 w-5 shrink-0" aria-hidden />
                      PIX — pague nesta página
                    </div>
                    <p className="hidden sm:block text-xs text-muted-foreground leading-relaxed">
                      Use o QR Code ou o código copia e cola no app do seu banco. Você <strong>não precisa sair</strong>{" "}
                      desta página para pagar com PIX. O status muda para <strong>Pago</strong> em alguns segundos
                      após a confirmação.
                    </p>
                    <Collapsible className="sm:hidden">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border border-primary/20 bg-background/60 px-3 py-2 text-left text-xs font-medium text-primary">
                        Instruções do PIX
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="text-xs text-muted-foreground leading-relaxed pt-2">
                        Use o QR Code ou copia e cola no app do banco, sem sair desta página. O status atualiza
                        automaticamente após o pagamento.
                      </CollapsibleContent>
                    </Collapsible>

                    {pixImageSrc ? (
                      <div className="flex justify-center">
                        <img
                          src={pixImageSrc}
                          alt="QR Code PIX"
                          className="h-48 w-48 rounded border bg-white p-2"
                        />
                      </div>
                    ) : null}

                    {canCopyPix && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">PIX copia e cola</Label>
                        <div className="flex items-start gap-2">
                          <code className="text-xs bg-muted px-2 py-1.5 rounded break-all flex-1 min-w-0">
                            {pixCopyPaste}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!pixCopyPaste) {
                                toast.error("Código PIX indisponível");
                                return;
                              }
                              try {
                                await navigator.clipboard.writeText(pixCopyPaste);
                                toast.success("Código PIX copiado");
                              } catch {
                                toast.error("Não foi possível copiar automaticamente");
                              }
                            }}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Copiar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(isBoletoSelected || isCardSelected) && hasSecondaryMethods && (
                  <div className="rounded-lg border border-border/80 bg-muted/30 dark:bg-muted/15 p-4 space-y-4">
                    {isBoletoSelected && allowBoleto && showBoletoSection && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold">Boleto</h3>
                        {hasBoletoDigitable && (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Linha digitável</Label>
                            <div className="flex items-start gap-2">
                              <code className="text-xs bg-muted px-2 py-1.5 rounded break-all flex-1 min-w-0">
                                {bankSlipDigitableLine}
                              </code>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  if (!bankSlipDigitableLine) {
                                    toast.error("Linha digitável indisponível");
                                    return;
                                  }
                                  try {
                                    await navigator.clipboard.writeText(bankSlipDigitableLine);
                                    toast.success("Linha digitável copiada");
                                  } catch {
                                    toast.error("Não foi possível copiar automaticamente");
                                  }
                                }}
                              >
                                <Copy className="h-4 w-4 mr-1" />
                                Copiar
                              </Button>
                            </div>
                          </div>
                        )}
                        {!hasBoletoDigitable && (hasBankSlipPdf || hasBoletoHosted) && (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            A linha digitável não está disponível para exibição neste momento. Use o PDF ou o link
                            do provedor abaixo.
                          </p>
                        )}
                        {hasBankSlipPdf && (
                          <div className="space-y-2">
                            <Button variant="outline" className="w-full sm:w-auto justify-start" asChild>
                              <a href={bankSlipUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-4 w-4 mr-2 shrink-0" aria-hidden />
                                Baixar / abrir boleto (PDF)
                                <ExternalLink className="h-4 w-4 ml-2 shrink-0 opacity-70" aria-hidden />
                                <span className="sr-only">Abre em nova aba</span>
                              </a>
                            </Button>
                            <p className="text-xs text-muted-foreground pl-0.5">
                              O PDF abre em nova aba para impressão ou download. A compensação pode levar um ou dois
                              dias úteis; use <strong>Atualizar status</strong> ou aguarde a verificação automática.
                            </p>
                          </div>
                        )}
                        {!hasBoletoDigitable && !hasBankSlipPdf && hasBoletoHosted && (
                          <div className="space-y-2">
                            <Button variant="default" className="w-full sm:w-auto justify-start" asChild>
                              <a href={hostedCheckoutUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-4 w-4 mr-2 shrink-0" aria-hidden />
                                Abrir cobrança no provedor
                                <ExternalLink className="h-4 w-4 ml-2 shrink-0 opacity-70" aria-hidden />
                                <span className="sr-only">Abre em nova aba</span>
                              </a>
                            </Button>
                            <p className="text-xs text-muted-foreground pl-0.5">
                              Sem linha digitável nem PDF neste retorno; use a página do provedor para pagar.
                            </p>
                          </div>
                        )}
                        {(hasBoletoDigitable || hasBankSlipPdf) && hasBoletoHosted && (
                          <p className="text-xs text-muted-foreground">
                            <a
                              href={hostedCheckoutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
                            >
                              Abrir também no site do provedor
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                    {isCardSelected && allowCard && switchingMethod === "CREDIT_CARD" && (
                      <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                        <p className="text-sm text-center">Preparando pagamento com cartão…</p>
                      </div>
                    )}

                    {isCardSelected && allowCard && showCardFormFields && (
                      <form className="space-y-4" onSubmit={(e) => void handlePayWithCard(e)}>
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <CreditCard className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                          Cartão de crédito
                        </h3>
                        <div className="space-y-3 rounded-lg border bg-background/80 p-4">
                          <p className="text-xs font-medium text-muted-foreground">Dados do cartão</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <Label htmlFor="cc_holder">Nome no cartão</Label>
                              <Input
                                id="cc_holder"
                                autoComplete="cc-name"
                                value={cardForm.holder_name}
                                onChange={(e) => setCardForm((f) => ({ ...f, holder_name: e.target.value }))}
                                className="mt-1"
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label htmlFor="cc_num">Número do cartão</Label>
                              <Input
                                id="cc_num"
                                inputMode="numeric"
                                autoComplete="cc-number"
                                value={cardForm.number}
                                onChange={(e) =>
                                  setCardForm((f) => ({
                                    ...f,
                                    number: e.target.value.replace(/\D/g, "").slice(0, 19),
                                  }))
                                }
                                className="mt-1"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="cc_m">Mês</Label>
                              <Input
                                id="cc_m"
                                inputMode="numeric"
                                placeholder="MM"
                                autoComplete="cc-exp-month"
                                value={cardForm.expiry_month}
                                onChange={(e) =>
                                  setCardForm((f) => ({
                                    ...f,
                                    expiry_month: e.target.value.replace(/\D/g, "").slice(0, 2),
                                  }))
                                }
                                className="mt-1"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="cc_y">Ano</Label>
                              <Input
                                id="cc_y"
                                inputMode="numeric"
                                placeholder="AAAA"
                                autoComplete="cc-exp-year"
                                value={cardForm.expiry_year}
                                onChange={(e) =>
                                  setCardForm((f) => ({
                                    ...f,
                                    expiry_year: e.target.value.replace(/\D/g, "").slice(0, 4),
                                  }))
                                }
                                className="mt-1"
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label htmlFor="cc_cvv">CVV</Label>
                              <Input
                                id="cc_cvv"
                                inputMode="numeric"
                                autoComplete="cc-csc"
                                type="password"
                                value={cardForm.cvv}
                                onChange={(e) =>
                                  setCardForm((f) => ({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))
                                }
                                className="mt-1"
                                required
                              />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 rounded-lg border bg-background/80 p-4">
                          <p className="text-xs font-medium text-muted-foreground">Titular do cartão</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <Label htmlFor="ch_name">Nome completo</Label>
                              <Input
                                id="ch_name"
                                value={cardForm.ch_name}
                                onChange={(e) => setCardForm((f) => ({ ...f, ch_name: e.target.value }))}
                                className="mt-1"
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label htmlFor="ch_email">E-mail</Label>
                              <Input
                                id="ch_email"
                                type="email"
                                autoComplete="email"
                                value={cardForm.ch_email}
                                onChange={(e) => setCardForm((f) => ({ ...f, ch_email: e.target.value }))}
                                className="mt-1"
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label htmlFor="ch_cpf">CPF ou CNPJ</Label>
                              <Input
                                id="ch_cpf"
                                inputMode="numeric"
                                value={formatCpfCnpjDigits(cardForm.ch_cpf_cnpj)}
                                onChange={(e) =>
                                  setCardForm((f) => ({
                                    ...f,
                                    ch_cpf_cnpj: e.target.value.replace(/\D/g, "").slice(0, 14),
                                  }))
                                }
                                className="mt-1"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="ch_cep">CEP</Label>
                              <Input
                                id="ch_cep"
                                inputMode="numeric"
                                value={cardForm.ch_postal_code}
                                onChange={(e) =>
                                  setCardForm((f) => ({
                                    ...f,
                                    ch_postal_code: e.target.value.replace(/\D/g, "").slice(0, 8),
                                  }))
                                }
                                className="mt-1"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="ch_num">Número</Label>
                              <Input
                                id="ch_num"
                                value={cardForm.ch_address_number}
                                onChange={(e) => setCardForm((f) => ({ ...f, ch_address_number: e.target.value }))}
                                className="mt-1"
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label htmlFor="ch_comp">Complemento (opcional)</Label>
                              <Input
                                id="ch_comp"
                                value={cardForm.ch_complement}
                                onChange={(e) => setCardForm((f) => ({ ...f, ch_complement: e.target.value }))}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="ch_phone">Telefone</Label>
                              <Input
                                id="ch_phone"
                                inputMode="tel"
                                value={formatPhoneBrDigits(cardForm.ch_phone)}
                                onChange={(e) =>
                                  setCardForm((f) => ({
                                    ...f,
                                    ch_phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                                  }))
                                }
                                className="mt-1"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="ch_mobile">Celular (opcional)</Label>
                              <Input
                                id="ch_mobile"
                                inputMode="tel"
                                value={formatPhoneBrDigits(cardForm.ch_mobile)}
                                onChange={(e) =>
                                  setCardForm((f) => ({
                                    ...f,
                                    ch_mobile: e.target.value.replace(/\D/g, "").slice(0, 11),
                                  }))
                                }
                                className="mt-1"
                              />
                            </div>
                          </div>
                        </div>
                        <Button type="submit" className="w-full sm:w-auto" disabled={payingCard}>
                          {payingCard ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processando…
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4 mr-2" />
                              Pagar agora
                            </>
                          )}
                        </Button>
                        {hostedCheckoutUrl ? (
                          <p className="text-xs text-muted-foreground">
                            Alternativa:{" "}
                            <a
                              href={hostedCheckoutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
                            >
                              abrir página do provedor
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                            </a>
                          </p>
                        ) : null}
                      </form>
                    )}
                  </div>
                )}
                </div>

                {awaitingGatewayPayload && (
                  <div
                    className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground/80" aria-hidden />
                    <span>Um momento.</span>
                  </div>
                )}
              </div>
              )}

              {!data.needs_customer && (
              <div className="text-center border-t pt-4 mt-2 space-y-2 leading-relaxed">
                <p className="text-[10px] text-muted-foreground/85 tracking-tight">
                  Pagamento seguro · Processado por parceiro de pagamento certificado
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Em caso de dúvida sobre esta fatura, entre em contato com <strong>{tenantName}</strong>
                  {tenantContact ? <> — {tenantContact}</> : null}.
                </p>
              </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CustomerInvoicePay;
