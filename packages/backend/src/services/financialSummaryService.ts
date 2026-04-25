/**
 * Resumo agregado: movimentações concluídas + cobranças pagas (customer_invoices).
 * Fase 2: despesas recorrentes planejadas.
 * Fase 3: parcelas de cartão planejadas (sem duplicar pagamento já em financial_transactions).
 */
import { pool } from '../utils/db.js';
import { getAccountBalanceCents, listFinancialAccounts } from './financialAccountsService.js';
import { plannedRecurringByMonth, sumPlannedRecurringExpenseCents } from './financialRecurringExpenseService.js';
import {
  plannedCcInstallmentsByMonth,
  sumOpenCcStatementsExpectedCents,
  sumPlannedCcInstallmentsCents,
} from './financialCreditCardService.js';

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

export interface FinancialSummaryAccount {
  id: string;
  name: string;
  balance: number;
}

export interface FinancialSummaryMonthly {
  month: string;
  income: number;
  expense: number;
  profit: number;
  planned_recurring_expense: number;
  planned_credit_card: number;
  projected_expense: number;
  projected_profit: number;
}

export interface FinancialSummaryResult {
  total_income: number;
  total_expense: number;
  total_profit: number;
  transaction_income: number;
  transaction_expense: number;
  invoice_income: number;
  accounts: FinancialSummaryAccount[];
  monthly: FinancialSummaryMonthly[];
  planned_recurring_expense_total: number;
  /** Parcelas de cartão ainda não pagas (planejadas) no período. */
  planned_credit_card_installments_total: number;
  /** Soma do esperado nas faturas de cartão em aberto (referência rápida). */
  open_credit_card_statements_expected_total: number;
  projected_total_expense: number;
  projected_total_income: number;
  projected_balance: number;
}

function defaultRange(): { from: string; to: string } {
  const y = new Date().getUTCFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export async function getFinancialSummary(
  tenantId: string,
  range?: { from?: string | null; to?: string | null }
): Promise<FinancialSummaryResult> {
  const { from, to } = range?.from && range?.to ? { from: range.from, to: range.to } : defaultRange();

  const txIncome = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_transactions
     WHERE tenant_id = $1 AND type = 'income' AND status = 'completed'
       AND COALESCE(transaction_kind, 'regular') <> 'transfer'
       AND transaction_date >= $2::date AND transaction_date <= $3::date`,
    [tenantId, from, to]
  );
  const txExpense = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_transactions
     WHERE tenant_id = $1 AND type = 'expense' AND status = 'completed'
       AND COALESCE(transaction_kind, 'regular') <> 'transfer'
       AND transaction_date >= $2::date AND transaction_date <= $3::date`,
    [tenantId, from, to]
  );

  const inv = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM customer_invoices
     WHERE tenant_id = $1 AND status = 'paid' AND paid_at IS NOT NULL
       AND (paid_at::date) >= $2::date AND (paid_at::date) <= $3::date`,
    [tenantId, from, to]
  );

  const ti = Number(txIncome.rows[0]?.s ?? 0);
  const te = Number(txExpense.rows[0]?.s ?? 0);
  const ii = Number(inv.rows[0]?.s ?? 0);

  const totalIncomeCents = ti + ii;
  const totalExpenseCents = te;
  const totalProfitCents = totalIncomeCents - totalExpenseCents;

  const plannedTotalCents = await sumPlannedRecurringExpenseCents(tenantId, from, to);
  const plannedByMonth = await plannedRecurringByMonth(tenantId, from, to);

  const plannedCcTotal = await sumPlannedCcInstallmentsCents(tenantId, from, to);
  const plannedCcByMonth = await plannedCcInstallmentsByMonth(tenantId, from, to);
  const openCcStatementsCents = await sumOpenCcStatementsExpectedCents(tenantId);

  const accountsRows = await listFinancialAccounts(tenantId);
  const accounts: FinancialSummaryAccount[] = [];
  for (const a of accountsRows) {
    const bal = await getAccountBalanceCents(tenantId, a.id);
    accounts.push({
      id: a.id,
      name: a.name,
      balance: centsToReais(bal ?? a.initial_balance_cents),
    });
  }

  const monthlyRows = await pool.query<{ ym: string; inc: string; exp: string }>(
    `SELECT to_char(d, 'YYYY-MM') AS ym,
            COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'completed' THEN t.amount_cents ELSE 0 END), 0)::text AS inc,
            COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'completed' THEN t.amount_cents ELSE 0 END), 0)::text AS exp
     FROM generate_series($2::date, $3::date, '1 month'::interval) AS d
     LEFT JOIN financial_transactions t
       ON t.tenant_id = $1
       AND date_trunc('month', t.transaction_date) = date_trunc('month', d::timestamp)
       AND COALESCE(t.transaction_kind, 'regular') <> 'transfer'
     GROUP BY to_char(d, 'YYYY-MM'), date_trunc('month', d::timestamp)
     ORDER BY date_trunc('month', d::timestamp)`,
    [tenantId, from, to]
  );

  const invMonthly = await pool.query<{ ym: string; s: string }>(
    `SELECT to_char(paid_at::date, 'YYYY-MM') AS ym,
            COALESCE(SUM(amount_cents), 0)::text AS s
     FROM customer_invoices
     WHERE tenant_id = $1 AND status = 'paid' AND paid_at IS NOT NULL
       AND (paid_at::date) >= $2::date AND (paid_at::date) <= $3::date
     GROUP BY to_char(paid_at::date, 'YYYY-MM')
     ORDER BY ym`,
    [tenantId, from, to]
  );
  const invByMonth = new Map(invMonthly.rows.map((r) => [r.ym, Number(r.s ?? 0)]));

  const monthly: FinancialSummaryMonthly[] = monthlyRows.rows.map((row) => {
    const incCents = Number(row.inc ?? 0) + (invByMonth.get(row.ym) ?? 0);
    const expCents = Number(row.exp ?? 0);
    const prCents = plannedByMonth.get(row.ym) ?? 0;
    const pccCents = plannedCcByMonth.get(row.ym) ?? 0;
    const projectedExpCents = expCents + prCents + pccCents;
    return {
      month: row.ym,
      income: centsToReais(incCents),
      expense: centsToReais(expCents),
      profit: centsToReais(incCents - expCents),
      planned_recurring_expense: centsToReais(prCents),
      planned_credit_card: centsToReais(pccCents),
      projected_expense: centsToReais(projectedExpCents),
      projected_profit: centsToReais(incCents - projectedExpCents),
    };
  });

  const projectedExpenseCents = totalExpenseCents + plannedTotalCents + plannedCcTotal;

  return {
    total_income: centsToReais(totalIncomeCents),
    total_expense: centsToReais(totalExpenseCents),
    total_profit: centsToReais(totalProfitCents),
    transaction_income: centsToReais(ti),
    transaction_expense: centsToReais(te),
    invoice_income: centsToReais(ii),
    accounts,
    monthly,
    planned_recurring_expense_total: centsToReais(plannedTotalCents),
    planned_credit_card_installments_total: centsToReais(plannedCcTotal),
    open_credit_card_statements_expected_total: centsToReais(openCcStatementsCents),
    projected_total_expense: centsToReais(projectedExpenseCents),
    projected_total_income: centsToReais(totalIncomeCents),
    projected_balance: centsToReais(totalIncomeCents - projectedExpenseCents),
  };
}
