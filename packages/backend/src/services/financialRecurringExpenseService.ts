/**
 * Despesas recorrentes e ocorrências (Fase 2).
 */
import { pool } from '../utils/db.js';
import { createFinancialTransaction } from './financialTransactionsService.js';
import {
  addCalendarMonthsPlain,
  compareYmd,
  generateDueDates,
  maxYmd,
  todayYmdUTC,
  type RecurringPeriodicity,
} from './financialRecurringDateUtils.js';

export type RecurringScheduleType = 'infinite' | 'finite';
export type OccurrenceStatus = 'planned' | 'pending' | 'paid' | 'cancelled';

export interface FinancialRecurringExpenseRow {
  id: string;
  tenant_id: string;
  description: string;
  amount_cents: number;
  category_id: string;
  default_account_id: string;
  periodicity: RecurringPeriodicity;
  due_day: number;
  start_date: string;
  end_date: string | null;
  schedule_type: RecurringScheduleType;
  max_occurrences: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinancialRecurringExpenseOccurrenceRow {
  id: string;
  recurring_expense_id: string;
  tenant_id: string;
  account_id: string;
  category_id: string | null;
  due_date: string;
  amount_cents: number;
  status: OccurrenceStatus;
  paid_at: string | null;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

function occurrenceStatusForDue(dueYmd: string): 'planned' | 'pending' {
  return compareYmd(dueYmd, todayYmdUTC()) > 0 ? 'planned' : 'pending';
}

function computeHorizonEndYmd(startYmd: string): string {
  return addCalendarMonthsPlain(maxYmd(todayYmdUTC(), startYmd), 12);
}

export async function listRecurringExpenses(tenantId: string, activeOnly?: boolean): Promise<FinancialRecurringExpenseRow[]> {
  let q = `SELECT id, tenant_id::text, description, amount_cents, category_id::text, default_account_id::text,
                  periodicity, due_day, start_date::text, end_date::text, schedule_type, max_occurrences,
                  is_active, created_at, updated_at
           FROM financial_recurring_expenses WHERE tenant_id = $1`;
  const p: unknown[] = [tenantId];
  if (activeOnly) {
    q += ` AND is_active = true`;
  }
  q += ` ORDER BY is_active DESC, lower(description) ASC`;
  const r = await pool.query<FinancialRecurringExpenseRow>(q, p);
  return r.rows.map((row) => ({
    ...row,
    amount_cents: Number(row.amount_cents),
    due_day: Number(row.due_day),
    max_occurrences: row.max_occurrences != null ? Number(row.max_occurrences) : null,
    end_date: row.end_date,
  }));
}

export async function getRecurringExpense(
  tenantId: string,
  id: string
): Promise<FinancialRecurringExpenseRow | null> {
  const r = await pool.query<FinancialRecurringExpenseRow>(
    `SELECT id, tenant_id::text, description, amount_cents, category_id::text, default_account_id::text,
            periodicity, due_day, start_date::text, end_date::text, schedule_type, max_occurrences,
            is_active, created_at, updated_at
     FROM financial_recurring_expenses WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    ...row,
    amount_cents: Number(row.amount_cents),
    due_day: Number(row.due_day),
    max_occurrences: row.max_occurrences != null ? Number(row.max_occurrences) : null,
  };
}

/** Remove ocorrências futuras não pagas (regeneração). */
export async function deleteFutureUnpaidOccurrences(tenantId: string, recurringExpenseId: string): Promise<void> {
  await pool.query(
    `DELETE FROM financial_recurring_expense_occurrences
     WHERE tenant_id = $1 AND recurring_expense_id = $2
       AND transaction_id IS NULL
       AND status IN ('planned', 'pending')
       AND due_date >= CURRENT_DATE`,
    [tenantId, recurringExpenseId]
  );
}

export async function insertOccurrencesForRecurring(
  tenantId: string,
  row: FinancialRecurringExpenseRow
): Promise<number> {
  if (!row.is_active) return 0;
  const horizonEnd = computeHorizonEndYmd(row.start_date);
  const dates = generateDueDates({
    startYmd: row.start_date,
    endYmd: row.end_date,
    periodicity: row.periodicity,
    dueDay: row.due_day,
    scheduleType: row.schedule_type,
    maxOccurrences: row.max_occurrences,
    horizonEndYmd: horizonEnd,
  });
  let inserted = 0;
  for (const due of dates) {
    const st = occurrenceStatusForDue(due);
    const ins = await pool.query(
      `INSERT INTO financial_recurring_expense_occurrences (
         recurring_expense_id, tenant_id, account_id, category_id, due_date, amount_cents, status
       ) VALUES ($1, $2, $3, $4, $5::date, $6, $7)
       ON CONFLICT ON CONSTRAINT financial_recurring_expense_occurrences_unique_due DO NOTHING`,
      [row.id, tenantId, row.default_account_id, row.category_id, due, row.amount_cents, st]
    );
    if (ins.rowCount && ins.rowCount > 0) inserted += ins.rowCount;
  }
  return inserted;
}

export async function regenerateOccurrences(tenantId: string, recurringExpenseId: string): Promise<void> {
  const row = await getRecurringExpense(tenantId, recurringExpenseId);
  if (!row) throw new Error('Despesa recorrente não encontrada');
  await deleteFutureUnpaidOccurrences(tenantId, recurringExpenseId);
  await insertOccurrencesForRecurring(tenantId, row);
}

export async function createRecurringExpense(
  tenantId: string,
  body: {
    description: string;
    amount_cents: number;
    category_id: string;
    default_account_id: string;
    periodicity: RecurringPeriodicity;
    due_day: number;
    start_date: string;
    end_date?: string | null;
    schedule_type: RecurringScheduleType;
    max_occurrences?: number | null;
    is_active?: boolean;
  }
): Promise<FinancialRecurringExpenseRow> {
  await assertCategoryAndAccount(tenantId, body.category_id, body.default_account_id);
  const r = await pool.query<FinancialRecurringExpenseRow>(
    `INSERT INTO financial_recurring_expenses (
       tenant_id, description, amount_cents, category_id, default_account_id, periodicity, due_day,
       start_date, end_date, schedule_type, max_occurrences, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, COALESCE($12, true))
     RETURNING id, tenant_id::text, description, amount_cents, category_id::text, default_account_id::text,
               periodicity, due_day, start_date::text, end_date::text, schedule_type, max_occurrences,
               is_active, created_at, updated_at`,
    [
      tenantId,
      body.description.trim(),
      body.amount_cents,
      body.category_id,
      body.default_account_id,
      body.periodicity,
      body.due_day,
      body.start_date,
      body.end_date ?? null,
      body.schedule_type,
      body.schedule_type === 'finite' ? body.max_occurrences ?? null : null,
      body.is_active,
    ]
  );
  const row = r.rows[0]!;
  const mapped = {
    ...row,
    amount_cents: Number(row.amount_cents),
    due_day: Number(row.due_day),
    max_occurrences: row.max_occurrences != null ? Number(row.max_occurrences) : null,
  };
  await insertOccurrencesForRecurring(tenantId, mapped);
  return mapped;
}

export async function updateRecurringExpense(
  tenantId: string,
  id: string,
  patch: Partial<{
    description: string;
    amount_cents: number;
    category_id: string;
    default_account_id: string;
    periodicity: RecurringPeriodicity;
    due_day: number;
    start_date: string;
    end_date: string | null;
    schedule_type: RecurringScheduleType;
    max_occurrences: number | null;
    is_active: boolean;
  }>
): Promise<FinancialRecurringExpenseRow | null> {
  const cur = await getRecurringExpense(tenantId, id);
  if (!cur) return null;
  if (patch.category_id != null || patch.default_account_id != null) {
    await assertCategoryAndAccount(
      tenantId,
      patch.category_id ?? cur.category_id,
      patch.default_account_id ?? cur.default_account_id
    );
  }
  const schedule_type = patch.schedule_type ?? cur.schedule_type;
  let max_occurrences =
    patch.max_occurrences !== undefined ? patch.max_occurrences : cur.max_occurrences;
  if (schedule_type === 'infinite') max_occurrences = null;
  const next = {
    description: patch.description ?? cur.description,
    amount_cents: patch.amount_cents ?? cur.amount_cents,
    category_id: patch.category_id ?? cur.category_id,
    default_account_id: patch.default_account_id ?? cur.default_account_id,
    periodicity: patch.periodicity ?? cur.periodicity,
    due_day: patch.due_day ?? cur.due_day,
    start_date: patch.start_date ?? cur.start_date,
    end_date: patch.end_date !== undefined ? patch.end_date : cur.end_date,
    schedule_type,
    max_occurrences,
    is_active: patch.is_active ?? cur.is_active,
  };
  if (next.schedule_type === 'finite' && (next.max_occurrences == null || next.max_occurrences < 1)) {
    throw new Error('Despesas finitas precisam de quantidade de ocorrências');
  }
  const r = await pool.query<FinancialRecurringExpenseRow>(
    `UPDATE financial_recurring_expenses SET
       description = $2,
       amount_cents = $3,
       category_id = $4,
       default_account_id = $5,
       periodicity = $6,
       due_day = $7,
       start_date = $8::date,
       end_date = $9::date,
       schedule_type = $10,
       max_occurrences = CASE WHEN $10 = 'finite' THEN $11 ELSE NULL END,
       is_active = $12,
       updated_at = now()
     WHERE tenant_id = $1 AND id = $13
     RETURNING id, tenant_id::text, description, amount_cents, category_id::text, default_account_id::text,
               periodicity, due_day, start_date::text, end_date::text, schedule_type, max_occurrences,
               is_active, created_at, updated_at`,
    [
      tenantId,
      next.description.trim(),
      next.amount_cents,
      next.category_id,
      next.default_account_id,
      next.periodicity,
      next.due_day,
      next.start_date,
      next.end_date,
      next.schedule_type,
      next.schedule_type === 'finite' ? next.max_occurrences : null,
      next.is_active,
      id,
    ]
  );
  const row = r.rows[0]!;
  const mapped = {
    ...row,
    amount_cents: Number(row.amount_cents),
    due_day: Number(row.due_day),
    max_occurrences: row.max_occurrences != null ? Number(row.max_occurrences) : null,
  };
  if (!mapped.is_active) {
    await pool.query(
      `DELETE FROM financial_recurring_expense_occurrences
       WHERE tenant_id = $1 AND recurring_expense_id = $2
         AND transaction_id IS NULL
         AND status IN ('planned', 'pending')
         AND due_date >= CURRENT_DATE`,
      [tenantId, id]
    );
  } else {
    await regenerateOccurrences(tenantId, id);
  }
  return mapped;
}

async function assertCategoryAndAccount(tenantId: string, categoryId: string, accountId: string): Promise<void> {
  const c = await pool.query(
    `SELECT 1 FROM expense_categories WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
    [categoryId, tenantId]
  );
  if (c.rowCount === 0) throw new Error('Categoria inválida');
  const a = await pool.query(`SELECT 1 FROM financial_accounts WHERE id = $1 AND tenant_id = $2`, [
    accountId,
    tenantId,
  ]);
  if (a.rowCount === 0) throw new Error('Conta inválida');
}

export async function listOccurrences(
  tenantId: string,
  filters: { from?: string | null; to?: string | null; recurring_expense_id?: string | null }
): Promise<FinancialRecurringExpenseOccurrenceRow[]> {
  let q = `SELECT o.id, o.recurring_expense_id::text, o.tenant_id::text, o.account_id::text, o.category_id::text,
                  o.due_date::text, o.amount_cents, o.status, o.paid_at::text, o.transaction_id::text,
                  o.created_at, o.updated_at
           FROM financial_recurring_expense_occurrences o
           WHERE o.tenant_id = $1`;
  const p: unknown[] = [tenantId];
  let n = 2;
  if (filters.from) {
    q += ` AND o.due_date >= $${n}::date`;
    p.push(filters.from);
    n++;
  }
  if (filters.to) {
    q += ` AND o.due_date <= $${n}::date`;
    p.push(filters.to);
    n++;
  }
  if (filters.recurring_expense_id) {
    q += ` AND o.recurring_expense_id = $${n}`;
    p.push(filters.recurring_expense_id);
    n++;
  }
  q += ` ORDER BY o.due_date ASC, o.created_at ASC LIMIT 2000`;
  const r = await pool.query<FinancialRecurringExpenseOccurrenceRow>(q, p);
  return r.rows.map((row) => ({
    ...row,
    amount_cents: Number(row.amount_cents),
    paid_at: row.paid_at,
  }));
}

export async function payRecurringExpenseOccurrence(
  tenantId: string,
  occurrenceId: string,
  opts?: { account_id?: string | null; transaction_date?: string | null }
): Promise<{ occurrence: FinancialRecurringExpenseOccurrenceRow; transaction_id: string }> {
  const occ = await pool.query<FinancialRecurringExpenseOccurrenceRow & { recurring_description: string }>(
    `SELECT o.id, o.recurring_expense_id::text, o.tenant_id::text, o.account_id::text, o.category_id::text,
            o.due_date::text, o.amount_cents, o.status, o.paid_at::text, o.transaction_id::text,
            o.created_at, o.updated_at, r.description AS recurring_description
     FROM financial_recurring_expense_occurrences o
     JOIN financial_recurring_expenses r ON r.id = o.recurring_expense_id AND r.tenant_id = o.tenant_id
     WHERE o.tenant_id = $1 AND o.id = $2 LIMIT 1`,
    [tenantId, occurrenceId]
  );
  if (occ.rowCount === 0) throw new Error('Ocorrência não encontrada');
  const row = occ.rows[0]!;
  if (row.status === 'paid') throw new Error('Já está paga');
  if (row.status === 'cancelled') throw new Error('Ocorrência cancelada');
  if (row.transaction_id) throw new Error('Ocorrência já vinculada a um movimento');

  const accountId = opts?.account_id?.trim() || row.account_id;
  const txDate = opts?.transaction_date?.trim() || row.due_date;

  await pool.query('BEGIN');
  try {
    const tx = await createFinancialTransaction(tenantId, {
      account_id: accountId,
      type: 'expense',
      amount_cents: Number(row.amount_cents),
      description: `Despesa recorrente: ${row.recurring_description}`,
      category_id: row.category_id,
      transaction_date: txDate,
      status: 'completed',
    });
    const up = await pool.query<FinancialRecurringExpenseOccurrenceRow>(
      `UPDATE financial_recurring_expense_occurrences SET
         status = 'paid',
         paid_at = now(),
         transaction_id = $3::uuid,
         account_id = $4::uuid,
         updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, recurring_expense_id::text, tenant_id::text, account_id::text, category_id::text,
                 due_date::text, amount_cents, status, paid_at::text, transaction_id::text,
                 created_at, updated_at`,
      [tenantId, occurrenceId, tx.id, accountId]
    );
    await pool.query('COMMIT');
    const out = up.rows[0]!;
    return {
      occurrence: {
        ...out,
        amount_cents: Number(out.amount_cents),
        paid_at: out.paid_at,
      },
      transaction_id: tx.id,
    };
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

/** Soma (cents) de ocorrências planejadas ou em aberto no período. */
export async function sumPlannedRecurringExpenseCents(
  tenantId: string,
  from: string,
  to: string
): Promise<number> {
  const r = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_recurring_expense_occurrences
     WHERE tenant_id = $1
       AND status IN ('planned', 'pending')
       AND due_date >= $2::date AND due_date <= $3::date`,
    [tenantId, from, to]
  );
  return Number(r.rows[0]?.s ?? 0);
}

export async function plannedRecurringByMonth(
  tenantId: string,
  from: string,
  to: string
): Promise<Map<string, number>> {
  const r = await pool.query<{ ym: string; s: string }>(
    `SELECT to_char(due_date, 'YYYY-MM') AS ym, COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_recurring_expense_occurrences
     WHERE tenant_id = $1
       AND status IN ('planned', 'pending')
       AND due_date >= $2::date AND due_date <= $3::date
     GROUP BY to_char(due_date, 'YYYY-MM')
     ORDER BY ym`,
    [tenantId, from, to]
  );
  return new Map(r.rows.map((x) => [x.ym, Number(x.s ?? 0)]));
}
