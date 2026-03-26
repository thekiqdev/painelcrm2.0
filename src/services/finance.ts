import { apiClient } from '@/integrations/api/client';

export interface InvoiceItem {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  client_id?: string | null;
  project_id?: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue';
  items: InvoiceItem[];
  total: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Expense {
  id: string;
  project_id?: string | null;
  description: string;
  amount: number;
  date: string;
  category?: string | null;
  is_paid: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Receita de cobrança (customer_invoices com status=paid) para o relatório financeiro. */
export interface BillingReceipt {
  id: string;
  amount_cents: number;
  paid_at: string;
  invoice_number: string | null;
  client_id: string | null;
}

export const financeService = {
  // Invoices
  async getInvoices(filters?: { status?: string; client_id?: string; project_id?: string }): Promise<Invoice[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.project_id) params.append('project_id', filters.project_id);
    
    const query = params.toString();
    const response = await apiClient.get<Invoice[]>(`/api/invoices${query ? `?${query}` : ''}`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getInvoiceById(id: string): Promise<Invoice> {
    const response = await apiClient.get<Invoice>(`/api/invoices/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Fatura não encontrada');
    return response.data;
  },

  async createInvoice(invoice: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>): Promise<Invoice> {
    const response = await apiClient.post<Invoice>('/api/invoices', {
      client_id: invoice.client_id || null,
      project_id: invoice.project_id || null,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      status: invoice.status || 'draft',
      items: invoice.items || [],
      total: invoice.total,
      notes: invoice.notes || null,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao criar fatura');
    return response.data;
  },

  async updateInvoice(id: string, invoice: Partial<Invoice>): Promise<Invoice> {
    const response = await apiClient.patch<Invoice>(`/api/invoices/${id}`, {
      client_id: invoice.client_id,
      project_id: invoice.project_id,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      status: invoice.status,
      items: invoice.items,
      total: invoice.total,
      notes: invoice.notes,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao atualizar fatura');
    return response.data;
  },

  async deleteInvoice(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/invoices/${id}`);
    if (response.error) throw new Error(response.error);
  },

  // Expenses
  async getExpenses(filters?: { project_id?: string; category?: string; is_paid?: boolean; start_date?: string; end_date?: string }): Promise<Expense[]> {
    const params = new URLSearchParams();
    if (filters?.project_id) params.append('project_id', filters.project_id);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.is_paid !== undefined) params.append('is_paid', filters.is_paid.toString());
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    
    const query = params.toString();
    const response = await apiClient.get<Expense[]>(`/api/expenses${query ? `?${query}` : ''}`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getExpenseById(id: string): Promise<Expense> {
    const response = await apiClient.get<Expense>(`/api/expenses/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Despesa não encontrada');
    return response.data;
  },

  async createExpense(expense: Omit<Expense, 'id' | 'created_at' | 'updated_at'>): Promise<Expense> {
    const response = await apiClient.post<Expense>('/api/expenses', {
      project_id: expense.project_id || null,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      category: expense.category || null,
      is_paid: expense.is_paid || false,
      notes: expense.notes || null,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao criar despesa');
    return response.data;
  },

  async updateExpense(id: string, expense: Partial<Expense>): Promise<Expense> {
    const response = await apiClient.patch<Expense>(`/api/expenses/${id}`, {
      project_id: expense.project_id,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      category: expense.category,
      is_paid: expense.is_paid,
      notes: expense.notes,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao atualizar despesa');
    return response.data;
  },

  async deleteExpense(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/expenses/${id}`);
    if (response.error) throw new Error(response.error);
  },

  /** Receitas de cobrança (customer_invoices pagas) para o relatório financeiro. */
  async getBillingReceipts(): Promise<BillingReceipt[]> {
    const response = await apiClient.get<BillingReceipt[]>('/api/finance/billing-receipts');
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },
};

