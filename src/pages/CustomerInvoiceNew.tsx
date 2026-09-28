import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, Link, useSearchParams, useMatch } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { clientsService } from "@/services/clients";
import { productsService } from "@/services/products";
import { projectsService } from "@/services/projects";
import { apiClient } from "@/integrations/api/client";
import type {
  CreateCustomerInvoiceBody,
  CustomerInvoiceItem,
  RecurrenceNextBillingEnqueueReason,
  UpdateCustomerInvoiceBody,
} from "@/services/customerInvoices";
import type { Product } from "@/types/products";
import { resolvePublicCatalogUnitPrice } from "@/types/products";
import type { Client } from "@/services/clients";
import { chatAvatarUrlForImgSrc } from "@/lib/chatAvatarUrl";
import { toast } from "@/components/ui/sonner";
import { InvoicePaymentMethodCards } from "@/components/billing/InvoicePaymentMethodCards";
import {
  SubscriptionSectionCard,
  SubscriptionSummaryCard,
} from "@/components/billing/SubscriptionCreateChrome";
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
  User,
  Mail,
  Phone,
  Building2,
  IdCard,
  Sparkles,
} from "lucide-react";
import {
  parseBrl,
  formatBrlDisplay,
  sanitizeNumericFieldInput,
  formatBrlInputMask,
  formatPercentInputMask,
} from "@/lib/brlCurrencyInput";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { parseClientsListReturnPath } from "@/lib/clientsListRestore";
import { MobileCommerceScreenLayout } from "@/components/mobile/MobileCommerceScreenLayout";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMobileShellChrome } from "@/contexts/MobileShellChromeContext";

function clientInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

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

const BILLING_INTERVAL_LABELS: Record<
  "weekly" | "monthly" | "quarterly" | "semi_annual" | "yearly",
  string
> = {
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semi_annual: "Semestral",
  yearly: "Anual",
};

const SUBSCRIPTION_DESCRIPTION_MAX_CHARS = 70;

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

function coerceInvoiceMoneyNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function formatInvoiceQuantityDisplay(value: unknown): string {
  const n = coerceInvoiceMoneyNumber(value, 1);
  if (Number.isInteger(n)) return String(n);
  return String(n).replace(".", ",");
}

function resolveInvoiceItemUnitPriceCents(it: CustomerInvoiceItem): number {
  const raw = it as CustomerInvoiceItem & {
    unitPriceCents?: unknown;
    unit_price?: unknown;
  };
  let unitCents = Math.max(0, Math.round(coerceInvoiceMoneyNumber(raw.unit_price_cents, 0)));
  if (unitCents <= 0 && raw.unitPriceCents != null) {
    unitCents = Math.max(0, Math.round(coerceInvoiceMoneyNumber(raw.unitPriceCents, 0)));
  }
  if (unitCents <= 0 && raw.unit_price != null) {
    unitCents = Math.max(0, Math.round(coerceInvoiceMoneyNumber(raw.unit_price, 0) * 100));
  }
  if (unitCents <= 0) {
    const quantity = Math.max(0, coerceInvoiceMoneyNumber(it.quantity, 0));
    const totalCents = Math.max(0, Math.round(coerceInvoiceMoneyNumber(it.total_cents, 0)));
    const discountCents = Math.max(0, Math.round(coerceInvoiceMoneyNumber(it.discount_cents, 0)));
    if (totalCents > 0 && quantity > 0) {
      unitCents = Math.max(0, Math.round((totalCents + discountCents) / quantity));
    }
  }
  return unitCents;
}

function invoiceItemToLine(it: CustomerInvoiceItem): InvoiceLineRow {
  const unitCents = resolveInvoiceItemUnitPriceCents(it);
  const discountCents = Math.max(0, Math.round(coerceInvoiceMoneyNumber(it.discount_cents, 0)));
  return {
    id: it.id,
    description: it.description,
    quantity: formatInvoiceQuantityDisplay(it.quantity),
    unit_price: unitCents > 0 ? formatBrlDisplay(unitCents / 100) : "",
    discount: formatBrlDisplay(discountCents / 100),
    discount_kind: "fixed",
    product_id: it.product_id,
    show_advanced: Boolean(it.scheduled_due_date || it.recurring_interval),
    is_recurring: it.is_recurring ?? true,
    recurring_interval: (it.recurring_interval as InvoiceLineRow["recurring_interval"]) ?? "monthly",
    scheduled_due_date: it.scheduled_due_date?.slice(0, 10) ?? "",
  };
}

/** Linhas do formulário de edição: itens da API ou valor único legado (amount_cents sem linhas). */
function buildEditLinesFromInvoice(inv: CustomerInvoice): InvoiceLineRow[] {
  const rawItems = Array.isArray(inv.items) ? inv.items : [];
  if (rawItems.length > 0) {
    return rawItems.map(invoiceItemToLine);
  }
  const amountCents = Math.round(coerceInvoiceMoneyNumber(inv.amount_cents, 0));
  if (amountCents > 0) {
    return [
      {
        ...defaultLine(),
        id: crypto.randomUUID(),
        description: (inv.description ?? "").trim() || "Item",
        quantity: "1",
        unit_price: formatBrlDisplay(amountCents / 100),
      },
    ];
  }
  return [defaultLine()];
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
  /** No fluxo embutido no chat: pré-seleciona fatura única vs assinatura recorrente. */
  embeddedBillingPreset?: 'one_off' | 'subscription';
  onBack?: () => void;
  onCreated?: (invoiceId: string) => void;
};

/** Cobrança única (sem assinatura) vs. assinatura com primeira fatura e renovações automáticas. */
type CreationKind = "one_off" | "subscription";

const CustomerInvoiceNew = ({
  embedded = false,
  initialClientId = null,
  embeddedBillingPreset = 'one_off',
  onBack,
  onCreated,
}: CustomerInvoiceNewProps = {}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { setSuppressMobileBottomNav } = useMobileShellChrome();
  const editMatch = useMatch({ path: "/customer-invoices/:id/edit", end: true });
  const editInvoiceId = embedded ? undefined : editMatch?.params?.id;
  const isEditMode = Boolean(editInvoiceId);
  const [searchParams] = useSearchParams();
  const editFlowQuery = searchParams.get("flow");
  const queryClientId = searchParams.get("client_id");
  const queryProjectId = searchParams.get("projectId")?.trim() || "";
  const projectInvoiceMode = (searchParams.get("mode") || "").trim().toLowerCase();
  const projectReturnTo = searchParams.get("returnTo")?.trim() || "";
  /** `one_off` | `subscription` — `billing` (canónico) ou `kind` (alias legado). */
  const billingKindQuery = useMemo((): CreationKind | null => {
    const raw = (
      searchParams.get("billing") ||
      searchParams.get("kind") ||
      ""
    )
      .trim()
      .toLowerCase();
    if (raw === "subscription") return "subscription";
    if (raw === "one_off") return "one_off";
    return null;
  }, [searchParams]);
  const byLinkQuery =
    searchParams.get("by_link") === "1" || searchParams.get("by_link") === "true";
  const returnToConversation = searchParams.get("return_to")?.trim() || "";
  const originChat = searchParams.get("origin") === "chat";
  const listReturnPath = useMemo(
    () => parseClientsListReturnPath(searchParams.get("return_path")),
    [searchParams],
  );
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
  const [billingInterval, setBillingInterval] = useState<"weekly" | "monthly" | "quarterly" | "semi_annual" | "yearly">("monthly");
  const [subscriptionCyclesUnlimited, setSubscriptionCyclesUnlimited] = useState(true);
  const [subscriptionMaxCycles, setSubscriptionMaxCycles] = useState("12");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");
  const [invoiceByLink, setInvoiceByLink] = useState(() => byLinkQuery);
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
  const [pixAutomaticAvailable, setPixAutomaticAvailable] = useState(false);
  const [pixAutomaticOn, setPixAutomaticOn] = useState(false);
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
        setCreationKind(inv.origin === "subscription" ? "subscription" : "one_off");

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
        setLines(buildEditLinesFromInvoice(inv));
        if (inv.origin === "subscription" && inv.subscription_id) {
          try {
            const insight = await customerInvoicesService.getRecurrenceInsight(editInvoiceId);
            if (!cancelled && insight.subscription?.billing_interval) {
              const interval = insight.subscription.billing_interval as typeof billingInterval;
              if (
                interval === "monthly" ||
                interval === "quarterly" ||
                interval === "semi_annual" ||
                interval === "yearly"
              ) {
                setBillingInterval(interval);
              }
            }
          } catch {
            /* mantém intervalo padrão se insight indisponível */
          }
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
        setPixAutomaticAvailable(s.pix_automatic_available === true);
      })
      .catch(() => {
        setCrmGatewayActive(null);
        setGatewayMethodsLoaded(true);
        setPixAutomaticAvailable(false);
      });
  }, []);

  useEffect(() => {
    if (!pixAutomaticAvailable || !allowedPaymentMethods.includes("PIX")) {
      setPixAutomaticOn(false);
    }
  }, [pixAutomaticAvailable, allowedPaymentMethods]);

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
    if (isEditMode || embedded || !queryProjectId) return;
    let cancelled = false;
    projectsService
      .getProjectById(queryProjectId)
      .then((project) => {
        if (cancelled) return;
        const useLinkMode = projectInvoiceMode === "link" || !project.client_id;
        setInvoiceByLink(useLinkMode);
        setForm((current) => ({
          ...current,
          project_id: queryProjectId,
          client_id: useLinkMode ? "" : current.client_id || project.client_id || "",
          description: current.description || project.name || null,
        }));
        setCreationKind("one_off");
        setStep("form");
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Erro ao carregar projeto");
      });
    return () => {
      cancelled = true;
    };
  }, [queryProjectId, projectInvoiceMode, isEditMode, embedded]);

  useEffect(() => {
    if (isEditMode || !prefillClientId) return;
    setInvoiceByLink(false);
    setForm((f) => {
      if (f.client_id === prefillClientId) return f;
      return { ...f, client_id: prefillClientId };
    });
    if (embedded) {
      setCreationKind(embeddedBillingPreset === "subscription" ? "subscription" : "one_off");
      setStep("form");
    } else {
      setCreationKind(billingKindQuery);
      setStep(billingKindQuery ? "form" : "billing_type");
    }
  }, [prefillClientId, isEditMode, embedded, billingKindQuery, embeddedBillingPreset]);

  useEffect(() => {
    if (isEditMode || embedded) return;
    if (byLinkQuery) setInvoiceByLink(true);
  }, [byLinkQuery, isEditMode, embedded]);

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
    if (!allowedPaymentMethods.includes("PIX") && pixAutomaticOn) {
      setPixAutomaticOn(false);
    }
  }, [allowedPaymentMethods, pixAutomaticOn]);

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
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (field === "description") return { ...l, description: value };
        if (field === "quantity") return { ...l, quantity: sanitizeNumericFieldInput(value) };
        if (field === "unit_price") {
          return { ...l, unit_price: formatBrlInputMask(sanitizeNumericFieldInput(value)) };
        }
        const raw = sanitizeNumericFieldInput(value);
        return {
          ...l,
          discount: l.discount_kind === "percent" ? formatPercentInputMask(raw) : formatBrlInputMask(raw),
        };
      })
    );
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
            "No fuso horário da empresa o dia do ciclo ainda é futuro (Fase 2); o scheduler enfileirará quando a data local coincidir.",
          too_early_local_time:
            "Mesmo dia local, mas ainda antes da hora mínima de geração configurada (Fase 2); o scheduler enfileirará depois.",
          outside_local_window:
            "Fora da janela horária local da empresa; o scheduler enfileirará quando a janela Fase 2 permitir.",
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
    if (wantsSubscription) {
      const title = (form.description ?? "").trim();
      if (!title) {
        toast.error("Informe a descrição da assinatura");
        return;
      }
      if (title.length > SUBSCRIPTION_DESCRIPTION_MAX_CHARS) {
        toast.error(`A descrição da assinatura deve ter no máximo ${SUBSCRIPTION_DESCRIPTION_MAX_CHARS} caracteres`);
        return;
      }
    }
    const useItems = !useSingleAmount && validLines.length > 0;
    const amountCents = useItems ? totalCentsFromLines : Math.round(parseBrl(form.amount) * 100);
    if (amountCents <= 0) {
      toast.error(useSingleAmount ? "Informe o valor único" : "Preencha a tabela de itens ou o valor único");
      return;
    }
    try {
      setCreateLoading(true);
      const subscriptionTitle = (form.description ?? "").trim();
      const notesTrim = subscriptionNotes.trim();
      const resolvedDescription = wantsSubscription
        ? notesTrim
          ? `${subscriptionTitle}\n\n${notesTrim}`
          : subscriptionTitle
        : form.description || null;
      const body: CreateCustomerInvoiceBody = {
        due_date: form.due_date,
        description: resolvedDescription,
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
      if (queryProjectId) body.project_id = queryProjectId;
      body.billing_mode = isInvoiceByLink ? "link" : "client";
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
      if (
        !isEditMode &&
        pixAutomaticOn &&
        pixAutomaticAvailable &&
        allowedPaymentMethods.includes("PIX")
      ) {
        body.pix_automatic = true;
      }
      const result = await customerInvoicesService.create(body);
      if (queryProjectId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["project-financial-summary", queryProjectId] }),
          queryClient.invalidateQueries({ queryKey: ["project-financial-invoices", queryProjectId] }),
        ]);
      }
      if (result.pix_automatic?.requested && result.pix_automatic.warning) {
        toast.warning(
          "Fatura criada. Pix Automático não pôde ser iniciado — o cliente pode pagar o PIX avulso."
        );
      } else if (result.pix_automatic?.started) {
        toast.success(
          result.subscription_id
            ? "Assinatura criada com Pix Automático. O cliente autoriza ao pagar o primeiro PIX."
            : "Fatura criada com Pix Automático. O cliente autoriza ao pagar o PIX."
        );
      } else {
        toast.success(
          result.subscription_id
            ? isInvoiceByLink
              ? "Assinatura criada por link com a primeira fatura. Compartilhe o link para o cliente concluir os dados e pagar."
              : "Assinatura criada com a primeira fatura. As próximas cobranças serão geradas automaticamente."
            : isInvoiceByLink
              ? "Fatura por link criada. Compartilhe o link de pagamento para o cliente preencher os dados e pagar."
              : "Fatura criada com sucesso"
        );
      }
      if (result.invoice?.id || result.subscription_id) {
        if (embedded) {
          if (result.invoice?.id) onCreated?.(result.invoice.id);
          else onBack?.();
        } else if (projectReturnTo) {
          navigate(projectReturnTo);
        } else if (result.subscription_id) {
          navigate(`/crm-subscriptions/${result.subscription_id}`, {
            state:
              originChat && returnToConversation
                ? { chatReturnTo: returnToConversation, fromNewSubscription: true }
                : { fromNewSubscription: true },
          });
        } else if (originChat && returnToConversation && result.invoice?.id) {
          navigate(`/customer-invoices/${result.invoice.id}`, {
            state: { chatReturnTo: returnToConversation },
          });
        } else if (result.invoice?.id) {
          navigate(`/customer-invoices/${result.invoice.id}`, { state: { fromNewInvoice: true } });
        } else {
          navigate("/customer-invoices");
        }
      } else {
        if (embedded) {
          onBack?.();
        } else {
          navigate(wantsSubscription ? "/crm-subscriptions" : "/customer-invoices");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar fatura");
    } finally {
      setCreateLoading(false);
    }
  };

  const activeGatewaysForSelect = gatewaysStatus.filter(
    (g) => g.is_enabled && g.configured && g.status === "active"
  );
  const showGatewaySelect = activeGatewaysForSelect.length > 1;
  const isSubscriptionCreate = !isEditMode && creationKind === "subscription";
  /** Resumo lateral/final — oculto no Chat e no float (fluxo `embedded`). */
  const showSubscriptionSummary = isSubscriptionCreate && !embedded;
  const summaryClientLabel = invoiceByLink
    ? "Por link"
    : selectedClient?.name || selectedClient?.company || form.client_id || "—";
  const summaryAmountCents = useSingleAmount
    ? Math.round(parseBrl(form.amount) * 100)
    : totalCentsFromLines;
  const summaryAmountLabel =
    summaryAmountCents > 0
      ? `R$ ${(summaryAmountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : "—";
  const summaryMethodsLabel = allowedPaymentMethods
    .map((m) => PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m)
    .join(", ");
  const summaryCyclesLabel = subscriptionCyclesUnlimited
    ? "Ilimitados"
    : `${subscriptionMaxCycles || "—"} ciclo(s)`;

  /** Mesmo shell mobile da rota global: fluxo embutido no Chat usa o mesmo padrão (portal fullscreen). */
  const mobileShell = isMobile;
  /** Radix Select/Popover portais precisam ficar acima do shell mobile (z-[200]). */
  const radixOverlayAboveMobileShellClassName = mobileShell ? "z-[260]" : undefined;
  const handleMobileBack = () => {
    if (embedded) {
      onBack?.();
      return;
    }
    if (returnToConversation) navigate(returnToConversation);
    else if (isEditMode && editInvoiceId) navigate(`/customer-invoices/${editInvoiceId}`);
    else if (listReturnPath) navigate(listReturnPath);
    else navigate("/customer-invoices");
  };

  useEffect(() => {
    if (!mobileShell) {
      setSuppressMobileBottomNav(false);
      return;
    }
    setSuppressMobileBottomNav(true);
    return () => setSuppressMobileBottomNav(false);
  }, [mobileShell, setSuppressMobileBottomNav]);

  const canContinueClientStep =
    invoiceByLink
      ? crmGatewayActive !== false
      : Boolean(form.client_id) && crmGatewayActive !== false;

  const cancelClientStep = () => {
    if (embedded) onBack?.();
    else if (returnToConversation) navigate(returnToConversation);
    else if (listReturnPath) navigate(listReturnPath);
    else if (billingKindQuery === "subscription") navigate("/crm-subscriptions");
    else navigate("/customer-invoices");
  };

  const advanceClientStep = () => {
    // Intenção já na URL (ex.: Assinaturas → billing=subscription) → salta billing_type.
    if (billingKindQuery) {
      setCreationKind(billingKindQuery);
      setStep("form");
      return;
    }
    setCreationKind(null);
    setStep("billing_type");
  };

  const goBackBillingTypeStep = () => {
    if (listReturnPath && prefillClientId && !embedded) {
      navigate(listReturnPath);
      return;
    }
    setCreationKind(null);
    setStep("client");
  };

  const goBackFormStep = () => {
    if (embedded) {
      onBack?.();
      return;
    }
    const directFromClientsList =
      Boolean(listReturnPath) &&
      Boolean(prefillClientId) &&
      (billingKindQuery === "one_off" || billingKindQuery === "subscription");
    if (directFromClientsList) {
      navigate(listReturnPath);
      return;
    }
    // Kind pré-definido na URL: voltar ao cliente sem reabrir fatura vs assinatura.
    if (billingKindQuery) {
      setCreationKind(billingKindQuery);
      setStep("client");
      return;
    }
    setStep("billing_type");
    setCreationKind(null);
  };

  const mobileFormSubmitId = "customer-invoice-form";

  if (!embedded && isEditMode && !editReady) {
    if (isMobile) {
      return (
        <MobileCommerceScreenLayout
          enabled
          header={
            <div className="flex items-center gap-2 px-3 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => (editInvoiceId ? navigate(`/customer-invoices/${editInvoiceId}`) : navigate("/customer-invoices"))}
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold tracking-tight">Editar fatura</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">A carregar…</p>
              </div>
            </div>
          }
        >
          <div className="flex justify-center px-3 py-12 text-sm text-muted-foreground">A carregar dados da fatura…</div>
        </MobileCommerceScreenLayout>
      );
    }
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
    <MobileCommerceScreenLayout
      enabled={mobileShell}
      header={
        mobileShell ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Button type="button" variant="ghost" size="icon" onClick={handleMobileBack} aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight">
                {isEditMode
                  ? editFlow === "renewal"
                    ? "Renovação"
                    : "Editar fatura"
                  : billingKindQuery === "subscription"
                    ? "Nova assinatura"
                    : billingKindQuery === "one_off"
                      ? "Nova fatura"
                      : "Nova cobrança"}
              </h1>
              {step === "client" && !isEditMode ? (
                <>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {billingKindQuery === "subscription"
                      ? "Escolha o cliente da assinatura"
                      : billingKindQuery === "one_off"
                        ? "Escolha o cliente da fatura"
                        : "Como quer criar esta cobrança?"}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/85">
                    {billingKindQuery ? "Etapa 1 de 2" : "Etapa 1 de 3"}
                  </p>
                </>
              ) : step === "billing_type" && !isEditMode ? (
                <>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    Fatura única ou assinatura recorrente
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/85">
                    Etapa 2 de 3
                  </p>
                </>
              ) : step === "form" && !isEditMode ? (
                <>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {creationKind === "subscription" ? "Assinatura — preencha e confirme" : "Fatura única — preencha e confirme"}
                  </p>
                  {embedded ? (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">Desde a conversa</p>
                  ) : (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/85">
                      {billingKindQuery ? "Etapa 2 de 2" : "Etapa 3 de 3"}
                    </p>
                  )}
                </>
              ) : isEditMode && editFlow === "renewal" ? (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  Ajuste só a data do próximo ciclo da assinatura
                </p>
              ) : isEditMode ? (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  Atualize itens, valores e pagamento
                </p>
              ) : originChat && returnToConversation ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">Após criar, pode voltar à conversa</p>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
      footer={
        mobileShell && !isEditMode ? (
          step === "client" ? (
            <div className="space-y-2">
              {crmGatewayActive === false ? (
                <p className="text-center text-[11px] leading-snug text-amber-800 dark:text-amber-400">
                  Ative pagamentos (CRM) em Configurações para emitir cobrança.
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full text-sm text-muted-foreground"
                onClick={cancelClientStep}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-12 w-full text-base font-semibold shadow-sm"
                disabled={!canContinueClientStep}
                onClick={advanceClientStep}
              >
                Continuar
              </Button>
            </div>
          ) : step === "billing_type" ? (
            <div className="space-y-2">
              <p className="text-center text-[11px] leading-snug text-muted-foreground">
                Toque em uma das opções acima para avançar.
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full text-base font-medium"
                onClick={goBackBillingTypeStep}
              >
                Voltar
              </Button>
            </div>
          ) : step === "form" ? (
            <div className="space-y-2">
              {crmGatewayActive === false ? (
                <p className="text-center text-[11px] leading-snug text-amber-800 dark:text-amber-400">
                  Ative pagamentos (CRM) em Configurações para emitir cobrança.
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full text-sm text-muted-foreground"
                onClick={goBackFormStep}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                form={mobileFormSubmitId}
                className="h-12 w-full text-base font-semibold shadow-sm"
                disabled={createLoading || crmGatewayActive === false}
              >
                {createLoading
                  ? "Criando…"
                  : creationKind === "subscription"
                    ? "Criar assinatura"
                    : "Criar fatura"}
              </Button>
            </div>
          ) : null
        ) : mobileShell && isEditMode && editReady && editFlow === "renewal" ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-sm text-muted-foreground"
              onClick={() => editInvoiceId && navigate(`/customer-invoices/${editInvoiceId}`)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              className="h-12 w-full text-base font-semibold shadow-sm"
              onClick={() => void handleRenewalSave()}
              disabled={renewalSaving}
            >
              {renewalSaving ? "Salvando…" : "Salvar próxima data"}
            </Button>
          </div>
        ) : mobileShell && isEditMode && editReady && editFlow === "invoice" ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-sm text-muted-foreground"
              onClick={() => editInvoiceId && navigate(`/customer-invoices/${editInvoiceId}`)}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              form={mobileFormSubmitId}
              className="h-12 w-full text-base font-semibold shadow-sm"
              disabled={createLoading}
            >
              {createLoading ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        ) : undefined
      }
    >
    <div className={cn("space-y-6", mobileShell && "px-2 pt-1")}>
      {!embedded && !mobileShell && (
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!isEditMode && listReturnPath) navigate(listReturnPath);
              else navigate("/customer-invoices");
            }}
            aria-label="Voltar"
          >
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
        <Card className={cn(mobileShell && "border-0 bg-transparent shadow-none")}>
          <CardHeader className={cn(mobileShell && "space-y-3 px-0 pt-0")}>
            <CardTitle className={cn(mobileShell && "text-base")}>Próxima cobrança da assinatura</CardTitle>
            <CardDescription className={cn(mobileShell && "text-xs leading-relaxed")}>
              {mobileShell ? (
                <>
                  Só a <strong className="text-foreground">recorrência futura</strong>. A fatura atual paga não é
                  alterada.
                </>
              ) : (
                <>
              <strong className="text-foreground">Nesta tela altera-se só a recorrência futura</strong> (data do próximo
              ciclo na assinatura). <strong>Não</strong> se mexe no vencimento nem nos itens da fatura atual — essa fatura
              já está paga e permanece como registo histórico.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className={cn("space-y-4 max-w-md", mobileShell && "max-w-none space-y-4 p-0")}>
            <Alert className={cn("border-primary/40 bg-primary/5", mobileShell && "text-xs")}>
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertDescription className={cn("text-sm", mobileShell && "text-xs leading-snug")}>
                {mobileShell ? (
                  <>
                    A data abaixo é o <strong className="text-foreground">1.º dia de geração</strong>. Ao gravar, soma{" "}
                    {renewalDaysBefore} dia(s) de antecipação para o vencimento do ciclo.
                  </>
                ) : (
                  <>
                    O valor guardado na assinatura é <code className="text-xs font-mono">subscriptions.next_billing_date</code>{" "}
                    (vencimento do ciclo). A data que escolhe abaixo é o{" "}
                    <span className="font-medium text-foreground">primeiro dia de geração</span>; ao gravar, o sistema soma{" "}
                    {renewalDaysBefore} dia(s) de antecipação da conta. A fatura atual não é alterada.
                  </>
                )}
              </AlertDescription>
            </Alert>
            {!mobileShell && (
            <CardDescription className="text-xs text-muted-foreground -mt-2">
              Jobs pendentes obsoletos na fila são cancelados. Se a nova data já for elegível (calendário do servidor e
                janela horária local da empresa), o backend pode enfileirar o job de imediato.
            </CardDescription>
            )}
            <div>
              <Label htmlFor="next_renewal_date">{mobileShell ? "1.º dia de geração" : "Primeiro dia de geração"}</Label>
              <Input
                id="next_renewal_date"
                type="date"
                className={cn("mt-1 max-w-xs", mobileShell && "h-11 max-w-full")}
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
            <div className={cn("flex flex-wrap gap-2", mobileShell && "hidden")}>
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
            Para emitir faturas com cobrança, a empresa precisa de uma configuração de <strong>pagamentos (CRM) ativa</strong>{" "}
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
        <Card
          className={cn(
            mobileShell && "border-0 bg-transparent shadow-none",
          )}
        >
          {!mobileShell && (
          <CardHeader>
            <CardTitle>{crmGatewayActive === false ? "Cliente e pré-requisitos" : "Cliente"}</CardTitle>
            <CardDescription>
              {crmGatewayActive === false
                ? "Selecione o cliente. É necessário gateway de pagamentos (CRM) ativo para emitir cobrança."
                  : "Escolha o tipo de fatura e, se for cliente existente, localize o contacto abaixo."}
            </CardDescription>
          </CardHeader>
          )}
          <CardContent className={cn("space-y-6", mobileShell && "space-y-5 p-0")}>
            {!embedded && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Tipo de fatura</p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!invoiceByLink}
                    onClick={() => setInvoiceByLink(false)}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !invoiceByLink
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15"
                        : "border-border bg-card hover:border-primary/30 hover:bg-muted/25",
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                      <User className="h-5 w-5 shrink-0" aria-hidden />
              </div>
                    <p className="mt-3 font-semibold text-foreground">Cliente existente</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Para quem já está no CRM. Busque pelo nome, e-mail ou telefone.
                    </p>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={invoiceByLink}
                    onClick={() => {
                      setInvoiceByLink(true);
                      setForm((f) => ({ ...f, client_id: "" }));
                    }}
                    className={cn(
                      "rounded-2xl border-2 p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      invoiceByLink
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15"
                        : "border-border bg-card hover:border-primary/30 hover:bg-muted/25",
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Link2 className="h-5 w-5 shrink-0" aria-hidden />
              </div>
                    <p className="mt-3 font-semibold text-foreground">Fatura por link</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Link público: a pessoa completa os dados e paga no gateway.
                    </p>
                  </button>
              </div>
              </div>
            )}

            {invoiceByLink && !embedded ? (
              <div className="space-y-3 rounded-2xl border border-border/80 bg-muted/15 px-4 py-4 dark:bg-muted/10">
                <h3 className="text-sm font-semibold text-foreground">Cobrança por link</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Não precisa escolher cliente agora. Depois de criar a cobrança, partilhe o link gerado.
                </p>
                <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground marker:font-medium">
                  <li>O cliente abre o link (WhatsApp, e-mail, etc.).</li>
                  <li>Na página pública, confirma ou preenche os dados necessários.</li>
                  <li>Conclui o pagamento (PIX, boleto ou cartão, conforme a sua configuração).</li>
                </ol>
              </div>
            ) : null}

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
                label={mobileShell ? "Buscar cliente" : "Cliente *"}
                placeholderTrigger={
                  isMobile ? "Nome, e-mail ou telefone" : "Buscar cliente (nome, e-mail, telefone, CPF)..."
                }
                selectedLabel={
                  selectedClient
                    ? [selectedClient.name, selectedClient.company].filter(Boolean).join(" — ") || undefined
                    : undefined
                }
                className="mt-0"
              />
            )}

            {form.client_id && !invoiceByLink && selectedClient ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex gap-3 border-b border-border/60 bg-muted/10 px-4 py-3.5 dark:bg-muted/15">
                  <Avatar className="h-12 w-12 shrink-0 border border-border/50 shadow-sm">
                    {(() => {
                      const src = chatAvatarUrlForImgSrc(selectedClient.whatsapp_avatar_url);
                      return src ? <AvatarImage src={src} alt="" className="object-cover" /> : null;
                    })()}
                    <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                      {clientInitials(selectedClient.name || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-tight text-foreground">
                      {selectedClient.name || "—"}
                    </p>
                    {selectedClient.company ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                        <span className="truncate">{selectedClient.company}</span>
                      </p>
                    ) : null}
              </div>
                </div>
                <div className="space-y-2.5 px-4 py-3.5 text-sm">
                  {selectedClient.email ? (
                    <div className="flex items-start gap-2.5">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 break-all text-foreground/90">{selectedClient.email}</span>
                    </div>
                  ) : null}
                  {selectedClient.phone ? (
                    <div className="flex items-start gap-2.5">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="text-foreground/90">{selectedClient.phone}</span>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-2.5 border-t border-border/50 pt-3">
                    <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        CPF / CNPJ
                      </p>
                        {selectedClient.cpf_cnpj ? (
                        <p className="mt-1 font-mono text-sm text-foreground/90">{selectedClient.cpf_cnpj}</p>
                      ) : (
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">
                          Não cadastrado. Se o gateway exigir documento, poderá ser pedido na página de pagamento.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
              </div>
            ) : null}

            {crmGatewayActive === false && !invoiceByLink && form.client_id ? (
              <div className="rounded-xl border border-orange-500/35 bg-orange-500/[0.06] px-3 py-3 text-sm dark:bg-orange-950/25">
                <p className="font-medium text-foreground">Pré-requisitos</p>
                <ul className="mt-2 list-none space-y-2 pl-0 text-muted-foreground">
                  <li className="flex flex-wrap items-center gap-2">
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                    <span>Sem pagamentos (CRM) ativos nesta empresa.</span>
                      <Link
                        to="/settings/payments"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                      Configurar <ExternalLink className="h-3 w-3" />
                      </Link>
                    </li>
                  </ul>
                </div>
            ) : null}

            {!(mobileShell && step === "client") && (
              <>
                {invoiceByLink && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={cancelClientStep}>
                      Cancelar
                    </Button>
                  <Button
                    type="button"
                      disabled={crmGatewayActive === false}
                      onClick={advanceClientStep}
                    >
                      Continuar
                    </Button>
                  </div>
                )}

                {form.client_id && !invoiceByLink && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={cancelClientStep}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={!invoiceByLink && crmGatewayActive === false}
                      onClick={advanceClientStep}
                  >
                    Continuar
                  </Button>
                </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : step === "billing_type" ? (
        <Card
          className={cn(mobileShell && "border-0 bg-transparent shadow-none")}
        >
          {!mobileShell && (
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
          )}
          <CardContent className={cn("space-y-6", mobileShell && "space-y-4 p-0")}>
            {mobileShell ? (
              <section className="rounded-2xl border border-border/70 bg-muted/20 p-3 dark:bg-muted/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contexto</p>
                <p className="mt-1 text-sm text-foreground">
                  {invoiceByLink ? (
                    <>Cobrança por link — escolha o tipo abaixo.</>
                  ) : (
                    <>
                      Cliente:{" "}
                      <span className="font-medium">
                        {selectedClient?.name || selectedClient?.company || form.client_id}
                      </span>
                    </>
                  )}
                </p>
              </section>
            ) : null}
            <div
              className={cn(
                "grid gap-4 sm:grid-cols-2",
                mobileShell && "grid-cols-1 gap-3",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setCreationKind("one_off");
                  setStep("form");
                }}
                className={cn(
                  "text-left rounded-xl border-2 border-border bg-card shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  mobileShell ? "min-h-[148px] p-4 active:scale-[0.99]" : "p-6",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg bg-muted text-foreground mb-3",
                    mobileShell ? "h-12 w-12" : "h-11 w-11",
                  )}
                >
                  <FileText className={cn("shrink-0", mobileShell ? "h-6 w-6" : "h-5 w-5")} aria-hidden />
                </div>
                <h3 className={cn("font-semibold text-foreground", mobileShell ? "text-base" : "text-lg")}>Fatura única</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {invoiceByLink
                    ? "Uma cobrança avulsa por link."
                    : "Uma cobrança só para este cliente — sem renovação automática."}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreationKind("subscription");
                  setStep("form");
                }}
                className={cn(
                  "text-left rounded-xl border-2 border-primary/35 bg-primary/[0.06] shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  mobileShell ? "min-h-[148px] p-4 active:scale-[0.99]" : "p-6",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg bg-primary/15 text-primary mb-3",
                    mobileShell ? "h-12 w-12" : "h-11 w-11",
                  )}
                >
                  <Repeat2 className={cn("shrink-0", mobileShell ? "h-6 w-6" : "h-5 w-5")} aria-hidden />
                </div>
                <h3 className={cn("font-semibold text-foreground", mobileShell ? "text-base" : "text-lg")}>
                  Assinatura recorrente
                </h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {invoiceByLink
                    ? "Renovações automáticas por link."
                    : "Renovações automáticas — primeira fatura e link neste passo."}
                </p>
              </button>
            </div>
            {!mobileShell && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("client")}>
                Voltar
              </Button>
            </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            isSubscriptionCreate &&
              showSubscriptionSummary &&
              !mobileShell &&
              /* Sem items-start: a coluna do resumo precisa esticar na altura do formulário
                 para o position:sticky ter espaço de deslocamento. */
              "grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]",
          )}
        >
        <Card className={cn(
          "min-w-0",
          mobileShell && "border-0 bg-transparent shadow-none",
        )}>
          <CardHeader className={cn(mobileShell && "space-y-3 px-0 pt-0")}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                {!mobileShell && (
                  <CardTitle>
                    {isSubscriptionCreate
                      ? "Nova assinatura"
                      : isEditMode
                        ? "Editar fatura"
                        : "Dados da cobrança"}
                  </CardTitle>
                )}
                {mobileShell ? (
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 dark:bg-muted/10">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isEditMode ? "Fatura" : "Resumo"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={creationKind === "subscription" ? "default" : "secondary"} className="text-xs">
                        {creationKind === "subscription" ? "Assinatura" : "Fatura única"}
                      </Badge>
                      {invoiceByLink ? (
                        <span className="text-xs text-muted-foreground">Por link</span>
                      ) : (
                        <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {selectedClient?.name || selectedClient?.company || form.client_id}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                <CardDescription>
                  {isSubscriptionCreate ? (
                    <>Defina itens, periodicidade e pagamento da assinatura.</>
                  ) : invoiceByLink ? (
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
                )}
              </div>
              {!isEditMode && creationKind && !mobileShell && (
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
              {!isEditMode && creationKind && mobileShell && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full shrink-0 sm:w-auto"
                  onClick={() => {
                    setStep("billing_type");
                    setCreationKind(null);
                  }}
                >
                  Alterar tipo de cobrança
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className={cn(mobileShell && "px-0 pb-0")}>
            <form
              id={mobileShell ? mobileFormSubmitId : "customer-invoice-create-form"}
              onSubmit={handleCreate}
              className={cn("space-y-6", mobileShell && "space-y-5")}
            >
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
              <div className={cn(isSubscriptionCreate ? "space-y-8" : "space-y-6")}>
              {isSubscriptionCreate ? (
                <SubscriptionSectionCard step={1} title="Identificação" description="Cliente e nome da assinatura.">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Cliente
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">{summaryClientLabel}</p>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <Label htmlFor="subscription_description">Descrição da assinatura *</Label>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {(form.description ?? "").length}/{SUBSCRIPTION_DESCRIPTION_MAX_CHARS}
                        </span>
                      </div>
                      <Input
                        id="subscription_description"
                        value={form.description ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            description: e.target.value.slice(0, SUBSCRIPTION_DESCRIPTION_MAX_CHARS) || null,
                          }))
                        }
                        placeholder="Ex.: Plano Premium Mensal"
                        maxLength={SUBSCRIPTION_DESCRIPTION_MAX_CHARS}
                        className={cn("mt-1.5 h-11", mobileShell && "h-12")}
                        required
                      />
                    </div>
                  </div>
                </SubscriptionSectionCard>
              ) : null}
              <div
                className={cn(
                  isSubscriptionCreate
                    ? "rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6 space-y-4"
                    : mobileShell &&
                        "rounded-2xl border border-border/60 bg-card/40 p-4 space-y-4 dark:bg-card/25",
                )}
              >
                {isSubscriptionCreate ? (
                  <header className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                        2
                      </span>
                      <h3 className="text-base font-semibold tracking-tight text-foreground">
                        Itens da assinatura
                      </h3>
                    </div>
                    <p className="pl-[1.875rem] text-sm text-muted-foreground">
                      Produtos e serviços cobrados a cada ciclo.
                    </p>
                  </header>
                ) : mobileShell ? (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens</h2>
                ) : null}
                {!isSubscriptionCreate ? (
                <Label className={cn("mb-2 block", mobileShell && "text-sm font-semibold text-foreground")}>
                  {mobileShell ? "Linhas da fatura" : "Itens da fatura"}
                </Label>
                ) : null}
                <div
                  className={cn(
                    "mb-3",
                    mobileShell ? "grid grid-cols-1 gap-2" : "flex flex-wrap gap-2",
                  )}
                >
                  <Button
                    type="button"
                    variant={mobileShell ? "default" : "secondary"}
                    size={mobileShell ? "default" : "sm"}
                    className={cn(
                      mobileShell && "h-12 w-full justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm",
                    )}
                    onClick={handleAddLine}
                  >
                    <Plus className={cn("shrink-0", mobileShell ? "h-5 w-5" : "h-4 w-4")} />
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
                        size={mobileShell ? "default" : "sm"}
                        disabled={loadingProducts}
                        className={cn(
                          mobileShell &&
                            "h-12 w-full justify-center gap-2 rounded-xl border-2 text-sm font-semibold",
                        )}
                      >
                        <Package className={cn("shrink-0", mobileShell ? "h-5 w-5" : "h-4 w-4")} />
                        {mobileShell ? "Produto (catálogo)" : "Produto do catálogo"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className={cn("w-80 p-0", radixOverlayAboveMobileShellClassName)}
                      align="start"
                    >
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
                        size={mobileShell ? "default" : "sm"}
                        disabled={loadingProducts}
                        className={cn(
                          mobileShell &&
                            "h-12 w-full justify-center gap-2 rounded-xl border-2 text-sm font-semibold",
                        )}
                      >
                        <Briefcase className={cn("shrink-0", mobileShell ? "h-5 w-5" : "h-4 w-4")} />
                        {mobileShell ? "Serviço (catálogo)" : "Serviço do catálogo"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className={cn("w-80 p-0", radixOverlayAboveMobileShellClassName)}
                      align="start"
                    >
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
                {mobileShell ? (
                  <div className="space-y-3">
                    {lines.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground">
                        Nenhum item nesta fatura. Adicione linhas acima ou informe um valor único abaixo (substitui as
                        linhas).
                      </div>
                    ) : (
                      lines.map((line, idx) => (
                        <div
                          key={line.id}
                          className="rounded-2xl border border-border bg-card p-3 shadow-sm dark:bg-card/90"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Item {idx + 1}
                            </p>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 text-muted-foreground"
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
                                className="h-10 w-10 text-muted-foreground"
                                onClick={() => handleRemoveLine(line.id)}
                                aria-label="Remover linha"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 space-y-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Descrição</Label>
                              <Input
                                placeholder="O que está a cobrar"
                                value={line.description}
                                onChange={(e) => handleLineChange(line.id, "description", e.target.value)}
                                className="mt-1 h-11"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs text-muted-foreground">Qtd</Label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="1"
                                  value={line.quantity}
                                  onChange={(e) => handleLineChange(line.id, "quantity", e.target.value)}
                                  className="mt-1 h-11 text-right"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Valor un. (R$)</Label>
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
                                  className="mt-1 h-11 text-right font-mono text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Desconto</Label>
                              <div className="mt-1 flex gap-2">
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
                                  <SelectTrigger className="h-11 w-[76px] shrink-0 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className={radixOverlayAboveMobileShellClassName}>
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
                                  className="h-11 flex-1 text-right font-mono text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-border/60 pt-3">
                              <span className="text-sm text-muted-foreground">Total linha</span>
                              <span className="text-base font-semibold tabular-nums">
                                R${" "}
                                {(lineTotalCents(line) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            {line.show_advanced ? (
                              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3 dark:bg-muted/10">
                                <p className="text-xs font-medium text-foreground">Opções avançadas</p>
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
                                  <Label
                                    htmlFor={`line_is_recurring_${line.id}`}
                                    className="text-sm font-normal leading-snug cursor-pointer"
                                  >
                                    Participa da recorrência
                                  </Label>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Intervalo por item</Label>
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
                                    <SelectTrigger className="mt-1 h-11">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className={radixOverlayAboveMobileShellClassName}>
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
                                  <Label className="text-xs text-muted-foreground">Outra data de cobrança (opc.)</Label>
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
                                    className="mt-1 h-11"
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
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
                                  <SelectContent className={radixOverlayAboveMobileShellClassName}>
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
                                      {line.show_advanced ? (
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      )}
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
                                        <Label
                                          htmlFor={`line_is_recurring_${line.id}`}
                                          className="text-xs font-normal cursor-pointer"
                                        >
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
                                          <SelectContent className={radixOverlayAboveMobileShellClassName}>
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
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Total:{" "}
                  <strong>R$ {(totalCentsFromLines / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mobileShell ? (
                    <>
                      Desconto em <strong>%</strong> incide sobre o subtotal da linha (arredondamento por linha).
                    </>
                  ) : (
                    <>
                      Desconto <strong>%</strong>: aplicado sobre o subtotal da linha; valor em centavos arredondado por
                      linha (regra documentada no plano técnico).
                    </>
                  )}
                </p>
                <p className={cn("text-xs text-muted-foreground mt-1", mobileShell && "flex flex-col gap-2 sm:block")}>
                  {mobileShell ? (
                    <>
                      <span className="font-medium text-foreground">Valor único (opcional)</span>
                      <span className="text-muted-foreground">
                        Se preencher, substitui as linhas acima no valor total da fatura.
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={form.amount}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            amount: formatBrlInputMask(sanitizeNumericFieldInput(e.target.value)),
                          }))
                        }
                        onBlur={() =>
                          setForm((f) =>
                            f.amount?.trim() ? { ...f, amount: formatBrlDisplay(parseBrl(f.amount)) } : f
                          )
                        }
                        className="h-11 w-full max-w-[200px] font-mono text-sm"
                      />
                    </>
                  ) : (
                    <>
                  Ou use valor único:{" "}
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            amount: formatBrlInputMask(sanitizeNumericFieldInput(e.target.value)),
                          }))
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
                    </>
                  )}
                </p>
              </div>

              {isSubscriptionCreate ? (
                <SubscriptionSectionCard
                  step={3}
                  title="Configurações da assinatura"
                  description="Periodicidade, ciclos, vencimento e formas de pagamento."
                >
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                      <div className="space-y-1.5">
                        <Label htmlFor="billing_interval_sub">Periodicidade</Label>
                        <Select
                          value={billingInterval}
                          onValueChange={(v) => setBillingInterval(v as typeof billingInterval)}
                        >
                          <SelectTrigger
                            id="billing_interval_sub"
                            className={cn("h-11", mobileShell && "h-12")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className={radixOverlayAboveMobileShellClassName}>
                            <SelectItem value="weekly">Semanal</SelectItem>
                            <SelectItem value="monthly">Mensal</SelectItem>
                            <SelectItem value="quarterly">Trimestral</SelectItem>
                            <SelectItem value="semi_annual">Semestral</SelectItem>
                            <SelectItem value="yearly">Anual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="sub_cycles_limit">Quantidade de ciclos</Label>
                        <div
                          className={cn(
                            "flex h-11 items-center gap-2 rounded-md border border-input bg-background px-3",
                            mobileShell && "h-12",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {subscriptionCyclesUnlimited ? "Ilimitado" : "Limite"}
                          </span>
                          {!subscriptionCyclesUnlimited ? (
                            <Input
                              id="sub_max_cycles"
                              type="number"
                              min={1}
                              className="h-8 w-[4.5rem] border-0 bg-muted/40 px-2 text-center shadow-none focus-visible:ring-1"
                              value={subscriptionMaxCycles}
                              onChange={(e) => setSubscriptionMaxCycles(e.target.value)}
                              placeholder="12"
                              aria-label="Número de ciclos"
                            />
                          ) : null}
                          <Switch
                            id="sub_cycles_limit"
                            checked={!subscriptionCyclesUnlimited}
                            onCheckedChange={(on) => setSubscriptionCyclesUnlimited(!on)}
                            aria-label="Definir limite de ciclos"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:max-w-xs">
                      <Label htmlFor="due_date">Vencimento da cobrança *</Label>
                      <Input
                        id="due_date"
                        type="date"
                        min={todayLocalYmd()}
                        value={form.due_date}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, due_date: e.target.value }));
                        }}
                        onBlur={(e) => {
                          const v = e.currentTarget.value.trim();
                          const t = todayLocalYmd();
                          if (!v) {
                            setForm((f) => ({ ...f, due_date: t }));
                            return;
                          }
                          if (isCompleteYmdString(v) && v < t) {
                            toast.error("A data de vencimento não pode ser anterior a hoje");
                            setForm((f) => ({ ...f, due_date: t }));
                            return;
                          }
                          setForm((f) => ({ ...f, due_date: v }));
                        }}
                        className={cn("h-11", mobileShell && "h-12")}
                      />
                      <p className="text-xs text-muted-foreground">Primeira cobrança desta assinatura.</p>
                    </div>

                    <div className="space-y-2 border-t border-border/60 pt-5">
                      <Label className="block">Métodos de pagamento</Label>
                      <InvoicePaymentMethodCards
                        gatewayEnabledMethods={gatewayEnabledMethods}
                        selected={allowedPaymentMethods}
                        onChange={setAllowedPaymentMethods}
                        pixAutomatic={
                          !isEditMode && pixAutomaticAvailable
                            ? {
                                available: true,
                                checked: pixAutomaticOn,
                                onCheckedChange: setPixAutomaticOn,
                              }
                            : null
                        }
                      />
                      {showGatewaySelect ? (
                        <div className="pt-2">
                          <Label htmlFor="gateway_key_sub">Gateway (opcional)</Label>
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
                            <SelectTrigger id="gateway_key_sub" className="mt-1.5 max-w-[320px]">
                              <SelectValue placeholder="Padrão da empresa" />
                            </SelectTrigger>
                            <SelectContent className={radixOverlayAboveMobileShellClassName}>
                              <SelectItem value="__none__">Padrão da empresa</SelectItem>
                              {activeGatewaysForSelect.map((g) => (
                                <SelectItem key={g.key} value={g.key}>
                                  {g.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </SubscriptionSectionCard>
              ) : (
              <div
                className={cn(
                  "grid gap-4 sm:grid-cols-2",
                  mobileShell && "rounded-2xl border border-border/60 bg-card/40 p-4 dark:bg-card/25",
                )}
              >
                {mobileShell ? (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
                    Vencimento e pagamento
                  </h2>
                ) : null}
                <div>
                  <Label htmlFor="due_date">
                    {mobileShell ? "Vencimento *" : "Data de vencimento *"}
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
                    className={cn("mt-1", mobileShell && "h-11")}
                  />
                </div>
                <div>
                  <Label>
                    {mobileShell ? "Métodos no link" : "Métodos de pagamento"}
                  </Label>
                  <div className="mt-2">
                    <InvoicePaymentMethodCards
                      gatewayEnabledMethods={gatewayEnabledMethods}
                      selected={allowedPaymentMethods}
                      onChange={setAllowedPaymentMethods}
                      pixAutomatic={
                        !isEditMode && pixAutomaticAvailable
                          ? {
                              available: true,
                              checked: pixAutomaticOn,
                              onCheckedChange: setPixAutomaticOn,
                            }
                          : null
                      }
                    />
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
                          <SelectValue placeholder="Padrão da empresa" />
                        </SelectTrigger>
                        <SelectContent className={radixOverlayAboveMobileShellClassName}>
                          <SelectItem value="__none__">Padrão da empresa</SelectItem>
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
              )}
              {isSubscriptionCreate ? (
                <SubscriptionSectionCard step={4} title="Observações" description="Opcional — aparece junto à descrição da assinatura.">
                  <Textarea
                    id="subscription_notes"
                    placeholder="Ex.: referência interna, NF, instruções…"
                    value={subscriptionNotes}
                    onChange={(e) => setSubscriptionNotes(e.target.value)}
                    rows={mobileShell ? 3 : 2}
                    className={cn(mobileShell && "min-h-[88px] text-base")}
                  />
                </SubscriptionSectionCard>
              ) : (
              <div
                className={cn(
                  mobileShell &&
                    "rounded-2xl border border-border/60 bg-card/40 p-4 dark:bg-card/25",
                )}
              >
                {mobileShell ? (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notas</h2>
                ) : null}
                <Label htmlFor="description" className={cn(mobileShell && "mt-3 block")}>
                  {mobileShell ? "Observações (opc.)" : "Observações (opcional)"}
                </Label>
                <Textarea
                  id="description"
                  placeholder={mobileShell ? "Ex.: referência, NF, instruções…" : "Observações da cobrança"}
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
                  rows={mobileShell ? 3 : 2}
                  className={cn("mt-1", mobileShell && "min-h-[88px] text-base")}
                />
              </div>
              )}
              <div className={cn("flex flex-col gap-3 pt-2 sm:flex-row sm:items-center", mobileShell && "hidden")}>
                {!isEditMode && (
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(isSubscriptionCreate && "h-11")}
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
                <Button
                  type="submit"
                  disabled={createLoading}
                  className={cn(
                    isSubscriptionCreate &&
                      "h-12 min-w-[240px] gap-2 px-6 text-base font-semibold shadow-md",
                  )}
                >
                  {isSubscriptionCreate && !createLoading ? (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  ) : null}
                  {createLoading
                    ? isEditMode
                      ? "Salvando…"
                      : "Criando..."
                    : isEditMode
                      ? "Salvar alterações"
                      : creationKind === "subscription"
                        ? "Criar assinatura"
                      : "Criar fatura"}
                </Button>
              </div>
              {showSubscriptionSummary ? (
                <div className="lg:hidden">
                  <SubscriptionSummaryCard
                    clientLabel={summaryClientLabel}
                    description={(form.description ?? "").trim()}
                    amountLabel={summaryAmountLabel}
                    intervalLabel={BILLING_INTERVAL_LABELS[billingInterval]}
                    dueDateLabel={form.due_date ? formatInvoiceDueDatePtBr(form.due_date) : ""}
                    methodsLabel={summaryMethodsLabel}
                    cyclesLabel={summaryCyclesLabel}
                  />
                </div>
              ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
        {showSubscriptionSummary && !mobileShell ? (
          <aside className="relative hidden lg:block" aria-label="Resumo da assinatura">
            {/* Wrapper estica com a linha do grid; o filho sticky desliza dentro dele. */}
            <div className="sticky top-6 z-20 space-y-3">
              <SubscriptionSummaryCard
                clientLabel={summaryClientLabel}
                description={(form.description ?? "").trim()}
                amountLabel={summaryAmountLabel}
                intervalLabel={BILLING_INTERVAL_LABELS[billingInterval]}
                dueDateLabel={form.due_date ? formatInvoiceDueDatePtBr(form.due_date) : ""}
                methodsLabel={summaryMethodsLabel}
                cyclesLabel={summaryCyclesLabel}
              />
              <Button
                type="submit"
                form="customer-invoice-create-form"
                disabled={createLoading}
                className="h-12 w-full gap-2 text-base font-semibold shadow-md"
              >
                {!createLoading ? <Sparkles className="h-4 w-4" aria-hidden /> : null}
                {createLoading ? "Criando..." : "Criar assinatura"}
              </Button>
            </div>
          </aside>
        ) : null}
        </div>
      ))}
    </div>
    </MobileCommerceScreenLayout>
  );
};

export default CustomerInvoiceNew;
