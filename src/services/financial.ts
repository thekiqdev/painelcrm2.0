/**
 * Módulo financeiro unificado — /api/financial/*
 */
import { apiClient } from "@/integrations/api/client";

const BASE = "/api/financial";

function qs(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") s.set(k, v);
  });
  const q = s.toString();
  return q ? `?${q}` : "";
}

export type FinancialAccountType = "bank" | "cash" | "wallet";
export type FinancialAccountScope = "business" | "personal";

export interface FinancialAccountDto {
  id: string;
  tenant_id: string;
  name: string;
  type: FinancialAccountType;
  account_scope: FinancialAccountScope;
  initial_balance_cents: number;
  initial_balance_date: string;
  is_active: boolean;
  balance: number;
  created_at: string;
  updated_at: string;
}

export type FinancialTransactionType = "income" | "expense";
export type FinancialTransactionStatus = "pending" | "completed";
export type FinancialTransactionKind = "regular" | "transfer";
export type FinancialTransferDirection = "in" | "out";

export interface FinancialTransactionDto {
  id: string;
  tenant_id: string;
  account_id: string;
  type: FinancialTransactionType;
  amount_cents: number;
  description: string;
  category_id: string | null;
  customer_id: string | null;
  reference_name: string | null;
  transaction_date: string;
  status: FinancialTransactionStatus;
  transaction_kind: FinancialTransactionKind;
  transfer_direction: FinancialTransferDirection | null;
  transfer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransferDto {
  id: string;
  tenant_id: string;
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  transfer_date: string;
  description: string | null;
  out_transaction_id: string | null;
  in_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategoryDto {
  id: string;
  tenant_id: string | null;
  name: string;
  created_at: string;
}

export interface FinancialSummaryMonthlyDto {
  month: string;
  income: number;
  expense: number;
  profit: number;
  planned_recurring_expense?: number;
  planned_credit_card?: number;
  projected_expense?: number;
  projected_profit?: number;
}

export interface FinancialSummaryDto {
  total_income: number;
  total_expense: number;
  total_profit: number;
  accounts: { id: string; name: string; balance: number }[];
  monthly: FinancialSummaryMonthlyDto[];
  transaction_income: number;
  transaction_expense: number;
  invoice_income: number;
  planned_recurring_expense_total?: number;
  planned_credit_card_installments_total?: number;
  open_credit_card_statements_expected_total?: number;
  projected_total_income?: number;
  projected_total_expense?: number;
  projected_balance?: number;
  preset?: string | null;
  from?: string;
  to?: string;
}

/** Relatório empresarial (Fase 4) — resposta de GET /reports */
export interface FinancialEnterpriseReportDto {
  period: { from: string; to: string };
  previous_period: { from: string; to: string };
  general: {
    total_income: number;
    received_income: number;
    projected_subscription_income: number;
    total_income_potential: number;
    total_expense: number;
    expense_paid: number;
    expense_projected: number;
    expense_total_potential: number;
    total_profit: number;
    realized_profit: number;
    projected_result: number;
    transaction_income: number;
    transaction_expense: number;
    invoice_income: number;
    planned_recurring_expense: number;
    planned_credit_card: number;
    projected_total_expense: number;
    projected_balance: number;
    open_credit_card_statements_expected: number;
  };
  comparison: {
    total_income_pct: number | null;
    total_expense_pct: number | null;
    total_profit_pct: number | null;
  };
  previous_general: {
    total_income: number;
    total_expense: number;
    total_profit: number;
  };
  monthly: Array<{
    month: string;
    income: number;
    income_received: number;
    income_projected: number;
    income_projected_subscriptions: number;
    income_total_potential: number;
    expense: number;
    expense_paid: number;
    expense_projected: number;
    expense_total_potential: number;
    profit: number;
    realized_profit: number;
    projected_result: number;
    planned_recurring: number;
    planned_credit_card: number;
    projected_expense: number;
    projected_profit: number;
    subscription_revenue_realized: number;
    subscription_revenue_pending: number;
    subscription_revenue_projected: number;
  }>;
  /** Presente a partir da versão com projeção de assinaturas (migração 154 + backend actualizado). */
  subscriptions_projection?: {
    active_subscriptions_count: number;
    projected_subscription_revenue: number;
    pending_subscription_revenue: number;
    paid_subscription_revenue: number;
    projected_cycles_count: number;
    paid_cycles_count: number;
    pending_cycles_count: number;
    potential_subscription_revenue: number;
    cycles_read_used: boolean;
    by_month: Array<{
      month: string;
      subscription_revenue_realized: number;
      subscription_revenue_pending: number;
      subscription_revenue_projected: number;
    }>;
    rows: Array<{
      subscription_id: string;
      client_id: string | null;
      client_name: string;
      amount_recurring: number;
      billing_interval: string;
      periodicity_label_pt: string;
      next_billing_date: string;
      paid_cycles_in_period: number;
      pending_cycles_in_period: number;
      projected_revenue_in_period: number;
      status: string;
      cycles_unlimited: boolean;
      max_cycles: number | null;
    }>;
  };
  by_account: Array<{
    account_id: string;
    name: string;
    income: number;
    expense: number;
    net: number;
    estimated_balance: number;
  }>;
  expenses_by_category: Array<{ category_id: string | null; name: string; amount: number }>;
  income_by_category: Array<{ category_id: string | null; name: string; amount: number }>;
  billing_by_client: Array<{ client_id: string; client_name: string; invoice_count: number; amount: number }>;
  credit_cards: Array<{
    id: string;
    name: string;
    type: string;
    limit: number | null;
    used: number;
    next_due: string | null;
    next_expected: number | null;
  }>;
  credit_card_bank_payments: number;
  recurring_snapshot: {
    due_in_period_still_open: number;
    paid_in_period: number;
  };
  preset?: string | null;
}

export type RecurringPeriodicityDto =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export interface FinancialRecurringExpenseDto {
  id: string;
  tenant_id: string;
  description: string;
  amount_cents: number;
  category_id: string;
  default_account_id: string;
  periodicity: RecurringPeriodicityDto;
  due_day: number;
  start_date: string;
  end_date: string | null;
  schedule_type: "infinite" | "finite";
  max_occurrences: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RecurringOccurrenceStatusDto = "planned" | "pending" | "paid" | "cancelled";

export type CreditCardTypeDto = "personal" | "business";

export interface FinancialCreditCardDto {
  id: string;
  tenant_id: string;
  name: string;
  type: CreditCardTypeDto;
  limit_cents: number | null;
  closing_day: number;
  due_day: number;
  default_payment_account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  used_cents?: number;
  next_statement_due_date?: string | null;
  next_statement_expected_cents?: number | null;
}

export type CreditCardPurchaseAmountModeDto = "total" | "installment";

export interface FinancialCreditCardPurchaseDto {
  id: string;
  tenant_id: string;
  credit_card_id: string;
  category_id: string | null;
  description: string;
  purchase_date: string;
  total_amount_cents: number;
  installments_count: number;
  amount_mode?: CreditCardPurchaseAmountModeDto;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CcInstallmentStatusDto = "planned" | "paid" | "cancelled";

export interface FinancialCreditCardInstallmentDto {
  id: string;
  tenant_id: string;
  credit_card_id: string;
  purchase_id: string;
  category_id: string | null;
  description: string;
  installment_number: number;
  installments_count: number;
  amount_cents: number;
  statement_month: string;
  due_date: string;
  status: CcInstallmentStatusDto;
  financial_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  purchase_description?: string;
  purchase_date?: string;
}

export type CcStatementStatusDto = "open" | "closed" | "paid";

export interface FinancialCreditCardStatementDto {
  id: string;
  tenant_id: string;
  credit_card_id: string;
  statement_month: string;
  closing_date: string;
  due_date: string;
  expected_amount_cents: number;
  manual_amount_cents: number | null;
  difference_amount_cents: number | null;
  status: CcStatementStatusDto;
  paid_at: string | null;
  payment_account_id: string | null;
  payment_transaction_id: string | null;
  payment_extra_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  card_name?: string;
}

export interface FinancialRecurringOccurrenceDto {
  id: string;
  recurring_expense_id: string;
  tenant_id: string;
  account_id: string;
  category_id: string | null;
  due_date: string;
  amount_cents: number;
  status: RecurringOccurrenceStatusDto;
  paid_at: string | null;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PayableSourceDto = "expense_transaction" | "recurring_occurrence";

export type PayableOperationalStatusDto =
  | "forecast"
  | "open"
  | "due_today"
  | "overdue"
  | "paid"
  | "cancelled";

export interface FinancialPayableItemDto {
  source: PayableSourceDto;
  id: string;
  description: string;
  amount_cents: number;
  due_date: string;
  category_id: string | null;
  category_name: string | null;
  operational_status: PayableOperationalStatusDto;
  is_recurring: boolean;
  recurring_expense_id: string | null;
  recurrence_title: string | null;
  payment_account_id: string | null;
  payment_account_name: string | null;
  transaction_id: string | null;
  paid_at: string | null;
  raw_occurrence_status: string | null;
  raw_transaction_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialPayablesSummaryDto {
  due_today_cents: number;
  due_today_count: number;
  due_week_cents: number;
  due_week_count: number;
  pending_not_paid_cents: number;
  pending_not_paid_count: number;
  recurring_active_rules_count: number;
  paid_in_period_cents: number;
  paid_in_period_count: number;
  total_outstanding_cents: number;
  week_start: string;
  week_end: string;
}

export interface FinancialPayablesListDto {
  period: { from: string; to: string };
  summary: FinancialPayablesSummaryDto;
  items: FinancialPayableItemDto[];
}

export const financialService = {
  async getSummary(params?: { from?: string; to?: string; preset?: string }): Promise<FinancialSummaryDto> {
    const r = await apiClient.get<FinancialSummaryDto>(`${BASE}/summary${qs(params ?? {})}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Resumo indisponível");
    return r.data;
  },

  async getEnterpriseReport(params?: {
    from?: string;
    to?: string;
    preset?: string;
  }): Promise<FinancialEnterpriseReportDto> {
    const r = await apiClient.get<FinancialEnterpriseReportDto>(`${BASE}/reports${qs(params ?? {})}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Relatório indisponível");
    return r.data;
  },

  async listAccounts(filters?: { account_scope?: FinancialAccountScope }): Promise<FinancialAccountDto[]> {
    const r = await apiClient.get<FinancialAccountDto[]>(
      `${BASE}/accounts${qs({ account_scope: filters?.account_scope })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createAccount(body: {
    name: string;
    type: FinancialAccountType;
    account_scope?: FinancialAccountScope;
    initial_balance_cents: number;
    initial_balance_date: string;
    is_active?: boolean;
  }): Promise<FinancialAccountDto> {
    const r = await apiClient.post<FinancialAccountDto>(`${BASE}/accounts`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao criar conta");
    return r.data;
  },

  async listTransactions(filters?: {
    type?: FinancialTransactionType;
    transaction_kind?: FinancialTransactionKind;
    status?: FinancialTransactionStatus;
    from?: string;
    to?: string;
    account_id?: string;
  }): Promise<FinancialTransactionDto[]> {
    const r = await apiClient.get<FinancialTransactionDto[]>(
      `${BASE}/transactions${qs({
        type: filters?.type,
        transaction_kind: filters?.transaction_kind,
        status: filters?.status,
        from: filters?.from,
        to: filters?.to,
        account_id: filters?.account_id,
      })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createTransaction(body: {
    account_id: string;
    type: FinancialTransactionType;
    amount_cents: number;
    description: string;
    category_id?: string | null;
    customer_id?: string | null;
    reference_name?: string | null;
    transaction_date: string;
    status?: FinancialTransactionStatus;
    transaction_kind?: FinancialTransactionKind;
  }): Promise<FinancialTransactionDto> {
    const r = await apiClient.post<FinancialTransactionDto>(`${BASE}/transactions`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao criar movimento");
    return r.data;
  },

  async getPayables(params?: {
    from?: string;
    to?: string;
    preset?: "today" | "week" | "month";
  }): Promise<FinancialPayablesListDto> {
    const r = await apiClient.get<FinancialPayablesListDto>(
      `${BASE}/payables${qs({
        from: params?.from,
        to: params?.to,
        preset: params?.preset,
      })}`
    );
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao carregar contas a pagar");
    return r.data;
  },

  /** Alias de `getPayables` — mesmo payload em `GET /accounts-payable`. */
  async getAccountsPayable(params?: {
    from?: string;
    to?: string;
    preset?: "today" | "week" | "month";
  }): Promise<FinancialPayablesListDto> {
    const r = await apiClient.get<FinancialPayablesListDto>(
      `${BASE}/accounts-payable${qs({
        from: params?.from,
        to: params?.to,
        preset: params?.preset,
      })}`
    );
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao carregar contas a pagar");
    return r.data;
  },

  async updateTransaction(
    id: string,
    body: Partial<{
      description: string;
      amount_cents: number;
      transaction_date: string;
      status: FinancialTransactionStatus;
      category_id: string | null;
      account_id: string;
    }>
  ): Promise<FinancialTransactionDto> {
    const r = await apiClient.patch<FinancialTransactionDto>(
      `${BASE}/transactions/${encodeURIComponent(id)}`,
      body
    );
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao actualizar movimento");
    return r.data;
  },

  async listTransfers(filters?: { account_id?: string; from?: string; to?: string }): Promise<FinancialTransferDto[]> {
    const r = await apiClient.get<FinancialTransferDto[]>(
      `${BASE}/transfers${qs({
        account_id: filters?.account_id,
        from: filters?.from,
        to: filters?.to,
      })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createTransfer(body: {
    from_account_id: string;
    to_account_id: string;
    amount_cents: number;
    transfer_date: string;
    description?: string | null;
  }): Promise<FinancialTransferDto> {
    const r = await apiClient.post<FinancialTransferDto>(`${BASE}/transfers`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao criar transferência");
    return r.data;
  },

  async listCategories(): Promise<ExpenseCategoryDto[]> {
    const r = await apiClient.get<ExpenseCategoryDto[]>(`${BASE}/categories`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createCategory(body: { name: string }): Promise<ExpenseCategoryDto> {
    const r = await apiClient.post<ExpenseCategoryDto>(`${BASE}/categories`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao criar categoria");
    return r.data;
  },

  async listRecurringExpenses(activeOnly?: boolean): Promise<FinancialRecurringExpenseDto[]> {
    const r = await apiClient.get<FinancialRecurringExpenseDto[]>(
      `${BASE}/recurring-expenses${qs({ active_only: activeOnly ? "true" : undefined })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createRecurringExpense(body: {
    description: string;
    amount_cents: number;
    category_id: string;
    default_account_id: string;
    periodicity: RecurringPeriodicityDto;
    due_day: number;
    start_date: string;
    end_date?: string | null;
    schedule_type: "infinite" | "finite";
    max_occurrences?: number | null;
    is_active?: boolean;
  }): Promise<FinancialRecurringExpenseDto> {
    const r = await apiClient.post<FinancialRecurringExpenseDto>(`${BASE}/recurring-expenses`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao criar");
    return r.data;
  },

  async updateRecurringExpense(
    id: string,
    body: Partial<{
      description: string;
      amount_cents: number;
      category_id: string;
      default_account_id: string;
      periodicity: RecurringPeriodicityDto;
      due_day: number;
      start_date: string;
      end_date: string | null;
      schedule_type: "infinite" | "finite";
      max_occurrences: number | null;
      is_active: boolean;
    }>
  ): Promise<FinancialRecurringExpenseDto> {
    const r = await apiClient.patch<FinancialRecurringExpenseDto>(
      `${BASE}/recurring-expenses/${encodeURIComponent(id)}`,
      body
    );
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao actualizar");
    return r.data;
  },

  async regenerateRecurringExpense(id: string): Promise<void> {
    const r = await apiClient.post<{ ok: boolean }>(
      `${BASE}/recurring-expenses/${encodeURIComponent(id)}/regenerate`,
      {}
    );
    if (r.error) throw new Error(r.error);
  },

  async listRecurringOccurrences(filters?: {
    from?: string;
    to?: string;
    recurring_expense_id?: string;
  }): Promise<FinancialRecurringOccurrenceDto[]> {
    const r = await apiClient.get<FinancialRecurringOccurrenceDto[]>(
      `${BASE}/recurring-expense-occurrences${qs({
        from: filters?.from,
        to: filters?.to,
        recurring_expense_id: filters?.recurring_expense_id,
      })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async payRecurringOccurrence(
    id: string,
    body: { account_id?: string; transaction_date?: string }
  ): Promise<{ occurrence: FinancialRecurringOccurrenceDto; transaction_id: string }> {
    const r = await apiClient.post<{ occurrence: FinancialRecurringOccurrenceDto; transaction_id: string }>(
      `${BASE}/recurring-expense-occurrences/${encodeURIComponent(id)}/pay`,
      body
    );
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao pagar");
    return r.data;
  },

  async listCreditCards(): Promise<FinancialCreditCardDto[]> {
    const r = await apiClient.get<FinancialCreditCardDto[]>(`${BASE}/credit-cards`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async getCreditCard(cardId: string): Promise<FinancialCreditCardDto> {
    const r = await apiClient.get<FinancialCreditCardDto>(`${BASE}/credit-cards/${encodeURIComponent(cardId)}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Cartão não encontrado");
    return r.data;
  },

  async createCreditCard(body: {
    name: string;
    type: CreditCardTypeDto;
    limit_cents?: number | null;
    closing_day: number;
    due_day: number;
    default_payment_account_id?: string | null;
    is_active?: boolean;
  }): Promise<FinancialCreditCardDto> {
    const r = await apiClient.post<FinancialCreditCardDto>(`${BASE}/credit-cards`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao criar cartão");
    return r.data;
  },

  async patchCreditCard(
    cardId: string,
    body: Partial<{
      name: string;
      type: CreditCardTypeDto;
      limit_cents: number | null;
      closing_day: number;
      due_day: number;
      default_payment_account_id: string | null;
      is_active: boolean;
    }>
  ): Promise<FinancialCreditCardDto> {
    const r = await apiClient.patch<FinancialCreditCardDto>(
      `${BASE}/credit-cards/${encodeURIComponent(cardId)}`,
      body
    );
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao actualizar");
    return r.data;
  },

  async listCreditCardPurchases(cardId?: string): Promise<FinancialCreditCardPurchaseDto[]> {
    const r = await apiClient.get<FinancialCreditCardPurchaseDto[]>(
      `${BASE}/credit-card-purchases${qs({ card_id: cardId })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async createCreditCardPurchase(body: {
    credit_card_id: string;
    category_id?: string | null;
    description: string;
    purchase_date: string;
    total_amount_cents: number;
    installments_count?: number;
    amount_mode?: CreditCardPurchaseAmountModeDto;
    notes?: string | null;
  }): Promise<{ purchase_id: string }> {
    const r = await apiClient.post<{ purchase_id: string }>(`${BASE}/credit-card-purchases`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao registar compra");
    return r.data;
  },

  async listCreditCardInstallments(filters?: {
    card_id?: string;
    from?: string;
    to?: string;
    status?: CcInstallmentStatusDto;
    statement_month?: string;
  }): Promise<FinancialCreditCardInstallmentDto[]> {
    const r = await apiClient.get<FinancialCreditCardInstallmentDto[]>(
      `${BASE}/credit-card-installments${qs({
        card_id: filters?.card_id,
        from: filters?.from,
        to: filters?.to,
        status: filters?.status,
        statement_month: filters?.statement_month,
      })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async listCreditCardStatements(filters?: {
    card_id?: string;
    from?: string;
    to?: string;
    status?: CcStatementStatusDto;
  }): Promise<FinancialCreditCardStatementDto[]> {
    const r = await apiClient.get<FinancialCreditCardStatementDto[]>(
      `${BASE}/credit-card-statements${qs({
        card_id: filters?.card_id,
        from: filters?.from,
        to: filters?.to,
        status: filters?.status,
      })}`
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },

  async getCreditCardStatement(statementId: string): Promise<{
    statement: FinancialCreditCardStatementDto & { card_name?: string };
    installments: FinancialCreditCardInstallmentDto[];
  }> {
    const r = await apiClient.get<{
      statement: FinancialCreditCardStatementDto & { card_name?: string };
      installments: FinancialCreditCardInstallmentDto[];
    }>(`${BASE}/credit-card-statements/${encodeURIComponent(statementId)}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Fatura não encontrada");
    return r.data;
  },

  async payCreditCardStatement(
    statementId: string,
    body: {
      payment_account_id: string;
      paid_at?: string | null;
      manual_amount_cents?: number | null;
    }
  ): Promise<{ payment_transaction_id: string; payment_extra_transaction_id: string | null }> {
    const r = await apiClient.post<{
      payment_transaction_id: string;
      payment_extra_transaction_id: string | null;
    }>(`${BASE}/credit-card-statements/${encodeURIComponent(statementId)}/pay`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error("Erro ao pagar fatura");
    return r.data;
  },
};
