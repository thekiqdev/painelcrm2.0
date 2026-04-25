/**
 * Módulo financeiro profissional (Fase 1): contas, categorias, entradas e despesas.
 * Todos os métodos exigem tenantId explícito (camada de API valida tenant).
 */
import { pool } from '../utils/db.js';

export type FinanceAccountType = 'bank' | 'cash' | 'wallet' | 'digital';

export interface FinanceAccountRow {
  id: string;
  tenant_id: string;
  name: string;
  account_type: FinanceAccountType;
  opening_balance_cents: number;
  opening_balance_date: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceExpenseCategoryRow {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FinanceIncomeEntryRow {
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

export interface FinanceExpenseEntryRow {
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

const DEFAULT_CATEGORY_NAMES: { name: string; sort_order: number }[] = [
  { name: 'Aluguel', sort_order: 10 },
  { name: 'Energia', sort_order: 20 },
  { name: 'Água', sort_order: 30 },
  { name: 'Internet', sort_order: 40 },
  { name: 'Telefone', sort_order: 50 },
  { name: 'Salários', sort_order: 60 },
  { name: 'Pró-labore', sort_order: 70 },
  { name: 'Impostos', sort_order: 80 },
  { name: 'Marketing', sort_order: 90 },
  { name: 'Tráfego pago', sort_order: 100 },
  { name: 'Ferramentas/SaaS', sort_order: 110 },
  { name: 'Contabilidade', sort_order: 120 },
  { name: 'Fornecedores', sort_order: 130 },
  { name: 'Manutenção', sort_order: 140 },
  { name: 'Transporte', sort_order: 150 },
  { name: 'Alimentação', sort_order: 160 },
  { name: 'Empréstimos', sort_order: 170 },
  { name: 'Cartão de crédito', sort_order: 180 },
  { name: 'Outros', sort_order: 999 },
];

export async function ensureDefaultExpenseCategories(tenantId: string): Promise<void> {
  const client = await pool.connect();
  try {
    for (const row of DEFAULT_CATEGORY_NAMES) {
      await client.query(
        `INSERT INTO finance_expense_categories (tenant_id, name, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT finance_expense_categories_tenant_name_unique DO NOTHING`,
        [tenantId, row.name, row.sort_order]
      );
    }
  } finally {
    client.release();
  }
}

export async function listExpenseCategories(tenantId: string): Promise<FinanceExpenseCategoryRow[]> {
  await ensureDefaultExpenseCategories(tenantId);
  const r = await pool.query<FinanceExpenseCategoryRow>(
    `SELECT id, tenant_id, name, sort_order, created_at, updated_at
     FROM finance_expense_categories
     WHERE tenant_id = $1
     ORDER BY sort_order ASC, name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function createExpenseCategory(
  tenantId: string,
  name: string,
  sortOrder?: number
): Promise<FinanceExpenseCategoryRow> {
  const r = await pool.query<FinanceExpenseCategoryRow>(
    `INSERT INTO finance_expense_categories (tenant_id, name, sort_order)
     VALUES ($1, $2, COALESCE($3, 500))
     RETURNING id, tenant_id, name, sort_order, created_at, updated_at`,
    [tenantId, name.trim(), sortOrder ?? null]
  );
  return r.rows[0]!;
}

export async function listAccounts(tenantId: string): Promise<FinanceAccountRow[]> {
  const r = await pool.query<FinanceAccountRow>(
    `SELECT id, tenant_id, name, account_type, opening_balance_cents, opening_balance_date::text,
            description, is_active, created_at, updated_at
     FROM finance_accounts
     WHERE tenant_id = $1
     ORDER BY is_active DESC, name ASC`,
    [tenantId]
  );
  return r.rows.map((row) => ({
    ...row,
    opening_balance_cents: Number(row.opening_balance_cents),
  }));
}

export async function getAccount(tenantId: string, accountId: string): Promise<FinanceAccountRow | null> {
  const r = await pool.query<FinanceAccountRow>(
    `SELECT id, tenant_id, name, account_type, opening_balance_cents, opening_balance_date::text,
            description, is_active, created_at, updated_at
     FROM finance_accounts
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, accountId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  return { ...row, opening_balance_cents: Number(row.opening_balance_cents) };
}

export async function createAccount(
  tenantId: string,
  body: {
    name: string;
    account_type: FinanceAccountType;
    opening_balance_cents: number;
    opening_balance_date: string;
    description?: string | null;
    is_active?: boolean;
  }
): Promise<FinanceAccountRow> {
  const r = await pool.query<FinanceAccountRow>(
    `INSERT INTO finance_accounts (
       tenant_id, name, account_type, opening_balance_cents, opening_balance_date, description, is_active
     ) VALUES ($1, $2, $3, $4, $5::date, $6, COALESCE($7, true))
     RETURNING id, tenant_id, name, account_type, opening_balance_cents, opening_balance_date::text,
               description, is_active, created_at, updated_at`,
    [
      tenantId,
      body.name.trim(),
      body.account_type,
      body.opening_balance_cents,
      body.opening_balance_date,
      body.description ?? null,
      body.is_active,
    ]
  );
  const row = r.rows[0]!;
  return { ...row, opening_balance_cents: Number(row.opening_balance_cents) };
}

export async function updateAccount(
  tenantId: string,
  accountId: string,
  patch: Partial<{
    name: string;
    account_type: FinanceAccountType;
    opening_balance_cents: number;
    opening_balance_date: string;
    description: string | null;
    is_active: boolean;
  }>
): Promise<FinanceAccountRow | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    fields.push(`name = $${i++}`);
    params.push(patch.name.trim());
  }
  if (patch.account_type !== undefined) {
    fields.push(`account_type = $${i++}`);
    params.push(patch.account_type);
  }
  if (patch.opening_balance_cents !== undefined) {
    fields.push(`opening_balance_cents = $${i++}`);
    params.push(patch.opening_balance_cents);
  }
  if (patch.opening_balance_date !== undefined) {
    fields.push(`opening_balance_date = $${i++}::date`);
    params.push(patch.opening_balance_date);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${i++}`);
    params.push(patch.description);
  }
  if (patch.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    params.push(patch.is_active);
  }
  if (fields.length === 0) {
    return getAccount(tenantId, accountId);
  }
  const whereTenant = i;
  params.push(tenantId);
  const whereId = i + 1;
  params.push(accountId);
  const r = await pool.query<FinanceAccountRow>(
    `UPDATE finance_accounts SET ${fields.join(', ')}
     WHERE tenant_id = $${whereTenant} AND id = $${whereId}
     RETURNING id, tenant_id, name, account_type, opening_balance_cents, opening_balance_date::text,
               description, is_active, created_at, updated_at`,
    params
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  return { ...row, opening_balance_cents: Number(row.opening_balance_cents) };
}

export async function deleteAccount(tenantId: string, accountId: string): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM finance_accounts WHERE tenant_id = $1 AND id = $2`,
    [tenantId, accountId]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Saldo aproximado: saldo inicial + entradas − despesas pagas desde a data do saldo inicial. */
export async function getAccountBalanceCents(tenantId: string, accountId: string): Promise<number | null> {
  const acc = await getAccount(tenantId, accountId);
  if (!acc) return null;
  const inc = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM finance_income_entries
     WHERE tenant_id = $1 AND finance_account_id = $2 AND received_at >= $3::date`,
    [tenantId, accountId, acc.opening_balance_date]
  );
  const exp = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM finance_expense_entries
     WHERE tenant_id = $1 AND finance_account_id = $2 AND status = 'paid'
       AND COALESCE(paid_at, expense_date) >= $3::date`,
    [tenantId, accountId, acc.opening_balance_date]
  );
  const inSum = Number(inc.rows[0]?.s ?? 0);
  const outSum = Number(exp.rows[0]?.s ?? 0);
  return acc.opening_balance_cents + inSum - outSum;
}

export interface AccountPeriodStats {
  total_in_cents: number;
  total_out_cents: number;
}

export async function getAccountPeriodStats(
  tenantId: string,
  accountId: string,
  from: string,
  to: string
): Promise<AccountPeriodStats> {
  const inc = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM finance_income_entries
     WHERE tenant_id = $1 AND finance_account_id = $2
       AND received_at >= $3::date AND received_at <= $4::date`,
    [tenantId, accountId, from, to]
  );
  const exp = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM finance_expense_entries
     WHERE tenant_id = $1 AND finance_account_id = $2 AND status = 'paid'
       AND COALESCE(paid_at, expense_date) >= $3::date
       AND COALESCE(paid_at, expense_date) <= $4::date`,
    [tenantId, accountId, from, to]
  );
  return {
    total_in_cents: Number(inc.rows[0]?.s ?? 0),
    total_out_cents: Number(exp.rows[0]?.s ?? 0),
  };
}

export interface LedgerRow {
  kind: 'income' | 'expense';
  id: string;
  occurred_at: string;
  description: string;
  amount_cents: number;
  status?: string;
}

export async function getAccountLedger(
  tenantId: string,
  accountId: string,
  from?: string | null,
  to?: string | null,
  limit = 200
): Promise<LedgerRow[]> {
  const params: unknown[] = [tenantId, accountId];
  let dateFilterIncome = '';
  let dateFilterExpense = '';
  if (from) {
    params.push(from);
    dateFilterIncome += ` AND received_at >= $${params.length}::date`;
    dateFilterExpense += ` AND COALESCE(paid_at, expense_date) >= $${params.length}::date`;
  }
  if (to) {
    params.push(to);
    dateFilterIncome += ` AND received_at <= $${params.length}::date`;
    dateFilterExpense += ` AND COALESCE(paid_at, expense_date) <= $${params.length}::date`;
  }
  params.push(limit);
  const lim = params.length;
  const q = `
    SELECT * FROM (
      SELECT 'income'::text AS kind, id::text, received_at::text AS occurred_at, description,
             amount_cents, NULL::text AS status
      FROM finance_income_entries
      WHERE tenant_id = $1 AND finance_account_id = $2 ${dateFilterIncome}
      UNION ALL
      SELECT 'expense', id::text, COALESCE(paid_at, expense_date)::text, description,
             amount_cents, status
      FROM finance_expense_entries
      WHERE tenant_id = $1 AND finance_account_id = $2 ${dateFilterExpense}
    ) u
    ORDER BY occurred_at DESC NULLS LAST
    LIMIT $${lim}
  `;
  const r = await pool.query<LedgerRow>(q, params);
  return r.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents) }));
}

export async function listIncomeEntries(
  tenantId: string,
  filters: { from?: string; to?: string; account_id?: string }
): Promise<FinanceIncomeEntryRow[]> {
  let q = `SELECT id, tenant_id, finance_account_id, amount_cents, received_at::text, description,
                  client_id, manual_payee_name, category_tag, payment_method, notes, created_at, updated_at
           FROM finance_income_entries WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let n = 2;
  if (filters.from) {
    q += ` AND received_at >= $${n}::date`;
    params.push(filters.from);
    n++;
  }
  if (filters.to) {
    q += ` AND received_at <= $${n}::date`;
    params.push(filters.to);
    n++;
  }
  if (filters.account_id) {
    q += ` AND finance_account_id = $${n}`;
    params.push(filters.account_id);
    n++;
  }
  q += ` ORDER BY received_at DESC, created_at DESC LIMIT 500`;
  const r = await pool.query<FinanceIncomeEntryRow>(q, params);
  return r.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents) }));
}

export async function createIncomeEntry(
  tenantId: string,
  body: {
    finance_account_id: string;
    amount_cents: number;
    received_at: string;
    description: string;
    client_id?: string | null;
    manual_payee_name?: string | null;
    category_tag?: string | null;
    payment_method?: string | null;
    notes?: string | null;
  }
): Promise<FinanceIncomeEntryRow> {
  const acc = await getAccount(tenantId, body.finance_account_id);
  if (!acc) throw new Error('Conta não encontrada');
  const r = await pool.query<FinanceIncomeEntryRow>(
    `INSERT INTO finance_income_entries (
       tenant_id, finance_account_id, amount_cents, received_at, description,
       client_id, manual_payee_name, category_tag, payment_method, notes
     ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)
     RETURNING id, tenant_id, finance_account_id, amount_cents, received_at::text, description,
               client_id, manual_payee_name, category_tag, payment_method, notes, created_at, updated_at`,
    [
      tenantId,
      body.finance_account_id,
      body.amount_cents,
      body.received_at,
      body.description.trim(),
      body.client_id ?? null,
      body.manual_payee_name?.trim() || null,
      body.category_tag?.trim() || null,
      body.payment_method?.trim() || null,
      body.notes?.trim() || null,
    ]
  );
  const row = r.rows[0]!;
  return { ...row, amount_cents: Number(row.amount_cents) };
}

export async function updateIncomeEntry(
  tenantId: string,
  id: string,
  patch: Partial<{
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
): Promise<FinanceIncomeEntryRow | null> {
  if (patch.finance_account_id) {
    const acc = await getAccount(tenantId, patch.finance_account_id);
    if (!acc) throw new Error('Conta não encontrada');
  }
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const add = (col: string, val: unknown) => {
    fields.push(`${col} = $${i++}`);
    params.push(val);
  };
  if (patch.finance_account_id !== undefined) add('finance_account_id', patch.finance_account_id);
  if (patch.amount_cents !== undefined) add('amount_cents', patch.amount_cents);
  if (patch.received_at !== undefined) {
    fields.push(`received_at = $${i++}::date`);
    params.push(patch.received_at);
  }
  if (patch.description !== undefined) add('description', patch.description.trim());
  if (patch.client_id !== undefined) add('client_id', patch.client_id);
  if (patch.manual_payee_name !== undefined) add('manual_payee_name', patch.manual_payee_name?.trim() || null);
  if (patch.category_tag !== undefined) add('category_tag', patch.category_tag?.trim() || null);
  if (patch.payment_method !== undefined) add('payment_method', patch.payment_method?.trim() || null);
  if (patch.notes !== undefined) add('notes', patch.notes?.trim() || null);
  if (fields.length === 0) {
    const cur = await pool.query<FinanceIncomeEntryRow>(
      `SELECT id, tenant_id, finance_account_id, amount_cents, received_at::text, description,
              client_id, manual_payee_name, category_tag, payment_method, notes, created_at, updated_at
       FROM finance_income_entries WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return cur.rows[0] ? { ...cur.rows[0], amount_cents: Number(cur.rows[0].amount_cents) } : null;
  }
  const whereTenant = i;
  params.push(tenantId);
  const whereId = i + 1;
  params.push(id);
  const r = await pool.query<FinanceIncomeEntryRow>(
    `UPDATE finance_income_entries SET ${fields.join(', ')}
     WHERE tenant_id = $${whereTenant} AND id = $${whereId}
     RETURNING id, tenant_id, finance_account_id, amount_cents, received_at::text, description,
               client_id, manual_payee_name, category_tag, payment_method, notes, created_at, updated_at`,
    params
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  return { ...row, amount_cents: Number(row.amount_cents) };
}

export async function deleteIncomeEntry(tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM finance_income_entries WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
  return (r.rowCount ?? 0) > 0;
}

export async function listExpenseEntries(
  tenantId: string,
  filters: { from?: string; to?: string; account_id?: string; status?: string }
): Promise<FinanceExpenseEntryRow[]> {
  let q = `SELECT id, tenant_id, finance_account_id, category_id, amount_cents,
                  expense_date::text, due_date::text, paid_at::text, description, status,
                  supplier_name, notes, created_at, updated_at
           FROM finance_expense_entries WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let n = 2;
  if (filters.from) {
    q += ` AND expense_date >= $${n}::date`;
    params.push(filters.from);
    n++;
  }
  if (filters.to) {
    q += ` AND expense_date <= $${n}::date`;
    params.push(filters.to);
    n++;
  }
  if (filters.account_id) {
    q += ` AND finance_account_id = $${n}`;
    params.push(filters.account_id);
    n++;
  }
  if (filters.status) {
    q += ` AND status = $${n}`;
    params.push(filters.status);
    n++;
  }
  q += ` ORDER BY expense_date DESC, created_at DESC LIMIT 500`;
  const r = await pool.query<FinanceExpenseEntryRow>(q, params);
  return r.rows.map((row) => ({
    ...row,
    amount_cents: Number(row.amount_cents),
  }));
}

export async function createExpenseEntry(
  tenantId: string,
  body: {
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
  }
): Promise<FinanceExpenseEntryRow> {
  if (body.finance_account_id) {
    const acc = await getAccount(tenantId, body.finance_account_id);
    if (!acc) throw new Error('Conta não encontrada');
  }
  if (body.category_id) {
    const c = await pool.query(`SELECT 1 FROM finance_expense_categories WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      body.category_id,
    ]);
    if (c.rowCount === 0) throw new Error('Categoria inválida');
  }
  const r = await pool.query<FinanceExpenseEntryRow>(
    `INSERT INTO finance_expense_entries (
       tenant_id, finance_account_id, category_id, amount_cents, expense_date, due_date, paid_at,
       description, status, supplier_name, notes
     ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::date, $8, $9, $10, $11)
     RETURNING id, tenant_id, finance_account_id, category_id, amount_cents,
               expense_date::text, due_date::text, paid_at::text, description, status,
               supplier_name, notes, created_at, updated_at`,
    [
      tenantId,
      body.finance_account_id ?? null,
      body.category_id ?? null,
      body.amount_cents,
      body.expense_date,
      body.due_date,
      body.paid_at ?? null,
      body.description.trim(),
      body.status,
      body.supplier_name?.trim() || null,
      body.notes?.trim() || null,
    ]
  );
  const row = r.rows[0]!;
  return { ...row, amount_cents: Number(row.amount_cents) };
}

export async function updateExpenseEntry(
  tenantId: string,
  id: string,
  patch: Partial<{
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
): Promise<FinanceExpenseEntryRow | null> {
  if (patch.finance_account_id !== undefined && patch.finance_account_id !== null) {
    const acc = await getAccount(tenantId, patch.finance_account_id);
    if (!acc) throw new Error('Conta não encontrada');
  }
  if (patch.category_id !== undefined && patch.category_id !== null) {
    const c = await pool.query(`SELECT 1 FROM finance_expense_categories WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      patch.category_id,
    ]);
    if (c.rowCount === 0) throw new Error('Categoria inválida');
  }
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.finance_account_id !== undefined) {
    fields.push(`finance_account_id = $${i++}`);
    params.push(patch.finance_account_id);
  }
  if (patch.category_id !== undefined) {
    fields.push(`category_id = $${i++}`);
    params.push(patch.category_id);
  }
  if (patch.amount_cents !== undefined) {
    fields.push(`amount_cents = $${i++}`);
    params.push(patch.amount_cents);
  }
  if (patch.expense_date !== undefined) {
    fields.push(`expense_date = $${i++}::date`);
    params.push(patch.expense_date);
  }
  if (patch.due_date !== undefined) {
    fields.push(`due_date = $${i++}::date`);
    params.push(patch.due_date);
  }
  if (patch.paid_at !== undefined) {
    fields.push(`paid_at = $${i++}::date`);
    params.push(patch.paid_at);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${i++}`);
    params.push(patch.description.trim());
  }
  if (patch.status !== undefined) {
    fields.push(`status = $${i++}`);
    params.push(patch.status);
  }
  if (patch.supplier_name !== undefined) {
    fields.push(`supplier_name = $${i++}`);
    params.push(patch.supplier_name?.trim() || null);
  }
  if (patch.notes !== undefined) {
    fields.push(`notes = $${i++}`);
    params.push(patch.notes?.trim() || null);
  }
  if (fields.length === 0) {
    const cur = await pool.query<FinanceExpenseEntryRow>(
      `SELECT id, tenant_id, finance_account_id, category_id, amount_cents,
              expense_date::text, due_date::text, paid_at::text, description, status,
              supplier_name, notes, created_at, updated_at
       FROM finance_expense_entries WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return cur.rows[0]
      ? { ...cur.rows[0], amount_cents: Number(cur.rows[0].amount_cents) }
      : null;
  }
  const whereTenant = i;
  params.push(tenantId);
  const whereId = i + 1;
  params.push(id);
  const r = await pool.query<FinanceExpenseEntryRow>(
    `UPDATE finance_expense_entries SET ${fields.join(', ')}
     WHERE tenant_id = $${whereTenant} AND id = $${whereId}
     RETURNING id, tenant_id, finance_account_id, category_id, amount_cents,
               expense_date::text, due_date::text, paid_at::text, description, status,
               supplier_name, notes, created_at, updated_at`,
    params
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  return { ...row, amount_cents: Number(row.amount_cents) };
}

export async function deleteExpenseEntry(tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM finance_expense_entries WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
  return (r.rowCount ?? 0) > 0;
}
