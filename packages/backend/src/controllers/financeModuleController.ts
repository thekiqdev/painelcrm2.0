import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountBalanceCents,
  getAccountPeriodStats,
  getAccountLedger,
  listExpenseCategories,
  createExpenseCategory,
  listIncomeEntries,
  createIncomeEntry,
  updateIncomeEntry,
  deleteIncomeEntry,
  listExpenseEntries,
  createExpenseEntry,
  updateExpenseEntry,
  deleteExpenseEntry,
  type FinanceExpenseStatus,
} from '../services/financeModuleService.js';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';

function respondPerm(res: Response, e: unknown): boolean {
  if (e instanceof ModulePermissionError) {
    res.status(e.statusCode).json({ error: e.message });
    return true;
  }
  return false;
}

const accountTypeSchema = z.enum(['bank', 'cash', 'wallet', 'digital']);
const expenseStatusSchema = z.enum(['expected', 'pending', 'paid', 'overdue', 'cancelled']);

const createAccountBody = z.object({
  name: z.string().min(1),
  account_type: accountTypeSchema,
  opening_balance_cents: z.number().int(),
  opening_balance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const patchAccountBody = createAccountBody.partial();

const createCategoryBody = z.object({
  name: z.string().min(1),
  sort_order: z.number().int().optional(),
});

const createIncomeBody = z.object({
  finance_account_id: z.string().uuid(),
  amount_cents: z.number().int().nonnegative(),
  received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  client_id: z.string().uuid().nullable().optional(),
  manual_payee_name: z.string().nullable().optional(),
  category_tag: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createExpenseFields = z.object({
  finance_account_id: z.string().uuid().nullable().optional(),
  financial_account_id: z.string().uuid().optional(),
  category_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().nonnegative(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  description: z.string().min(1),
  status: expenseStatusSchema,
  project_id: z.string().uuid().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createExpenseBody = createExpenseFields.superRefine((data, ctx) => {
  if (data.project_id && !data.financial_account_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Conta financeira de saída é obrigatória para despesas do projeto',
      path: ['financial_account_id'],
    });
  }
});

const patchExpenseBody = createExpenseFields.partial();

function tenantOr401(req: AuthRequest, res: Response): string | null {
  const tenantId = req.tenantId ?? null;
  if (!tenantId) {
    res.status(401).json({ error: 'Empresa não identificada' });
    return null;
  }
  return tenantId;
}

export async function listFinanceAccountsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.view', req);
    const rows = await listAccounts(tenantId);
    const withBalance = await Promise.all(
      rows.map(async (a) => {
        const balance = await getAccountBalanceCents(tenantId, a.id);
        return { ...a, current_balance_cents: balance ?? a.opening_balance_cents };
      })
    );
    res.json(withBalance);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] listFinanceAccountsHandler', e);
    res.status(500).json({ error: 'Erro ao listar contas' });
  }
}

export async function getFinanceAccountHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.view', req);
    const acc = await getAccount(tenantId, req.params.accountId);
    if (!acc) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    const balance = await getAccountBalanceCents(tenantId, acc.id);
    res.json({ ...acc, current_balance_cents: balance ?? acc.opening_balance_cents });
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] getFinanceAccountHandler', e);
    res.status(500).json({ error: 'Erro ao carregar conta' });
  }
}

export async function getFinanceAccountLedgerHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.view_revenue', req);
    const { from, to, limit } = req.query;
    const lim = typeof limit === 'string' ? Math.min(500, Math.max(1, parseInt(limit, 10) || 200)) : 200;
    const rows = await getAccountLedger(
      tenantId,
      req.params.accountId,
      typeof from === 'string' ? from : null,
      typeof to === 'string' ? to : null,
      lim
    );
    res.json(rows);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] getFinanceAccountLedgerHandler', e);
    res.status(500).json({ error: 'Erro ao carregar extrato' });
  }
}

export async function getFinanceAccountPeriodHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.view_revenue', req);
    const { from, to } = req.query;
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'Informe from e to (YYYY-MM-DD)' });
      return;
    }
    const stats = await getAccountPeriodStats(tenantId, req.params.accountId, from, to);
    res.json(stats);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] getFinanceAccountPeriodHandler', e);
    res.status(500).json({ error: 'Erro ao calcular período' });
  }
}

export async function createFinanceAccountHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const parsed = createAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await assertModulePermission(req.userId, 'finance', 'create', undefined, req);
    const row = await createAccount(tenantId, parsed.data);
    res.status(201).json(row);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] createFinanceAccountHandler', e);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
}

export async function patchFinanceAccountHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const parsed = patchAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await assertModulePermission(req.userId, 'finance', 'edit', undefined, req);
    const row = await updateAccount(tenantId, req.params.accountId, parsed.data as Parameters<typeof updateAccount>[2]);
    if (!row) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    res.json(row);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] patchFinanceAccountHandler', e);
    res.status(500).json({ error: 'Erro ao atualizar conta' });
  }
}

export async function deleteFinanceAccountHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertModulePermission(req.userId, 'finance', 'delete', undefined, req);
    const ok = await deleteAccount(tenantId, req.params.accountId);
    if (!ok) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    res.status(204).end();
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('foreign key') || msg.includes('violates')) {
      res.status(409).json({ error: 'Não é possível excluir: existem lançamentos vinculados.' });
      return;
    }
    console.error('[financeModule] deleteFinanceAccountHandler', e);
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
}

export async function listFinanceExpenseCategoriesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.view_expenses', req);
    const rows = await listExpenseCategories(tenantId);
    res.json(rows);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] listFinanceExpenseCategoriesHandler', e);
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
}

export async function createFinanceExpenseCategoryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const parsed = createCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.create_expense', req);
    const row = await createExpenseCategory(tenantId, parsed.data.name, parsed.data.sort_order);
    res.status(201).json(row);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      res.status(409).json({ error: 'Já existe uma categoria com esse nome' });
      return;
    }
    console.error('[financeModule] createFinanceExpenseCategoryHandler', e);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
}

export async function listFinanceIncomeEntriesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const { from, to, account_id } = req.query;
  try {
    await assertPermissionKey(req.userId, 'finance.view_revenue', req);
    const rows = await listIncomeEntries(tenantId, {
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
      account_id: typeof account_id === 'string' ? account_id : undefined,
    });
    res.json(rows);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] listFinanceIncomeEntriesHandler', e);
    res.status(500).json({ error: 'Erro ao listar entradas' });
  }
}

export async function createFinanceIncomeEntryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const parsed = createIncomeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await assertModulePermission(req.userId, 'finance', 'create', undefined, req);
    await assertPermissionKey(req.userId, 'finance.view_revenue', req);
    const row = await createIncomeEntry(tenantId, parsed.data);
    res.status(201).json(row);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('não encontrada')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financeModule] createFinanceIncomeEntryHandler', e);
    res.status(500).json({ error: 'Erro ao registrar entrada' });
  }
}

export async function patchFinanceIncomeEntryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const parsed = createIncomeBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await assertModulePermission(req.userId, 'finance', 'edit', undefined, req);
    await assertPermissionKey(req.userId, 'finance.view_revenue', req);
    const row = await updateIncomeEntry(tenantId, req.params.id, parsed.data);
    if (!row) {
      res.status(404).json({ error: 'Lançamento não encontrado' });
      return;
    }
    res.json(row);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('não encontrada')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financeModule] patchFinanceIncomeEntryHandler', e);
    res.status(500).json({ error: 'Erro ao atualizar entrada' });
  }
}

export async function deleteFinanceIncomeEntryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertModulePermission(req.userId, 'finance', 'delete', undefined, req);
    await assertPermissionKey(req.userId, 'finance.view_revenue', req);
    const ok = await deleteIncomeEntry(tenantId, req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Lançamento não encontrado' });
      return;
    }
    res.status(204).end();
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] deleteFinanceIncomeEntryHandler', e);
    res.status(500).json({ error: 'Erro ao excluir entrada' });
  }
}

export async function listFinanceExpenseEntriesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const { from, to, account_id, status, project_id } = req.query;
  try {
    await assertPermissionKey(req.userId, 'finance.view_expenses', req);
    const rows = await listExpenseEntries(tenantId, {
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
      account_id: typeof account_id === 'string' ? account_id : undefined,
      status: typeof status === 'string' ? status : undefined,
      project_id: typeof project_id === 'string' ? project_id : undefined,
    });
    res.json(rows);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] listFinanceExpenseEntriesHandler', e);
    res.status(500).json({ error: 'Erro ao listar despesas' });
  }
}

export async function createFinanceExpenseEntryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const parsed = createExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.create_expense', req);
    const row = await createExpenseEntry(tenantId, parsed.data);
    res.status(201).json(row);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('não pertence')) {
      res.status(403).json({ error: msg });
      return;
    }
    if (msg.includes('não encontrada') || msg.includes('inválida')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financeModule] createFinanceExpenseEntryHandler', e);
    res.status(500).json({ error: 'Erro ao registrar despesa' });
  }
}

export async function patchFinanceExpenseEntryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  const parsed = patchExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.edit_expense', req);
    const row = await updateExpenseEntry(tenantId, req.params.id, parsed.data as Partial<{
      finance_account_id: string | null;
      category_id: string | null;
      amount_cents: number;
      expense_date: string;
      due_date: string;
      paid_at: string | null;
      description: string;
      status: FinanceExpenseStatus;
      project_id: string | null;
      supplier_name: string | null;
      notes: string | null;
    }>);
    if (!row) {
      res.status(404).json({ error: 'Despesa não encontrada' });
      return;
    }
    res.json(row);
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('não pertence')) {
      res.status(403).json({ error: msg });
      return;
    }
    if (msg.includes('não encontrada') || msg.includes('inválida')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[financeModule] patchFinanceExpenseEntryHandler', e);
    res.status(500).json({ error: 'Erro ao atualizar despesa' });
  }
}

export async function deleteFinanceExpenseEntryHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = tenantOr401(req, res);
  if (!tenantId) return;
  if (!req.userId) {
    res.status(401).json({ error: 'Usuário não identificado' });
    return;
  }
  try {
    await assertPermissionKey(req.userId, 'finance.delete_expense', req);
    const ok = await deleteExpenseEntry(tenantId, req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Despesa não encontrada' });
      return;
    }
    res.status(204).end();
  } catch (e: unknown) {
    if (respondPerm(res, e)) return;
    console.error('[financeModule] deleteFinanceExpenseEntryHandler', e);
    res.status(500).json({ error: 'Erro ao excluir despesa' });
  }
}
