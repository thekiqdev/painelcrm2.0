/**
 * API /api/financial — modelo unificado (financial_* + expense_categories).
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  createFinancialAccount,
  listFinancialAccounts,
  getAccountBalanceCents,
  type FinancialAccountScope,
  type FinancialAccountType,
} from '../services/financialAccountsService.js';
import {
  createFinancialTransaction,
  listFinancialTransactions,
  type FinancialTransactionKind,
  type FinancialTransactionStatus,
  type FinancialTransactionType,
} from '../services/financialTransactionsService.js';
import { createExpenseCategory, listExpenseCategories } from '../services/expenseCategoriesService.js';
import { getFinancialSummary } from '../services/financialSummaryService.js';
import {
  createRecurringExpense,
  listOccurrences,
  listRecurringExpenses,
  payRecurringExpenseOccurrence,
  regenerateOccurrences,
  updateRecurringExpense,
} from '../services/financialRecurringExpenseService.js';
import type { RecurringPeriodicity } from '../services/financialRecurringDateUtils.js';
import {
  createCreditCard,
  createCreditCardPurchase,
  getCreditCard,
  getCreditCardStatementDetail,
  listCreditCards,
  listCreditCardInstallments,
  listCreditCardPurchases,
  listCreditCardStatements,
  payCreditCardStatement,
  updateCreditCard,
} from '../services/financialCreditCardService.js';
import type { InstallmentStatus, StatementStatus } from '../services/financialCreditCardService.js';
import { getFinancialEnterpriseReport } from '../services/financialReportsService.js';
import { createFinancialTransfer, listFinancialTransfers } from '../services/financialTransfersService.js';

const accountTypeSchema = z.enum(['bank', 'cash', 'wallet']);
const accountScopeSchema = z.enum(['business', 'personal']);
const transactionTypeSchema = z.enum(['income', 'expense']);
const transactionKindSchema = z.enum(['regular', 'transfer']);
const transactionStatusSchema = z.enum(['pending', 'completed']);

const createAccountBody = z.object({
  name: z.string().min(1),
  type: accountTypeSchema,
  account_scope: accountScopeSchema.optional(),
  initial_balance_cents: z.number().int(),
  initial_balance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_active: z.boolean().optional(),
});

const createTransactionBody = z.object({
  account_id: z.string().uuid(),
  type: transactionTypeSchema,
  transaction_kind: transactionKindSchema.optional(),
  amount_cents: z.number().int().nonnegative(),
  description: z.string().min(1),
  category_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  reference_name: z.string().nullable().optional(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: transactionStatusSchema.optional(),
});

const createTransferBody = z.object({
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  transfer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().nullable().optional(),
});

const createCategoryBody = z.object({
  name: z.string().min(1),
});

const periodicitySchema = z.enum([
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
]);
const scheduleTypeSchema = z.enum(['infinite', 'finite']);

const createRecurringBody = z
  .object({
    description: z.string().min(1),
    amount_cents: z.number().int().nonnegative(),
    category_id: z.string().uuid(),
    default_account_id: z.string().uuid(),
    periodicity: periodicitySchema,
    due_day: z.number().int().min(1).max(31),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    schedule_type: scheduleTypeSchema,
    max_occurrences: z.number().int().positive().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.schedule_type === 'finite' && (data.max_occurrences == null || data.max_occurrences < 1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'max_occurrences obrigatório para tipo finito' });
    }
    const w = data.periodicity === 'weekly' || data.periodicity === 'biweekly';
    if (w && (data.due_day < 1 || data.due_day > 7)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Para periodicidade semanal/quinzenal use dia 1–7 (1=segunda … 7=domingo)' });
    }
    if (!w && (data.due_day < 1 || data.due_day > 31)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Para esta periodicidade use dia do mês 1–31' });
    }
  });

const patchRecurringBody = z.object({
  description: z.string().min(1).optional(),
  amount_cents: z.number().int().nonnegative().optional(),
  category_id: z.string().uuid().optional(),
  default_account_id: z.string().uuid().optional(),
  periodicity: periodicitySchema.optional(),
  due_day: z.number().int().min(1).max(31).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  schedule_type: scheduleTypeSchema.optional(),
  max_occurrences: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

const payOccurrenceBody = z.object({
  account_id: z.string().uuid().optional(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const creditCardTypeSchema = z.enum(['personal', 'business']);
const createCreditCardBody = z.object({
  name: z.string().min(1),
  type: creditCardTypeSchema,
  limit_cents: z.number().int().nonnegative().nullable().optional(),
  closing_day: z.number().int().min(1).max(31),
  due_day: z.number().int().min(1).max(31),
  default_payment_account_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});
const patchCreditCardBody = z.object({
  name: z.string().min(1).optional(),
  type: creditCardTypeSchema.optional(),
  limit_cents: z.number().int().nonnegative().nullable().optional(),
  closing_day: z.number().int().min(1).max(31).optional(),
  due_day: z.number().int().min(1).max(31).optional(),
  default_payment_account_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});
const purchaseAmountModeSchema = z.enum(['total', 'installment']);
const createCreditCardPurchaseBody = z.object({
  credit_card_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_amount_cents: z.number().int().nonnegative(),
  installments_count: z.number().int().min(1).max(120).optional(),
  amount_mode: purchaseAmountModeSchema.optional(),
  notes: z.string().nullable().optional(),
});
const payCreditCardStatementBody = z.object({
  payment_account_id: z.string().uuid(),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  manual_amount_cents: z.number().int().nonnegative().nullable().optional(),
});

export function resolveSummaryRange(q: Record<string, unknown>): { from: string; to: string; preset?: string } {
  const preset = typeof q.preset === 'string' ? q.preset.trim() : '';
  const now = new Date();
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  const d0 = now.getUTCDate();
  if (preset === 'current_month') {
    const from = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
    const to = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to, preset };
  }
  if (preset === 'last_month') {
    let yy = y;
    let mm = m0 - 1;
    if (mm < 0) {
      yy -= 1;
      mm = 11;
    }
    const from = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const to = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to, preset };
  }
  if (preset === 'ytd') {
    const from = `${y}-01-01`;
    const to = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d0).padStart(2, '0')}`;
    return { from, to, preset };
  }
  if (preset === 'full_year' || preset === 'current_year') {
    const from = `${y}-01-01`;
    const to = `${y}-12-31`;
    return { from, to, preset };
  }
  if (preset === 'next_month') {
    let yy = y;
    let mm = m0 + 1;
    if (mm > 11) {
      yy += 1;
      mm = 0;
    }
    const from = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const to = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to, preset };
  }
  const yDefault = new Date().getUTCFullYear();
  const from =
    typeof q.from === 'string' && q.from.trim()
      ? q.from.trim()
      : `${yDefault}-01-01`;
  let to =
    typeof q.to === 'string' && q.to.trim()
      ? q.to.trim()
      : undefined;
  if (!to) {
    const yFrom = parseInt(from.slice(0, 4), 10);
    to = `${yFrom}-12-31`;
  }
  return { from, to, preset: preset || undefined };
}

function tenantOr401(req: AuthRequest, res: Response): string | null {
  const tenantId = req.tenantId ?? null;
  if (!tenantId) {
    res.status(401).json({ error: 'Tenant não identificado' });
    return null;
  }
  return tenantId;
}

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

export async function listFinancialAccountsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const scope =
    req.query.account_scope === 'business' || req.query.account_scope === 'personal'
      ? (req.query.account_scope as FinancialAccountScope)
      : undefined;
  try {
    const rows = await listFinancialAccounts(tenantId, { account_scope: scope });
    const withBalance = await Promise.all(
      rows.map(async (a) => {
        const bal = await getAccountBalanceCents(tenantId, a.id);
        return {
          ...a,
          balance: centsToReais(bal ?? a.initial_balance_cents),
        };
      })
    );
    res.json(withBalance);
  } catch (e) {
    console.error('[financial] listFinancialAccountsHandler', e);
    res.status(500).json({ error: 'Erro ao listar contas' });
  }
}

export async function createFinancialAccountHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const parsed = createAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await createFinancialAccount(tenantId, {
      name: parsed.data.name,
      type: parsed.data.type as FinancialAccountType,
      account_scope: parsed.data.account_scope as FinancialAccountScope | undefined,
      initial_balance_cents: parsed.data.initial_balance_cents,
      initial_balance_date: parsed.data.initial_balance_date,
      is_active: parsed.data.is_active,
    });
    const bal = await getAccountBalanceCents(tenantId, row.id);
    res.status(201).json({
      ...row,
      balance: centsToReais(bal ?? row.initial_balance_cents),
    });
  } catch (e) {
    console.error('[financial] createFinancialAccountHandler', e);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
}

export async function listFinancialTransactionsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const q = req.query;
  const type =
    q.type === 'income' || q.type === 'expense' ? (q.type as FinancialTransactionType) : undefined;
  const transaction_kind =
    q.transaction_kind === 'regular' || q.transaction_kind === 'transfer'
      ? (q.transaction_kind as FinancialTransactionKind)
      : undefined;
  const status =
    q.status === 'pending' || q.status === 'completed'
      ? (q.status as FinancialTransactionStatus)
      : undefined;
  const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : undefined;
  const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : undefined;
  const account_id = typeof q.account_id === 'string' && q.account_id.trim() ? q.account_id.trim() : undefined;
  try {
    const rows = await listFinancialTransactions(tenantId, { type, transaction_kind, status, from, to, account_id });
    res.json(rows);
  } catch (e) {
    console.error('[financial] listFinancialTransactionsHandler', e);
    res.status(500).json({ error: 'Erro ao listar movimentos' });
  }
}

export async function createFinancialTransactionHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const parsed = createTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await createFinancialTransaction(tenantId, {
      account_id: parsed.data.account_id,
      type: parsed.data.type as FinancialTransactionType,
      amount_cents: parsed.data.amount_cents,
      description: parsed.data.description,
      category_id: parsed.data.category_id ?? null,
      customer_id: parsed.data.customer_id ?? null,
      reference_name: parsed.data.reference_name ?? null,
      transaction_date: parsed.data.transaction_date,
      status: parsed.data.status,
      transaction_kind: parsed.data.transaction_kind as FinancialTransactionKind | undefined,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('não encontrada') || msg.includes('inválid')) {
      res.status(400).json({ error: msg || 'Dados inválidos' });
      return;
    }
    console.error('[financial] createFinancialTransactionHandler', e);
    res.status(500).json({ error: 'Erro ao criar movimento' });
  }
}

export async function createFinancialTransferHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const parsed = createTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await createFinancialTransfer(tenantId, {
      from_account_id: parsed.data.from_account_id,
      to_account_id: parsed.data.to_account_id,
      amount_cents: parsed.data.amount_cents,
      transfer_date: parsed.data.transfer_date,
      description: parsed.data.description ?? null,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('inválida') || msg.includes('diferentes') || msg.includes('maior que zero')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] createFinancialTransferHandler', e);
    res.status(500).json({ error: 'Erro ao criar transferência' });
  }
}

export async function listFinancialTransfersHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const account_id = typeof req.query.account_id === 'string' ? req.query.account_id.trim() : undefined;
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;
  try {
    const rows = await listFinancialTransfers(tenantId, {
      account_id: account_id || null,
      from: from || null,
      to: to || null,
    });
    res.json(rows);
  } catch (e) {
    console.error('[financial] listFinancialTransfersHandler', e);
    res.status(500).json({ error: 'Erro ao listar transferências' });
  }
}

export async function listExpenseCategoriesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  try {
    const rows = await listExpenseCategories(tenantId);
    res.json(rows);
  } catch (e) {
    console.error('[financial] listExpenseCategoriesHandler', e);
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
}

export async function createExpenseCategoryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const parsed = createCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await createExpenseCategory(tenantId, parsed.data.name);
    res.status(201).json(row);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '23505') {
      res.status(409).json({ error: 'Já existe uma categoria com esse nome' });
      return;
    }
    console.error('[financial] createExpenseCategoryHandler', e);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
}

export async function getFinancialSummaryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const q = req.query as Record<string, unknown>;
  try {
    const { from, to, preset } = resolveSummaryRange(q);
    const summary = await getFinancialSummary(tenantId, { from, to });
    res.json({
      total_income: summary.total_income,
      total_expense: summary.total_expense,
      total_profit: summary.total_profit,
      accounts: summary.accounts,
      monthly: summary.monthly,
      transaction_income: summary.transaction_income,
      transaction_expense: summary.transaction_expense,
      invoice_income: summary.invoice_income,
      planned_recurring_expense_total: summary.planned_recurring_expense_total,
      planned_credit_card_installments_total: summary.planned_credit_card_installments_total,
      open_credit_card_statements_expected_total: summary.open_credit_card_statements_expected_total,
      projected_total_income: summary.projected_total_income,
      projected_total_expense: summary.projected_total_expense,
      projected_balance: summary.projected_balance,
      preset: preset ?? null,
      from,
      to,
    });
  } catch (e) {
    console.error('[financial] getFinancialSummaryHandler', e);
    res.status(500).json({ error: 'Erro ao carregar resumo' });
  }
}

export async function listRecurringExpensesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const activeOnly = req.query.active_only === 'true' || req.query.active_only === '1';
  try {
    const rows = await listRecurringExpenses(tenantId, activeOnly);
    res.json(rows);
  } catch (e) {
    console.error('[financial] listRecurringExpensesHandler', e);
    res.status(500).json({ error: 'Erro ao listar despesas recorrentes' });
  }
}

export async function createRecurringExpenseHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const parsed = createRecurringBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await createRecurringExpense(tenantId, {
      ...parsed.data,
      periodicity: parsed.data.periodicity as RecurringPeriodicity,
      end_date: parsed.data.end_date ?? null,
      max_occurrences: parsed.data.max_occurrences ?? null,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('inválid')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] createRecurringExpenseHandler', e);
    res.status(500).json({ error: 'Erro ao criar despesa recorrente' });
  }
}

export async function updateRecurringExpenseHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const id = req.params.recurringId;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = patchRecurringBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await updateRecurringExpense(tenantId, id, {
      ...parsed.data,
      periodicity: parsed.data.periodicity as RecurringPeriodicity | undefined,
    });
    if (!row) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json(row);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('inválid') || msg.includes('finitas')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] updateRecurringExpenseHandler', e);
    res.status(500).json({ error: 'Erro ao atualizar' });
  }
}

export async function regenerateRecurringHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const id = req.params.recurringId;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    await regenerateOccurrences(tenantId, id);
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('não encontrada')) {
      res.status(404).json({ error: msg });
      return;
    }
    console.error('[financial] regenerateRecurringHandler', e);
    res.status(500).json({ error: 'Erro ao regenerar ocorrências' });
  }
}

export async function listRecurringOccurrencesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const q = req.query;
  const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : undefined;
  const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : undefined;
  const recurring_expense_id =
    typeof q.recurring_expense_id === 'string' && q.recurring_expense_id.trim()
      ? q.recurring_expense_id.trim()
      : undefined;
  try {
    const rows = await listOccurrences(tenantId, { from, to, recurring_expense_id });
    res.json(rows);
  } catch (e) {
    console.error('[financial] listRecurringOccurrencesHandler', e);
    res.status(500).json({ error: 'Erro ao listar ocorrências' });
  }
}

export async function payRecurringOccurrenceHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const id = req.params.occurrenceId;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = payOccurrenceBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const out = await payRecurringExpenseOccurrence(tenantId, id, parsed.data);
    res.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('não encontrada') || msg.includes('Já está') || msg.includes('cancelada') || msg.includes('vinculada')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] payRecurringOccurrenceHandler', e);
    res.status(500).json({ error: 'Erro ao registar pagamento' });
  }
}

export async function listCreditCardsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  try {
    const rows = await listCreditCards(tenantId);
    res.json(rows);
  } catch (e) {
    console.error('[financial] listCreditCardsHandler', e);
    res.status(500).json({ error: 'Erro ao listar cartões' });
  }
}

export async function getCreditCardHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const id = req.params.cardId;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    const row = await getCreditCard(tenantId, id);
    if (!row) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json(row);
  } catch (e) {
    console.error('[financial] getCreditCardHandler', e);
    res.status(500).json({ error: 'Erro ao carregar cartão' });
  }
}

export async function createCreditCardHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const parsed = createCreditCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await createCreditCard(tenantId, parsed.data);
    res.status(201).json(row);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('inválida')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] createCreditCardHandler', e);
    res.status(500).json({ error: 'Erro ao criar cartão' });
  }
}

export async function patchCreditCardHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const id = req.params.cardId;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = patchCreditCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const row = await updateCreditCard(tenantId, id, parsed.data);
    if (!row) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json(row);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('inválida')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] patchCreditCardHandler', e);
    res.status(500).json({ error: 'Erro ao actualizar cartão' });
  }
}

export async function listCreditCardPurchasesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const q = req.query;
  const credit_card_id =
    typeof q.credit_card_id === 'string' && q.credit_card_id.trim()
      ? q.credit_card_id.trim()
      : typeof q.card_id === 'string' && q.card_id.trim()
        ? q.card_id.trim()
        : undefined;
  try {
    const rows = await listCreditCardPurchases(tenantId, credit_card_id ?? null);
    res.json(rows);
  } catch (e) {
    console.error('[financial] listCreditCardPurchasesHandler', e);
    res.status(500).json({ error: 'Erro ao listar compras' });
  }
}

export async function createCreditCardPurchaseHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const parsed = createCreditCardPurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const out = await createCreditCardPurchase(tenantId, {
      ...parsed.data,
      installments_count: parsed.data.installments_count ?? 1,
      amount_mode: parsed.data.amount_mode,
    });
    res.status(201).json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('não encontrado') || msg.includes('inválida')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] createCreditCardPurchaseHandler', e);
    res.status(500).json({ error: 'Erro ao registar compra' });
  }
}

export async function listCreditCardInstallmentsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const q = req.query;
  const credit_card_id =
    typeof q.credit_card_id === 'string' && q.credit_card_id.trim()
      ? q.credit_card_id.trim()
      : typeof q.card_id === 'string' && q.card_id.trim()
        ? q.card_id.trim()
        : undefined;
  const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : undefined;
  const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : undefined;
  const statement_month =
    typeof q.statement_month === 'string' && q.statement_month.trim() ? q.statement_month.trim() : undefined;
  const status =
    q.status === 'planned' || q.status === 'paid' || q.status === 'cancelled'
      ? (q.status as InstallmentStatus)
      : undefined;
  try {
    const rows = await listCreditCardInstallments(tenantId, {
      credit_card_id: credit_card_id ?? null,
      from: from ?? null,
      to: to ?? null,
      status: status ?? null,
      statement_month: statement_month ?? null,
    });
    res.json(rows);
  } catch (e) {
    console.error('[financial] listCreditCardInstallmentsHandler', e);
    res.status(500).json({ error: 'Erro ao listar parcelas' });
  }
}

export async function listCreditCardStatementsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const q = req.query;
  const credit_card_id =
    typeof q.credit_card_id === 'string' && q.credit_card_id.trim()
      ? q.credit_card_id.trim()
      : typeof q.card_id === 'string' && q.card_id.trim()
        ? q.card_id.trim()
        : undefined;
  const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : undefined;
  const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : undefined;
  const status =
    q.status === 'open' || q.status === 'closed' || q.status === 'paid'
      ? (q.status as StatementStatus)
      : undefined;
  try {
    const rows = await listCreditCardStatements(tenantId, {
      credit_card_id: credit_card_id ?? null,
      from: from ?? null,
      to: to ?? null,
      status: status ?? null,
    });
    res.json(rows);
  } catch (e) {
    console.error('[financial] listCreditCardStatementsHandler', e);
    res.status(500).json({ error: 'Erro ao listar faturas do cartão' });
  }
}

export async function getCreditCardStatementHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const id = req.params.statementId;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    const detail = await getCreditCardStatementDetail(tenantId, id);
    if (!detail) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json(detail);
  } catch (e) {
    console.error('[financial] getCreditCardStatementHandler', e);
    res.status(500).json({ error: 'Erro ao carregar fatura' });
  }
}

export async function payCreditCardStatementHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const id = req.params.statementId;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = payCreditCardStatementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const out = await payCreditCardStatement(tenantId, id, parsed.data);
    res.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('não encontrada') || msg.includes('já paga') || msg.includes('inválida') || msg.includes('em falta')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financial] payCreditCardStatementHandler', e);
    res.status(500).json({ error: 'Erro ao pagar fatura' });
  }
}

export async function getFinancialReportsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  const q = req.query as Record<string, unknown>;
  try {
    const { from, to, preset } = resolveSummaryRange(q);
    const report = await getFinancialEnterpriseReport(tenantId, { from, to });
    res.json({ ...report, preset: preset ?? null });
  } catch (e) {
    console.error('[financial] getFinancialReportsHandler', e);
    res.status(500).json({ error: 'Erro ao gerar relatórios' });
  }
}
