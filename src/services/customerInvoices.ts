/**
 * Customer Billing: faturas do tenant para seus clientes (customer_invoices).
 * Consome GET/POST/PATCH /api/customer-invoices.
 */
import { apiClient } from '@/integrations/api/client';

export interface CustomerInvoice {
  id: string;
  tenant_id: string;
  client_id: string | null;
  subscription_id: string | null;
  /** E2: fatura pai quando invoice_type = child */
  parent_invoice_id?: string | null;
  /** E2: item na fatura pai */
  parent_invoice_item_id?: string | null;
  period_start: string | null;
  period_end: string | null;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  invoice_number: string | null;
  gateway: string | null;
  payment_method: string | null;
  allowed_payment_methods?: Array<'PIX' | 'BOLETO' | 'CREDIT_CARD'> | null;
  asaas_payment_id?: string | null;
  asaas_status?: string | null;
  idempotency_key: string | null;
  origin: string;
  invoice_type: string;
  description: string | null;
  payment_token: string | null;
  charge_id: string | null;
  created_at: string;
  updated_at: string;
  items?: CustomerInvoiceItem[];
  gateway_metadata?: Record<string, unknown> | null;
  gateway_status?: string | null;
}

/** Item de linha para criação (opcional). Se enviado, amount_cents é calculado no backend. */
export interface CreateCustomerInvoiceItemBody {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents?: number;
  product_id?: string | null;
  is_recurring?: boolean;
  recurring_interval?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly' | null;
  scheduled_due_date?: string | null;
}

export type BillingIntervalRecurring = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

export interface CreateCustomerInvoiceBody {
  client_id?: string | null;
  amount_cents?: number;
  due_date: string;
  description?: string | null;
  payment_method?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
  allowed_payment_methods?: Array<'PIX' | 'BOLETO' | 'CREDIT_CARD'> | null;
  items?: CreateCustomerInvoiceItemBody[];
  recurring?: boolean;
  billing_interval?: BillingIntervalRecurring;
  /**
   * Fase 3 — Seleção de gateway (C1).
   * Quando omitido, mantém comportamento anterior (gateway ativo implícito).
   */
  gateway_key?: string | null;
  /** Vincular à cobrança (Fase 10). */
  charge_id?: string | null;
}

/** Item retornado no GET :id (customer_invoice_items). */
export interface CustomerInvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  total_cents: number;
  sort_order: number;
  is_recurring?: boolean;
  recurring_interval?: string | null;
  scheduled_due_date?: string | null;
  created_at?: string;
}

export interface RecurrenceHistoryInvoice {
  id: string;
  subscription_id: string;
  invoice_number: string | null;
  status: string;
  amount_cents: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export interface CustomerInvoiceRecurrenceHistoryResponse {
  subscription_id: string | null;
  history: RecurrenceHistoryInvoice[];
}

export interface UpdateCustomerInvoiceBody {
  description?: string | null;
  status?: 'cancelled';
  due_date?: string;
  amount_cents?: number;
  /** Substitui linhas da fatura; use `[]` + `amount_cents` para valor único sem linhas. */
  items?: CreateCustomerInvoiceItemBody[];
  payment_method?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
  allowed_payment_methods?: Array<'PIX' | 'BOLETO' | 'CREDIT_CARD'> | null;
}

export interface CreateCustomerInvoiceResult {
  invoice: CustomerInvoice;
  paymentUrls?: {
    invoiceUrl?: string;
    bankSlipUrl?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
  };
  subscription_id?: string;
}

export interface ListCustomerInvoicesParams {
  client_id?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}

/** Resposta do GET /api/customer-invoices/gateway-status (Fase 1 + métodos do gateway). */
export interface CustomerInvoicesGatewayStatus {
  gatewayConfigured: boolean;
  enabled_payment_methods: Array<'pix' | 'boleto' | 'credit_card'>;
  default_payment_method: 'pix' | 'boleto' | 'credit_card' | null;
}

/** Resposta do GET /api/customer-invoices/preconditions (Fase 3). */
export interface CustomerInvoicePreconditions {
  ok: boolean;
  clientHasCpfCnpj: boolean;
  gatewayConfigured: boolean;
  errors: string[];
}

const BASE = '/api/customer-invoices';

export const customerInvoicesService = {
  async list(params: ListCustomerInvoicesParams = {}): Promise<CustomerInvoice[]> {
    const search = new URLSearchParams();
    if (params.client_id) search.set('client_id', params.client_id);
    if (params.status) search.set('status', params.status);
    if (params.limit != null) search.set('limit', String(params.limit));
    if (params.offset != null) search.set('offset', String(params.offset));
    const query = search.toString();
    const url = query ? `${BASE}?${query}` : BASE;
    const response = await apiClient.get<CustomerInvoice[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },

  async getById(id: string): Promise<CustomerInvoice | null> {
    const response = await apiClient.get<CustomerInvoice>(`${BASE}/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data ?? null;
  },

  async getRecurrenceHistory(id: string): Promise<CustomerInvoiceRecurrenceHistoryResponse> {
    const response = await apiClient.get<CustomerInvoiceRecurrenceHistoryResponse>(`${BASE}/${id}/recurrence-history`);
    if (response.error) throw new Error(response.error);
    return response.data ?? { subscription_id: null, history: [] };
  },

  async getGatewayStatus(): Promise<CustomerInvoicesGatewayStatus> {
    const response = await apiClient.get<CustomerInvoicesGatewayStatus>(`${BASE}/gateway-status`);
    if (response.error) throw new Error(response.error);
    const raw = response.data;
    if (!raw || typeof raw !== 'object') throw new Error('Resposta inválida ao verificar gateway');
    const r = raw as unknown as Record<string, unknown>;
    const enabled = Array.isArray(r.enabled_payment_methods)
      ? (r.enabled_payment_methods as string[])
      : ['pix', 'boleto', 'credit_card'];
    const allowedSlug = (s: string): s is 'pix' | 'boleto' | 'credit_card' =>
      s === 'pix' || s === 'boleto' || s === 'credit_card';
    const enabledNorm = enabled.filter(allowedSlug);
    const defRaw = r.default_payment_method;
    const default_payment_method =
      defRaw === null || defRaw === undefined || defRaw === ''
        ? null
        : allowedSlug(String(defRaw))
          ? (String(defRaw) as 'pix' | 'boleto' | 'credit_card')
          : null;
    const fallback: CustomerInvoicesGatewayStatus['enabled_payment_methods'] = ['pix', 'boleto', 'credit_card'];
    return {
      gatewayConfigured: Boolean(r.gatewayConfigured ?? r.gateway_configured),
      enabled_payment_methods: enabledNorm.length > 0 ? (enabledNorm as CustomerInvoicesGatewayStatus['enabled_payment_methods']) : fallback,
      default_payment_method,
    };
  },

  async getPreconditions(clientId: string): Promise<CustomerInvoicePreconditions> {
    const response = await apiClient.get<CustomerInvoicePreconditions>(
      `${BASE}/preconditions?client_id=${encodeURIComponent(clientId)}`
    );
    if (response.error) throw new Error(response.error);
    const raw = response.data;
    if (!raw || typeof raw !== 'object') throw new Error('Resposta inválida ao verificar pré-condições');
    const r = raw as unknown as Record<string, unknown>;
    const clientHasCpfCnpj = Boolean(r.clientHasCpfCnpj ?? r.client_has_cpf_cnpj);
    const gatewayConfigured = Boolean(r.gatewayConfigured ?? r.gateway_configured);
    return {
      ok: Boolean(r.ok),
      clientHasCpfCnpj,
      gatewayConfigured,
      errors: Array.isArray(r.errors) ? (r.errors as string[]) : [],
    };
  },

  async create(body: CreateCustomerInvoiceBody): Promise<CreateCustomerInvoiceResult> {
    const response = await apiClient.post<CreateCustomerInvoiceResult>(BASE, body);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta inválida ao criar fatura');
    return response.data;
  },

  async cancel(id: string): Promise<void> {
    const response = await apiClient.patch<CustomerInvoice>(`${BASE}/${id}`, { status: 'cancelled' });
    if (response.error) throw new Error(response.error);
  },

  async update(id: string, data: UpdateCustomerInvoiceBody): Promise<CustomerInvoice | null> {
    const response = await apiClient.patch<CustomerInvoice>(`${BASE}/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data ?? null;
  },

  /** Exclui a fatura no sistema e cancela/remove a cobrança no Asaas (faturas de assinatura não permitidas). */
  async remove(id: string): Promise<void> {
    const response = await apiClient.delete(`${BASE}/${id}`);
    if (response.error) throw new Error(response.error);
  },
};
