/**
 * Módulo financeiro profissional (Fase 1) — /api/finance/*
 */
import { apiClient } from '@/integrations/api/client';

export type FinanceAccountType = 'bank' | 'cash' | 'wallet' | 'digital';

export interface FinanceAccount {
  id: string;
  tenant_id: string;
  name: string;
  account_type: FinanceAccountType;
  opening_balance_cents: number;
  opening_balance_date: string;
  description: string | null;
  is_active: boolean;
  current_balance_cents?: number;
  created_at: string;
  updated_at: string;
}

export interface FinanceExpenseCategory {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FinanceIncomeEntry {
  id: string;
  tenant_id: string;
  finance_account_id: string;
  amount_cents: number;
  received_at: string;
  description: string;
  client_id: string | null;
  manual_payee_name: string | null;
  category_tag: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type FinanceExpenseStatus = 'expected' | 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface FinanceExpenseEntry {
  id: string;
  tenant_id: string;
  finance_account_id: string | null;
  category_id: string | null;
  amount_cents: number;
  expense_date: string;
  due_date: string;
  paid_at: string | null;
  description: string;
  status: FinanceExpenseStatus;
  supplier_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerRow {
  kind: 'income' | 'expense';
  id: string;
  occurred_at: string;
  description: string;
  amount_cents: number;
  status?: string;
}

const BASE = '/api/finance';

function qs(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') s.set(k, v);
  });
  const q = s.toString();
  return q ? `?${q}` : '';
}

export const financeModuleService = {
  async listAccounts(): Promise<FinanceAccount[]> {
    const r = await apiClient.get<FinanceAccount[]>(`${BASE}/accounts`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async getAccount(id: string): Promise<FinanceAccount> {
    const r = await apiClient.get<FinanceAccount>(`${BASE}/accounts/${encodeURIComponent(id)}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Conta não encontrada');
    return r.data;
  },

  async createAccount(body: {
    name: string;
    account_type: FinanceAccountType;
    opening_balance_cents: number;
    opening_balance_date: string;
    description?: string | null;
    is_active?: boolean;
  }): Promise<FinanceAccount> {
    const r = await apiClient.post<FinanceAccount>(`${BASE}/accounts`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Erro ao criar conta');
    return r.data;
  },

  async updateAccount(
    id: string,
    body: Partial<{
      name: string;
      account_type: FinanceAccountType;
      opening_balance_cents: number;
      opening_balance_date: string;
      description: string | null;
      is_active: boolean;
    }>
  ): Promise<FinanceAccount> {
    const r = await apiClient.patch<FinanceAccount>(`${BASE}/accounts/${encodeURIComponent(id)}`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Erro ao atualizar');
    return r.data;
  },

  async deleteAccount(id: string): Promise<void> {
    const r = await apiClient.delete(`${BASE}/accounts/${encodeURIComponent(id)}`);
    if (r.error) throw new Error(r.error);
  },

  async getLedger(accountId: string, filters?: { from?: string; to?: string; limit?: number }): Promise<LedgerRow[]> {
    const r = await apiClient.get<LedgerRow[]>(
      `${BASE}/accounts/${encodeURIComponent(accountId)}/ledger${qs({
        from: filters?.from,
        to: filters?.to,
        limit: filters?.limit != null ? String(filters.limit) : undefined,
      })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async getPeriodStats(accountId: string, from: string, to: string): Promise<{ total_in_cents: number; total_out_cents: number }> {
    const r = await apiClient.get<{ total_in_cents: number; total_out_cents: number }>(
      `${BASE}/accounts/${encodeURIComponent(accountId)}/period${qs({ from, to })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? { total_in_cents: 0, total_out_cents: 0 };
  },

  async listCategories(): Promise<FinanceExpenseCategory[]> {
    const r = await apiClient.get<FinanceExpenseCategory[]>(`${BASE}/expense-categories`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createCategory(body: { name: string; sort_order?: number }): Promise<FinanceExpenseCategory> {
    const r = await apiClient.post<FinanceExpenseCategory>(`${BASE}/expense-categories`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Erro ao criar categoria');
    return r.data;
  },

  async listIncomeEntries(filters?: { from?: string; to?: string; account_id?: string }): Promise<FinanceIncomeEntry[]> {
    const r = await apiClient.get<FinanceIncomeEntry[]>(`${BASE}/income-entries${qs(filters ?? {})}`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createIncomeEntry(body: {
    finance_account_id: string;
    amount_cents: number;
    received_at: string;
    description: string;
    client_id?: string | null;
    manual_payee_name?: string | null;
    category_tag?: string | null;
    payment_method?: string | null;
    notes?: string | null;
  }): Promise<FinanceIncomeEntry> {
    const r = await apiClient.post<FinanceIncomeEntry>(`${BASE}/income-entries`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Erro ao registrar entrada');
    return r.data;
  },

  async updateIncomeEntry(
    id: string,
    body: Partial<{
      finance_account_id: string;
      amount_cents: number;
      received_at: string;
      description: string;
      client_id: string | null;
      manual_payee_name: string | null;
      category_tag: string | null;
      payment_method: string | null;
      notes: string | null;
    }>
  ): Promise<FinanceIncomeEntry> {
    const r = await apiClient.patch<FinanceIncomeEntry>(`${BASE}/income-entries/${encodeURIComponent(id)}`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Erro ao atualizar');
    return r.data;
  },

  async deleteIncomeEntry(id: string): Promise<void> {
    const r = await apiClient.delete(`${BASE}/income-entries/${encodeURIComponent(id)}`);
    if (r.error) throw new Error(r.error);
  },

  async listExpenseEntries(filters?: {
    from?: string;
    to?: string;
    account_id?: string;
    status?: string;
  }): Promise<FinanceExpenseEntry[]> {
    const r = await apiClient.get<FinanceExpenseEntry[]>(`${BASE}/expense-entries${qs(filters ?? {})}`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createExpenseEntry(body: {
    finance_account_id?: string | null;
    category_id?: string | null;
    amount_cents: number;
    expense_date: string;
    due_date: string;
    paid_at?: string | null;
    description: string;
    status: FinanceExpenseStatus;
    supplier_name?: string | null;
    notes?: string | null;
  }): Promise<FinanceExpenseEntry> {
    const r = await apiClient.post<FinanceExpenseEntry>(`${BASE}/expense-entries`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Erro ao registrar despesa');
    return r.data;
  },

  async updateExpenseEntry(
    id: string,
    body: Partial<{
      finance_account_id: string | null;
      category_id: string | null;
      amount_cents: number;
      expense_date: string;
      due_date: string;
      paid_at: string | null;
      description: string;
      status: FinanceExpenseStatus;
      supplier_name: string | null;
      notes: string | null;
    }>
  ): Promise<FinanceExpenseEntry> {
    const r = await apiClient.patch<FinanceExpenseEntry>(`${BASE}/expense-entries/${encodeURIComponent(id)}`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Erro ao atualizar');
    return r.data;
  },

  async deleteExpenseEntry(id: string): Promise<void> {
    const r = await apiClient.delete(`${BASE}/expense-entries/${encodeURIComponent(id)}`);
    if (r.error) throw new Error(r.error);
  },
};
