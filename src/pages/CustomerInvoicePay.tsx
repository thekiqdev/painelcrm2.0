/**
 * Página pública de pagamento por link único (Fase 6 + Fase 10).
 * PIX inline; boleto com linha/PDF; cartão com formulário seguro na coluna direita (Desenho A: payWithCreditCard).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiClient } from "@/integrations/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
  QrCode,
  ChevronDown,
  CalendarDays,
  AlertTriangle,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { formatInvoiceDueDatePtBr } from "@/lib/formatInvoiceDates";
import { formatPhoneBrDigits, formatCpfCnpjDigits } from "@/lib/brazilInputMasks";
import { InlineCreditCardPaymentForm } from "@/components/payments/InlineCreditCardPaymentForm";
import { CustomerInvoiceStatusBadge } from "@/lib/customerInvoiceStatusUi";
import { cn } from "@/lib/utils";
import { PublicTenantBrandMark } from "@/components/tenant/PublicTenantBrand";
import { hasTenantLogoForTheme } from "@/utils/tenantBranding";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

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
    /** Fase 3 — Checkout Pro Mercado Pago (redirect). */
    mercado_pago_init_point?: string;
  };
  client_name: string | null;
  tenant_branding?: {
    name?: string | null;
    logo_url?: string | null;
    logo_light_url?: string | null;
    logo_dark_url?: string | null;
    billing_phone?: string | null;
    billing_email?: string | null;
  };
  needs_customer?: boolean;
  needs_customer_reason?: "missing_client" | "missing_cpf_cnpj" | null;
  client_summary?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
  } | null;
  /** Fase 10: se há PIX ou link de cobrança no metadata. */
  has_payment_payload?: boolean;
  payment_options_summary?: "none" | "pix" | "hosted" | "pix_and_hosted";
  /** Quando o backend passar a expor na API pública, exibe data/hora na tela de confirmação. */
  paid_at?: string | null;
  /** Resumo MP para UX pós-checkout (Fase 4+). */
  mercado_pago_public?: {
    has_checkout: boolean;
    payment_status: string | null;
    paid_by_mercado_pago: boolean;
  };
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
      (u.bankSlipDigitableLine ?? "").trim() ||
      (u.mercado_pago_init_point ?? "").trim()
  );
}

/** Mesma prioridade da UI (PIX → boleto → cartão) para criar a primeira cobrança no gateway. */
function pickPreferredBootstrapPaymentMethod(
  data: PayInvoiceResponse
): "PIX" | "BOLETO" | "CREDIT_CARD" | null {
  const normalized = (
    Array.isArray(data.allowed_payment_methods) && data.allowed_payment_methods.length > 0
      ? data.allowed_payment_methods
      : ["PIX", "BOLETO", "CREDIT_CARD"]
  ) as Array<"PIX" | "BOLETO" | "CREDIT_CARD">;
  if (normalized.includes("PIX")) return "PIX";
  if (normalized.includes("BOLETO")) return "BOLETO";
  if (normalized.includes("CREDIT_CARD")) return "CREDIT_CARD";
  return null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
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
  /** Evita disparar o bootstrap automático mais de uma vez por fatura (token) enquanto não há payload. */
  const autoBootstrapAttemptedForTokenRef = useRef<string | null>(null);
  const payPageTokenPrevRef = useRef<string | null>(null);
  /** Mantém aviso pós-redirect do Checkout Pro (`?mp_return=…`), mesmo após limpar a URL. */
  const [mercadoPagoReturnHint, setMercadoPagoReturnHint] = useState(false);
  const mpReturnHandledRef = useRef(false);

  useEffect(() => {
    const raw = searchParams.get("mp_return");
    if (raw == null) return;
    if (!mpReturnHandledRef.current) {
      mpReturnHandledRef.current = true;
      setMercadoPagoReturnHint(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("mp_return");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  useEffect(() => {
    if (!data?.needs_customer) return;
    const summary = data.client_summary;
    setCustomerForm((f) => ({
      ...f,
      name: f.name || summary?.name || data.client_name || "",
      email: f.email || summary?.email || "",
      phone: f.phone || (summary?.phone ? String(summary.phone).replace(/\D/g, "").slice(0, 11) : ""),
      company: f.company || summary?.company || "",
    }));
  }, [data?.needs_customer, data?.client_summary, data?.client_name]);

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
    const requiresFullCustomer = data.needs_customer_reason !== "missing_cpf_cnpj";
    const resolvedName = customerForm.name.trim() || data.client_summary?.name?.trim() || data.client_name?.trim() || "";
    if (requiresFullCustomer && !resolvedName) {
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
          name: resolvedName,
          email: customerForm.email.trim() || data.client_summary?.email || null,
          phone: customerForm.phone.replace(/\D/g, "") || (data.client_summary?.phone ? String(data.client_summary.phone).replace(/\D/g, "") : null),
          company: customerForm.company.trim() || data.client_summary?.company || null,
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
                needs_customer_reason: null,
                client_name: resolvedName,
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

  /**
   * Faturas já vinculadas a cliente com CPF (ex.: checkout da loja) chegam sem cobrança no gateway até
   * `switch-method`. Antes só o clique manual no método disparava isso; aqui geramos a primeira cobrança
   * automaticamente, reutilizando a mesma rota e idempotência do fluxo existente.
   */
  useEffect(() => {
    if (payPageTokenPrevRef.current !== token) {
      autoBootstrapAttemptedForTokenRef.current = null;
      payPageTokenPrevRef.current = token ?? null;
    }

    if (!token || !data || loading || error) return;
    if (data.needs_customer) return;
    if (!POLLABLE_STATUSES.has(data.status)) return;
    if (resolveHasPaymentPayload(data)) {
      autoBootstrapAttemptedForTokenRef.current = null;
      return;
    }
    if (switchingMethod) return;

    const method = pickPreferredBootstrapPaymentMethod(data);
    if (!method) return;

    if (autoBootstrapAttemptedForTokenRef.current === token) return;
    autoBootstrapAttemptedForTokenRef.current = token;

    setSelectedMethod(method);
    setSwitchingMethod(method);
    void switchPayMethod(token, method, `auto_bootstrap_${token}_${method}`)
      .then((res) => {
        if (res.error) {
          autoBootstrapAttemptedForTokenRef.current = null;
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
      })
      .finally(() => {
        setSwitchingMethod(null);
      });
  }, [token, data, loading, error, switchingMethod, data?.needs_customer, data?.status]);

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

  const canInitiatePayment = ["pending", "waiting_payment", "overdue"].includes(data.status);
  const isProcessingPayment = data.status === "processing";
  const isPaid = data.status === "paid";
  const isCancelled = data.status === "cancelled";
  const isFailed = data.status === "failed";
  const isRefunded = data.status === "refunded";
  /** Cobrança ainda passível de fluxo de pagamento ou confirmação (evita “indisponível” em processing). */
  const showPaymentSection =
    (canInitiatePayment || isProcessingPayment) && !data.needs_customer;
  const tenantName = data.tenant_branding?.name?.trim() || "PainelCRM";
  const tb = data.tenant_branding;
  const hasTenantLogo = Boolean(tb && hasTenantLogoForTheme(resolvedTheme, tb));
  const billingEmail = (data.tenant_branding?.billing_email ?? "").trim();
  const billingPhone = (data.tenant_branding?.billing_phone ?? "").trim();
  const tenantContact = [billingEmail || null, billingPhone || null].filter(Boolean).join(" • ");
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
  const bankSlipDigitableLine = (data.payment_urls.bankSlipDigitableLine ?? "").trim();
  const hasBoletoDigitable = allowBoleto && isBoletoSelected && bankSlipDigitableLine.length > 0;
  const canCopyBoleto = hasBoletoDigitable;
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
  const showBoletoSection = isBoletoSelected && allowBoleto;
  const hasSecondaryMethods = showBoletoSection || showCardSection;
  const pixCopyPaste = (data.payment_urls.pixCopyPaste ?? "").trim();
  const canCopyPix = pixCopyPaste.length > 0;
  const mercadoPagoInitPoint = (data.payment_urls.mercado_pago_init_point ?? "").trim();
  const hasMercadoCheckout = mercadoPagoInitPoint.length > 0;
  /** Checkout MP só é oferecido enquanto a fatura não está quitada. */
  const showMercadoPagoPaymentButtons = hasMercadoCheckout && !isPaid;
  const awaitingGatewayPayload =
    canInitiatePayment &&
    !data.needs_customer &&
    (allowPix || allowBoleto || allowCard) &&
    !(
      (isPixSelected && hasPix) ||
      hasBoletoDigitable ||
      showCardChargeReady ||
      (isCardSelected && allowCard && switchingMethod === "CREDIT_CARD") ||
      hasMercadoCheckout
    );

  const itemsTotalCents = (data.items ?? []).reduce((acc, item) => acc + item.total_cents, 0);
  const itemsCount = data.items?.length ?? 0;

  const invoiceTitle = data.invoice_number?.trim()
    ? `Fatura n.º ${data.invoice_number}`
    : "Cobrança";
  const showStickyBar = isMobile && showPaymentSection && !isPaid;

  const mpPublic = data.mercado_pago_public;
  const mpStatusNorm = (mpPublic?.payment_status ?? "").toLowerCase().trim();
  const showMpAwaitingBanner =
    !data.needs_customer &&
    !isPaid &&
    !isProcessingPayment &&
    (mercadoPagoReturnHint ||
      (Boolean(mpStatusNorm) &&
        ["pending", "in_process", "authorized", "in_mediation"].includes(mpStatusNorm)));

  const handleStickyPrimary = async () => {
    if (isProcessingPayment) {
      await handleRefreshStatus();
      return;
    }
    if (isPixSelected && canCopyPix) {
      try {
        await navigator.clipboard.writeText(pixCopyPaste);
        toast.success("Código PIX copiado");
      } catch {
        toast.error("Não foi possível copiar");
      }
      return;
    }
    if (isBoletoSelected && canCopyBoleto) {
      try {
        await navigator.clipboard.writeText(bankSlipDigitableLine);
        toast.success("Linha digitável copiada");
      } catch {
        toast.error("Não foi possível copiar");
      }
      return;
    }
    document.getElementById("area-pagamento")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stickyLabel = isProcessingPayment
    ? refreshing
      ? "A atualizar…"
      : "Atualizar status"
    : isPixSelected && canCopyPix
      ? "Copiar código PIX"
      : isBoletoSelected && canCopyBoleto
        ? "Copiar código do boleto"
        : "Ver como pagar";

  return (
    <div
      className={cn(
        "min-h-[100dvh] bg-gradient-to-b from-background via-background to-muted/25",
        showStickyBar && "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10 sm:px-6">
        {/* Cabeçalho — marca e identificação */}
        <header className="mb-8 text-center sm:text-left">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-5">
                {tb ? (
                  <PublicTenantBrandMark
                    branding={tb}
                    nameShownElsewhere
                className="shrink-0 items-center sm:items-start"
                imgClassName="max-h-14 max-w-[220px] sm:max-h-12"
                  />
                ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-card text-sm font-bold shadow-sm">
                    {tenantName.slice(0, 2).toUpperCase()}
                  </div>
                )}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tenantName}
              </p>
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{invoiceTitle}</h1>
                <CustomerInvoiceStatusBadge status={data.status} />
              </div>
              {!hasTenantLogo && (billingEmail || billingPhone) ? (
                <p className="text-xs text-muted-foreground">
                  {[billingEmail, billingPhone].filter(Boolean).join(" · ")}
                </p>
                      ) : null}
            </div>
          </div>
        </header>

        {!data.needs_customer && (isCancelled || isFailed) ? (
          <Alert variant="destructive" className="mb-6">
            <XCircle className="h-4 w-4 shrink-0" aria-hidden />
            <AlertDescription className="text-sm">
              {isCancelled ? (
                <>
                  <span className="font-semibold">Cobrança cancelada.</span> Não é possível pagar por este link. Em caso
                  de dúvida, fale com {tenantName}
                  {tenantContact ? <> ({tenantContact})</> : null}.
                    </>
                  ) : (
                    <>
                  <span className="font-semibold">Pagamento não concluído.</span> Este link não está ativo para nova
                  tentativa automática. Solicite um novo meio de pagamento a {tenantName}
                  {tenantContact ? <> — {tenantContact}</> : null}.
                </>
              )}
            </AlertDescription>
          </Alert>
                      ) : null}

        {!data.needs_customer && isRefunded ? (
          <Alert className="mb-6 border-sky-500/30 bg-sky-500/10">
            <Info className="h-4 w-4 shrink-0 text-sky-800 dark:text-sky-200" aria-hidden />
            <AlertDescription className="text-sm text-foreground">
              <span className="font-semibold">Valores reembolsados.</span> A operação seguiu o fluxo do meio de pagamento.
              Para novas cobranças, fale com {tenantName}
              {tenantContact ? <> — {tenantContact}</> : null}.
            </AlertDescription>
          </Alert>
                      ) : null}

        {showMpAwaitingBanner ? (
          <Alert className="mb-6 border-sky-500/35 bg-sky-500/10">
            <Info className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
            <AlertDescription className="text-sm text-foreground">
              {mercadoPagoReturnHint ? (
                <>
                  <span className="font-semibold">Você voltou do Mercado Pago.</span> Se o pagamento foi concluído no
                  checkout, <strong>esta página atualiza sozinha</strong> em alguns segundos — pode ficar aqui. Não é
                  necessário pagar de novo por PIX ou boleto abaixo, salvo se quiser usar outro meio.
                </>
              ) : (
                <>
                  <span className="font-semibold">Pagamento em análise.</span> O Mercado Pago ainda está confirmando;
                  quando liberar, o status aqui muda sozinho. Se já debitou, aguarde ou toque em{" "}
                  <strong>Atualizar status</strong> na área de pagamento.
                    </>
                  )}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Resumo principal — compacto e distribuído no desktop */}
        <section
                className={cn(
            "mb-6 rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
            data.status === "overdue" && canInitiatePayment && "border-amber-500/40 ring-1 ring-amber-500/20",
            isPaid && "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20",
          )}
          aria-labelledby="pay-amount-heading"
        >
          {isProcessingPayment ? (
            <div className="mb-4 flex gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
              <p>
                <span className="font-semibold">Aguardando confirmação.</span> Estamos sincronizando com o banco ou com o
                Mercado Pago — costuma levar poucos segundos. Se não atualizar, use <strong>Atualizar status</strong>.
              </p>
              </div>
          ) : null}

          {data.status === "overdue" && canInitiatePayment ? (
            <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
              <AlertTriangle className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              <p>
                <span className="font-semibold">Vencida.</span> Pode pagar abaixo com o mesmo link — não é necessário
                pedir nova cobrança.
              </p>
                </div>
          ) : null}

          {!data.needs_customer && isPaid ? (
            <div className="mb-5 flex flex-col items-center gap-2 text-center">
                <CheckCircle
                className="h-12 w-12 text-emerald-600 dark:text-emerald-400"
                strokeWidth={1.25}
                  aria-hidden
                />
              <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">Pagamento confirmado</p>
              <p className="text-sm text-muted-foreground">
                Esta cobrança foi quitada com sucesso. Guarde esta página ou o comprovante do seu banco.
                </p>
                {data.paid_at ? (
                <p className="text-xs font-medium text-emerald-800/90 dark:text-emerald-200/90">
                    {format(new Date(data.paid_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                ) : null}
              </div>
          ) : null}

          <p id="pay-amount-heading" className="sr-only">
            Valor e vencimento
          </p>
          <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr_1fr]">
            <div className="rounded-xl border bg-background/70 p-3.5">
              <p className="text-sm font-medium text-muted-foreground">{isPaid ? "Valor pago" : "Valor a pagar"}</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">R$ {totalBrl}</p>
            </div>
            <div className="rounded-xl border bg-background/70 p-3.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencimento</p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium text-foreground">{formatInvoiceDueDatePtBr(data.due_date)}</span>
              </p>
            </div>
            <div className="rounded-xl border bg-background/70 p-3.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Referência</p>
              <p className="mt-1 text-sm font-medium text-foreground">{data.client_name || "Cobrança avulsa"}</p>
              {data.invoice_number ? (
                <p className="mt-1 text-xs text-muted-foreground">N.º {data.invoice_number}</p>
              ) : null}
            </div>
          </div>
          {data.description ? (
            <p className="mt-3 border-t border-border/60 pt-3 text-sm leading-relaxed text-foreground">
              {data.description}
            </p>
          ) : null}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] lg:items-start">
          <div className="space-y-6">
              {data.needs_customer && (
              <form
                onSubmit={handleCompleteCustomer}
                className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
              >
                {data.needs_customer_reason === "missing_cpf_cnpj" ? (
                  <>
                    <p className="text-sm font-medium leading-snug">
                      Confirme seu CPF/CNPJ para continuar para o pagamento
                    </p>
                    <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
                      <p><strong>Nome:</strong> {data.client_summary?.name || data.client_name || "—"}</p>
                      <p><strong>E-mail:</strong> {data.client_summary?.email || "—"}</p>
                      <p><strong>Telefone:</strong> {data.client_summary?.phone || "—"}</p>
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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

              {!data.needs_customer && showPaymentSection && isProcessingPayment ? (
                <section
                  id="area-pagamento"
                  className="scroll-mt-6 space-y-5 rounded-2xl border-2 border-primary/25 bg-primary/[0.06] p-6 text-center shadow-md dark:bg-primary/10 sm:p-8"
                >
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" aria-hidden />
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">Confirmação em andamento</h2>
                    <p className="text-sm text-muted-foreground">
                      Não refaça o pagamento. Esta tela atualiza sozinha; se demorar, use <strong>Atualizar status agora</strong>.
                    </p>
                  </div>
                  {POLLABLE_STATUSES.has(data.status) ? (
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                      Verificação automática em andamento…
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full max-w-xs rounded-xl"
                    onClick={() => void handleRefreshStatus()}
                    disabled={refreshing}
                  >
                    {refreshing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        A atualizar…
                      </>
                    ) : (
                      "Atualizar status agora"
                    )}
                  </Button>
                </section>
              ) : null}

              {!data.needs_customer && showPaymentSection && !isProcessingPayment ? (
              <section
                id="area-pagamento"
                className="scroll-mt-6 space-y-5 rounded-2xl border-2 border-primary/30 bg-primary/[0.06] p-4 shadow-md dark:bg-primary/10 sm:p-6 lg:p-7"
              >
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Pagar agora</h2>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Escolha a forma de pagamento e use o código, QR ou link abaixo.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {normalizedAllowedMethods.map((method) => {
                    const isSelected = currentMethod === method;
                    const isLoading = switchingMethod === method;
                    const label = method === "PIX" ? "PIX" : method === "BOLETO" ? "Boleto" : "Cartão";
                    return (
                      <Button
                        key={method}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        className="h-12 w-full justify-center rounded-xl text-base font-semibold shadow-sm"
                        disabled={!!switchingMethod}
                        onClick={() => void handleSwitchMethod(method)}
                      >
                        <span className="flex items-center justify-center gap-2">
                          {label}
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        </span>
                      </Button>
                    );
                  })}
                </div>

                {showMercadoPagoPaymentButtons ? (
                  <div className="rounded-xl border border-sky-500/40 bg-sky-500/[0.07] p-4 shadow-sm dark:bg-sky-950/25">
                    <p className="text-sm font-semibold text-foreground">Mercado Pago</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      Abre o checkout do Mercado Pago em nova aba (cartão, Pix e demais meios habilitados na sua conta).
                      O status da fatura neste link só muda após confirmação do pagamento.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="rounded-xl"
                        onClick={() =>
                          window.open(mercadoPagoInitPoint, "_blank", "noopener,noreferrer")
                        }
                      >
                        <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                        Pagar com Mercado Pago
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(mercadoPagoInitPoint);
                            toast.success("Link do Mercado Pago copiado");
                          } catch {
                            toast.error("Não foi possível copiar");
                          }
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" aria-hidden />
                        Copiar link MP
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                    className="h-10 rounded-xl text-xs font-medium"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        toast.success("Link desta cobrança copiado");
                      } catch {
                        toast.error("Não foi possível copiar o link");
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                    Copiar link da cobrança
                  </Button>
                </div>

                <div className="flex flex-col gap-2 border-t border-primary/15 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  {POLLABLE_STATUSES.has(data.status) ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                      A confirmar pagamento automaticamente…
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 self-start sm:self-auto text-muted-foreground"
                      onClick={() => void handleRefreshStatus()}
                      disabled={refreshing}
                    >
                      {refreshing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        A atualizar…
                        </>
                      ) : (
                      "Já paguei — atualizar"
                      )}
                    </Button>
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

                    <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:items-start">
                    {pixImageSrc ? (
                        <div className="flex justify-center lg:justify-start">
                        <img
                          src={pixImageSrc}
                          alt="QR Code PIX"
                            className="h-44 w-44 rounded border bg-white p-2 lg:h-52 lg:w-52"
                        />
                      </div>
                    ) : null}

                      {canCopyPix ? (
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
                      ) : null}
                    </div>
                  </div>
                )}

                {(isBoletoSelected || isCardSelected) && hasSecondaryMethods && (
                  <div className="rounded-lg border border-border/80 bg-muted/30 dark:bg-muted/15 p-4 space-y-4">
                    {isBoletoSelected && allowBoleto && showBoletoSection && (
                      <div className="rounded-xl border-2 border-primary/40 bg-primary/5 dark:bg-primary/10 p-5 space-y-3 shadow-lg ring-2 ring-primary/20">
                        <div className="flex items-center gap-2 text-base font-semibold text-primary">
                          <Copy className="h-5 w-5 shrink-0" aria-hidden />
                          Boleto — pague com linha digitável
                        </div>
                        {hasBoletoDigitable ? (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Linha digitável do boleto</Label>
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
                                Copiar código
                              </Button>
                            </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                              Copie o código e pague no app do seu banco. O status desta cobrança será atualizado
                              automaticamente após a confirmação.
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            A linha digitável do boleto ainda está em preparação. Aguarde alguns instantes e use{" "}
                            <strong>Atualizar status</strong>.
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
                      <InlineCreditCardPaymentForm
                        form={cardForm}
                        setForm={setCardForm}
                        onSubmit={handlePayWithCard}
                        paying={payingCard}
                        hostedCheckoutUrl={null}
                      />
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
                    <span>A preparar o pagamento…</span>
                  </div>
                )}
              </section>
              ) : null}

              {!data.needs_customer && !showPaymentSection && !isPaid && (
                <div className="rounded-2xl border bg-muted/40 px-4 py-6 text-center text-sm">
                  <p className="font-medium text-foreground">Esta cobrança não está disponível para pagamento aqui.</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Em dúvida, contacte <strong>{tenantName}</strong>
                    {tenantContact ? <> — {tenantContact}</> : null}.
                  </p>
              </div>
              )}

              <footer className="mt-10 space-y-3 border-t border-border/60 pt-6 text-center sm:text-left">
                <p className="text-[11px] text-muted-foreground">
                  Pagamento processado de forma segura. Dúvidas sobre valores ou prazos? Fale com{" "}
                  <strong className="text-foreground">{tenantName}</strong>
                  {tenantContact ? <> — {tenantContact}</> : null}.
                </p>
              </footer>
              </div>

          <>
            <aside className="hidden lg:block lg:sticky lg:top-6">
              <div className="space-y-4">
                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Resumo da cobrança</p>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Valor</span>
                      <span className="font-semibold tabular-nums">R$ {totalBrl}</span>
            </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Vencimento</span>
                      <span className="font-medium">{formatInvoiceDueDatePtBr(data.due_date)}</span>
      </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Status</span>
                      <CustomerInvoiceStatusBadge status={data.status} />
                    </div>
                  </div>
                </div>

                {data.items && data.items.length > 0 ? (
                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 space-y-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Itens da cobrança</p>
                      <p className="text-sm font-medium text-foreground">
                        {itemsCount} item{itemsCount > 1 ? "s" : ""} • R${" "}
                        {(itemsTotalCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="max-h-[58vh] overflow-auto rounded-lg border text-sm">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                          <tr className="border-b">
                            <th className="text-left p-2.5">Descrição</th>
                            <th className="text-right p-2.5 w-16">Qtd</th>
                            <th className="text-right p-2.5 w-28">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((item, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2.5 align-top">{item.description}</td>
                              <td className="p-2.5 text-right align-top">{item.quantity}</td>
                              <td className="p-2.5 text-right tabular-nums font-medium align-top">
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
                  </div>
                ) : null}
              </div>
            </aside>

            {data.items && data.items.length > 0 ? (
              <Collapsible className="rounded-2xl border bg-card/50 lg:hidden">
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left text-sm font-medium hover:bg-muted/40 rounded-2xl">
                  <span>Detalhe dos itens ({data.items.length})</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t px-4 pb-4 pt-2">
                  <div className="space-y-3 sm:hidden">
                    {data.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-1 rounded-xl border bg-background/80 px-3 py-2.5 text-sm"
                      >
                        <span className="font-medium text-foreground">{item.description}</span>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Qtd. {item.quantity}</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            R${" "}
                            {(item.total_cents / 100).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden sm:block overflow-x-auto rounded-lg border text-sm">
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
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        </div>
      </div>

      {showStickyBar ? (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md dark:shadow-[0_-8px_30px_rgba(0,0,0,0.4)] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
        >
          <Button
            type="button"
            className="h-12 w-full max-w-lg mx-auto flex rounded-xl text-base font-semibold shadow-md"
            onClick={() => void handleStickyPrimary()}
            disabled={refreshing && isProcessingPayment}
          >
            {stickyLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default CustomerInvoicePay;
