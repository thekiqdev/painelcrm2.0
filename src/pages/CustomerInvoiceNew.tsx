import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, Link, useSearchParams, useMatch } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { customerInvoicesService } from "@/services/customerInvoices";
import { customerChargesService } from "@/services/customerCharges";
import { clientsService } from "@/services/clients";
import { productsService } from "@/services/products";
import { apiClient } from "@/integrations/api/client";
import type {
  CreateCustomerInvoiceBody,
  CustomerInvoiceItem,
  RecurrenceNextBillingEnqueueReason,
  UpdateCustomerInvoiceBody,
} from "@/services/customerInvoices";
import type { CustomerChargeWithSummary } from "@/services/customerCharges";
import type { Product } from "@/types/products";
import { resolvePublicCatalogUnitPrice } from "@/types/products";
import type { Client } from "@/services/clients";
import { toast } from "@/components/ui/sonner";
import {
  ArrowLeft,
  X,
  ExternalLink,
  Plus,
  Trash2,
  AlertTriangle,
  Link2,
  Settings2,
  ChevronDown,
  ChevronUp,
  Package,
  Briefcase,
  Search,
  FileText,
  Repeat2,
} from "lucide-react";
import { parseBrl, formatBrlDisplay, sanitizeNumericFieldInput } from "@/lib/brlCurrencyInput";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import {
  effectiveLinkPaymentMethods,
  invoiceMethodsFromGatewaySlugs,
  type InvoicePaymentMethodUi,
} from "@/lib/crmGatewayPaymentMethods";
import { INVOICE_ACTIONABLE } from "@/lib/customerInvoiceActions";
import {
  addCalendarDaysToIsoYmd,
  clampRecurringGenerateDaysBeforeDue,
  computeRecurringGenerationDateYmd,
} from "@/lib/recurringGenerationPreview";
import { formatInvoiceDueDatePtBr } from "@/lib/formatInvoiceDates";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

function todayLocalYmd(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Mesmo texto enviado ao gateway quando não há observação (alinhado ao backend). */
function effectiveInvoiceObservationText(dueDateYmd: string, stored: string | null | undefined): string {
  const t = stored?.trim();
  if (t) return t;
  return `Cobrança ${dueDateYmd}`;
}

/** Valor completo emitido pelo input type="date" (yyyy-mm-dd). */
function isCompleteYmdString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export type InvoiceLineDiscountKind = "fixed" | "percent";
type InvoicePaymentMethod = InvoicePaymentMethodUi;
const PAYMENT_METHOD_OPTIONS: Array<{ value: InvoicePaymentMethod; label: string }> = [
  { value: "PIX", label: "PIX" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CREDIT_CARD", label: "Cartão" },
];

interface GatewayStatusItemForSelect {
  key: string;
  name: string;
  is_enabled: boolean;
  configured: boolean;
  status: string | null;
}

export interface InvoiceLineRow {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount: string;
  discount_kind: InvoiceLineDiscountKind;
  product_id?: string | null;
  show_advanced: boolean;
  is_recurring: boolean;
  recurring_interval: "daily" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "yearly";
  scheduled_due_date: string;
}

const defaultLine = (): InvoiceLineRow => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unit_price: "",
  discount: "0",
  discount_kind: "fixed",
  product_id: null,
  show_advanced: false,
  is_recurring: true,
  recurring_interval: "monthly",
  scheduled_due_date: "",
});

function invoiceItemToLine(it: CustomerInvoiceItem): InvoiceLineRow {
  return {
    id: it.id,
    description: it.description,
    quantity: String(it.quantity),
    unit_price: formatBrlDisplay(it.unit_price_cents / 100),
    discount: formatBrlDisplay(it.discount_cents / 100),
    discount_kind: "fixed",
    product_id: it.product_id,
    show_advanced: Boolean(it.scheduled_due_date || it.recurring_interval),
    is_recurring: it.is_recurring ?? true,
    recurring_interval: (it.recurring_interval as InvoiceLineRow["recurring_interval"]) ?? "monthly",
    scheduled_due_date: it.scheduled_due_date?.slice(0, 10) ?? "",
  };
}

/** Subtotal da linha em centavos (q × unitário). */
function lineSubtotalCents(line: InvoiceLineRow): number {
  const q = parseBrl(line.quantity);
  const up = parseBrl(line.unit_price) * 100;
  return Math.round(q * up);
}

/** Desconto em centavos: fixo (R$) ou % com arredondamento por linha (Fase 2 — A6). */
function lineDiscountCents(line: InvoiceLineRow): number {
  const sub = lineSubtotalCents(line);
  if (sub <= 0) return 0;
  if (line.discount_kind === "percent") {
    const pct = Math.min(100, Math.max(0, parseBrl(line.discount)));
    return Math.min(sub, Math.round(sub * (pct / 100)));
  }
  return Math.min(sub, Math.round(parseBrl(line.discount) * 100));
}

function lineTotalCents(line: InvoiceLineRow): number {
  return Math.max(0, lineSubtotalCents(line) - lineDiscountCents(line));
}

type CustomerInvoiceNewProps = {
  embedded?: boolean;
  initialClientId?: string | null;
  onBack?: () => void;
  onCreated?: (invoiceId: string) => void;
};

/** Cobrança única (sem assinatura) vs. assinatura com primeira fatura e renovações automáticas. */
type CreationKind = "one_off" | "subscription";

const CustomerInvoiceNew = ({
  embedded = false,
  initialClientId = null,
  onBack,
  onCreated,
}: CustomerInvoiceNewProps = {}) => {
  const navigate = useNavigate();
  const editMatch = useMatch({ path: "/customer-invoices/:id/edit", end: true });
  const editInvoiceId = embedded ? undefined : editMatch?.params?.id;
  const isEditMode = Boolean(editInvoiceId);
  const [searchParams] = useSearchParams();
  const editFlowQuery = searchParams.get("flow");
  const queryClientId = searchParams.get("client_id");
  const prefillClientId = (initialClientId ?? queryClientId ?? "").trim();
  const forcedEmbeddedClientId = embedded ? prefillClientId : "";
  const [step, setStep] = useState<"client" | "billing_type" | "form">(() => (isEditMode ? "form" : "client"));
  const [form, setForm] = useState<CreateCustomerInvoiceBody & { amount?: string }>({
    client_id: "",
    due_date: "",
    description: null,
    payment_method: null,
    gateway_key: null,
    amount: "",
    charge_id: null,
  });
  const [lines, setLines] = useState<InvoiceLineRow[]>([]);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState<"product" | "service" | null>(null);
  const [invoicePickerQuery, setInvoicePickerQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [creationKind, setCreationKind] = useState<CreationKind | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "quarterly" | "semi_annual" | "yearly">("monthly");
  const [subscriptionCyclesUnlimited, setSubscriptionCyclesUnlimited] = useState(true);
  const [subscriptionMaxCycles, setSubscriptionMaxCycles] = useState("12");
  const [invoiceByLink, setInvoiceByLink] = useState(false);
  const [charges, setCharges] = useState<CustomerChargeWithSummary[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(false);
  const [chargeQuery, setChargeQuery] = useState("");
  const [crmGatewayActive, setCrmGatewayActive] = useState<boolean | null>(null);
  const [gatewaysStatus, setGatewaysStatus] = useState<GatewayStatusItemForSelect[]>([]);
  const [gatewaysLoading, setGatewaysLoading] = useState(false);
  const [gatewayEnabledMethods, setGatewayEnabledMethods] = useState<InvoicePaymentMethod[]>([
    "PIX",
    "BOLETO",
    "CREDIT_CARD",
  ]);
  const [gatewayMethodsLoaded, setGatewayMethodsLoaded] = useState(false);
  const [allowedPaymentMethods, setAllowedPaymentMethods] = useState<InvoicePaymentMethod[]>([
    "PIX",
    "BOLETO",
    "CREDIT_CARD",
  ]);
  const [editReady, setEditReady] = useState(() => !isEditMode);
  /** null até carregar; invoice = cobrança atual; renewal = só próxima data (fatura paga). */
  const [editFlow, setEditFlow] = useState<"invoice" | "renewal" | null>(null);
  const [nextRenewalDate, setNextRenewalDate] = useState("");
  /** Antecipação da conta (dias); usada para converter geração → `next_billing_date` (vencimento do ciclo). */
  const [renewalDaysBefore, setRenewalDaysBefore] = useState(0);
  const [renewalSaving, setRenewalSaving] = useState(false);
  const [editingSubscriptionInvoice, setEditingSubscriptionInvoice] = useState(false);
  const editInitialObservationsRef = useRef("");

  useEffect(() => {
    if (!isEditMode || !editInvoiceId || embedded) return;
    let cancelled = false;
    (async () => {
      try {
        // Sempre reinicia o bootstrap: evita flash do formulário da fatura com editReady=true e editFlow=null
        setEditReady(false);
        if (editFlowQuery === "renewal") {
          setEditFlow("renewal");
        } else {
          setEditFlow(null);
        }

        const inv = await customerInvoicesService.getById(editInvoiceId);
        if (cancelled || !inv) {
          if (!cancelled) {
            toast.error("Fatura não encontrada");
            navigate("/customer-invoices");
          }
          return;
        }

        if (inv.origin === "subscription" && inv.status === "paid") {
          if (editFlowQuery === "invoice") {
            if (!cancelled) {
              toast.info(
                "Esta fatura já está paga: não é possível editar a cobrança atual aqui. No detalhe da fatura use «Alterar próxima renovação» para mudar o ciclo da assinatura."
              );
              navigate(`/customer-invoices/${editInvoiceId}`);
            }
            return;
          }
          // URL canónica: fatura paga de assinatura só edita ciclo com ?flow=renewal
          if (editFlowQuery !== "renewal") {
            if (!cancelled) {
              navigate(`/customer-invoices/${editInvoiceId}/edit?flow=renewal`, { replace: true });
            }
            return;
          }
          const insight = await customerInvoicesService.getRecurrenceInsight(editInvoiceId);
          if (cancelled) return;
          const cycleDueYmd =
            insight.subscription?.next_billing_date?.slice(0, 10) ||
            (insight.next_charge_date ? insight.next_charge_date.slice(0, 10) : "") ||
            "";
          const trg = insight.tenant_recurring_generation;
          const daysBefore = clampRecurringGenerateDaysBeforeDue(trg?.days_before_due ?? 0);
          setRenewalDaysBefore(daysBefore);
          const genYmd =
            trg?.generation_date_ymd?.slice(0, 10) ||
            (cycleDueYmd.length === 10 ? computeRecurringGenerationDateYmd(cycleDueYmd, daysBefore) : cycleDueYmd);
          setNextRenewalDate(genYmd);
          setEditFlow("renewal");
          setEditingSubscriptionInvoice(false);
          setEditReady(true);
          setStep("form");
          return;
        }

        if (inv.origin === "subscription" && !INVOICE_ACTIONABLE.has(inv.status)) {
          toast.error("Esta fatura recorrente não está em estado editável.");
          navigate(`/customer-invoices/${editInvoiceId}`);
          return;
        }

        setEditFlow("invoice");
        setEditingSubscriptionInvoice(inv.origin === "subscription");

        setInvoiceByLink(!inv.client_id);
        const dueYmd = inv.due_date.slice(0, 10);
        const observationText = effectiveInvoiceObservationText(dueYmd, inv.description);
        editInitialObservationsRef.current = observationText;
        setForm({
          client_id: inv.client_id ?? "",
          due_date: dueYmd,
          description: observationText,
          payment_method: (inv.payment_method as InvoicePaymentMethod | null) ?? null,
          gateway_key: inv.gateway ?? null,
          amount: "",
          charge_id: inv.charge_id ?? null,
        });
        const meta = inv.gateway_metadata as { allowed_payment_methods?: InvoicePaymentMethod[] } | null;
        if (Array.isArray(meta?.allowed_payment_methods) && meta.allowed_payment_methods.length > 0) {
          setAllowedPaymentMethods(meta.allowed_payment_methods);
        }
        if (inv.items && inv.items.length > 0) {
          setLines(inv.items.map(invoiceItemToLine));
        } else {
          setLines([defaultLine()]);
          setForm((f) => ({
            ...f,
            amount: formatBrlDisplay(inv.amount_cents / 100),
          }));
        }
        setStep("form");
        setEditReady(true);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erro ao carregar fatura");
          navigate("/customer-invoices");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editInvoiceId, embedded, navigate, editFlowQuery]);

  useEffect(() => {
    customerInvoicesService
      .getGatewayStatus()
      .then((s) => {
        setCrmGatewayActive(s.gatewayConfigured);
        setGatewayEnabledMethods(invoiceMethodsFromGatewaySlugs(s.enabled_payment_methods));
        setGatewayMethodsLoaded(true);
      })
      .catch(() => {
        setCrmGatewayActive(null);
        setGatewayMethodsLoaded(true);
      });
  }, []);

  /** Mantém “permitidos no link” alinhados ao gateway (e às alterações após carregar edição). */
  useEffect(() => {
    if (!gatewayMethodsLoaded) return;
    setAllowedPaymentMethods((prev) => effectiveLinkPaymentMethods(prev, gatewayEnabledMethods));
  }, [gatewayMethodsLoaded, gatewayEnabledMethods, editReady]);

  useEffect(() => {
    let cancelled = false;
    setGatewaysLoading(true);
    apiClient
      .get<GatewayStatusItemForSelect[]>("/api/me/tenant/payment-gateways/status")
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setGatewaysStatus([]);
          return;
        }
        setGatewaysStatus(res.data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setGatewaysStatus([]);
      })
      .finally(() => {
        if (cancelled) return;
        setGatewaysLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "client" || invoiceByLink) return;
    let cancelled = false;
    setLoadingClients(true);
    clientsService
      .getClients()
      .then((data) => {
        if (cancelled) return;
        setClients(data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setClients([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingClients(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, invoiceByLink]);

  useEffect(() => {
    if (step !== "form") return;
    const timer = window.setTimeout(() => {
    setLoadingCharges(true);
    customerChargesService
      .list({
        client_id: form.client_id || undefined,
        q: chargeQuery.trim() || undefined,
        limit: 100,
      })
      .then((data) => {
        setCharges(data.filter((c) => c.status === "open" || c.status === "partial"));
      })
      .catch(() => setCharges([]))
      .finally(() => setLoadingCharges(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [step, form.client_id, chargeQuery]);

  useEffect(() => {
    if (invoiceByLink) {
      setSelectedClient(null);
      return;
    }
    if (!form.client_id) {
      setSelectedClient(null);
      return;
    }
    clientsService
      .getClientById(form.client_id)
      .then((client) => {
        setSelectedClient(client ?? null);
      })
      .catch(() => {
        setSelectedClient(null);
      });
  }, [form.client_id, invoiceByLink]);

  useEffect(() => {
    if (step === "form") {
      setLoadingProducts(true);
      productsService
        .getProducts()
        .then((data) => setProducts(data))
        .catch(() => setProducts([]))
        .finally(() => setLoadingProducts(false));
    }
  }, [step]);

  useEffect(() => {
    if (embedded && !prefillClientId) {
      toast.error("Cliente não identificado para criar fatura no chat");
      onBack?.();
      return;
    }
  }, [embedded, prefillClientId, onBack]);

  useEffect(() => {
    if (isEditMode || !prefillClientId) return;
    setInvoiceByLink(false);
    setForm((f) => {
      if (f.client_id === prefillClientId) return f;
      return { ...f, client_id: prefillClientId };
    });
    if (embedded) {
      setCreationKind("one_off");
      setStep("form");
    } else {
      setCreationKind(null);
      setStep("billing_type");
    }
  }, [prefillClientId, isEditMode, embedded]);

  useEffect(() => {
    if (embedded && !isEditMode) {
      setCreationKind((k) => k ?? "one_off");
    }
  }, [embedded, isEditMode]);

  useEffect(() => {
    if (creationKind !== "subscription") return;
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        is_recurring: true,
        recurring_interval: billingInterval,
      }))
    );
  }, [billingInterval, creationKind]);

  useEffect(() => {
    setChargeQuery("");
  }, [form.client_id]);

  useEffect(() => {
    if (step !== "form" || isEditMode) return;
    setForm((f) => {
      if (f.due_date?.trim()) return f;
      return { ...f, due_date: todayLocalYmd() };
    });
  }, [step, isEditMode]);

  const totalCentsFromLines = lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
  const validLines = lines.filter((l) => parseBrl(l.quantity) > 0 && parseBrl(l.unit_price) >= 0);
  const useSingleAmount = form.amount != null && form.amount.trim() !== "" && parseBrl(form.amount) > 0;

  const handleAddLine = () =>
    setLines((prev) => [
      ...prev,
      {
        ...defaultLine(),
        id: crypto.randomUUID(),
        ...(creationKind === "subscription"
          ? { is_recurring: true, recurring_interval: billingInterval }
          : {}),
      },
    ]);

  const handleRemoveLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const invoiceCatalogFiltered = useMemo(() => {
    const type =
      invoicePickerOpen === "product"
        ? "product"
        : invoicePickerOpen === "service"
          ? "service"
          : null;
    if (!type) return [];
    const q = invoicePickerQuery.trim().toLowerCase();
    return products
      .filter((p) => p.type === type && p.status !== "inactive")
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false) ||
          (p.short_description?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 80);
  }, [products, invoicePickerOpen, invoicePickerQuery]);

  const appendLineFromCatalog = useCallback(
    (p: Product) => {
      const unit =
        resolvePublicCatalogUnitPrice({
          price: p.price ?? null,
          discount_price: p.discount_price ?? null,
        }) ?? 0;
      const desc =
        [p.name, p.short_description || p.description || ""].filter(Boolean).join(" — ") || p.name;
      setLines((prev) => [
        ...prev,
        {
          ...defaultLine(),
          id: crypto.randomUUID(),
          product_id: p.id,
          description: desc.slice(0, 2000),
          quantity: "1",
          unit_price: unit > 0 ? formatBrlDisplay(unit) : "",
          discount: "0",
          discount_kind: "fixed",
          ...(creationKind === "subscription"
            ? { is_recurring: true, recurring_interval: billingInterval }
            : {}),
        },
      ]);
      setInvoicePickerOpen(null);
      setInvoicePickerQuery("");
    },
    [creationKind, billingInterval]
  );
  const handleLineChange = (
    id: string,
    field: "description" | "quantity" | "unit_price" | "discount",
    value: string
  ) => {
    const v =
      field === "description" ? value : sanitizeNumericFieldInput(value);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: v } : l)));
  };

  const handleRenewalSave = async () => {
    if (!editInvoiceId) return;
    if (!isCompleteYmdString(nextRenewalDate)) {
      toast.error("Informe o primeiro dia de geração (aaaa-mm-dd)");
      return;
    }
    try {
      setRenewalSaving(true);
      const cycleDueYmd = addCalendarDaysToIsoYmd(nextRenewalDate.trim(), renewalDaysBefore);
      const patchResult = await customerInvoicesService.updateRecurrenceNextBilling(editInvoiceId, {
        next_billing_date: cycleDueYmd,
      });
      const enq = patchResult.enqueue_after_patch;
      const base = "Próxima cobrança gravada na assinatura; jobs pendentes obsoletos foram cancelados quando existiam.";
      if (enq.ok) {
        toast.success(
          enq.mode === "reactivated"
            ? `${base} Job de recorrência reativado na fila (ciclo anterior cancelado ou falho).`
            : `${base} Job de recorrência criado na fila — o worker processará dentro da janela habitual.`
        );
      } else {
        const f = enq as Extract<typeof enq, { ok: false }>;
        const reasonCopy: Partial<Record<RecurrenceNextBillingEnqueueReason, string>> = {
          next_billing_after_db_today:
            "A data do ciclo ainda está à frente do calendário do servidor de base de dados; o scheduler enfileirará quando o dia for atingido.",
          future_local_date:
            "No fuso do tenant o dia do ciclo ainda é futuro (Fase 2); o scheduler enfileirará quando a data local coincidir.",
          too_early_local_time:
            "Mesmo dia local, mas ainda antes da hora mínima de geração configurada (Fase 2); o scheduler enfileirará depois.",
          outside_local_window:
            "Fora da janela horária local do tenant; o scheduler enfileirará quando a janela Fase 2 permitir.",
          active_job_exists: "Já existe job pendente ou em processamento para este ciclo — não foi criada duplicidade.",
          completed_cycle_guard:
            "Já existe um job concluído para este mesmo ciclo; não foi criada duplicidade (idempotência).",
          subscription_not_active: "Assinatura não ativa — sem enfileiramento.",
          subscription_type_unsupported: "Tipo de assinatura não suportado para esta fila.",
          subscription_not_found: "Estado inesperado ao enfileirar.",
          internal_enqueue_error: "Erro interno ao tentar enfileirar.",
        };
        const win =
          f.reason !== "internal_enqueue_error" && f.window_reason
            ? ` Detalhe janela: ${f.window_reason}.`
            : "";
        const detail =
          f.reason === "internal_enqueue_error" && f.error
            ? `${reasonCopy.internal_enqueue_error} ${f.error}`
            : `${reasonCopy[f.reason] ?? "Não foi possível enfileirar neste momento; o scheduler continuará a tentar nas próximas execuções."}${win}`;
        toast.success(`${base} ${detail}`);
      }
      navigate(`/customer-invoices/${editInvoiceId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setRenewalSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode && editInvoiceId && !embedded) {
      const resolvedClientId = (form.client_id || "").trim();
      if (!form.due_date) {
        toast.error("Preencha a data de vencimento");
        return;
      }
      if (!invoiceByLink && !resolvedClientId) {
        toast.error("Preencha o cliente");
        return;
      }
      const useItems = !useSingleAmount && validLines.length > 0;
      const amountCents = useItems ? totalCentsFromLines : Math.round(parseBrl(form.amount) * 100);
      if (amountCents <= 0) {
        toast.error(useSingleAmount ? "Informe o valor único" : "Preencha a tabela de itens ou o valor único");
        return;
      }
      try {
        setCreateLoading(true);
        const payload: UpdateCustomerInvoiceBody = {
          due_date: form.due_date,
          payment_method:
            form.payment_method ??
            (allowedPaymentMethods.includes("PIX")
              ? "PIX"
              : allowedPaymentMethods.includes("BOLETO")
                ? "BOLETO"
                : allowedPaymentMethods.includes("CREDIT_CARD")
                  ? "CREDIT_CARD"
                  : null),
          allowed_payment_methods: allowedPaymentMethods.length > 0 ? allowedPaymentMethods : null,
        };
        const obsTrim = (form.description ?? "").trim();
        const initialObsTrim = (editInitialObservationsRef.current ?? "").trim();
        if (obsTrim !== initialObsTrim) {
          payload.description = obsTrim || null;
        }
        if (useItems) {
          payload.items = validLines.map((l) => ({
            description: l.description.trim() || "Item",
            quantity: parseBrl(l.quantity),
            unit_price_cents: Math.round(parseBrl(l.unit_price) * 100),
            discount_cents: lineDiscountCents(l),
            ...(l.product_id ? { product_id: l.product_id } : {}),
            is_recurring: l.is_recurring,
            recurring_interval: l.is_recurring ? l.recurring_interval : null,
            scheduled_due_date: l.scheduled_due_date.trim() || null,
          }));
        } else {
          payload.items = [];
          payload.amount_cents = amountCents;
        }
        await customerInvoicesService.update(editInvoiceId, payload);
        toast.success("Fatura atualizada no sistema e no provedor de pagamento");
        navigate(`/customer-invoices/${editInvoiceId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar fatura");
      } finally {
        setCreateLoading(false);
      }
      return;
    }

    const isInvoiceByLink = embedded ? false : invoiceByLink;
    const wantsSubscription = creationKind === "subscription";
    const resolvedClientId = (forcedEmbeddedClientId || form.client_id || "").trim();
    if (!form.due_date) {
      toast.error("Preencha a data de vencimento");
      return;
    }
    const today = todayLocalYmd();
    if (form.due_date < today) {
      toast.error("A data de vencimento não pode ser anterior a hoje");
      return;
    }
    if (!isInvoiceByLink && !resolvedClientId) {
      toast.error("Preencha o cliente ou marque “Fatura por link”");
      return;
    }
    const useItems = !useSingleAmount && validLines.length > 0;
    const amountCents = useItems ? totalCentsFromLines : Math.round(parseBrl(form.amount) * 100);
    if (amountCents <= 0) {
      toast.error(useSingleAmount ? "Informe o valor único" : "Preencha a tabela de itens ou o valor único");
      return;
    }
    try {
      setCreateLoading(true);
      const body: CreateCustomerInvoiceBody = {
        due_date: form.due_date,
        description: form.description || null,
        payment_method:
          form.payment_method ??
          (allowedPaymentMethods.includes("PIX")
            ? "PIX"
            : allowedPaymentMethods.includes("BOLETO")
              ? "BOLETO"
              : allowedPaymentMethods.includes("CREDIT_CARD")
                ? "CREDIT_CARD"
                : null),
        allowed_payment_methods: allowedPaymentMethods.length > 0 ? allowedPaymentMethods : null,
      };
      if (!isInvoiceByLink && resolvedClientId) body.client_id = resolvedClientId;
      else if (isInvoiceByLink) body.client_id = null;
      if (!isInvoiceByLink && form.gateway_key) body.gateway_key = form.gateway_key;
      if (useItems) {
        body.items = validLines.map((l) => ({
          description: l.description.trim() || "Item",
          quantity: parseBrl(l.quantity),
          unit_price_cents: Math.round(parseBrl(l.unit_price) * 100),
          discount_cents: lineDiscountCents(l),
          ...(l.product_id ? { product_id: l.product_id } : {}),
          is_recurring: wantsSubscription ? true : l.is_recurring,
          recurring_interval: wantsSubscription ? billingInterval : l.is_recurring ? l.recurring_interval : null,
          scheduled_due_date: l.scheduled_due_date.trim() || null,
        }));
      } else {
        body.amount_cents = amountCents;
      }
      if (wantsSubscription) {
        body.recurring = true;
        body.billing_interval = billingInterval;
        body.cycles_unlimited = subscriptionCyclesUnlimited;
        if (!subscriptionCyclesUnlimited) {
          const n = Math.trunc(Number(subscriptionMaxCycles));
          if (!Number.isFinite(n) || n < 1) {
            toast.error("Indique a quantidade de ciclos (inteiro maior que zero) ou active «Ciclos ilimitados»");
            setCreateLoading(false);
            return;
          }
          body.max_cycles = n;
        } else {
          body.max_cycles = null;
        }
      }
      if (form.charge_id) body.charge_id = form.charge_id;
      const result = await customerInvoicesService.create(body);
      toast.success(
        result.subscription_id
          ? isInvoiceByLink
            ? "Assinatura criada por link com a primeira fatura. Compartilhe o link para o cliente concluir os dados e pagar."
            : "Assinatura criada com a primeira fatura. As próximas cobranças serão geradas automaticamente."
          : isInvoiceByLink
            ? "Fatura por link criada. Compartilhe o link de pagamento para o cliente preencher os dados e pagar."
            : "Fatura criada com sucesso"
      );
      if (result.invoice?.id) {
        if (embedded) {
          onCreated?.(result.invoice.id);
        } else {
          navigate(`/customer-invoices/${result.invoice.id}`, { state: { fromNewInvoice: true } });
        }
      } else {
        if (embedded) {
          onBack?.();
        } else {
          navigate("/customer-invoices");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar fatura");
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredCharges = charges;
  const activeGatewaysForSelect = gatewaysStatus.filter(
    (g) => g.is_enabled && g.configured && g.status === "active"
  );
  const showGatewaySelect = activeGatewaysForSelect.length > 1;

  if (!embedded && isEditMode && !editReady) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/customer-invoices")} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Carregar fatura</h1>
        </div>
        <p className="text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/customer-invoices")} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">
            {isEditMode
              ? editFlow === "renewal"
                ? "Alterar próxima renovação (assinatura)"
                : "Editar fatura"
              : "Nova fatura"}
          </h1>
        </div>
      )}

      {isEditMode && editReady && editFlow === "renewal" && (
        <Card>
          <CardHeader>
            <CardTitle>Próxima cobrança da assinatura</CardTitle>
            <CardDescription>
              <strong className="text-foreground">Nesta tela altera-se só a recorrência futura</strong> (data do próximo
              ciclo na assinatura). <strong>Não</strong> se mexe no vencimento nem nos itens da fatura atual — essa fatura
              já está paga e permanece como registo histórico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <Alert className="border-primary/40 bg-primary/5">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                O valor guardado na assinatura é <code className="text-xs font-mono">subscriptions.next_billing_date</code>{" "}
                (vencimento do ciclo). A data que escolhe abaixo é o{" "}
                <span className="font-medium text-foreground">primeiro dia de geração</span>; ao gravar, o sistema soma{" "}
                {renewalDaysBefore} dia(s) de antecipação da conta. A fatura atual não é alterada.
              </AlertDescription>
            </Alert>
            <CardDescription className="text-xs text-muted-foreground -mt-2">
              Jobs pendentes obsoletos na fila são cancelados. Se a nova data já for elegível (calendário do servidor e
              janela horária local do tenant), o backend pode enfileirar o job de imediato.
            </CardDescription>
            <div>
              <Label htmlFor="next_renewal_date">Primeiro dia de geração</Label>
              <Input
                id="next_renewal_date"
                type="date"
                className="mt-1 max-w-xs"
                value={nextRenewalDate}
                onChange={(e) => setNextRenewalDate(e.target.value)}
              />
              {nextRenewalDate.match(/^\d{4}-\d{2}-\d{2}$/) ? (
                <p className="text-xs text-muted-foreground mt-2">
                  Vencimento do ciclo após gravar:{" "}
                  <span className="font-medium text-foreground">
                    {formatInvoiceDueDatePtBr(addCalendarDaysToIsoYmd(nextRenewalDate, renewalDaysBefore))}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(`/customer-invoices/${editInvoiceId}`)}>
                Voltar ao detalhe
              </Button>
              <Button type="button" onClick={() => void handleRenewalSave()} disabled={renewalSaving}>
                {renewalSaving ? "Salvando…" : "Salvar próxima data"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {crmGatewayActive === false && !(isEditMode && editFlow === "renewal") && (
        <Alert className="border-orange-500/50 bg-orange-500/10 text-orange-950 dark:border-orange-500/40 dark:bg-orange-950/35 dark:text-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription>
            Para emitir faturas com cobrança, o tenant precisa de uma configuração de <strong>pagamentos (CRM) ativa</strong>{" "}
            (<code className="text-xs">status = ativo</code> em Configurações). Isso não exige teste de conexão explícito
            nesta tela — apenas configuração válida e ativa.{" "}
            <Link to="/settings/payments" className="font-medium text-primary underline hover:no-underline">
              Configurar pagamentos <ExternalLink className="inline h-3 w-3 ml-0.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {(!isEditMode || !editReady || editFlow !== "renewal") &&
        (step === "client" ? (
        <Card>
          <CardHeader>
            <CardTitle>{crmGatewayActive === false ? "Cliente e pré-requisitos" : "Cliente"}</CardTitle>
            <CardDescription>
              {crmGatewayActive === false
                ? "Selecione o cliente. É necessário gateway de pagamentos (CRM) ativo para emitir cobrança."
                : "Selecione o cliente para continuar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!embedded && (
              <div className="rounded-xl border-2 border-primary/45 bg-primary/5 dark:bg-primary/10 p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                Fatura por link
              </div>
              <p className="text-sm text-muted-foreground">
                Gere um link único: o cliente informa os dados na página pública e conclui o pagamento no gateway.
              </p>
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="invoice_by_link"
                  checked={invoiceByLink}
                  onCheckedChange={(v) => {
                    setInvoiceByLink(v === true);
                    if (v === true) setForm((f) => ({ ...f, client_id: "" }));
                  }}
                />
                <Label htmlFor="invoice_by_link" className="font-normal cursor-pointer">
                  Usar fatura por link (sem selecionar cliente aqui)
                </Label>
              </div>
              {invoiceByLink && (
                <p className="text-sm text-muted-foreground leading-relaxed border-t border-primary/15 pt-3">
                  Você pode criar uma cobrança sem selecionar o cliente agora. O cliente poderá acessar o link e concluir
                  os dados necessários para pagamento.
                </p>
              )}
              </div>
            )}
            {!invoiceByLink && (
              <ClientSearchCombobox
                id="invoice_client_id"
                value={form.client_id || null}
                onChange={(id) => setForm((f) => ({ ...f, client_id: id ?? "" }))}
                clients={clients}
                remoteSearch={false}
                searchInTrigger
                disabled={loadingClients}
                onClientCreated={() => {
                  void clientsService
                    .getClients()
                    .then((data) => setClients(data ?? []))
                    .catch(() => setClients([]));
                  toast.success("Cliente criado e selecionado");
                }}
                label="Cliente *"
                placeholderTrigger="Buscar cliente (nome, e-mail, telefone, CPF)..."
                selectedLabel={
                  selectedClient
                    ? [selectedClient.name, selectedClient.company].filter(Boolean).join(" — ") || undefined
                    : undefined
                }
                className="mt-0"
              />
            )}

            {invoiceByLink && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (embedded) onBack?.();
                    else navigate("/customer-invoices");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={crmGatewayActive === false}
                  onClick={() => {
                    setCreationKind(null);
                    setStep("billing_type");
                  }}
                >
                  Continuar
                </Button>
              </div>
            )}

            {form.client_id && !invoiceByLink && (
              <>
                {selectedClient && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium">Dados do cliente</p>
                    <div className="grid gap-2 text-sm">
                      <div><span className="text-muted-foreground">Nome:</span> {selectedClient.name || "—"}</div>
                      {selectedClient.company && (
                        <div><span className="text-muted-foreground">Empresa:</span> {selectedClient.company}</div>
                      )}
                      {selectedClient.email && (
                        <div><span className="text-muted-foreground">E-mail:</span> {selectedClient.email}</div>
                      )}
                      {selectedClient.phone && (
                        <div><span className="text-muted-foreground">Telefone:</span> {selectedClient.phone}</div>
                      )}
                      <div className="space-y-1">
                        <Label htmlFor="invoice_client_cpf_display" className="text-muted-foreground">
                          CPF/CNPJ
                        </Label>
                        {selectedClient.cpf_cnpj ? (
                          <Input
                            id="invoice_client_cpf_display"
                            readOnly
                            tabIndex={-1}
                            value={selectedClient.cpf_cnpj}
                            className="max-w-[280px] font-mono bg-muted/50 cursor-default"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Será solicitado na tela pública de pagamento (não editável aqui).
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {crmGatewayActive === false && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium">Pré-requisitos para emitir fatura</p>
                  <ul className="space-y-2 text-sm list-none pl-0">
                    <li className="flex items-center gap-2 flex-wrap">
                      <X className="h-4 w-4 text-red-600 shrink-0" aria-hidden />
                      <span className="text-muted-foreground">
                        Sem configuração de pagamentos (CRM) ativa — ative em Configurações
                      </span>
                      <Link
                        to="/settings/payments"
                        className="inline-flex items-center gap-1 text-primary hover:underline ml-auto"
                      >
                        Configurar ou ativar gateway <ExternalLink className="h-3 w-3" />
                      </Link>
                    </li>
                  </ul>
                </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (embedded) onBack?.();
                      else navigate("/customer-invoices");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={!invoiceByLink && crmGatewayActive === false}
                    onClick={() => setStep("billing_type")}
                  >
                    Continuar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : step === "billing_type" ? (
        <Card>
          <CardHeader>
            <CardTitle>Tipo de cobrança</CardTitle>
            <CardDescription>
              {invoiceByLink ? (
                <>
                  Cobrança por link — sem cliente selecionado neste momento. Escolha entre fatura única ou assinatura
                  recorrente; em seguida preencha os dados da cobrança.
                </>
              ) : (
                <>
                  Cliente:{" "}
                  <strong>{selectedClient?.name || selectedClient?.company || form.client_id}</strong>. Escolha o que
                  deseja criar.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setCreationKind("one_off");
                  setStep("form");
                }}
                className="text-left rounded-xl border-2 border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-foreground mb-3">
                  <FileText className="h-5 w-5 shrink-0" aria-hidden />
                </div>
                <h3 className="font-semibold text-lg text-foreground">Fatura</h3>
                <p className="text-sm font-medium text-muted-foreground mt-1">Fatura única</p>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  {invoiceByLink
                    ? "Crie uma cobrança avulsa por link."
                    : "Crie uma cobrança única para este cliente. Não cria assinatura nem geração automática de novas faturas."}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreationKind("subscription");
                  setStep("form");
                }}
                className="text-left rounded-xl border-2 border-primary/35 bg-primary/[0.06] p-6 shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary mb-3">
                  <Repeat2 className="h-5 w-5 shrink-0" aria-hidden />
                </div>
                <h3 className="font-semibold text-lg text-foreground">Assinatura</h3>
                <p className="text-sm font-medium text-muted-foreground mt-1">Assinatura recorrente</p>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  {invoiceByLink
                    ? "Crie uma cobrança recorrente por link, com geração automática das próximas faturas."
                    : "Crie uma cobrança recorrente com geração automática de faturas. A primeira fatura e o link de pagamento são criados neste passo."}
                </p>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("client")}>
                Voltar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Dados da cobrança</CardTitle>
                <CardDescription>
                  {invoiceByLink ? (
                    <>
                      Cobrança por link — o cliente poderá concluir os dados no link público. Tipo:{" "}
                      <strong>{creationKind === "subscription" ? "Assinatura recorrente" : "Fatura única"}</strong>.
                    </>
                  ) : (
                    <>
                      Cliente:{" "}
                      <strong>{selectedClient?.name || selectedClient?.company || form.client_id}</strong>
                    </>
                  )}
                </CardDescription>
              </div>
              {!isEditMode && creationKind && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={creationKind === "subscription" ? "default" : "secondary"} className="text-sm">
                    {creationKind === "subscription" ? "Assinatura recorrente" : "Fatura única"}
                  </Badge>
                  {!embedded && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-muted-foreground"
                      onClick={() => {
                        setStep("billing_type");
                        setCreationKind(null);
                      }}
                    >
                      Alterar tipo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-6">
              {isEditMode && editingSubscriptionInvoice && (
                <Alert className="border-primary/45 bg-primary/5 dark:bg-primary/10">
                  <Package className="h-4 w-4 text-primary" />
                  <AlertDescription className="space-y-2">
                    <p>
                      <strong>Cobrança atual da recorrência.</strong> As alterações valem para esta fatura (e para a
                      cobrança no Asaas, se existir). Itens marcados como recorrentes entram na base copiada pelo motor na
                      próxima renovação.
                    </p>
                    <p className="text-muted-foreground text-sm border-t border-primary/20 pt-2">
                      <strong className="text-foreground">Isto edita a cobrança atual</strong> (vencimento, itens,
                      valor). <strong>Não</strong> altera a próxima renovação automática. O motor usa{" "}
                      <code className="text-xs">subscriptions.next_billing_date</code>; para mudar essa data com fatura
                      já paga, use no detalhe «Alterar próxima renovação».
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              {!isEditMode && (
              <div>
                <Label htmlFor="charge_search">Vincular à cobrança (opcional)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Busca no servidor por descrição, ID, nome/empresa/e-mail/telefone do cliente
                  {form.client_id ? " (restrita ao cliente selecionado)" : " (todas as cobranças do tenant)"}.
                </p>
                <div className="mt-1 space-y-2">
                  <Input
                    id="charge_search"
                    value={chargeQuery}
                    onChange={(e) => setChargeQuery(e.target.value)}
                    placeholder="Digite para filtrar cobranças abertas ou parciais…"
                    className="h-9"
                    disabled={loadingCharges}
                    autoComplete="off"
                  />
                </div>
                <Select
                  value={form.charge_id ?? "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, charge_id: v === "none" ? null : v }))}
                >
                  <SelectTrigger id="charge_id" className="mt-1">
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {loadingCharges ? (
                      <SelectItem value="__loading_charges__" disabled>
                        Carregando...
                      </SelectItem>
                    ) : filteredCharges.length > 0 ? (
                      filteredCharges.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.description || `Cobrança ${ch.id.slice(0, 8)}`} — {ch.invoice_count} fatura(s) — {ch.status === "open" ? "Aberta" : "Parcial"}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__no_charges__" disabled>
                        Nenhuma cobrança encontrada
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              )}
              {!isEditMode && creationKind === "subscription" && (
                <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Dados da assinatura</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="billing_interval_sub">Periodicidade</Label>
                      <Select
                        value={billingInterval}
                        onValueChange={(v) => setBillingInterval(v as typeof billingInterval)}
                      >
                        <SelectTrigger id="billing_interval_sub" className="mt-1 max-w-[240px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="quarterly">Trimestral</SelectItem>
                          <SelectItem value="semi_annual">Semestral</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2 space-y-2 text-sm text-muted-foreground">
                      <p>
                        O <strong className="text-foreground">vencimento</strong> abaixo refere-se apenas a esta primeira
                        cobrança. A <strong className="text-foreground">próxima cobrança automática</strong> é agendada pelo
                        sistema após o fim do período, conforme a periodicidade — não confunda as duas datas.
                      </p>
                    </div>
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Checkbox id="first_invoice_now" checked disabled />
                      <Label htmlFor="first_invoice_now" className="text-sm font-normal leading-snug cursor-default">
                        Gerar a primeira fatura e a cobrança no pagamento agora (sempre ativo neste fluxo).
                      </Label>
                    </div>
                    <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-background/80 px-3 py-2">
                      <Label htmlFor="sub_cycles_unlimited" className="text-sm font-normal cursor-pointer">
                        Ciclos ilimitados
                      </Label>
                      <Switch
                        id="sub_cycles_unlimited"
                        checked={subscriptionCyclesUnlimited}
                        onCheckedChange={setSubscriptionCyclesUnlimited}
                      />
                    </div>
                    {!subscriptionCyclesUnlimited && (
                      <div className="sm:col-span-2 max-w-[220px]">
                        <Label htmlFor="sub_max_cycles">Quantidade de ciclos</Label>
                        <Input
                          id="sub_max_cycles"
                          type="number"
                          min={1}
                          className="mt-1"
                          value={subscriptionMaxCycles}
                          onChange={(e) => setSubscriptionMaxCycles(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Total de cobranças previstas (inclui a primeira fatura deste passo).
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Geração antecipada: quando existir configuração no tenant, o sistema aplica automaticamente nas
                      próximas emissões.
                    </p>
                  </div>
                </div>
              )}
              {!isEditMode && creationKind === "subscription" && (
                <Alert className="border-border bg-muted/40">
                  <AlertDescription className="text-sm">
                    Os itens desta fatura definem a base de valores e descrições para as renovações automáticas, alinhadas
                    à periodicidade escolhida.
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <Label className="mb-2 block">Itens da fatura</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddLine}>
                    <Plus className="h-4 w-4 mr-1" />
                    Linha manual
                  </Button>
                  <Popover
                    open={invoicePickerOpen === "product"}
                    onOpenChange={(o) => {
                      setInvoicePickerOpen(o ? "product" : null);
                      if (!o) setInvoicePickerQuery("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loadingProducts}
                      >
                        <Package className="h-4 w-4 mr-1" />
                        Produto do catálogo
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <div className="p-2 border-b flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          className="h-8"
                          placeholder="Buscar produto..."
                          value={invoicePickerQuery}
                          onChange={(e) => setInvoicePickerQuery(e.target.value)}
                        />
                      </div>
                      <ScrollArea className="h-56">
                        {invoiceCatalogFiltered.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-3">Nenhum produto encontrado.</p>
                        ) : (
                          <ul className="p-1">
                            {invoiceCatalogFiltered.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className="w-full text-left text-sm px-2 py-2 rounded hover:bg-muted"
                                  onClick={() => appendLineFromCatalog(p)}
                                >
                                  <span className="font-medium block truncate">{p.name}</span>
                                  {p.short_description ? (
                                    <span className="text-xs text-muted-foreground line-clamp-1">
                                      {p.short_description}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                  <Popover
                    open={invoicePickerOpen === "service"}
                    onOpenChange={(o) => {
                      setInvoicePickerOpen(o ? "service" : null);
                      if (!o) setInvoicePickerQuery("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loadingProducts}
                      >
                        <Briefcase className="h-4 w-4 mr-1" />
                        Serviço do catálogo
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <div className="p-2 border-b flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          className="h-8"
                          placeholder="Buscar serviço..."
                          value={invoicePickerQuery}
                          onChange={(e) => setInvoicePickerQuery(e.target.value)}
                        />
                      </div>
                      <ScrollArea className="h-56">
                        {invoiceCatalogFiltered.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-3">Nenhum serviço encontrado.</p>
                        ) : (
                          <ul className="p-1">
                            {invoiceCatalogFiltered.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className="w-full text-left text-sm px-2 py-2 rounded hover:bg-muted"
                                  onClick={() => appendLineFromCatalog(p)}
                                >
                                  <span className="font-medium block truncate">{p.name}</span>
                                  {p.short_description ? (
                                    <span className="text-xs text-muted-foreground line-clamp-1">
                                      {p.short_description}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Descrição</th>
                        <th className="text-right p-2 w-20">Qtd</th>
                        <th className="text-right p-2 w-32">Valor un. (R$)</th>
                        <th className="text-right p-2 min-w-[140px]">Desconto</th>
                        <th className="text-right p-2 w-28">Total</th>
                        <th className="w-10 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                            Nenhuma linha. Adicione itens manuais ou do catálogo — ou informe um valor único abaixo
                            (quando não houver linhas).
                          </td>
                        </tr>
                      ) : null}
                      {lines.flatMap((line) => [
                        <tr key={`${line.id}-main`} className="border-b">
                          <td className="p-2">
                            <Input
                              placeholder="Descrição"
                              value={line.description}
                              onChange={(e) => handleLineChange(line.id, "description", e.target.value)}
                              className="h-8"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="1"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(line.id, "quantity", e.target.value)}
                              className="h-8 text-right"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={line.unit_price}
                              onChange={(e) => handleLineChange(line.id, "unit_price", e.target.value)}
                              onBlur={() =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.id === line.id && l.unit_price.trim() !== ""
                                      ? { ...l, unit_price: formatBrlDisplay(parseBrl(l.unit_price)) }
                                      : l
                                  )
                                )
                              }
                              className="h-8 text-right font-mono text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-end">
                              <Select
                                value={line.discount_kind}
                                onValueChange={(v) =>
                                  setLines((prev) =>
                                    prev.map((l) =>
                                      l.id === line.id
                                        ? {
                                            ...l,
                                            discount_kind: v as InvoiceLineDiscountKind,
                                            discount:
                                              v === "percent"
                                                ? l.discount_kind === "fixed"
                                                  ? "0"
                                                  : l.discount
                                                : l.discount_kind === "percent"
                                                  ? "0,00"
                                                  : l.discount,
                                          }
                                        : l
                                    )
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 w-full sm:w-[68px] text-xs shrink-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fixed">R$</SelectItem>
                                  <SelectItem value="percent">%</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder={line.discount_kind === "percent" ? "0" : "0,00"}
                                value={line.discount}
                                onChange={(e) => handleLineChange(line.id, "discount", e.target.value)}
                                onBlur={() =>
                                  setLines((prev) =>
                                    prev.map((l) => {
                                      if (l.id !== line.id) return l;
                                      if (l.discount.trim() === "") {
                                        return { ...l, discount: l.discount_kind === "percent" ? "0" : "0,00" };
                                      }
                                      if (l.discount_kind === "percent") {
                                        const p = Math.min(100, Math.max(0, parseBrl(l.discount)));
                                        return {
                                          ...l,
                                          discount: p.toLocaleString("pt-BR", {
                                            maximumFractionDigits: 2,
                                            minimumFractionDigits: 0,
                                          }),
                                        };
                                      }
                                      return { ...l, discount: formatBrlDisplay(parseBrl(l.discount)) };
                                    })
                                  )
                                }
                                className="h-8 text-right font-mono text-xs sm:min-w-[4.5rem]"
                              />
                            </div>
                          </td>
                          <td className="p-2 text-right font-medium">
                            R$ {(lineTotalCents(line) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() =>
                                  setLines((prev) =>
                                    prev.map((l) => (l.id === line.id ? { ...l, show_advanced: !l.show_advanced } : l))
                                  )
                                }
                                aria-label="Opções avançadas do item"
                                title="Opções avançadas do item"
                              >
                                <Settings2 className="h-4 w-4" />
                              </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              onClick={() => handleRemoveLine(line.id)}
                              aria-label="Remover linha"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            </div>
                          </td>
                        </tr>,
                        ...(line.show_advanced
                          ? [
                              <tr key={`${line.id}-adv`} className="border-b bg-muted/30">
                            <td colSpan={6} className="p-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2 mb-2 font-medium text-foreground">
                                Opções avançadas do item
                                {line.show_advanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`line_is_recurring_${line.id}`}
                                    checked={line.is_recurring}
                                    disabled={creationKind === "subscription"}
                                    onCheckedChange={(v) =>
                                      setLines((prev) =>
                                        prev.map((l) =>
                                          l.id === line.id ? { ...l, is_recurring: v === true } : l
                                        )
                                      )
                                    }
                                  />
                                  <Label htmlFor={`line_is_recurring_${line.id}`} className="text-xs font-normal cursor-pointer">
                                    Participa da recorrência
                                  </Label>
                                </div>
                                <div>
                                  <Label className="text-xs">Intervalo por item</Label>
                                  <Select
                                    value={line.recurring_interval}
                                    onValueChange={(v) =>
                                      setLines((prev) =>
                                        prev.map((l) =>
                                          l.id === line.id
                                            ? {
                                                ...l,
                                                recurring_interval: v as InvoiceLineRow["recurring_interval"],
                                              }
                                            : l
                                        )
                                      )
                                    }
                                    disabled={!line.is_recurring || creationKind === "subscription"}
                                  >
                                    <SelectTrigger className="h-8 mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="daily">Diário</SelectItem>
                                      <SelectItem value="weekly">Semanal</SelectItem>
                                      <SelectItem value="monthly">Mensal</SelectItem>
                                      <SelectItem value="quarterly">Trimestral</SelectItem>
                                      <SelectItem value="semi_annual">Semestral</SelectItem>
                                      <SelectItem value="yearly">Anual</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Cobrar em outra data (opcional)</Label>
                                  <Input
                                    type="date"
                                    value={line.scheduled_due_date}
                                    onChange={(e) =>
                                      setLines((prev) =>
                                        prev.map((l) =>
                                          l.id === line.id ? { ...l, scheduled_due_date: e.target.value } : l
                                        )
                                      )
                                    }
                                    className="h-8 mt-1"
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>,
                            ]
                          : []),
                      ])}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Total: <strong>R$ {(totalCentsFromLines / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Desconto <strong>%</strong>: aplicado sobre o subtotal da linha; valor em centavos arredondado por linha
                  (regra documentada no plano técnico).
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ou use valor único:{" "}
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: sanitizeNumericFieldInput(e.target.value) }))
                    }
                    onBlur={() =>
                      setForm((f) =>
                        f.amount?.trim()
                          ? { ...f, amount: formatBrlDisplay(parseBrl(f.amount)) }
                          : f
                      )
                    }
                    className="inline-block w-28 h-7 text-xs font-mono"
                  />{" "}
                  R$ (se preenchido, ignora a tabela de itens)
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="due_date">
                    {!isEditMode && creationKind === "subscription"
                      ? "Vencimento da primeira cobrança *"
                      : "Data de vencimento *"}
                  </Label>
                  <Input
                    id="due_date"
                    type="date"
                    min={isEditMode ? undefined : todayLocalYmd()}
                    value={form.due_date}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, due_date: e.target.value }));
                    }}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      const t = todayLocalYmd();
                      if (!v) {
                        if (!isEditMode) {
                          setForm((f) => ({ ...f, due_date: t }));
                        }
                        return;
                      }
                      if (!isEditMode && isCompleteYmdString(v) && v < t) {
                        toast.error("A data de vencimento não pode ser anterior a hoje");
                        setForm((f) => ({ ...f, due_date: t }));
                        return;
                      }
                      setForm((f) => ({ ...f, due_date: v }));
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Métodos permitidos no link de pagamento</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Só é possível ativar métodos que estão ligados na configuração do gateway (Configurações → Pagamentos).
                  </p>
                  <div className="mt-2 space-y-2 rounded-md border p-3">
                    {PAYMENT_METHOD_OPTIONS.filter((option) => gatewayEnabledMethods.includes(option.value)).map(
                      (option) => {
                      const checked = allowedPaymentMethods.includes(option.value);
                      return (
                        <div key={option.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`allowed_method_${option.value}`}
                            checked={checked}
                            onCheckedChange={(v) => {
                              const isChecked = v === true;
                              setAllowedPaymentMethods((prev) => {
                                if (isChecked) {
                                  return prev.includes(option.value) ? prev : [...prev, option.value];
                                }
                                if (prev.length <= 1) return prev;
                                return prev.filter((m) => m !== option.value);
                              });
                            }}
                          />
                          <Label
                            htmlFor={`allowed_method_${option.value}`}
                            className="font-normal cursor-pointer"
                          >
                            {option.label}
                          </Label>
                        </div>
                      );
                    }
                    )}
                    {gatewayEnabledMethods.length === 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Nenhum método ativo no gateway. Configure em Pagamentos antes de emitir cobrança com link.
                      </p>
                    )}
                  </div>
                  {showGatewaySelect && !isEditMode && (
                    <div className="mt-4">
                      <Label htmlFor="gateway_key">Gateway (opcional)</Label>
                      <Select
                        value={form.gateway_key ?? "__none__"}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            gateway_key: v === "__none__" ? null : v,
                          }))
                        }
                        disabled={gatewaysLoading}
                      >
                        <SelectTrigger id="gateway_key" className="mt-1 max-w-[320px]">
                          <SelectValue placeholder="Padrão do tenant" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Padrão do tenant</SelectItem>
                          {activeGatewaysForSelect.map((g) => (
                            <SelectItem key={g.key} value={g.key}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="description">Observações (opcional)</Label>
                <Textarea
                  id="description"
                  placeholder="Observações da cobrança"
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 pt-2">
                {!isEditMode && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (embedded) {
                        onBack?.();
                        return;
                      }
                      setStep("billing_type");
                      setCreationKind(null);
                    }}
                  >
                    Voltar
                  </Button>
                )}
                <Button type="submit" disabled={createLoading}>
                  {createLoading
                    ? isEditMode
                      ? "Salvando…"
                      : "Criando..."
                    : isEditMode
                      ? "Salvar alterações"
                      : creationKind === "subscription"
                        ? "Criar assinatura e primeira fatura"
                        : "Criar fatura"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CustomerInvoiceNew;
