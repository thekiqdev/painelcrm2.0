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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { customerInvoicesService } from "@/services/customerInvoices";
import { customerChargesService } from "@/services/customerCharges";
import { clientsService } from "@/services/clients";
import { productsService } from "@/services/products";
import { apiClient } from "@/integrations/api/client";
import type { CreateCustomerInvoiceBody, CustomerInvoiceItem, UpdateCustomerInvoiceBody } from "@/services/customerInvoices";
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
} from "lucide-react";
import { parseBrl, formatBrlDisplay, sanitizeNumericFieldInput } from "@/lib/brlCurrencyInput";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import {
  effectiveLinkPaymentMethods,
  invoiceMethodsFromGatewaySlugs,
  type InvoicePaymentMethodUi,
} from "@/lib/crmGatewayPaymentMethods";
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
  const queryClientId = searchParams.get("client_id");
  const prefillClientId = (initialClientId ?? queryClientId ?? "").trim();
  const forcedEmbeddedClientId = embedded ? prefillClientId : "";
  const [step, setStep] = useState<"client" | "form">(() => (isEditMode ? "form" : "client"));
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
  const [recurring, setRecurring] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "quarterly" | "semi_annual" | "yearly">("monthly");
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
  const editInitialObservationsRef = useRef("");

  useEffect(() => {
    if (!isEditMode || !editInvoiceId || embedded) return;
    let cancelled = false;
    (async () => {
      try {
        const inv = await customerInvoicesService.getById(editInvoiceId);
        if (cancelled || !inv) {
          if (!cancelled) {
            toast.error("Fatura não encontrada");
            navigate("/customer-invoices");
          }
          return;
        }
        if (inv.origin === "subscription") {
          toast.error("Faturas geradas pela assinatura não podem ser editadas nesta tela.");
          navigate(`/customer-invoices/${editInvoiceId}`);
          return;
        }
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
        setRecurring(false);
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
  }, [isEditMode, editInvoiceId, embedded, navigate]);

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
    setStep("form");
  }, [prefillClientId, isEditMode]);

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

  const handleAddLine = () => setLines((prev) => [...prev, defaultLine()]);

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

  const appendLineFromCatalog = useCallback((p: Product) => {
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
      },
    ]);
    setInvoicePickerOpen(null);
    setInvoicePickerQuery("");
  }, []);
  const handleLineChange = (
    id: string,
    field: "description" | "quantity" | "unit_price" | "discount",
    value: string
  ) => {
    const v =
      field === "description" ? value : sanitizeNumericFieldInput(value);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: v } : l)));
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
          is_recurring: l.is_recurring,
          recurring_interval: l.is_recurring ? l.recurring_interval : null,
          scheduled_due_date: l.scheduled_due_date.trim() || null,
        }));
      } else {
        body.amount_cents = amountCents;
      }
      if (recurring && !isInvoiceByLink) {
        body.recurring = true;
        body.billing_interval = billingInterval;
      }
      if (form.charge_id) body.charge_id = form.charge_id;
      const result = await customerInvoicesService.create(body);
      toast.success(
        result.subscription_id
          ? "Fatura e assinatura criadas. As próximas faturas serão geradas automaticamente."
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
          <h1 className="text-2xl font-bold">Editar fatura</h1>
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
          <h1 className="text-2xl font-bold">{isEditMode ? "Editar fatura" : "Nova fatura"}</h1>
        </div>
      )}

      {crmGatewayActive === false && (
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

      {step === "client" ? (
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
              <div className="rounded-xl border-2 border-primary/45 bg-primary/5 dark:bg-primary/10 p-4 space-y-2 shadow-sm">
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
                <Button type="button" onClick={() => setStep("form")}>
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
                    onClick={() => setStep("form")}
                  >
                    Continuar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dados da cobrança</CardTitle>
            <CardDescription>
              {invoiceByLink ? "Fatura por link (sem cliente)" : <>Cliente: <strong>{selectedClient?.name || selectedClient?.company || form.client_id}</strong></>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-6">
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
                                    disabled={!line.is_recurring}
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
                  <Label htmlFor="due_date">Data de vencimento *</Label>
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
                <div className="flex flex-col gap-2">
                {!invoiceByLink && !isEditMode && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recurring"
                    checked={recurring}
                    onCheckedChange={(v) => setRecurring(v === true)}
                  />
                  <Label htmlFor="recurring" className="font-normal cursor-pointer">
                    Fatura recorrente (próximas cobranças geradas automaticamente)
                  </Label>
                </div>
                )}
                {recurring && !invoiceByLink && !isEditMode && (
                  <div className="pl-6">
                    <Label htmlFor="billing_interval" className="text-muted-foreground text-sm">Periodicidade</Label>
                    <Select
                      value={billingInterval}
                      onValueChange={(v) => setBillingInterval(v as typeof billingInterval)}
                    >
                      <SelectTrigger id="billing_interval" className="mt-1 max-w-[200px]">
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
                )}
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
                  <Button type="button" variant="outline" onClick={() => setStep("client")}>
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
                      : "Criar fatura"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CustomerInvoiceNew;
