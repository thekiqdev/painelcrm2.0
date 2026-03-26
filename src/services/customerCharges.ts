/**
 * Cobranças (customer_charges). Consome GET/POST/PATCH /api/customer-charges.
 */
import { apiClient } from '@/integrations/api/client';

export interface CustomerCharge {
  id: string;
  tenant_id: string;
  client_id: string | null;
  description: string | null;
  status: 'open' | 'partial' | 'paid';
  created_at: string;
  updated_at: string;
}

export interface CustomerChargeWithSummary extends CustomerCharge {
  invoice_count: number;
  total_cents: number;
  paid_cents: number;
}

export interface ChargeInvoiceSummary {
  id: string;
  invoice_number: string | null;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
}

export interface CustomerChargeDetail extends CustomerChargeWithSummary {
  invoices: ChargeInvoiceSummary[];
}

export interface CreateCustomerChargeBody {
  client_id?: string | null;
  description?: string | null;
}

export interface ListCustomerChargesParams {
  client_id?: string | null;
  status?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

const BASE = '/api/customer-charges';

export const customerChargesService = {
  async list(params: ListCustomerChargesParams = {}): Promise<CustomerChargeWithSummary[]> {
    const search = new URLSearchParams();
    if (params.client_id) search.set('client_id', params.client_id);
    if (params.status) search.set('status', params.status);
    if (params.q) search.set('q', params.q);
    if (params.limit != null) search.set('limit', String(params.limit));
    if (params.offset != null) search.set('offset', String(params.offset));
    const query = search.toString();
    const url = query ? `${BASE}?${query}` : BASE;
    const response = await apiClient.get<CustomerChargeWithSummary[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },

  async getById(id: string): Promise<CustomerChargeDetail | null> {
    const response = await apiClient.get<CustomerChargeDetail>(`${BASE}/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data ?? null;
  },

  async create(body: CreateCustomerChargeBody): Promise<CustomerCharge> {
    const response = await apiClient.post<CustomerCharge>(BASE, body);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta inválida ao criar cobrança');
    return response.data;
  },

  async update(id: string, data: { description?: string | null }): Promise<CustomerCharge | null> {
    const response = await apiClient.patch<CustomerCharge>(`${BASE}/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data ?? null;
  },
};
