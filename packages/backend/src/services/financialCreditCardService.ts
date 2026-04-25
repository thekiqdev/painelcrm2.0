/**
 * Cartões de crédito: cartões, compras, parcelas, faturas (Fase 3).
 */
import { pool } from '../utils/db.js';
import { createFinancialTransaction } from './financialTransactionsService.js';
import {
  addMonthsFirstDay,
  closingYmdForStatementMonth,
  dueYmdForStatementMonth,
  splitTotalIntoInstallments,
  statementMonthFirstDayFromPurchase,
} from './financialCreditCardCycleUtils.js';

export type CreditCardType = 'personal' | 'business';
export type InstallmentStatus = 'planned' | 'paid' | 'cancelled';
export type StatementStatus = 'open' | 'closed' | 'paid';
export type PurchaseAmountMode = 'total' | 'installment';

export interface CreditCardRow {
  id: string;
  tenant_id: string;
  name: string;
  type: CreditCardType;
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

async function getSystemCategoryId(name: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM expense_categories WHERE tenant_id IS NULL AND lower(name) = lower($1) LIMIT 1`,
    [name]
  );
  return r.rows[0]?.id ?? null;
}

export async function listCreditCards(tenantId: string): Promise<CreditCardRow[]> {
  const r = await pool.query<CreditCardRow & { used_cents: string; next_due: string | null; next_exp: string | null }>(
    `SELECT c.id, c.tenant_id::text, c.name, c.type, c.limit_cents, c.closing_day, c.due_day,
            c.default_payment_account_id::text, c.is_active, c.created_at, c.updated_at,
            COALESCE((
              SELECT SUM(i.amount_cents)::text FROM financial_credit_card_installments i
              WHERE i.credit_card_id = c.id AND i.tenant_id = c.tenant_id AND i.status = 'planned'
            ), '0') AS used_cents,
            (SELECT s.due_date::text FROM financial_credit_card_statements s
             WHERE s.credit_card_id = c.id AND s.tenant_id = c.tenant_id AND s.status = 'open'
             ORDER BY s.due_date ASC LIMIT 1) AS next_due,
            (SELECT s.expected_amount_cents::text FROM financial_credit_card_statements s
             WHERE s.credit_card_id = c.id AND s.tenant_id = c.tenant_id AND s.status = 'open'
             ORDER BY s.due_date ASC LIMIT 1) AS next_exp
     FROM financial_credit_cards c
     WHERE c.tenant_id = $1
     ORDER BY c.is_active DESC, lower(c.name) ASC`,
    [tenantId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    type: row.type,
    limit_cents: row.limit_cents != null ? Number(row.limit_cents) : null,
    closing_day: Number(row.closing_day),
    due_day: Number(row.due_day),
    default_payment_account_id: row.default_payment_account_id,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    used_cents: Number(row.used_cents ?? 0),
    next_statement_due_date: row.next_due,
    next_statement_expected_cents: row.next_exp != null ? Number(row.next_exp) : null,
  }));
}

export async function getCreditCard(tenantId: string, id: string): Promise<CreditCardRow | null> {
  const r = await pool.query<CreditCardRow & { used_cents: string; next_due: string | null; next_exp: string | null }>(
    `SELECT c.id, c.tenant_id::text, c.name, c.type, c.limit_cents, c.closing_day, c.due_day,
            c.default_payment_account_id::text, c.is_active, c.created_at, c.updated_at,
            COALESCE((
              SELECT SUM(i.amount_cents)::text FROM financial_credit_card_installments i
              WHERE i.credit_card_id = c.id AND i.tenant_id = c.tenant_id AND i.status = 'planned'
            ), '0') AS used_cents,
            (SELECT s.due_date::text FROM financial_credit_card_statements s
             WHERE s.credit_card_id = c.id AND s.tenant_id = c.tenant_id AND s.status = 'open'
             ORDER BY s.due_date ASC LIMIT 1) AS next_due,
            (SELECT s.expected_amount_cents::text FROM financial_credit_card_statements s
             WHERE s.credit_card_id = c.id AND s.tenant_id = c.tenant_id AND s.status = 'open'
             ORDER BY s.due_date ASC LIMIT 1) AS next_exp
     FROM financial_credit_cards c
     WHERE c.tenant_id = $1 AND c.id = $2 LIMIT 1`,
    [tenantId, id]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    type: row.type,
    limit_cents: row.limit_cents != null ? Number(row.limit_cents) : null,
    closing_day: Number(row.closing_day),
    due_day: Number(row.due_day),
    default_payment_account_id: row.default_payment_account_id,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    used_cents: Number(row.used_cents ?? 0),
    next_statement_due_date: row.next_due,
    next_statement_expected_cents: row.next_exp != null ? Number(row.next_exp) : null,
  };
}

export async function createCreditCard(
  tenantId: string,
  body: {
    name: string;
    type: CreditCardType;
    limit_cents?: number | null;
    closing_day: number;
    due_day: number;
    default_payment_account_id?: string | null;
    is_active?: boolean;
  }
): Promise<CreditCardRow> {
  if (body.default_payment_account_id) {
    const a = await pool.query(`SELECT 1 FROM financial_accounts WHERE id = $1 AND tenant_id = $2`, [
      body.default_payment_account_id,
      tenantId,
    ]);
    if (a.rowCount === 0) throw new Error('Conta de pagamento inválida');
  }
  const r = await pool.query<CreditCardRow>(
    `INSERT INTO financial_credit_cards (
       tenant_id, name, type, limit_cents, closing_day, due_day, default_payment_account_id, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, true))
     RETURNING id, tenant_id::text, name, type, limit_cents, closing_day, due_day,
               default_payment_account_id::text, is_active, created_at, updated_at`,
    [
      tenantId,
      body.name.trim(),
      body.type,
      body.limit_cents ?? null,
      body.closing_day,
      body.due_day,
      body.default_payment_account_id ?? null,
      body.is_active,
    ]
  );
  const row = r.rows[0]!;
  return {
    ...row,
    limit_cents: row.limit_cents != null ? Number(row.limit_cents) : null,
    closing_day: Number(row.closing_day),
    due_day: Number(row.due_day),
  };
}

export async function updateCreditCard(
  tenantId: string,
  id: string,
  patch: Partial<{
    name: string;
    type: CreditCardType;
    limit_cents: number | null;
    closing_day: number;
    due_day: number;
    default_payment_account_id: string | null;
    is_active: boolean;
  }>
): Promise<CreditCardRow | null> {
  const cur = await pool.query<CreditCardRow>(
    `SELECT id, tenant_id::text, name, type, limit_cents, closing_day, due_day,
            default_payment_account_id::text, is_active, created_at, updated_at
     FROM financial_credit_cards WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id]
  );
  if (cur.rowCount === 0) return null;
  const c = cur.rows[0]!;
  const name = patch.name !== undefined ? patch.name.trim() : c.name;
  const type = (patch.type ?? c.type) as CreditCardType;
  const limit_cents = patch.limit_cents !== undefined ? patch.limit_cents : c.limit_cents;
  const closing_day = patch.closing_day ?? c.closing_day;
  const due_day = patch.due_day ?? c.due_day;
  const default_payment_account_id =
    patch.default_payment_account_id !== undefined ? patch.default_payment_account_id : c.default_payment_account_id;
  const is_active = patch.is_active ?? c.is_active;
  if (default_payment_account_id) {
    const a = await pool.query(`SELECT 1 FROM financial_accounts WHERE id = $1 AND tenant_id = $2`, [
      default_payment_account_id,
      tenantId,
    ]);
    if (a.rowCount === 0) throw new Error('Conta de pagamento inválida');
  }
  const r = await pool.query<CreditCardRow>(
    `UPDATE financial_credit_cards SET
       name = $3, type = $4, limit_cents = $5, closing_day = $6, due_day = $7,
       default_payment_account_id = $8, is_active = $9, updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id::text, name, type, limit_cents, closing_day, due_day,
               default_payment_account_id::text, is_active, created_at, updated_at`,
    [tenantId, id, name, type, limit_cents, closing_day, due_day, default_payment_account_id, is_active]
  );
  const row = r.rows[0]!;
  return {
    ...row,
    limit_cents: row.limit_cents != null ? Number(row.limit_cents) : null,
    closing_day: Number(row.closing_day),
    due_day: Number(row.due_day),
  };
}

export async function recomputeStatementExpected(
  tenantId: string,
  creditCardId: string,
  statementMonthYmd01: string
): Promise<void> {
  const card = await pool.query<CreditCardRow>(
    `SELECT closing_day, due_day FROM financial_credit_cards WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, creditCardId]
  );
  if (card.rowCount === 0) return;
  const closingDay = Number(card.rows[0]!.closing_day);
  const dueDay = Number(card.rows[0]!.due_day);
  const sumR = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_credit_card_installments
     WHERE tenant_id = $1 AND credit_card_id = $2 AND statement_month = $3::date AND status = 'planned'`,
    [tenantId, creditCardId, statementMonthYmd01]
  );
  const expected = Number(sumR.rows[0]?.s ?? 0);
  const closingDate = closingYmdForStatementMonth(statementMonthYmd01, closingDay);
  const dueDate = dueYmdForStatementMonth(statementMonthYmd01, dueDay);
  await pool.query(
    `INSERT INTO financial_credit_card_statements (
       tenant_id, credit_card_id, statement_month, closing_date, due_date, expected_amount_cents, status
     ) VALUES ($1, $2, $3::date, $4::date, $5::date, $6, 'open')
     ON CONFLICT ON CONSTRAINT financial_cc_stmt_unique_month DO UPDATE SET
       expected_amount_cents = EXCLUDED.expected_amount_cents,
       closing_date = EXCLUDED.closing_date,
       due_date = EXCLUDED.due_date,
       updated_at = now()`,
    [tenantId, creditCardId, statementMonthYmd01, closingDate, dueDate, expected]
  );
}

export async function createCreditCardPurchase(
  tenantId: string,
  body: {
    credit_card_id: string;
    category_id?: string | null;
    description: string;
    purchase_date: string;
    /** Valor digitado: total da compra se amount_mode=total; valor de cada parcela se amount_mode=installment. */
    total_amount_cents: number;
    installments_count: number;
    amount_mode?: PurchaseAmountMode;
    notes?: string | null;
  }
): Promise<{ purchase_id: string }> {
  const cardR = await pool.query<CreditCardRow>(
    `SELECT id, closing_day, due_day FROM financial_credit_cards WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1`,
    [tenantId, body.credit_card_id]
  );
  if (cardR.rowCount === 0) throw new Error('Cartão não encontrado ou inactivo');
  const card = cardR.rows[0]!;
  const closingDay = Number(card.closing_day);
  const dueDay = Number(card.due_day);
  if (body.category_id) {
    const c = await pool.query(
      `SELECT 1 FROM expense_categories WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
      [body.category_id, tenantId]
    );
    if (c.rowCount === 0) throw new Error('Categoria inválida');
  }
  const n = Math.max(1, body.installments_count);
  const mode: PurchaseAmountMode = body.amount_mode ?? 'total';
  const inputCents = body.total_amount_cents;
  let totalPurchaseCents: number;
  let amounts: number[];
  if (mode === 'installment') {
    if (!Number.isFinite(inputCents) || inputCents < 0) throw new Error('Valor da parcela inválido');
    totalPurchaseCents = inputCents * n;
    amounts = Array.from({ length: n }, () => inputCents);
  } else {
    if (!Number.isFinite(inputCents) || inputCents < 0) throw new Error('Valor total inválido');
    totalPurchaseCents = inputCents;
    amounts = splitTotalIntoInstallments(totalPurchaseCents, n);
  }
  const firstSm = statementMonthFirstDayFromPurchase(body.purchase_date, closingDay);

  const pr = await pool.query<{ id: string }>(
    `INSERT INTO financial_credit_card_purchases (
       tenant_id, credit_card_id, category_id, description, purchase_date, total_amount_cents, installments_count, notes, amount_mode
     ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9)
     RETURNING id::text`,
    [
      tenantId,
      body.credit_card_id,
      body.category_id ?? null,
      body.description.trim(),
      body.purchase_date,
      totalPurchaseCents,
      n,
      body.notes?.trim() || null,
      mode,
    ]
  );
  const purchaseId = pr.rows[0]!.id;
  const touchedMonths = new Set<string>();
  for (let i = 0; i < n; i++) {
    const sm = addMonthsFirstDay(firstSm, i);
    touchedMonths.add(sm);
    const dueDate = dueYmdForStatementMonth(sm, dueDay);
    const desc = `${body.description.trim()} (${i + 1}/${n})`;
    await pool.query(
      `INSERT INTO financial_credit_card_installments (
         tenant_id, credit_card_id, purchase_id, category_id, description, installment_number, installments_count,
         amount_cents, statement_month, due_date, status
       ) VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9::date, $10::date, 'planned')`,
      [
        tenantId,
        body.credit_card_id,
        purchaseId,
        body.category_id ?? null,
        desc,
        i + 1,
        n,
        amounts[i]!,
        sm,
        dueDate,
      ]
    );
  }
  for (const sm of touchedMonths) {
    await recomputeStatementExpected(tenantId, body.credit_card_id, sm);
  }
  return { purchase_id: purchaseId };
}

export async function listCreditCardPurchases(
  tenantId: string,
  credit_card_id?: string | null
): Promise<unknown[]> {
  let q = `SELECT id, tenant_id::text, credit_card_id::text, category_id::text, description, purchase_date::text,
                  total_amount_cents, installments_count, amount_mode, notes, created_at, updated_at
           FROM financial_credit_card_purchases WHERE tenant_id = $1`;
  const p: unknown[] = [tenantId];
  if (credit_card_id) {
    q += ` AND credit_card_id = $2`;
    p.push(credit_card_id);
  }
  q += ` ORDER BY purchase_date DESC, created_at DESC LIMIT 500`;
  const r = await pool.query(q, p);
  return r.rows.map((row: Record<string, unknown>) => ({
    ...row,
    total_amount_cents: Number(row.total_amount_cents),
    amount_mode: (row.amount_mode as string) === 'installment' ? 'installment' : 'total',
  }));
}

export async function listCreditCardInstallments(
  tenantId: string,
  filters: {
    credit_card_id?: string | null;
    from?: string | null;
    to?: string | null;
    status?: InstallmentStatus | null;
    statement_month?: string | null;
  }
): Promise<unknown[]> {
  let q = `SELECT id, tenant_id::text, credit_card_id::text, purchase_id::text, category_id::text, description,
                  installment_number, installments_count, amount_cents, statement_month::text, due_date::text,
                  status, financial_transaction_id::text, created_at, updated_at
           FROM financial_credit_card_installments WHERE tenant_id = $1`;
  const p: unknown[] = [tenantId];
  let n = 2;
  if (filters.credit_card_id) {
    q += ` AND credit_card_id = $${n}`;
    p.push(filters.credit_card_id);
    n++;
  }
  if (filters.statement_month) {
    q += ` AND statement_month = $${n}::date`;
    p.push(filters.statement_month);
    n++;
  }
  if (filters.from) {
    q += ` AND due_date >= $${n}::date`;
    p.push(filters.from);
    n++;
  }
  if (filters.to) {
    q += ` AND due_date <= $${n}::date`;
    p.push(filters.to);
    n++;
  }
  if (filters.status) {
    q += ` AND status = $${n}`;
    p.push(filters.status);
    n++;
  }
  q += ` ORDER BY due_date ASC, installment_number ASC LIMIT 2000`;
  const r = await pool.query(q, p);
  return r.rows.map((row: Record<string, unknown>) => ({
    ...row,
    amount_cents: Number(row.amount_cents),
    installment_number: Number(row.installment_number),
    installments_count: Number(row.installments_count),
  }));
}

export async function listCreditCardStatements(
  tenantId: string,
  filters: { credit_card_id?: string | null; from?: string | null; to?: string | null; status?: StatementStatus | null }
): Promise<unknown[]> {
  let q = `SELECT id, tenant_id::text, credit_card_id::text, statement_month::text, closing_date::text, due_date::text,
                  expected_amount_cents, manual_amount_cents, difference_amount_cents, status, paid_at::text,
                  payment_account_id::text, payment_transaction_id::text, payment_extra_transaction_id::text,
                  created_at, updated_at
           FROM financial_credit_card_statements WHERE tenant_id = $1`;
  const p: unknown[] = [tenantId];
  let n = 2;
  if (filters.credit_card_id) {
    q += ` AND credit_card_id = $${n}`;
    p.push(filters.credit_card_id);
    n++;
  }
  if (filters.from) {
    q += ` AND statement_month >= $${n}::date`;
    p.push(filters.from);
    n++;
  }
  if (filters.to) {
    q += ` AND statement_month <= $${n}::date`;
    p.push(filters.to);
    n++;
  }
  if (filters.status) {
    q += ` AND status = $${n}`;
    p.push(filters.status);
    n++;
  }
  q += ` ORDER BY statement_month DESC LIMIT 500`;
  const r = await pool.query(q, p);
  return r.rows.map((row: Record<string, unknown>) => ({
    ...row,
    expected_amount_cents: Number(row.expected_amount_cents),
    manual_amount_cents: row.manual_amount_cents != null ? Number(row.manual_amount_cents) : null,
    difference_amount_cents: row.difference_amount_cents != null ? Number(row.difference_amount_cents) : null,
  }));
}

export async function getCreditCardStatementDetail(tenantId: string, statementId: string): Promise<{
  statement: Record<string, unknown>;
  installments: unknown[];
} | null> {
  const s = await pool.query<{
    credit_card_id: string;
    statement_month: string;
    [key: string]: unknown;
  }>(
    `SELECT s.id, s.tenant_id::text AS tenant_id, s.credit_card_id::text AS credit_card_id,
            s.statement_month::text AS statement_month, s.closing_date::text AS closing_date,
            s.due_date::text AS due_date, s.expected_amount_cents, s.manual_amount_cents, s.difference_amount_cents,
            s.status, s.paid_at::text AS paid_at, s.payment_account_id::text AS payment_account_id,
            s.payment_transaction_id::text AS payment_transaction_id,
            s.payment_extra_transaction_id::text AS payment_extra_transaction_id,
            s.created_at, s.updated_at, c.name AS card_name
     FROM financial_credit_card_statements s
     JOIN financial_credit_cards c ON c.id = s.credit_card_id AND c.tenant_id = s.tenant_id
     WHERE s.tenant_id = $1 AND s.id = $2 LIMIT 1`,
    [tenantId, statementId]
  );
  if (s.rowCount === 0) return null;
  const head = s.rows[0]!;
  const inst = await pool.query(
    `SELECT i.id, i.tenant_id::text, i.credit_card_id::text, i.purchase_id::text, i.category_id::text, i.description,
            i.installment_number, i.installments_count, i.amount_cents, i.statement_month::text, i.due_date::text,
            i.status, i.financial_transaction_id::text, i.created_at, i.updated_at,
            p.description AS purchase_description, p.purchase_date::text AS purchase_date
     FROM financial_credit_card_installments i
     JOIN financial_credit_card_purchases p ON p.id = i.purchase_id
     WHERE i.tenant_id = $1 AND i.credit_card_id = $2::uuid AND i.statement_month = $3::date
     ORDER BY i.due_date, i.installment_number`,
    [tenantId, head.credit_card_id, head.statement_month]
  );
  const stmt = { ...head } as Record<string, unknown>;
  stmt.expected_amount_cents = Number(stmt.expected_amount_cents ?? 0);
  stmt.manual_amount_cents =
    stmt.manual_amount_cents != null ? Number(stmt.manual_amount_cents) : null;
  stmt.difference_amount_cents =
    stmt.difference_amount_cents != null ? Number(stmt.difference_amount_cents) : null;
  return {
    statement: stmt,
    installments: inst.rows.map((row: Record<string, unknown>) => ({
      ...row,
      amount_cents: Number(row.amount_cents),
      installment_number: Number(row.installment_number),
      installments_count: Number(row.installments_count),
    })),
  };
}

export async function payCreditCardStatement(
  tenantId: string,
  statementId: string,
  body: {
    payment_account_id: string;
    paid_at?: string | null;
    manual_amount_cents?: number | null;
  }
): Promise<{ payment_transaction_id: string; payment_extra_transaction_id: string | null }> {
  const s = await pool.query<{
    id: string;
    credit_card_id: string;
    statement_month: string;
    status: string;
    expected_amount_cents: string;
  }>(
    `SELECT id::text, credit_card_id::text, statement_month::text, status, expected_amount_cents::text
     FROM financial_credit_card_statements WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, statementId]
  );
  if (s.rowCount === 0) throw new Error('Fatura não encontrada');
  const st = s.rows[0]!;
  if (st.status !== 'open') throw new Error('Fatura já paga ou fechada');
  const accChk = await pool.query(`SELECT 1 FROM financial_accounts WHERE id = $1 AND tenant_id = $2`, [
    body.payment_account_id,
    tenantId,
  ]);
  if (accChk.rowCount === 0) throw new Error('Conta inválida');

  const sumR = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_credit_card_installments
     WHERE tenant_id = $1 AND credit_card_id = $2::uuid AND statement_month = $3::date AND status = 'planned'`,
    [tenantId, st.credit_card_id, st.statement_month]
  );
  const expected = Number(sumR.rows[0]?.s ?? 0);
  const paid =
    body.manual_amount_cents != null && body.manual_amount_cents >= 0 ? body.manual_amount_cents : expected;
  const diff = paid - expected;
  const paidYmd =
    body.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at.trim())
      ? body.paid_at.trim()
      : new Date().toISOString().slice(0, 10);

  const catCard = await getSystemCategoryId('Cartão de crédito');
  const catExtra = await getSystemCategoryId('Despesas não cadastradas');
  if (!catCard) throw new Error('Categoria sistema "Cartão de crédito" em falta — execute migração 152');

  await pool.query('BEGIN');
  try {
    let paymentTransactionId: string;
    let paymentExtraTransactionId: string | null = null;

    if (diff > 0) {
      const txMain = await createFinancialTransaction(tenantId, {
        account_id: body.payment_account_id,
        type: 'expense',
        amount_cents: expected,
        description: `Pagamento fatura do cartão (${st.statement_month.slice(0, 7)})`,
        category_id: catCard,
        transaction_date: paidYmd,
        status: 'completed',
      });
      if (!catExtra) throw new Error('Categoria "Despesas não cadastradas" em falta');
      const txExtra = await createFinancialTransaction(tenantId, {
        account_id: body.payment_account_id,
        type: 'expense',
        amount_cents: diff,
        description: 'Despesas não cadastradas (diferença na fatura do cartão)',
        category_id: catExtra,
        transaction_date: paidYmd,
        status: 'completed',
      });
      paymentTransactionId = txMain.id;
      paymentExtraTransactionId = txExtra.id;
    } else {
      const txMain = await createFinancialTransaction(tenantId, {
        account_id: body.payment_account_id,
        type: 'expense',
        amount_cents: paid,
        description: `Pagamento fatura do cartão (${st.statement_month.slice(0, 7)})`,
        category_id: catCard,
        transaction_date: paidYmd,
        status: 'completed',
      });
      paymentTransactionId = txMain.id;
    }

    await pool.query(
      `UPDATE financial_credit_card_installments SET
         status = 'paid',
         financial_transaction_id = $3::uuid,
         updated_at = now()
       WHERE tenant_id = $1 AND credit_card_id = $2::uuid AND statement_month = $4::date AND status = 'planned'`,
      [tenantId, st.credit_card_id, paymentTransactionId, st.statement_month]
    );

    const paidAtIso =
      body.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at.trim())
        ? `${body.paid_at.trim()}T12:00:00.000Z`
        : `${paidYmd}T12:00:00.000Z`;

    await pool.query(
      `UPDATE financial_credit_card_statements SET
         status = 'paid',
         paid_at = $3::timestamptz,
         payment_account_id = $4::uuid,
         payment_transaction_id = $5::uuid,
         payment_extra_transaction_id = $6::uuid,
         manual_amount_cents = $7,
         difference_amount_cents = $8,
         expected_amount_cents = $9,
         updated_at = now()
       WHERE tenant_id = $1 AND id = $2::uuid`,
      [
        tenantId,
        statementId,
        paidAtIso,
        body.payment_account_id,
        paymentTransactionId,
        paymentExtraTransactionId,
        body.manual_amount_cents != null ? paid : null,
        diff,
        expected,
      ]
    );

    await pool.query('COMMIT');
    return { payment_transaction_id: paymentTransactionId, payment_extra_transaction_id: paymentExtraTransactionId };
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

/** Soma parcelas planejadas (cartão) no período por mês de referência da fatura. */
export async function plannedCcInstallmentsByMonth(
  tenantId: string,
  from: string,
  to: string
): Promise<Map<string, number>> {
  const r = await pool.query<{ ym: string; s: string }>(
    `SELECT to_char(statement_month, 'YYYY-MM') AS ym, COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_credit_card_installments
     WHERE tenant_id = $1 AND status = 'planned'
       AND statement_month >= $2::date AND statement_month <= $3::date
     GROUP BY to_char(statement_month, 'YYYY-MM')
     ORDER BY ym`,
    [tenantId, from, to]
  );
  return new Map(r.rows.map((x) => [x.ym, Number(x.s ?? 0)]));
}

export async function sumPlannedCcInstallmentsCents(tenantId: string, from: string, to: string): Promise<number> {
  const r = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_credit_card_installments
     WHERE tenant_id = $1 AND status = 'planned'
       AND statement_month >= $2::date AND statement_month <= $3::date`,
    [tenantId, from, to]
  );
  return Number(r.rows[0]?.s ?? 0);
}

export async function sumOpenCcStatementsExpectedCents(tenantId: string): Promise<number> {
  const r = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(expected_amount_cents), 0)::text AS s
     FROM financial_credit_card_statements
     WHERE tenant_id = $1 AND status = 'open'`,
    [tenantId]
  );
  return Number(r.rows[0]?.s ?? 0);
}
