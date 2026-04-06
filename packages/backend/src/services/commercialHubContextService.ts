/**
 * Contexto somente leitura para o hub comercial (Meu plano): cobrança SaaS em aberto.
 * Não cria cobrança nem duplica regras do checkout / subscriptionService.
 */
import { pool } from '../utils/db.js';

const OPEN_BILLING_STATUSES = [
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
] as const;

export interface PendingBillingPublic {
  billing_id: string;
  status: string;
  amount_cents: number;
  due_date: string | null;
  payment_method: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
  gateway: string | null;
  invoice_number: string | null;
  /** Indica se já existe cobrança no gateway (ex.: polling /api/billing/:id/status). */
  has_gateway_reference: boolean;
  /** true quando esta linha é a mesma que tenants.activated_billing_id */
  is_activated_billing: boolean;
}

type BillingRow = {
  id: string;
  status: string;
  amount_cents: number;
  due_date: Date | string | null;
  payment_method: string | null;
  gateway: string | null;
  gateway_reference_id: string | null;
  invoice_number: string | null;
};

function mapRow(row: BillingRow, isActivated: boolean): PendingBillingPublic {
  const due = row.due_date;
  let dueStr: string | null = null;
  if (due != null) {
    const d = due instanceof Date ? due : new Date(due);
    if (!Number.isNaN(d.getTime())) {
      dueStr = d.toISOString().slice(0, 10);
    }
  }
  const pm = row.payment_method;
  const methodOk =
    pm === 'PIX' || pm === 'BOLETO' || pm === 'CREDIT_CARD' ? pm : null;
  return {
    billing_id: row.id,
    status: row.status,
    amount_cents: row.amount_cents ?? 0,
    due_date: dueStr,
    payment_method: methodOk,
    gateway: row.gateway ?? null,
    invoice_number: row.invoice_number ?? null,
    has_gateway_reference: !!(row.gateway_reference_id && String(row.gateway_reference_id).trim()),
    is_activated_billing: isActivated,
  };
}

function isOpenStatus(status: string): boolean {
  return (OPEN_BILLING_STATUSES as readonly string[]).includes(status);
}

/**
 * Retorna a cobrança em aberto mais relevante: prioriza tenants.activated_billing_id se ainda aberta;
 * senão a mais recente entre status abertos.
 */
export async function getOpenTenantBillingSummary(
  tenantId: string,
  activatedBillingId: string | null | undefined
): Promise<PendingBillingPublic | null> {
  const tenantRow = await pool.query<{
    status: string;
    activated_billing_id: string | null;
  }>(`SELECT status, activated_billing_id FROM tenants WHERE id = $1`, [tenantId]);
  const tr = tenantRow.rows[0];
  if (tr?.status === 'active' && tr.activated_billing_id) {
    const paid = await pool.query<{ status: string }>(
      `SELECT status FROM tenant_billing WHERE id = $1 AND tenant_id = $2`,
      [tr.activated_billing_id, tenantId]
    );
    if (paid.rows[0]?.status === 'paid') {
      return null;
    }
  }

  const fetchOpenById = async (id: string): Promise<BillingRow | null> => {
    const r = await pool.query<BillingRow>(
      `SELECT id, status, amount_cents, due_date, payment_method, gateway, gateway_reference_id, invoice_number
       FROM tenant_billing
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    const row = r.rows[0];
    if (!row || !isOpenStatus(row.status)) return null;
    return row;
  };

  if (activatedBillingId) {
    const row = await fetchOpenById(activatedBillingId);
    if (row) return mapRow(row, true);
  }

  /** Preferir cobranças de plano/upgrade/renovação ao último seat_addon; evita “Meu plano” apontar só para assentos. */
  const latest = await pool.query<BillingRow>(
    `SELECT id, status, amount_cents, due_date, payment_method, gateway, gateway_reference_id, invoice_number
     FROM tenant_billing
     WHERE tenant_id = $1
       AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
     ORDER BY
       CASE WHEN COALESCE(billing_reason, 'plan_purchase') = 'seat_addon' THEN 1 ELSE 0 END ASC,
       created_at DESC
     LIMIT 1`,
    [tenantId]
  );
  const row = latest.rows[0];
  if (!row) return null;
  const isAct = activatedBillingId != null && row.id === activatedBillingId;
  return mapRow(row, isAct);
}
