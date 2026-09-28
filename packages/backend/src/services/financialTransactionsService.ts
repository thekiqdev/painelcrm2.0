/**
 * Movimentações financeiras (financial_transactions).
 */
import { pool } from '../utils/db.js';
import { getFinancialAccount } from './financialAccountsService.js';

export type FinancialTransactionType = 'income' | 'expense';
export type FinancialTransactionStatus = 'pending' | 'completed';
export type FinancialTransactionKind = 'regular' | 'transfer';
export type FinancialTransferDirection = 'in' | 'out';

export type TransactionEntrySource = 'manual' | 'gateway_payment';

export interface FinancialTransactionRow {
  id: string;
  tenant_id: string;
  account_id: string;
  type: FinancialTransactionType;
  amount_cents: number;
  description: string;
  category_id: string | null;
  customer_id: string | null;
  reference_name: string | null;
  transaction_date: string;
  status: FinancialTransactionStatus;
  transaction_kind: FinancialTransactionKind;
  transfer_direction: FinancialTransferDirection | null;
  transfer_id: string | null;
  entry_source: TransactionEntrySource | null;
  reference_type: string | null;
  reference_id: string | null;
  gateway_provider: string | null;
  gateway_reference_id: string | null;
  external_event_id: string | null;
  metadata: unknown | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function listFinancialTransactions(
  tenantId: string,
  filters: {
    type?: FinancialTransactionType | null;
    status?: FinancialTransactionStatus | null;
    transaction_kind?: FinancialTransactionKind | null;
    from?: string | null;
    to?: string | null;
    account_id?: string | null;
    /** Restringe a estas contas (visibilidade); omitir = sem filtro extra. */
    restrict_to_account_ids?: string[] | null;
  }
): Promise<FinancialTransactionRow[]> {
  let q = `SELECT id, tenant_id::text, account_id::text, type, amount_cents, description,
                  category_id::text, customer_id::text, reference_name, transaction_date::text,
                  status, transaction_kind, transfer_direction, transfer_id::text,
                  COALESCE(entry_source, 'manual') AS entry_source,
                  reference_type, reference_id::text, gateway_provider, gateway_reference_id,
                  external_event_id, metadata, project_id::text, created_at, updated_at
           FROM financial_transactions WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let n = 2;
  if (filters.type) {
    q += ` AND type = $${n}`;
    params.push(filters.type);
    n++;
  }
  if (filters.status) {
    q += ` AND status = $${n}`;
    params.push(filters.status);
    n++;
  }
  if (filters.transaction_kind) {
    q += ` AND transaction_kind = $${n}`;
    params.push(filters.transaction_kind);
    n++;
  }
  if (filters.from) {
    q += ` AND transaction_date >= $${n}::date`;
    params.push(filters.from);
    n++;
  }
  if (filters.to) {
    q += ` AND transaction_date <= $${n}::date`;
    params.push(filters.to);
    n++;
  }
  if (filters.account_id) {
    q += ` AND account_id = $${n}`;
    params.push(filters.account_id);
    n++;
  }
  if (filters.restrict_to_account_ids && filters.restrict_to_account_ids.length > 0) {
    q += ` AND account_id = ANY($${n}::uuid[])`;
    params.push(filters.restrict_to_account_ids);
    n++;
  }
  q += ` ORDER BY transaction_date DESC, created_at DESC LIMIT 1000`;
  const r = await pool.query<FinancialTransactionRow>(q, params);
  return r.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents) }));
}

export async function createFinancialTransaction(
  tenantId: string,
  body: {
    account_id: string;
    type: FinancialTransactionType;
    amount_cents: number;
    description: string;
    category_id?: string | null;
    customer_id?: string | null;
    reference_name?: string | null;
    transaction_date: string;
    status?: FinancialTransactionStatus;
    transaction_kind?: FinancialTransactionKind;
    transfer_direction?: FinancialTransferDirection | null;
    transfer_id?: string | null;
    entry_source?: TransactionEntrySource;
    reference_type?: string | null;
    reference_id?: string | null;
    gateway_provider?: string | null;
    gateway_reference_id?: string | null;
    external_event_id?: string | null;
    metadata?: Record<string, unknown> | null;
    project_id?: string | null;
  }
): Promise<FinancialTransactionRow> {
  const acc = await getFinancialAccount(tenantId, body.account_id);
  if (!acc) throw new Error('Conta não encontrada');
  if (body.category_id) {
    const c = await pool.query(
      `SELECT 1 FROM expense_categories WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
      [body.category_id, tenantId]
    );
    if (c.rowCount === 0) throw new Error('Categoria inválida');
  }
  if (body.customer_id) {
    const cl = await pool.query(
      `SELECT 1 FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2::uuid
       WHERE c.id = $1::uuid`,
      [body.customer_id, tenantId]
    );
    if (cl.rowCount === 0) throw new Error('Cliente inválido');
  }
  const metaJson =
    body.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata) : null;

  const r = await pool.query<FinancialTransactionRow>(
    `INSERT INTO financial_transactions (
       tenant_id, account_id, type, amount_cents, description, category_id, customer_id,
       reference_name, transaction_date, status, transaction_kind, transfer_direction, transfer_id,
       entry_source, reference_type, reference_id, gateway_provider, gateway_reference_id, external_event_id, metadata,
       project_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::date, COALESCE($10, 'pending'), COALESCE($11, 'regular'), $12, $13::uuid,
       COALESCE($14, 'manual'), $15, $16::uuid, $17, $18, $19, $20::jsonb, $21::uuid
     )
     RETURNING id, tenant_id::text, account_id::text, type, amount_cents, description,
               category_id::text, customer_id::text, reference_name, transaction_date::text,
               status, transaction_kind, transfer_direction, transfer_id::text,
               COALESCE(entry_source, 'manual') AS entry_source,
               reference_type, reference_id::text, gateway_provider, gateway_reference_id,
               external_event_id, metadata, project_id::text, created_at, updated_at`,
    [
      tenantId,
      body.account_id,
      body.type,
      body.amount_cents,
      body.description.trim(),
      body.category_id ?? null,
      body.customer_id ?? null,
      body.reference_name?.trim() || null,
      body.transaction_date,
      body.status ?? null,
      body.transaction_kind ?? 'regular',
      body.transfer_direction ?? null,
      body.transfer_id ?? null,
      body.entry_source ?? 'manual',
      body.reference_type ?? null,
      body.reference_id ?? null,
      body.gateway_provider ?? null,
      body.gateway_reference_id ?? null,
      body.external_event_id ?? null,
      metaJson,
      body.project_id ?? null,
    ]
  );
  const row = r.rows[0]!;
  return { ...row, amount_cents: Number(row.amount_cents) };
}

export async function getFinancialTransaction(tenantId: string, id: string): Promise<FinancialTransactionRow | null> {
  const r = await pool.query<FinancialTransactionRow>(
    `SELECT id, tenant_id::text, account_id::text, type, amount_cents, description,
            category_id::text, customer_id::text, reference_name, transaction_date::text,
            status, transaction_kind, transfer_direction, transfer_id::text,
            COALESCE(entry_source, 'manual') AS entry_source,
            reference_type, reference_id::text, gateway_provider, gateway_reference_id,
            external_event_id, metadata, project_id::text, created_at, updated_at
     FROM financial_transactions
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, id]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return { ...row, amount_cents: Number(row.amount_cents) };
}

export async function updateFinancialTransaction(
  tenantId: string,
  id: string,
  patch: Partial<{
    description: string;
    amount_cents: number;
    transaction_date: string;
    status: FinancialTransactionStatus;
    category_id: string | null;
    account_id: string;
  }>
): Promise<FinancialTransactionRow | null> {
  const cur = await getFinancialTransaction(tenantId, id);
  if (!cur) return null;
  if (cur.transaction_kind !== 'regular') {
    throw new Error('Só é possível editar movimentos do tipo regular por esta API');
  }
  if (cur.entry_source === 'gateway_payment') {
    throw new Error('Movimento automático do gateway não pode ser editado por esta API');
  }
  const next = {
    description: patch.description !== undefined ? patch.description.trim() : cur.description,
    amount_cents: patch.amount_cents !== undefined ? patch.amount_cents : cur.amount_cents,
    transaction_date: patch.transaction_date !== undefined ? patch.transaction_date : cur.transaction_date,
    status: patch.status !== undefined ? patch.status : cur.status,
    category_id: patch.category_id !== undefined ? patch.category_id : cur.category_id,
    account_id: patch.account_id !== undefined ? patch.account_id : cur.account_id,
  };
  if (next.description.length === 0) throw new Error('Descrição inválida');
  if (next.amount_cents < 0) throw new Error('Valor inválido');
  const acc = await getFinancialAccount(tenantId, next.account_id);
  if (!acc) throw new Error('Conta não encontrada');
  if (next.category_id) {
    const c = await pool.query(
      `SELECT 1 FROM expense_categories WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
      [next.category_id, tenantId]
    );
    if (c.rowCount === 0) throw new Error('Categoria inválida');
  }
  const r = await pool.query<FinancialTransactionRow>(
    `UPDATE financial_transactions SET
       description = $2,
       amount_cents = $3,
       transaction_date = $4::date,
       status = $5,
       category_id = $6,
       account_id = $7::uuid,
       updated_at = now()
     WHERE tenant_id = $1 AND id = $8 AND transaction_kind = 'regular'
     RETURNING id, tenant_id::text, account_id::text, type, amount_cents, description,
               category_id::text, customer_id::text, reference_name, transaction_date::text,
               status, transaction_kind, transfer_direction, transfer_id::text,
               COALESCE(entry_source, 'manual') AS entry_source,
               reference_type, reference_id::text, gateway_provider, gateway_reference_id,
               external_event_id, metadata, project_id::text, created_at, updated_at`,
    [
      tenantId,
      next.description,
      next.amount_cents,
      next.transaction_date,
      next.status,
      next.category_id,
      next.account_id,
      id,
    ]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return { ...row, amount_cents: Number(row.amount_cents) };
}
