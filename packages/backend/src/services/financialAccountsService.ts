/**
 * Contas financeiras (financial_accounts).
 */
import { pool } from '../utils/db.js';

export type FinancialAccountType = 'bank' | 'cash' | 'wallet';
export type FinancialAccountScope = 'business' | 'personal';

export interface FinancialAccountRow {
  id: string;
  tenant_id: string;
  name: string;
  type: FinancialAccountType;
  account_scope: FinancialAccountScope;
  initial_balance_cents: number;
  initial_balance_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listFinancialAccounts(
  tenantId: string,
  filters?: { account_scope?: FinancialAccountScope | null }
): Promise<FinancialAccountRow[]> {
  const hasScope = filters?.account_scope != null;
  const r = await pool.query<FinancialAccountRow>(
    `SELECT id, tenant_id::text, name, type, account_scope, initial_balance_cents, initial_balance_date::text,
            is_active, created_at, updated_at
     FROM financial_accounts
     WHERE tenant_id = $1
       ${hasScope ? 'AND account_scope = $2' : ''}
     ORDER BY is_active DESC, lower(name) ASC`,
    hasScope ? [tenantId, filters?.account_scope] : [tenantId]
  );
  return r.rows.map((row) => ({
    ...row,
    initial_balance_cents: Number(row.initial_balance_cents),
  }));
}

export async function getFinancialAccount(tenantId: string, id: string): Promise<FinancialAccountRow | null> {
  const r = await pool.query<FinancialAccountRow>(
    `SELECT id, tenant_id::text, name, type, account_scope, initial_balance_cents, initial_balance_date::text,
            is_active, created_at, updated_at
     FROM financial_accounts
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, id]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  return { ...row, initial_balance_cents: Number(row.initial_balance_cents) };
}

/** Saldo = saldo inicial + entradas concluídas − despesas concluídas (desde initial_balance_date). */
export async function getAccountBalanceCents(tenantId: string, accountId: string): Promise<number | null> {
  const acc = await getFinancialAccount(tenantId, accountId);
  if (!acc) return null;
  const inc = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_transactions
     WHERE tenant_id = $1 AND account_id = $2 AND type = 'income' AND status = 'completed'
       AND transaction_date >= $3::date`,
    [tenantId, accountId, acc.initial_balance_date]
  );
  const exp = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
     FROM financial_transactions
     WHERE tenant_id = $1 AND account_id = $2 AND type = 'expense' AND status = 'completed'
       AND transaction_date >= $3::date`,
    [tenantId, accountId, acc.initial_balance_date]
  );
  return acc.initial_balance_cents + Number(inc.rows[0]?.s ?? 0) - Number(exp.rows[0]?.s ?? 0);
}

export async function createFinancialAccount(
  tenantId: string,
  body: {
    name: string;
    type: FinancialAccountType;
    account_scope?: FinancialAccountScope;
    initial_balance_cents: number;
    initial_balance_date: string;
    is_active?: boolean;
  }
): Promise<FinancialAccountRow> {
  const r = await pool.query<FinancialAccountRow>(
    `INSERT INTO financial_accounts (
       tenant_id, name, type, account_scope, initial_balance_cents, initial_balance_date, is_active
     ) VALUES ($1, $2, $3, COALESCE($4, 'business'), $5, $6::date, COALESCE($7, true))
     RETURNING id, tenant_id::text, name, type, account_scope, initial_balance_cents, initial_balance_date::text,
               is_active, created_at, updated_at`,
    [
      tenantId,
      body.name.trim(),
      body.type,
      body.account_scope ?? 'business',
      body.initial_balance_cents,
      body.initial_balance_date,
      body.is_active,
    ]
  );
  const row = r.rows[0]!;
  return { ...row, initial_balance_cents: Number(row.initial_balance_cents) };
}
