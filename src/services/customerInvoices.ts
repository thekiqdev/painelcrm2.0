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
  /** Lista (GET /customer-invoices): próxima cobrança da assinatura quando houver JOIN. */
  subscription_next_billing_date?: string | null;
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
  cycles_unlimited?: boolean;
  max_cycles?: number | null;
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
  paid_at: string | null;
  payment_token: string | null;
  created_at: string;
}

export interface CustomerInvoiceRecurrenceHistoryResponse {
  subscription_id: string | null;
  history: RecurrenceHistoryInvoice[];
}

export type RecurrenceVisualTag =
  | 'not_recurring'
  | 'scheduled'
  | 'processed'
  | 'no_new_invoice'
  | 'failed'
  | 'cancelled'
  | 'stale_after_reschedule';

/** Motivos alinhados ao backend (`TryEnqueueRenewalReason` + casos de insight). */
export type RenewalEnqueueBlockReasonCode =
  | 'subscription_not_found'
  | 'subscription_not_active'
  | 'subscription_type_unsupported'
  | 'next_billing_after_db_today'
  | 'future_local_date'
  | 'too_early_local_time'
  | 'outside_local_window'
  | 'active_job_exists'
  | 'completed_cycle_guard'
  | 'eligible_no_row_yet';

/** GET /api/customer-invoices/:id/recurrence-insight */
export interface CustomerInvoiceRecurrenceInsight {
  is_recurring: boolean;
  visual_tag: RecurrenceVisualTag;
  status_badge_pt: string;
  is_queued: boolean;
  subscription: {
    id: string;
    status: string;
    billing_interval: string;
    next_billing_date: string;
    cancel_at_period_end: boolean;
    current_period_start: string | null;
    current_period_end: string | null;
    type: string;
  } | null;
  /** Datas gravadas nesta fatura; estáveis quando a assinatura muda. */
  this_invoice?: {
    period_start: string | null;
    period_end: string | null;
    due_date: string | null;
  };
  /** Igual a `subscription.next_billing_date` quando houver assinatura (próximo ciclo global). */
  next_charge_date: string | null;
  periodicity_label_pt: string | null;
  last_processing_at: string | null;
  last_result_summary_pt: string;
  problem_hint_pt: string | null;
  pending_jobs_count: number;
  latest_job: {
    id: string;
    status: string;
    cycle_key: string;
    updated_at: string;
    completion_outcome: string | null;
    completion_detail: string | null;
    result_invoice_id: string | null;
    error_message: string | null;
  } | null;
  last_generated_invoice_id: string | null;
  operational: {
    subscription_id: string;
    latest_job_id: string | null;
    completion_outcome: string | null;
    completion_detail_raw: string | null;
    completion_detail_parsed: Record<string, unknown> | null;
    result_invoice_id: string | null;
  } | null;
  renewal_enqueue_status: {
    current_cycle_key: string;
    pending_jobs_for_current_cycle: number;
    why_no_job_for_cycle: {
      code: RenewalEnqueueBlockReasonCode;
      message_pt: string;
      window_reason: string | null;
      predicted_insert: string | null;
    } | null;
  } | null;
  /** Pré-visualização: vencimento do ciclo vs primeiro dia de geração (preferências do tenant). */
  tenant_recurring_generation?: {
    days_before_due: number;
    cycle_due_ymd: string;
    generation_date_ymd: string;
    recurring_generate_time_local: string | null;
    timezone: string | null;
  } | null;
  /** Só quando `subscription_cycles_read=true` no superadmin_settings (Etapa 2). */
  subscription_cycles_insight?: {
    matched_cycle: {
      id: string;
      cycle_date: string;
      period_start: string;
      period_end: string;
      status: string;
      invoice_id: string | null;
      job_id: string | null;
      processed_at: string | null;
      skipped_reason: string | null;
      status_label_pt: string;
    } | null;
    recent_cycles: Array<{
      id: string;
      cycle_date: string;
      period_start: string;
      period_end: string;
      status: string;
      invoice_id: string | null;
      job_id: string | null;
      processed_at: string | null;
      skipped_reason: string | null;
      status_label_pt: string;
    }>;
  };
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

/** Motivos quando o backend não enfileirou job logo após o PATCH (regras do scheduler / janela local). */
export type RecurrenceNextBillingEnqueueReason =
  | 'subscription_not_found'
  | 'subscription_not_active'
  | 'subscription_type_unsupported'
  | 'next_billing_after_db_today'
  | 'future_local_date'
  | 'too_early_local_time'
  | 'outside_local_window'
  | 'active_job_exists'
  | 'completed_cycle_guard'
  | 'internal_enqueue_error';

/** Resposta de PATCH .../recurrence/next-billing (fatura paga + assinatura CRM). */
export interface CustomerInvoiceRecurrenceNextBillingResult {
  subscription: {
    id: string;
    next_billing_date: string;
    billing_interval: string;
    status: string;
    type: string;
  };
  cancelled_pending_jobs: number;
  /** Tentativa imediata de criar/reativar job (alinhada ao scheduler + Fase 2). */
  enqueue_after_patch:
    | { ok: true; mode: 'inserted' | 'reactivated' }
    | {
        ok: false;
        reason: RecurrenceNextBillingEnqueueReason;
        /** Presente quando `reason` é bloqueio de janela Fase 2 (backend). */
        window_reason?: string;
        error?: string;
      };
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
  /** Vários estados (query `status_in` no backend). */
  status_in?: string[] | null;
  limit?: number;
  offset?: number;
}

/** GET /api/customer-invoices/summary */
export interface CustomerInvoicesSummary {
  paid_count: number;
  paid_amount_cents: number;
  pending_count: number;
  pending_amount_cents: number;
  overdue_count: number;
  overdue_amount_cents: number;
  total_count: number;
  total_amount_cents: number;
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
    if (params.status_in && params.status_in.length > 0) {
      search.set('status_in', params.status_in.join(','));
    } else if (params.status) {
      search.set('status', params.status);
    }
    if (params.limit != null) search.set('limit', String(params.limit));
    if (params.offset != null) search.set('offset', String(params.offset));
    const query = search.toString();
    const url = query ? `${BASE}?${query}` : BASE;
    const response = await apiClient.get<CustomerInvoice[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },

  async getSummary(): Promise<CustomerInvoicesSummary> {
    const response = await apiClient.get<CustomerInvoicesSummary>(`${BASE}/summary`);
    if (response.error) throw new Error(response.error);
    if (!response.data || typeof response.data !== 'object') throw new Error('Resposta inválida ao carregar resumo');
    return response.data;
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

  async getRecurrenceInsight(id: string): Promise<CustomerInvoiceRecurrenceInsight> {
    const response = await apiClient.get<CustomerInvoiceRecurrenceInsight>(`${BASE}/${id}/recurrence-insight`);
    if (response.error) throw new Error(response.error);
    const data = response.data;
    if (!data || typeof data !== 'object') throw new Error('Resposta inválida ao carregar recorrência');
    return data;
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

  /**
   * Atualiza apenas a próxima data de cobrança da assinatura (fatura recorrente já paga).
   * Não altera a invoice nem a cobrança liquidada no gateway.
   */
  async updateRecurrenceNextBilling(
    id: string,
    body: { next_billing_date: string }
  ): Promise<CustomerInvoiceRecurrenceNextBillingResult> {
    const response = await apiClient.patch<CustomerInvoiceRecurrenceNextBillingResult>(
      `${BASE}/${id}/recurrence/next-billing`,
      body
    );
    if (response.error) throw new Error(response.error);
    if (!response.data || typeof response.data !== 'object') {
      throw new Error('Resposta inválida ao atualizar próxima cobrança');
    }
    return response.data;
  },

  /** Exclui a fatura no sistema e cancela/remove a cobrança no Asaas (faturas de assinatura não permitidas). */
  async remove(id: string): Promise<void> {
    const response = await apiClient.delete(`${BASE}/${id}`);
    if (response.error) throw new Error(response.error);
  },

  /** Fase 3 — preferência Checkout Pro Mercado Pago (requer MP conectado; não substitui Asaas na mesma fatura). */
  async createMercadoPagoCheckoutPayment(
    id: string,
    body?: { regenerate?: boolean }
  ): Promise<{
    preference_id: string;
    init_point: string;
    sandbox_init_point?: string;
    payment_url: string;
    invoice_url: string;
    cached: boolean;
    oauth_environment: 'sandbox' | 'production';
  }> {
    const response = await apiClient.post<{
      preference_id: string;
      init_point: string;
      sandbox_init_point?: string;
      payment_url: string;
      invoice_url: string;
      cached: boolean;
      oauth_environment: 'sandbox' | 'production';
    }>(`${BASE}/${id}/mercado-pago/create-payment`, body ?? {});
    if (response.error) throw new Error(response.error);
    if (!response.data || typeof response.data !== 'object') {
      throw new Error('Resposta inválida ao gerar cobrança Mercado Pago');
    }
    return response.data;
  },
};
