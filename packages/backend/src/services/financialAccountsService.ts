/**
 * Contas financeiras (financial_accounts).
 */
import { pool } from '../utils/db.js';

export type FinancialAccountType = 'bank' | 'cash' | 'wallet';
export type FinancialAccountScope = 'business' | 'personal';

/** Quem pode ver a conta além dos admins do tenant (sempre com módulo financeiro). */
export type FinancialAccountVisibilityMode = 'all_finance_users' | 'admins_only' | 'restricted';

export interface FinancialAccountRow {
  id: string;
  tenant_id: string;
  name: string;
  type: FinancialAccountType;
  account_scope: FinancialAccountScope;
  visibility_mode: FinancialAccountVisibilityMode;
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
    `SELECT id, tenant_id::text, name, type, account_scope,
            COALESCE(visibility_mode, 'all_finance_users')::text AS visibility_mode,
            initial_balance_cents, initial_balance_date::text,
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
    `SELECT id, tenant_id::text, name, type, account_scope,
            COALESCE(visibility_mode, 'all_finance_users')::text AS visibility_mode,
            initial_balance_cents, initial_balance_date::text,
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

/**
 * Saldo = saldo inicial + entradas concluídas − despesas concluídas (movimentos com `transaction_date` >= `initial_balance_date`).
 * Inclui `entry_source = gateway_payment` como qualquer outra entrada. Sincronizações de faturas com `paid_at` anterior
 * à data de saldo inicial ajustam a data do movimento para o saldo inicial (ver `financialGatewayReceivablesService`).
 */
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
     RETURNING id, tenant_id::text, name, type, account_scope,
               COALESCE(visibility_mode, 'all_finance_users')::text AS visibility_mode,
               initial_balance_cents, initial_balance_date::text,
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

export async function updateFinancialAccountSettings(
  tenantId: string,
  accountId: string,
  patch: {
    name?: string;
    type?: FinancialAccountType;
    is_active?: boolean;
  }
): Promise<FinancialAccountRow | null> {
  const cur = await getFinancialAccount(tenantId, accountId);
  if (!cur) return null;
  const name = patch.name != null ? patch.name.trim() : cur.name;
  const type = patch.type ?? cur.type;
  const is_active = patch.is_active != null ? patch.is_active : cur.is_active;
  const r = await pool.query<FinancialAccountRow>(
    `UPDATE financial_accounts
     SET name = $3, type = $4::text, is_active = $5, updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id::text, name, type, account_scope,
               COALESCE(visibility_mode, 'all_finance_users')::text AS visibility_mode,
               initial_balance_cents, initial_balance_date::text,
               is_active, created_at, updated_at`,
    [tenantId, accountId, name, type, is_active]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  return { ...row, initial_balance_cents: Number(row.initial_balance_cents) };
}

export type DeleteFinancialAccountErrorCode =
  | 'not_found'
  | 'active'
  | 'has_transactions'
  | 'has_transfers'
  | 'has_recurring'
  | 'has_occurrences';

/**
 * Remove a conta no PostgreSQL. Só permitida com `is_active = false`.
 * Respeita FKs: movimentos, transferências, despesas recorrentes e ocorrências bloqueiam a eliminação.
 * Gateway e permissões eliminam-se em cascade.
 */
export async function deleteFinancialAccount(
  tenantId: string,
  accountId: string
): Promise<{ ok: true } | { ok: false; error: DeleteFinancialAccountErrorCode }> {
  const acc = await getFinancialAccount(tenantId, accountId);
  if (!acc) return { ok: false, error: 'not_found' };
  if (acc.is_active) return { ok: false, error: 'active' };

  const txC = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM financial_transactions
     WHERE tenant_id = $1 AND account_id = $2`,
    [tenantId, accountId]
  );
  if (Number(txC.rows[0]?.c ?? 0) > 0) return { ok: false, error: 'has_transactions' };

  const trC = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM financial_transfers
     WHERE tenant_id = $1 AND (from_account_id = $2 OR to_account_id = $2)`,
    [tenantId, accountId]
  );
  if (Number(trC.rows[0]?.c ?? 0) > 0) return { ok: false, error: 'has_transfers' };

  const reC = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM financial_recurring_expenses
     WHERE tenant_id = $1 AND default_account_id = $2`,
    [tenantId, accountId]
  );
  if (Number(reC.rows[0]?.c ?? 0) > 0) return { ok: false, error: 'has_recurring' };

  const ocC = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM financial_recurring_expense_occurrences
     WHERE tenant_id = $1 AND account_id = $2`,
    [tenantId, accountId]
  );
  if (Number(ocC.rows[0]?.c ?? 0) > 0) return { ok: false, error: 'has_occurrences' };

  const del = await pool.query(
    `DELETE FROM financial_accounts
     WHERE tenant_id = $1 AND id = $2 AND is_active = false`,
    [tenantId, accountId]
  );
  if ((del.rowCount ?? 0) === 0) return { ok: false, error: 'not_found' };
  return { ok: true };
}

