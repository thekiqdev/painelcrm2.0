/**
 * M5 S5 — ledger de comissões: accrual, extrato, marcar pago, clawback.
 */

import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { computeCommissionAmount } from './partnerCommissionMath.js';
import {
  resolveEffectiveRule,
  toRuleSnapshot,
} from './partnerCommissionRuleService.js';
import { getPartnerLicensePool } from './partnerRepository.js';

export type PartnerCommissionLedgerRow = {
  id: string;
  partner_tenant_id: string;
  seller_user_id: string;
  customer_tenant_id: string;
  billing_id: string | null;
  cycle_number: number;
  sale_amount_cents: number;
  cost_amount_cents: number;
  profit_amount_cents: number;
  commission_amount_cents: number;
  commission_capped: boolean;
  rule_snapshot_json: Record<string, unknown>;
  status: string;
  available_at: string;
  paid_at: string | null;
  payout_id: string | null;
  created_at: string;
  seller_email?: string | null;
  customer_name?: string | null;
};

function mapLedger(row: Record<string, unknown>): PartnerCommissionLedgerRow {
  return {
    id: String(row.id),
    partner_tenant_id: String(row.partner_tenant_id),
    seller_user_id: String(row.seller_user_id),
    customer_tenant_id: String(row.customer_tenant_id),
    billing_id: row.billing_id != null ? String(row.billing_id) : null,
    cycle_number: Number(row.cycle_number ?? 1),
    sale_amount_cents: Number(row.sale_amount_cents ?? 0),
    cost_amount_cents: Number(row.cost_amount_cents ?? 0),
    profit_amount_cents: Number(row.profit_amount_cents ?? 0),
    commission_amount_cents: Number(row.commission_amount_cents ?? 0),
    commission_capped: Boolean(row.commission_capped),
    rule_snapshot_json: (row.rule_snapshot_json ?? {}) as Record<string, unknown>,
    status: String(row.status),
    available_at: String(row.available_at),
    paid_at: row.paid_at != null ? String(row.paid_at) : null,
    payout_id: row.payout_id != null ? String(row.payout_id) : null,
    created_at: String(row.created_at),
    seller_email: row.seller_email != null ? String(row.seller_email) : null,
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
  };
}

export async function listCommissionLedger(
  partnerTenantId: string,
  opts?: { sellerUserId?: string; status?: string }
): Promise<PartnerCommissionLedgerRow[]> {
  const params: unknown[] = [partnerTenantId];
  let where = `l.partner_tenant_id = $1`;
  if (opts?.sellerUserId) {
    params.push(opts.sellerUserId);
    where += ` AND l.seller_user_id = $${params.length}`;
  }
  if (opts?.status) {
    params.push(opts.status);
    where += ` AND l.status = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT l.*, u.email AS seller_email, t.name AS customer_name
     FROM partner_commission_ledger l
     LEFT JOIN users u ON u.id = l.seller_user_id
     LEFT JOIN tenants t ON t.id = l.customer_tenant_id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT 500`,
    params
  );
  return r.rows.map((row) => mapLedger(row));
}

export type AccrueResult =
  | { ok: true; ledger: PartnerCommissionLedgerRow | null; skipped?: string }
  | { ok: false; reason: string; code?: string };

/**
 * Accrual idempotente a partir de tenant_billing paid de customer_tenant com seller.
 */
export async function accrueCommissionForBilling(billingId: string): Promise<AccrueResult> {
  const billing = await pool.query<{
    id: string;
    tenant_id: string;
    amount_cents: number;
    status: string;
    users_count: number | null;
    billing_reason: string | null;
  }>(
    `SELECT id, tenant_id, amount_cents, status, users_count, billing_reason
     FROM tenant_billing WHERE id = $1 LIMIT 1`,
    [billingId]
  );
  const inv = billing.rows[0];
  if (!inv) return { ok: false, reason: 'Fatura não encontrada', code: 'BILLING_NOT_FOUND' };
  if (inv.status !== 'paid') {
    return { ok: false, reason: 'Fatura não está paga', code: 'BILLING_NOT_PAID' };
  }

  const existing = await pool.query(
    `SELECT id FROM partner_commission_ledger
     WHERE billing_id = $1 AND status <> 'clawed_back' LIMIT 1`,
    [billingId]
  );
  if (existing.rows[0]) {
    const full = await pool.query(`SELECT * FROM partner_commission_ledger WHERE id = $1`, [
      existing.rows[0].id,
    ]);
    return { ok: true, ledger: mapLedger(full.rows[0]), skipped: 'already_accrued' };
  }

  const tenant = await pool.query<{
    account_type: string;
    partner_id: string | null;
    seller_user_id: string | null;
  }>(
    `SELECT account_type, partner_id::text AS partner_id, seller_user_id::text AS seller_user_id
     FROM tenants WHERE id = $1 LIMIT 1`,
    [inv.tenant_id]
  );
  const t = tenant.rows[0];
  if (!t || t.account_type !== 'customer_tenant' || !t.partner_id) {
    return { ok: true, ledger: null, skipped: 'not_partner_channel' };
  }
  if (!t.seller_user_id) {
    return { ok: true, ledger: null, skipped: 'house_wallet_no_seller' };
  }

  const partnerId = t.partner_id;
  const sellerId = t.seller_user_id;

  const rule = await resolveEffectiveRule(partnerId, sellerId);
  if (!rule) {
    return { ok: true, ledger: null, skipped: 'no_commission_rule' };
  }

  const prior = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM partner_commission_ledger
     WHERE customer_tenant_id = $1 AND partner_tenant_id = $2 AND status <> 'clawed_back'`,
    [inv.tenant_id, partnerId]
  );
  const cycleNumber = (parseInt(prior.rows[0]?.c || '0', 10) || 0) + 1;

  const poolRow = await getPartnerLicensePool(partnerId);
  const unitCost = poolRow?.unit_cost_cents ?? 0;
  let seats = inv.users_count != null && inv.users_count > 0 ? inv.users_count : 0;
  if (seats < 1) {
    const uc = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM users WHERE tenant_id = $1`,
      [inv.tenant_id]
    );
    seats = Math.max(1, parseInt(uc.rows[0]?.c || '1', 10) || 1);
  }
  const costAmount = unitCost * seats;
  const saleAmount = Math.max(0, inv.amount_cents);
  const snapshot = toRuleSnapshot(rule);
  const computed = computeCommissionAmount({
    saleAmountCents: saleAmount,
    costAmountCents: costAmount,
    rule: snapshot,
    cycleNumber,
  });

  if (computed.skip || computed.commission_amount_cents <= 0) {
    return {
      ok: true,
      ledger: null,
      skipped: computed.skip_reason || 'zero_commission',
    };
  }

  const ins = await pool.query(
    `INSERT INTO partner_commission_ledger (
       partner_tenant_id, seller_user_id, customer_tenant_id, billing_id, cycle_number,
       sale_amount_cents, cost_amount_cents, profit_amount_cents,
       commission_amount_cents, commission_capped, rule_snapshot_json, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, 'available'
     )
     RETURNING *`,
    [
      partnerId,
      sellerId,
      inv.tenant_id,
      billingId,
      cycleNumber,
      saleAmount,
      costAmount,
      computed.profit_amount_cents,
      computed.commission_amount_cents,
      computed.commission_capped,
      JSON.stringify({
        ...snapshot,
        raw_commission_cents: computed.raw_commission_cents,
        billing_reason: inv.billing_reason,
      }),
    ]
  );

  return { ok: true, ledger: mapLedger(ins.rows[0]) };
}

/** Hook seguro pós-activatePlanFromBilling. */
export async function maybeAccruePartnerCommissionForBilling(billingId: string): Promise<void> {
  try {
    const result = await accrueCommissionForBilling(billingId);
    if (!result.ok) {
      console.warn('[partner-commission] accrue_failed', { billingId, ...result });
    }
  } catch (err) {
    console.warn('[partner-commission] accrue_error', { billingId, err });
  }
}

export async function markCommissionsPaid(
  partnerTenantId: string,
  input: {
    ledger_ids: string[];
    reference?: string | null;
    marked_by_user_id?: string | null;
  }
): Promise<{ payout_id: string; amount_cents: number; count: number }> {
  const ids = [...new Set(input.ledger_ids.filter(Boolean))];
  if (ids.length === 0) {
    throw new PartnerAdminError('Informe ledger_ids', 'LEDGER_IDS_REQUIRED', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query<{
      id: string;
      seller_user_id: string;
      commission_amount_cents: number;
      status: string;
    }>(
      `SELECT id, seller_user_id::text AS seller_user_id, commission_amount_cents, status
       FROM partner_commission_ledger
       WHERE partner_tenant_id = $1 AND id = ANY($2::uuid[])
       FOR UPDATE`,
      [partnerTenantId, ids]
    );
    if (rows.rows.length !== ids.length) {
      throw new PartnerAdminError('Uma ou mais linhas não encontradas', 'LEDGER_NOT_FOUND', 404);
    }
    const sellerId = rows.rows[0]!.seller_user_id;
    for (const row of rows.rows) {
      if (row.seller_user_id !== sellerId) {
        throw new PartnerAdminError(
          'Todas as linhas devem ser do mesmo vendedor',
          'MIXED_SELLERS',
          400
        );
      }
      if (row.status !== 'available') {
        throw new PartnerAdminError(
          `Linha ${row.id} não está available (${row.status})`,
          'LEDGER_NOT_AVAILABLE',
          409
        );
      }
    }
    const amount = rows.rows.reduce((s, r) => s + Number(r.commission_amount_cents), 0);
    const payout = await client.query<{ id: string }>(
      `INSERT INTO partner_commission_payouts (
         partner_tenant_id, seller_user_id, amount_cents, reference, marked_by_user_id
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        partnerTenantId,
        sellerId,
        amount,
        input.reference?.trim() || null,
        input.marked_by_user_id ?? null,
      ]
    );
    const payoutId = payout.rows[0]!.id;
    await client.query(
      `UPDATE partner_commission_ledger
       SET status = 'paid', paid_at = now(), payout_id = $1, updated_at = now()
       WHERE id = ANY($2::uuid[])`,
      [payoutId, ids]
    );
    await client.query('COMMIT');
    return { payout_id: payoutId, amount_cents: amount, count: ids.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function clawbackCommission(
  partnerTenantId: string,
  ledgerId: string,
  reason?: string
): Promise<PartnerCommissionLedgerRow> {
  const r = await pool.query(
    `UPDATE partner_commission_ledger
     SET status = 'clawed_back',
         updated_at = now(),
         rule_snapshot_json = rule_snapshot_json || $3::jsonb
     WHERE id = $1 AND partner_tenant_id = $2 AND status IN ('available', 'pending')
     RETURNING *`,
    [
      ledgerId,
      partnerTenantId,
      JSON.stringify({ clawback_reason: reason || 'manual', clawed_back_at: new Date().toISOString() }),
    ]
  );
  if (!r.rows[0]) {
    throw new PartnerAdminError(
      'Linha não encontrada ou já paga/clawed',
      'LEDGER_CLAWBACK_DENIED',
      409
    );
  }
  return mapLedger(r.rows[0]);
}

export async function getSellerCommissionSummary(
  partnerTenantId: string,
  sellerUserId: string
): Promise<{
  available_cents: number;
  paid_cents: number;
  pending_cents: number;
  items: PartnerCommissionLedgerRow[];
}> {
  const items = await listCommissionLedger(partnerTenantId, { sellerUserId });
  let available = 0;
  let paid = 0;
  let pending = 0;
  for (const i of items) {
    if (i.status === 'available') available += i.commission_amount_cents;
    else if (i.status === 'paid') paid += i.commission_amount_cents;
    else if (i.status === 'pending') pending += i.commission_amount_cents;
  }
  return { available_cents: available, paid_cents: paid, pending_cents: pending, items };
}
