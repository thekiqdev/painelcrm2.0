import { pool } from '../utils/db.js';
import { getFinancialAccount } from './financialAccountsService.js';
import { createFinancialTransaction } from './financialTransactionsService.js';

export interface FinancialTransferRow {
  id: string;
  tenant_id: string;
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  transfer_date: string;
  description: string | null;
  out_transaction_id: string | null;
  in_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function createFinancialTransfer(
  tenantId: string,
  body: {
    from_account_id: string;
    to_account_id: string;
    amount_cents: number;
    transfer_date: string;
    description?: string | null;
  }
): Promise<FinancialTransferRow> {
  if (body.from_account_id === body.to_account_id) {
    throw new Error('Conta de origem e destino devem ser diferentes');
  }
  if (body.amount_cents <= 0) {
    throw new Error('Valor deve ser maior que zero');
  }

  const [fromAcc, toAcc] = await Promise.all([
    getFinancialAccount(tenantId, body.from_account_id),
    getFinancialAccount(tenantId, body.to_account_id),
  ]);
  if (!fromAcc || !toAcc) throw new Error('Conta inválida');

  const created = await pool.query<FinancialTransferRow>(
    `INSERT INTO financial_transfers (
       tenant_id, from_account_id, to_account_id, amount_cents, transfer_date, description
     ) VALUES ($1, $2, $3, $4, $5::date, $6)
     RETURNING id::text, tenant_id::text, from_account_id::text, to_account_id::text, amount_cents,
               transfer_date::text, description, out_transaction_id::text, in_transaction_id::text, created_at, updated_at`,
    [
      tenantId,
      body.from_account_id,
      body.to_account_id,
      body.amount_cents,
      body.transfer_date,
      body.description?.trim() || null,
    ]
  );
  const transfer = created.rows[0]!;

  const baseDesc = body.description?.trim() || null;
  const out = await createFinancialTransaction(tenantId, {
    account_id: body.from_account_id,
    type: 'expense',
    amount_cents: body.amount_cents,
    description: baseDesc ? `Transferência para ${toAcc.name} · ${baseDesc}` : `Transferência para ${toAcc.name}`,
    transaction_date: body.transfer_date,
    status: 'completed',
    transaction_kind: 'transfer',
    transfer_direction: 'out',
    transfer_id: transfer.id,
  });
  const inp = await createFinancialTransaction(tenantId, {
    account_id: body.to_account_id,
    type: 'income',
    amount_cents: body.amount_cents,
    description: baseDesc ? `Transferência de ${fromAcc.name} · ${baseDesc}` : `Transferência de ${fromAcc.name}`,
    transaction_date: body.transfer_date,
    status: 'completed',
    transaction_kind: 'transfer',
    transfer_direction: 'in',
    transfer_id: transfer.id,
  });

  const updated = await pool.query<FinancialTransferRow>(
    `UPDATE financial_transfers
     SET out_transaction_id = $1::uuid, in_transaction_id = $2::uuid, updated_at = now()
     WHERE id = $3
     RETURNING id::text, tenant_id::text, from_account_id::text, to_account_id::text, amount_cents,
               transfer_date::text, description, out_transaction_id::text, in_transaction_id::text, created_at, updated_at`,
    [out.id, inp.id, transfer.id]
  );
  return {
    ...updated.rows[0]!,
    amount_cents: Number(updated.rows[0]!.amount_cents),
  };
}

export async function listFinancialTransfers(
  tenantId: string,
  filters: { account_id?: string | null; from?: string | null; to?: string | null }
): Promise<FinancialTransferRow[]> {
  let q = `SELECT id::text, tenant_id::text, from_account_id::text, to_account_id::text, amount_cents,
                  transfer_date::text, description, out_transaction_id::text, in_transaction_id::text, created_at, updated_at
           FROM financial_transfers WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let n = 2;
  if (filters.account_id) {
    q += ` AND (from_account_id = $${n}::uuid OR to_account_id = $${n}::uuid)`;
    params.push(filters.account_id);
    n++;
  }
  if (filters.from) {
    q += ` AND transfer_date >= $${n}::date`;
    params.push(filters.from);
    n++;
  }
  if (filters.to) {
    q += ` AND transfer_date <= $${n}::date`;
    params.push(filters.to);
    n++;
  }
  q += ` ORDER BY transfer_date DESC, created_at DESC LIMIT 500`;
  const r = await pool.query<FinancialTransferRow>(q, params);
  return r.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents) }));
}

