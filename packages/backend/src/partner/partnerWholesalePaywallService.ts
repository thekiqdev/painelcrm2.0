/**
 * M5-W Block Sprint 2 — paywall Partner: faturas Platform abertas.
 */

import { pool } from '../utils/db.js';
import type { WholesaleStatus } from './partnerWholesaleStatusService.js';
import { getPartnerWholesaleStatusRow } from './partnerWholesaleStatusService.js';

export const PARTNER_PLATFORM_OPEN_BILLING_REASONS = [
  'partner_wholesale',
  'partner_license_topup',
] as const;

export const PARTNER_PLATFORM_OPEN_STATUSES = [
  'overdue',
  'pending',
  'waiting_payment',
  'processing',
] as const;

export type PartnerPlatformOpenInvoice = {
  id: string;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  billing_reason: string;
  due_date: string | null;
  created_at: string;
};

export function isPartnerWholesalePaywallActive(status: WholesaleStatus | string | null | undefined): boolean {
  return status === 'past_due' || status === 'canceled';
}

export async function listPartnerPlatformOpenInvoices(
  partnerTenantId: string,
  opts?: { limit?: number }
): Promise<PartnerPlatformOpenInvoice[]> {
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
  const r = await pool.query<PartnerPlatformOpenInvoice>(
    `SELECT id::text AS id,
            amount_cents,
            status,
            payment_method,
            COALESCE(billing_reason, '') AS billing_reason,
            due_date::text AS due_date,
            created_at::text AS created_at
     FROM tenant_billing
     WHERE tenant_id = $1
       AND COALESCE(billing_reason, '') = ANY($2::text[])
       AND status = ANY($3::text[])
     ORDER BY
       CASE WHEN status = 'overdue' THEN 0 ELSE 1 END,
       due_date ASC NULLS LAST,
       created_at ASC
     LIMIT $4`,
    [
      partnerTenantId,
      [...PARTNER_PLATFORM_OPEN_BILLING_REASONS],
      [...PARTNER_PLATFORM_OPEN_STATUSES],
      limit,
    ]
  );
  return r.rows;
}

export async function getPartnerWholesalePaywallState(partnerTenantId: string): Promise<{
  wholesale_status: WholesaleStatus;
  wholesale_plan_id: string | null;
  wholesale_subscription_id: string | null;
  paywall_active: boolean;
  open_invoices: PartnerPlatformOpenInvoice[];
}> {
  const row = await getPartnerWholesaleStatusRow(partnerTenantId);
  const wholesale_status = (row?.wholesale_status ?? 'none') as WholesaleStatus;
  const open_invoices = await listPartnerPlatformOpenInvoices(partnerTenantId);
  return {
    wholesale_status,
    wholesale_plan_id: row?.wholesale_plan_id ?? null,
    wholesale_subscription_id: row?.wholesale_subscription_id ?? null,
    paywall_active: isPartnerWholesalePaywallActive(wholesale_status),
    open_invoices,
  };
}
