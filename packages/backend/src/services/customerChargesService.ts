/**
 * Cobranças (customer_charges): agrupam faturas; status open/partial/paid derivado das faturas.
 * Fase 10 — docs/ANALISE-IMPLANTACAO-SEGURA-EVOLUCAO-FINANCEIRO.md
 */
import { pool } from '../utils/db.js';

export interface CustomerChargeRow {
  id: string;
  tenant_id: string;
  client_id: string | null;
  description: string | null;
  status: 'open' | 'partial' | 'paid';
  created_at: string;
  updated_at: string;
}

export interface CustomerChargeWithSummary extends CustomerChargeRow {
  invoice_count: number;
  total_cents: number;
  paid_cents: number;
}

const SELECT_COLUMNS = 'id, tenant_id, client_id, description, status, created_at, updated_at';

export async function listCharges(
  tenantId: string,
  filters: { client_id?: string | null; status?: string | null; q?: string | null; limit?: number; offset?: number } = {}
): Promise<CustomerChargeWithSummary[]> {
  const conditions: string[] = ['c.tenant_id = $1'];
  const params: (string | number)[] = [tenantId];
  let idx = 2;
  if (filters.client_id != null && filters.client_id !== '') {
    conditions.push(`c.client_id = $${idx}`);
    params.push(filters.client_id);
    idx++;
  }
  if (filters.status != null && filters.status !== '') {
    conditions.push(`c.status = $${idx}`);
    params.push(filters.status);
    idx++;
  }
  if (filters.q != null && filters.q.trim() !== '') {
    const safe = filters.q.trim().slice(0, 120).replace(/[%_\\]/g, '');
    const pattern = `%${safe}%`;
    conditions.push(`(
      COALESCE(c.description, '') ILIKE $${idx}
      OR c.id::text ILIKE $${idx}
      OR COALESCE(cl.name, '') ILIKE $${idx}
      OR COALESCE(cl.company, '') ILIKE $${idx}
      OR COALESCE(cl.email, '') ILIKE $${idx}
      OR COALESCE(cl.phone, '') ILIKE $${idx}
    )`);
    params.push(pattern);
    idx++;
  }
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = Math.max(0, filters.offset ?? 0);
  params.push(limit, offset);

  const r = await pool.query<CustomerChargeWithSummary>(
    `SELECT c.id, c.tenant_id, c.client_id, c.description, c.status, c.created_at, c.updated_at,
            COUNT(ci.id)::int AS invoice_count,
            COALESCE(SUM(ci.amount_cents), 0)::int AS total_cents,
            COALESCE(SUM(ci.amount_cents) FILTER (WHERE ci.status = 'paid'), 0)::int AS paid_cents
     FROM customer_charges c
     LEFT JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN customer_invoices ci ON ci.charge_id = c.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY c.id, c.tenant_id, c.client_id, c.description, c.status, c.created_at, c.updated_at
     ORDER BY c.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return r.rows;
}

export async function getChargeById(
  tenantId: string,
  chargeId: string
): Promise<CustomerChargeWithSummary | null> {
  const r = await pool.query<CustomerChargeWithSummary>(
    `SELECT c.id, c.tenant_id, c.client_id, c.description, c.status, c.created_at, c.updated_at,
            COUNT(ci.id)::int AS invoice_count,
            COALESCE(SUM(ci.amount_cents), 0)::int AS total_cents,
            COALESCE(SUM(ci.amount_cents) FILTER (WHERE ci.status = 'paid'), 0)::int AS paid_cents
     FROM customer_charges c
     LEFT JOIN customer_invoices ci ON ci.charge_id = c.id
     WHERE c.id = $1 AND c.tenant_id = $2
     GROUP BY c.id, c.tenant_id, c.client_id, c.description, c.status, c.created_at, c.updated_at`,
    [chargeId, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function createCharge(
  tenantId: string,
  data: { client_id?: string | null; description?: string | null }
): Promise<CustomerChargeRow> {
  const r = await pool.query<CustomerChargeRow>(
    `INSERT INTO customer_charges (tenant_id, client_id, description, status)
     VALUES ($1, $2, $3, 'open')
     RETURNING ${SELECT_COLUMNS}`,
    [tenantId, data.client_id ?? null, data.description ?? null]
  );
  const row = r.rows[0];
  if (!row) throw new Error('createCharge: INSERT retornou vazio');
  return row;
}

export async function updateCharge(
  tenantId: string,
  chargeId: string,
  data: { description?: string | null }
): Promise<CustomerChargeRow | null> {
  const r = await pool.query<CustomerChargeRow>(
    `UPDATE customer_charges SET description = COALESCE($1, description), updated_at = now()
     WHERE id = $2 AND tenant_id = $3
     RETURNING ${SELECT_COLUMNS}`,
    [data.description ?? null, chargeId, tenantId]
  );
  return r.rows[0] ?? null;
}

/**
 * Recalcula o status da cobrança a partir das faturas: open (nenhuma paga), partial (algumas), paid (todas).
 * Chamado após marcar uma fatura como paga (webhook ou manual).
 */
export async function recalculateChargeStatus(chargeId: string): Promise<void> {
  const r = await pool.query<{ cnt: number; paid: number }>(
    `SELECT COUNT(*)::int AS cnt,
            COUNT(*) FILTER (WHERE status = 'paid')::int AS paid
     FROM customer_invoices
     WHERE charge_id = $1`,
    [chargeId]
  );
  const row = r.rows[0];
  if (!row || row.cnt === 0) {
    await pool.query(
      `UPDATE customer_charges SET status = 'open', updated_at = now() WHERE id = $1`,
      [chargeId]
    );
    return;
  }
  const status = row.paid === row.cnt ? 'paid' : row.paid > 0 ? 'partial' : 'open';
  await pool.query(
    `UPDATE customer_charges SET status = $1, updated_at = now() WHERE id = $2`,
    [status, chargeId]
  );
}

export interface ChargeInvoiceSummary {
  id: string;
  invoice_number: string | null;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
}

export async function getInvoicesForCharge(
  tenantId: string,
  chargeId: string
): Promise<ChargeInvoiceSummary[]> {
  const r = await pool.query<ChargeInvoiceSummary>(
    `SELECT id, invoice_number, amount_cents, due_date, status, paid_at
     FROM customer_invoices
     WHERE charge_id = $1 AND tenant_id = $2
     ORDER BY due_date ASC, created_at ASC`,
    [chargeId, tenantId]
  );
  return r.rows;
}
