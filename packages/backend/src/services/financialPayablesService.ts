/**
 * Visão operacional de contas a pagar (despesas avulsas + ocorrências recorrentes).
 * Reutiliza financial_transactions e financial_recurring_expense_occurrences — sem tabela nova.
 */
import { pool } from '../utils/db.js';
import { addUtcDays, compareYmd, todayYmdUTC, utcDateFromYmd } from './financialRecurringDateUtils.js';

export type PayableSource = 'expense_transaction' | 'recurring_occurrence';
export type PayableOperationalStatus =
  | 'forecast'
  | 'open'
  | 'due_today'
  | 'overdue'
  | 'paid'
  | 'cancelled';

export interface PayableItemRow {
  source: PayableSource;
  id: string;
  description: string;
  amount_cents: number;
  due_date: string;
  category_id: string | null;
  category_name: string | null;
  operational_status: PayableOperationalStatus;
  is_recurring: boolean;
  recurring_expense_id: string | null;
  recurrence_title: string | null;
  payment_account_id: string | null;
  payment_account_name: string | null;
  /** Movimento de despesa criado ao pagar (recorrente) ou o próprio id quando despesa avulsa paga */
  transaction_id: string | null;
  paid_at: string | null;
  raw_occurrence_status: string | null;
  raw_transaction_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayablesSummaryDto {
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

export interface PayablesListResult {
  period: { from: string; to: string };
  summary: PayablesSummaryDto;
  items: PayableItemRow[];
}

function isoWeekRangeUtc(anchorYmd: string): { week_start: string; week_end: string } {
  const d = utcDateFromYmd(anchorYmd);
  const dow = d.getUTCDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const weekStart = addUtcDays(anchorYmd, toMonday);
  const weekEnd = addUtcDays(weekStart, 6);
  return { week_start: weekStart, week_end: weekEnd };
}

function operationalForExpenseTx(
  status: string,
  transactionDate: string,
  today: string
): PayableOperationalStatus {
  if (status === 'completed') return 'paid';
  if (compareYmd(transactionDate, today) < 0) return 'overdue';
  if (transactionDate === today) return 'due_today';
  if (compareYmd(transactionDate, today) > 0) return 'forecast';
  return 'open';
}

function operationalForOccurrence(status: string, dueDate: string, today: string): PayableOperationalStatus {
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'planned') {
    if (compareYmd(dueDate, today) > 0) return 'forecast';
    return 'open';
  }
  if (status === 'pending') {
    if (compareYmd(dueDate, today) < 0) return 'overdue';
    if (dueDate === today) return 'due_today';
    return 'open';
  }
  return 'open';
}

function isUnpaidOperational(s: PayableOperationalStatus): boolean {
  return s !== 'paid' && s !== 'cancelled';
}

/**
 * Data usada para «pago no período» no resumo — data do pagamento efectivo,
 * não a data de vencimento/cometência quando diferem.
 */
function paymentDateYmdForPaid(it: PayableItemRow): string {
  if (it.source === 'recurring_occurrence') {
    if (it.paid_at) {
      const s = String(it.paid_at);
      return s.slice(0, 10);
    }
    return it.due_date;
  }
  if (it.paid_at) {
    const s = String(it.paid_at);
    return s.slice(0, 10);
  }
  return it.due_date;
}

export async function listPayablesForTenant(tenantId: string, from: string, to: string): Promise<PayablesListResult> {
  const today = todayYmdUTC();
  const { week_start, week_end } = isoWeekRangeUtc(today);

  const txR = await pool.query<{
    id: string;
    description: string;
    amount_cents: string;
    transaction_date: string;
    status: string;
    category_id: string | null;
    category_name: string | null;
    account_id: string;
    account_name: string | null;
    transaction_id: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT t.id::text, t.description, t.amount_cents::text, t.transaction_date::text, t.status,
            t.category_id::text,
            ec.name AS category_name,
            t.account_id::text,
            a.name AS account_name,
            t.id::text AS transaction_id,
            CASE WHEN t.status = 'completed' THEN t.updated_at ELSE NULL END AS paid_at,
            t.created_at, t.updated_at
     FROM financial_transactions t
     LEFT JOIN expense_categories ec ON ec.id = t.category_id AND (ec.tenant_id IS NULL OR ec.tenant_id = t.tenant_id)
     LEFT JOIN financial_accounts a ON a.id = t.account_id AND a.tenant_id = t.tenant_id
     WHERE t.tenant_id = $1
       AND t.type = 'expense'
       AND t.transaction_kind = 'regular'
       AND (
         t.status = 'pending'
         OR (
           t.status = 'completed'
           AND (
             (t.transaction_date >= $2::date AND t.transaction_date <= $3::date)
             OR (
               (t.updated_at AT TIME ZONE 'UTC')::date >= $2::date
               AND (t.updated_at AT TIME ZONE 'UTC')::date <= $3::date
             )
           )
         )
       )
     ORDER BY t.transaction_date ASC, t.created_at ASC`,
    [tenantId, from, to]
  );

  const occR = await pool.query<{
    id: string;
    recurring_expense_id: string;
    recurring_description: string;
    due_date: string;
    amount_cents: string;
    status: string;
    category_id: string | null;
    category_name: string | null;
    account_id: string;
    account_name: string | null;
    transaction_id: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT o.id::text, o.recurring_expense_id::text, r.description AS recurring_description,
            o.due_date::text, o.amount_cents::text, o.status,
            o.category_id::text,
            ec.name AS category_name,
            o.account_id::text,
            acc.name AS account_name,
            o.transaction_id::text,
            o.paid_at,
            o.created_at, o.updated_at
     FROM financial_recurring_expense_occurrences o
     INNER JOIN financial_recurring_expenses r
       ON r.id = o.recurring_expense_id AND r.tenant_id = o.tenant_id
     LEFT JOIN expense_categories ec ON ec.id = o.category_id AND (ec.tenant_id IS NULL OR ec.tenant_id = o.tenant_id)
     LEFT JOIN financial_accounts acc ON acc.id = o.account_id AND acc.tenant_id = o.tenant_id
     WHERE o.tenant_id = $1
       AND (
         (o.due_date >= $2::date AND o.due_date <= $3::date)
         OR (o.status IN ('planned', 'pending') AND o.due_date < $2::date)
         OR (
           o.status = 'paid'
           AND o.paid_at IS NOT NULL
           AND (o.paid_at AT TIME ZONE 'UTC')::date >= $2::date
           AND (o.paid_at AT TIME ZONE 'UTC')::date <= $3::date
         )
       )
     ORDER BY o.due_date ASC, o.created_at ASC`,
    [tenantId, from, to]
  );

  const activeRules = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM financial_recurring_expenses WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );
  const recurring_active_rules_count = Number(activeRules.rows[0]?.c ?? 0);

  const items: PayableItemRow[] = [];

  for (const t of txR.rows) {
    const amount_cents = Number(t.amount_cents);
    const op = operationalForExpenseTx(t.status, t.transaction_date, today);
    items.push({
      source: 'expense_transaction',
      id: t.id,
      description: t.description,
      amount_cents,
      due_date: t.transaction_date,
      category_id: t.category_id,
      category_name: t.category_name,
      operational_status: op,
      is_recurring: false,
      recurring_expense_id: null,
      recurrence_title: null,
      payment_account_id: t.account_id,
      payment_account_name: t.account_name,
      transaction_id: t.transaction_id,
      paid_at: t.paid_at,
      raw_occurrence_status: null,
      raw_transaction_status: t.status,
      created_at: t.created_at,
      updated_at: t.updated_at,
    });
  }

  for (const o of occR.rows) {
    const amount_cents = Number(o.amount_cents);
    const op = operationalForOccurrence(o.status, o.due_date, today);
    items.push({
      source: 'recurring_occurrence',
      id: o.id,
      description: o.recurring_description,
      amount_cents,
      due_date: o.due_date,
      category_id: o.category_id,
      category_name: o.category_name,
      operational_status: op,
      is_recurring: true,
      recurring_expense_id: o.recurring_expense_id,
      recurrence_title: o.recurring_description,
      payment_account_id: o.account_id,
      payment_account_name: o.account_name,
      transaction_id: o.transaction_id,
      paid_at: o.paid_at,
      raw_occurrence_status: o.status,
      raw_transaction_status: null,
      created_at: o.created_at,
      updated_at: o.updated_at,
    });
  }

  items.sort((a, b) => {
    const c = compareYmd(a.due_date, b.due_date);
    if (c !== 0) return c;
    return a.description.localeCompare(b.description, 'pt');
  });

  let due_today_cents = 0;
  let due_today_count = 0;
  let due_week_cents = 0;
  let due_week_count = 0;
  let pending_not_paid_cents = 0;
  let pending_not_paid_count = 0;
  let paid_in_period_cents = 0;
  let paid_in_period_count = 0;
  let total_outstanding_cents = 0;

  for (const it of items) {
    if (it.operational_status === 'paid') {
      const pymd = paymentDateYmdForPaid(it);
      if (compareYmd(pymd, from) >= 0 && compareYmd(pymd, to) <= 0) {
        paid_in_period_cents += it.amount_cents;
        paid_in_period_count += 1;
      }
      continue;
    }
    if (it.operational_status === 'cancelled') continue;

    total_outstanding_cents += it.amount_cents;
    pending_not_paid_cents += it.amount_cents;
    pending_not_paid_count += 1;

    if (it.due_date === today && isUnpaidOperational(it.operational_status)) {
      due_today_cents += it.amount_cents;
      due_today_count += 1;
    }
    if (
      isUnpaidOperational(it.operational_status) &&
      compareYmd(it.due_date, week_start) >= 0 &&
      compareYmd(it.due_date, week_end) <= 0
    ) {
      due_week_cents += it.amount_cents;
      due_week_count += 1;
    }
  }

  const summary: PayablesSummaryDto = {
    due_today_cents,
    due_today_count,
    due_week_cents,
    due_week_count,
    pending_not_paid_cents,
    pending_not_paid_count,
    recurring_active_rules_count,
    paid_in_period_cents,
    paid_in_period_count,
    total_outstanding_cents,
    week_start,
    week_end,
  };

  return {
    period: { from, to },
    summary,
    items,
  };
}
