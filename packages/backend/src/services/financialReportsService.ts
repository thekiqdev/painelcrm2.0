/**
 * Relatórios consolidados (Fase 4) — leitura tenant-scoped, modelo unificado financial_*.
 */
import { pool } from '../utils/db.js';
import { getAccountBalanceCents, listFinancialAccounts } from './financialAccountsService.js';
import { getFinancialSummary } from './financialSummaryService.js';
import { listCreditCards } from './financialCreditCardService.js';
import { buildSubscriptionsProjection, type SubscriptionsProjectionBlock } from './financialReportsSubscriptionProjection.js';

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function inclusiveDaysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map((x) => parseInt(x, 10));
  const [y2, m2, d2] = to.split('-').map((x) => parseInt(x, 10));
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((b - a) / 86400000) + 1;
}

export function previousPeriodOfRange(from: string, to: string): { from: string; to: string } {
  const n = inclusiveDaysBetween(from, to);
  const prevTo = addDaysYmd(from, -1);
  const prevFrom = addDaysYmd(prevTo, -(n - 1));
  return { from: prevFrom, to: prevTo };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

async function accountBalancesCentsMap(tenantId: string): Promise<Map<string, number>> {
  const accs = await listFinancialAccounts(tenantId);
  const m = new Map<string, number>();
  for (const a of accs) {
    const b = await getAccountBalanceCents(tenantId, a.id);
    m.set(a.id, b ?? a.initial_balance_cents);
  }
  return m;
}

export interface FinancialEnterpriseReport {
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
  subscriptions_projection: SubscriptionsProjectionBlock;
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
  /** Despesas no período ligadas ao pagamento de faturas de cartão (conta + ajuste de fatura). */
  credit_card_bank_payments: number;
  recurring_snapshot: {
    due_in_period_still_open: number;
    paid_in_period: number;
  };
}

export async function getFinancialEnterpriseReport(
  tenantId: string,
  range: { from: string; to: string }
): Promise<FinancialEnterpriseReport> {
  const { from, to } = range;
  const prev = previousPeriodOfRange(from, to);

  const [summary, prevSummary] = await Promise.all([
    getFinancialSummary(tenantId, { from, to }),
    getFinancialSummary(tenantId, { from: prev.from, to: prev.to }),
  ]);

  const byAccountR = await pool.query<{ account_id: string; name: string; inc: string; exp: string }>(
    `SELECT a.id::text AS account_id, a.name,
            COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'completed' THEN t.amount_cents ELSE 0 END), 0)::text AS inc,
            COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'completed' THEN t.amount_cents ELSE 0 END), 0)::text AS exp
     FROM financial_accounts a
     LEFT JOIN financial_transactions t
       ON t.account_id = a.id AND t.tenant_id = a.tenant_id
       AND t.transaction_date >= $2::date AND t.transaction_date <= $3::date
       AND COALESCE(t.transaction_kind, 'regular') IN ('regular', 'transfer')
     WHERE a.tenant_id = $1
     GROUP BY a.id, a.name
     ORDER BY lower(a.name)`,
    [tenantId, from, to]
  );

  const balanceMap = await accountBalancesCentsMap(tenantId);

  const by_account = byAccountR.rows.map((row) => {
    const inc = Number(row.inc ?? 0);
    const exp = Number(row.exp ?? 0);
    return {
      account_id: row.account_id,
      name: row.name,
      income: centsToReais(inc),
      expense: centsToReais(exp),
      net: centsToReais(inc - exp),
      estimated_balance: centsToReais(balanceMap.get(row.account_id) ?? 0),
    };
  });

  const catExp = await pool.query<{ category_id: string | null; name: string; s: string }>(
    `SELECT t.category_id::text AS category_id,
            COALESCE(ec.name, 'Sem categoria') AS name,
            COALESCE(SUM(t.amount_cents), 0)::text AS s
     FROM financial_transactions t
     LEFT JOIN expense_categories ec ON ec.id = t.category_id AND (ec.tenant_id IS NULL OR ec.tenant_id = t.tenant_id)
     WHERE t.tenant_id = $1 AND t.type = 'expense' AND t.status = 'completed'
       AND COALESCE(t.transaction_kind, 'regular') <> 'transfer'
       AND t.transaction_date >= $2::date AND t.transaction_date <= $3::date
     GROUP BY t.category_id, COALESCE(ec.name, 'Sem categoria')
     ORDER BY SUM(t.amount_cents) DESC`,
    [tenantId, from, to]
  );

  const catInc = await pool.query<{ category_id: string | null; name: string; s: string }>(
    `SELECT t.category_id::text AS category_id,
            COALESCE(ec.name, 'Sem categoria') AS name,
            COALESCE(SUM(t.amount_cents), 0)::text AS s
     FROM financial_transactions t
     LEFT JOIN expense_categories ec ON ec.id = t.category_id AND (ec.tenant_id IS NULL OR ec.tenant_id = t.tenant_id)
     WHERE t.tenant_id = $1 AND t.type = 'income' AND t.status = 'completed'
       AND COALESCE(t.transaction_kind, 'regular') <> 'transfer'
       AND t.transaction_date >= $2::date AND t.transaction_date <= $3::date
     GROUP BY t.category_id, COALESCE(ec.name, 'Sem categoria')
     ORDER BY SUM(t.amount_cents) DESC`,
    [tenantId, from, to]
  );

  const billing = await pool.query<{ client_id: string; client_name: string; cnt: string; s: string }>(
    `SELECT c.id::text AS client_id,
            COALESCE(NULLIF(trim(c.name), ''), 'Cliente') AS client_name,
            COUNT(*)::text AS cnt,
            COALESCE(SUM(ci.amount_cents), 0)::text AS s
     FROM customer_invoices ci
     JOIN clients c ON c.id = ci.client_id
       AND EXISTS (
         SELECT 1
         FROM users u
         WHERE u.id = c.user_id
           AND u.tenant_id = ci.tenant_id
       )
     WHERE ci.tenant_id = $1 AND ci.status = 'paid' AND ci.paid_at IS NOT NULL
       AND (ci.paid_at::date) >= $2::date AND (ci.paid_at::date) <= $3::date
       AND NOT EXISTS (
         SELECT 1 FROM financial_transactions ft
         WHERE ft.tenant_id = ci.tenant_id
           AND ft.entry_source = 'gateway_payment'
           AND ft.reference_type = 'customer_invoice'
           AND ft.reference_id = ci.id
       )
     GROUP BY c.id, c.name
     ORDER BY SUM(ci.amount_cents) DESC
     LIMIT 200`,
    [tenantId, from, to]
  );

  const ccPay = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(t.amount_cents), 0)::text AS s
     FROM financial_transactions t
     LEFT JOIN expense_categories ec ON ec.id = t.category_id
     WHERE t.tenant_id = $1 AND t.type = 'expense' AND t.status = 'completed'
       AND COALESCE(t.transaction_kind, 'regular') <> 'transfer'
       AND t.transaction_date >= $2::date AND t.transaction_date <= $3::date
       AND ec.tenant_id IS NULL
       AND (
         lower(trim(ec.name)) = lower('Cartão de crédito')
         OR (
           lower(trim(ec.name)) = lower('Despesas não cadastradas')
           AND t.description ILIKE '%fatura%cartão%'
         )
       )`,
    [tenantId, from, to]
  );

  const recur = await pool.query<{ open_s: string; paid_s: string }>(
    `SELECT
       COALESCE(SUM(CASE
         WHEN o.status IN ('planned', 'pending')
         THEN o.amount_cents ELSE 0 END), 0)::text AS open_s,
       COALESCE(SUM(CASE
         WHEN o.status = 'paid' AND o.paid_at IS NOT NULL
         THEN o.amount_cents ELSE 0 END), 0)::text AS paid_s
     FROM financial_recurring_expense_occurrences o
     WHERE o.tenant_id = $1
       AND (
         (o.due_date >= $2::date AND o.due_date <= $3::date)
         OR (
           o.status = 'paid' AND o.paid_at IS NOT NULL
           AND (o.paid_at::date) >= $2::date AND (o.paid_at::date) <= $3::date
         )
       )`,
    [tenantId, from, to]
  );

  const monthKeys = summary.monthly.map((m) => m.month);
  const subscriptions_projection = await buildSubscriptionsProjection(tenantId, { from, to }, monthKeys);
  const subByMonth = new Map(subscriptions_projection.by_month.map((x) => [x.month, x]));

  const cards = await listCreditCards(tenantId);
  const credit_cards = cards.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    limit: c.limit_cents != null ? centsToReais(c.limit_cents) : null,
    used: centsToReais(c.used_cents ?? 0),
    next_due: c.next_statement_due_date ?? null,
    next_expected: c.next_statement_expected_cents != null ? centsToReais(c.next_statement_expected_cents) : null,
  }));

  return {
    period: { from, to },
    previous_period: prev,
    general: {
      total_income: summary.total_income,
      received_income: summary.total_income,
      projected_subscription_income:
        subscriptions_projection.pending_subscription_revenue +
        subscriptions_projection.projected_subscription_revenue,
      total_income_potential:
        summary.total_income +
        subscriptions_projection.pending_subscription_revenue +
        subscriptions_projection.projected_subscription_revenue,
      total_expense: summary.total_expense,
      expense_paid: summary.total_expense,
      expense_projected: Math.max(0, summary.projected_total_expense - summary.total_expense),
      expense_total_potential: summary.projected_total_expense,
      total_profit: summary.total_profit,
      realized_profit: summary.total_profit,
      projected_result:
        summary.total_income +
        subscriptions_projection.pending_subscription_revenue +
        subscriptions_projection.projected_subscription_revenue -
        summary.projected_total_expense,
      transaction_income: summary.transaction_income,
      transaction_expense: summary.transaction_expense,
      invoice_income: summary.invoice_income,
      planned_recurring_expense: summary.planned_recurring_expense_total,
      planned_credit_card: summary.planned_credit_card_installments_total,
      projected_total_expense: summary.projected_total_expense,
      projected_balance: summary.projected_balance,
      open_credit_card_statements_expected: summary.open_credit_card_statements_expected_total,
    },
    comparison: {
      total_income_pct: pctChange(summary.total_income, prevSummary.total_income),
      total_expense_pct: pctChange(summary.total_expense, prevSummary.total_expense),
      total_profit_pct: pctChange(summary.total_profit, prevSummary.total_profit),
    },
    previous_general: {
      total_income: prevSummary.total_income,
      total_expense: prevSummary.total_expense,
      total_profit: prevSummary.total_profit,
    },
    monthly: summary.monthly.map((m) => {
      const sp = subByMonth.get(m.month);
      return {
        month: m.month,
        income: m.income,
        income_received: m.income,
        income_projected:
          (sp?.subscription_revenue_pending ?? 0) + (sp?.subscription_revenue_projected ?? 0),
        income_projected_subscriptions:
          (sp?.subscription_revenue_pending ?? 0) + (sp?.subscription_revenue_projected ?? 0),
        income_total_potential:
          m.income + (sp?.subscription_revenue_pending ?? 0) + (sp?.subscription_revenue_projected ?? 0),
        expense: m.expense,
        expense_paid: m.expense,
        expense_projected: Math.max(0, (m.projected_expense ?? m.expense) - m.expense),
        expense_total_potential: m.projected_expense ?? m.expense,
        profit: m.profit,
        realized_profit: m.profit,
        projected_result:
          m.income +
          (sp?.subscription_revenue_pending ?? 0) +
          (sp?.subscription_revenue_projected ?? 0) -
          (m.projected_expense ?? m.expense),
        planned_recurring: m.planned_recurring_expense ?? 0,
        planned_credit_card: m.planned_credit_card ?? 0,
        projected_expense: m.projected_expense ?? 0,
        projected_profit: m.projected_profit ?? 0,
        subscription_revenue_realized: sp?.subscription_revenue_realized ?? 0,
        subscription_revenue_pending: sp?.subscription_revenue_pending ?? 0,
        subscription_revenue_projected: sp?.subscription_revenue_projected ?? 0,
      };
    }),
    subscriptions_projection,
    by_account,
    expenses_by_category: catExp.rows.map((r) => ({
      category_id: r.category_id,
      name: r.name,
      amount: centsToReais(Number(r.s ?? 0)),
    })),
    income_by_category: catInc.rows.map((r) => ({
      category_id: r.category_id,
      name: r.name,
      amount: centsToReais(Number(r.s ?? 0)),
    })),
    billing_by_client: billing.rows.map((r) => ({
      client_id: r.client_id,
      client_name: r.client_name,
      invoice_count: Number(r.cnt ?? 0),
      amount: centsToReais(Number(r.s ?? 0)),
    })),
    credit_cards,
    credit_card_bank_payments: centsToReais(Number(ccPay.rows[0]?.s ?? 0)),
    recurring_snapshot: {
      due_in_period_still_open: centsToReais(Number(recur.rows[0]?.open_s ?? 0)),
      paid_in_period: centsToReais(Number(recur.rows[0]?.paid_s ?? 0)),
    },
  };
}
