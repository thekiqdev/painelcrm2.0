/**
 * M5-W Sprint 4 — confirmação de renovação do plano atacado (W3: não re-credita seats_included).
 */

import { pool } from '../utils/db.js';
import type { TenantBillingRow } from '../services/invoiceService.js';
import { clearPartnerWholesalePastDueBySubscription } from './partnerWholesaleStatusService.js';

/**
 * Se a fatura plan_renewal pertence à subscription wholesale do Partner:
 * - ledger plan_renewal com delta 0 (auditoria; top-ups permanecem)
 * - wholesale_status → active
 * Idempotente por billing_id.
 */
export async function maybeConfirmPartnerWholesaleRenewal(
  billing: TenantBillingRow
): Promise<{ handled: boolean; partnerTenantId: string | null }> {
  if ((billing.billing_reason ?? '') !== 'plan_renewal') {
    return { handled: false, partnerTenantId: null };
  }
  if (billing.status !== 'paid') {
    return { handled: false, partnerTenantId: null };
  }
  if (!billing.subscription_id) {
    return { handled: false, partnerTenantId: null };
  }

  const link = await pool.query<{
    partner_tenant_id: string;
    wholesale_plan_id: string | null;
    seats_included: number | null;
  }>(
    `SELECT pp.partner_tenant_id::text,
            pp.wholesale_plan_id::text,
            w.seats_included
     FROM partner_profiles pp
     LEFT JOIN partner_wholesale_plans w ON w.id = pp.wholesale_plan_id
     WHERE pp.wholesale_subscription_id = $1
     LIMIT 1`,
    [billing.subscription_id]
  );
  const row = link.rows[0];
  if (!row) {
    return { handled: false, partnerTenantId: null };
  }

  const dup = await pool.query<{ id: string }>(
    `SELECT id FROM partner_license_ledger
     WHERE billing_id = $1 AND reason = 'plan_renewal'
     LIMIT 1`,
    [billing.id]
  );
  if (dup.rows.length > 0) {
    await clearPartnerWholesalePastDueBySubscription(billing.subscription_id);
    return { handled: true, partnerTenantId: row.partner_tenant_id };
  }

  const bal = await pool.query<{ purchased_seats: number }>(
    `SELECT purchased_seats FROM partner_license_pool WHERE partner_tenant_id = $1`,
    [row.partner_tenant_id]
  );
  const balanceAfter = bal.rows[0]?.purchased_seats ?? 0;

  await pool.query(
    `INSERT INTO partner_license_ledger (
       partner_tenant_id, delta_seats, balance_after, reason,
       billing_id, wholesale_plan_id, note, metadata
     ) VALUES ($1, 0, $2, 'plan_renewal', $3, $4, $5, $6::jsonb)`,
    [
      row.partner_tenant_id,
      balanceAfter,
      billing.id,
      row.wholesale_plan_id,
      'Renovação plano atacado — seats do pacote mantidos (W3)',
      JSON.stringify({
        seats_included: row.seats_included,
        policy: 'w3_no_recredit',
        subscription_id: billing.subscription_id,
      }),
    ]
  );

  await pool.query(
    `UPDATE partner_profiles
     SET wholesale_status = 'active',
         wholesale_past_due_at = NULL,
         updated_at = now()
     WHERE partner_tenant_id = $1`,
    [row.partner_tenant_id]
  );

  console.log('[WHOLESALE] renewal confirmed (no seat recredit)', {
    partnerTenantId: row.partner_tenant_id,
    billingId: billing.id,
    balanceAfter,
  });

  return { handled: true, partnerTenantId: row.partner_tenant_id };
}
