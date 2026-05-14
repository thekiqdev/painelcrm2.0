import { apiClient } from '@/integrations/api/client';

export interface ProjectFinancialSummary {
  can_view_invoices: boolean;
  can_view_expenses: boolean;
  invoiced_total: number;
  paid_total: number;
  open_invoice_total: number;
  expense_total: number;
  profit_estimate: number | null;
  invoice_count: number;
  expense_count: number;
  invoiced_total_cents: number;
  paid_total_cents: number;
  open_invoice_total_cents: number;
  expense_total_cents: number;
  profit_estimate_cents: number | null;
}

export interface ProjectFinancialInvoice {
  id: string;
  number: string | null;
  project_id: string | null;
  client_id: string | null;
  client_name: string | null;
  amount: number;
  amount_cents: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  gateway: string | null;
  payment_method: string | null;
  payment_token: string | null;
  created_at: string;
}

export interface ProjectFinancialExpense {
  id: string;
  finance_account_id: string | null;
  account_name: string | null;
  account_type: string | null;
  description: string;
  amount: number;
  amount_cents: number;
  category: string | null;
  date: string;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  supplier_name: string | null;
  created_at: string;
}

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/financial`;

export const projectFinancialService = {
  async getProjectFinancialSummary(projectId: string): Promise<ProjectFinancialSummary> {
    const res = await apiClient.get<ProjectFinancialSummary>(`${base(projectId)}/summary`);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Resumo financeiro inválido');
    return res.data;
  },

  async getProjectFinancialInvoices(projectId: string): Promise<ProjectFinancialInvoice[]> {
    const res = await apiClient.get<ProjectFinancialInvoice[]>(`${base(projectId)}/invoices`);
    if (res.error) throw new Error(res.error);
    return res.data ?? [];
  },

  async getProjectFinancialExpenses(projectId: string): Promise<ProjectFinancialExpense[]> {
    const res = await apiClient.get<ProjectFinancialExpense[]>(`${base(projectId)}/expenses`);
    if (res.error) throw new Error(res.error);
    return res.data ?? [];
  },
};
