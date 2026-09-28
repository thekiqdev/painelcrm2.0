/**
 * M5-W Sprint 2 — ativa plano atacado (grant admin ou pós-pagamento Platform).
 */

import { pool } from '../utils/db.js';
import type { TenantBillingRow } from '../services/invoiceService.js';
import { setBillingSubscriptionId } from '../services/invoiceService.js';
import {
  createSubscription,
  getActiveSaasSubscriptionByTenant,
  getOpenSaasSubscriptionByTenant,
} from '../services/billingSubscriptionService.js';
import { getBillingSettings } from '../services/billingSettingsService.js';
import { getActiveConfig } from '../services/paymentGatewayConfigService.js';
import { withTenantRlsContext } from '../utils/db.js';
import { PartnerAdminError } from './partnerErrors.js';
import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';
import { getWholesalePlan, type PartnerWholesalePlan } from './partnerWholesalePlanService.js';
import { getPartnerDetail, resolveDefaultPlanId } from './partnerRepository.js';
import { logSuperAdminAction } from '../services/auditLogService.js';
import type { WholesaleBillingInterval } from './partnerWholesalePlanService.js';

function wholesalePlanIdFromBilling(billing: TenantBillingRow): string | null {
  const meta =
    billing.gateway_metadata && typeof billing.gateway_metadata === 'object'
      ? (billing.gateway_metadata as Record<string, unknown>)
      : {};
  const id = meta.wholesale_plan_id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

async function ledgerExistsForBilling(billingId: string): Promise<boolean> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM partner_license_ledger
     WHERE billing_id = $1
       AND reason IN ('plan_activate', 'grant')
     LIMIT 1`,
    [billingId]
  );
  return r.rows.length > 0;
}

export async function resolveWholesaleEnvelopePlanId(
  plan: PartnerWholesalePlan,
  partnerTenantId: string
): Promise<string | null> {
  if (plan.envelope_plan_id) return plan.envelope_plan_id;
  const detail = await getPartnerDetail(partnerTenantId);
  if (detail?.plan_id) return detail.plan_id;
  return resolveDefaultPlanId();
}

function addIntervalYmd(startYmd: string, interval: WholesaleBillingInterval): string {
  const [y, m, d] = startYmd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const months =
    interval === 'yearly' ? 12 : interval === 'semi_annual' ? 6 : interval === 'quarterly' ? 3 : 1;
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

/**
 * Snapshot de subscription SaaS no tenant Partner (cobrança Platform; renovação = Sprint 4).
 */
export async function ensureWholesaleSubscriptionSnapshot(params: {
  tenantId: string;
  planId: string;
  billingInterval: WholesaleBillingInterval;
  amountCents: number;
  usersCount: number | null;
  billingId: string | null;
}): Promise<string | null> {
  const periodStartStr = new Date().toISOString().slice(0, 10);
  const periodEndStr = addIntervalYmd(periodStartStr, params.billingInterval);

  return withTenantRlsContext(params.tenantId, async () => {
    let activeSub = await getActiveSaasSubscriptionByTenant(params.tenantId);
    if (!activeSub) {
      const open = await getOpenSaasSubscriptionByTenant(params.tenantId);
      if (open) activeSub = open;
    }

    if (!activeSub) {
      const config = await getActiveConfig('saas');
      const gatewayKey = config?.gateway_key ?? 'asaas';
      const billingSettings = await getBillingSettings();
      const dayPart = parseInt(periodStartStr.slice(8, 10), 10);
      const billing_anchor_day =
        Number.isFinite(dayPart) && dayPart >= 1 && dayPart <= 31 ? dayPart : 1;

      try {
        activeSub = await createSubscription({
          type: 'saas',
          tenant_id: params.tenantId,
          plan_id: params.planId,
          amount_cents: params.amountCents,
          billing_interval: params.billingInterval,
          next_billing_date: periodEndStr,
          current_period_start: periodStartStr,
          current_period_end: periodEndStr,
          billing_anchor_day,
          grace_period_days: billingSettings.grace_period_days,
          users_count: params.usersCount,
          gateway: gatewayKey,
          created_by: 'partner_wholesale',
          status: 'active',
        });
      } catch (e: unknown) {
        const pgCode =
          typeof e === 'object' && e !== null && 'code' in e
            ? String((e as { code: unknown }).code)
            : '';
        if (pgCode === '23505') {
          activeSub = await getActiveSaasSubscriptionByTenant(params.tenantId);
        } else {
          throw e;
        }
      }
    }

    if (activeSub && params.billingId) {
      await setBillingSubscriptionId(params.billingId, activeSub.id);
    }

    return activeSub?.id ?? null;
  });
}

async function linkWholesaleSubscription(
  partnerTenantId: string,
  subscriptionId: string | null
): Promise<void> {
  if (!subscriptionId) return;
  await pool.query(
    `UPDATE partner_profiles
     SET wholesale_subscription_id = $1, updated_at = now()
     WHERE partner_tenant_id = $2`,
    [subscriptionId, partnerTenantId]
  );
}

/**
 * Pós-pagamento (webhook / zero-settlement) — billing_reason=partner_wholesale.
 */
export async function activatePartnerWholesaleFromBilling(
  billing: TenantBillingRow
): Promise<void> {
  if (billing.status !== 'paid') {
    console.log('[WHOLESALE] activate skipped — billing not paid', {
      billingId: billing.id,
      status: billing.status,
    });
    return;
  }

  if (await ledgerExistsForBilling(billing.id)) {
    console.log('[WHOLESALE] activate idempotent', { billingId: billing.id });
    return;
  }

  const wholesalePlanId = wholesalePlanIdFromBilling(billing);
  if (!wholesalePlanId) {
    console.error('[WHOLESALE] billing sem wholesale_plan_id no metadata', {
      billingId: billing.id,
    });
    return;
  }

  const plan = await getWholesalePlan(wholesalePlanId);
  if (!plan) {
    console.error('[WHOLESALE] plano não encontrado', { wholesalePlanId, billingId: billing.id });
    return;
  }

  const partnerTenantId = billing.tenant_id;
  const seats = Math.max(0, Math.trunc(plan.seats_included));
  const envelopePlanId = await resolveWholesaleEnvelopePlanId(plan, partnerTenantId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dup = await client.query<{ id: string }>(
      `SELECT id FROM partner_license_ledger
       WHERE billing_id = $1 AND reason IN ('plan_activate', 'grant')
       LIMIT 1`,
      [billing.id]
    );
    if (dup.rows.length > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(
      `UPDATE partner_profiles
       SET wholesale_plan_id = $1,
           wholesale_status = 'active',
           updated_at = now()
       WHERE partner_tenant_id = $2`,
      [plan.id, partnerTenantId]
    );

    if (envelopePlanId) {
      await client.query(
        `UPDATE tenants SET plan_id = $1, updated_at = now() WHERE id = $2`,
        [envelopePlanId, partnerTenantId]
      );
    }

    if (seats > 0) {
      await applyPartnerLicenseDelta({
        partnerTenantId,
        deltaSeats: seats,
        reason: 'plan_activate',
        billingId: billing.id,
        wholesalePlanId: plan.id,
        note: `Ativação plano atacado ${plan.slug}`,
        metadata: {
          mode: 'charge',
          seats_included: seats,
          wholesale_plan_slug: plan.slug,
        },
        client,
      });
    } else {
      const bal = await client.query<{ purchased_seats: number }>(
        `SELECT purchased_seats FROM partner_license_pool WHERE partner_tenant_id = $1 FOR UPDATE`,
        [partnerTenantId]
      );
      await client.query(
        `INSERT INTO partner_license_ledger (
           partner_tenant_id, delta_seats, balance_after, reason,
           billing_id, wholesale_plan_id, note, metadata
         ) VALUES ($1, 0, $2, 'plan_activate', $3, $4, $5, $6::jsonb)`,
        [
          partnerTenantId,
          bal.rows[0]?.purchased_seats ?? 0,
          billing.id,
          plan.id,
          `Ativação plano atacado ${plan.slug} (0 seats)`,
          JSON.stringify({ mode: 'charge', seats_included: 0 }),
        ]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  if (envelopePlanId) {
    try {
      const subId = await ensureWholesaleSubscriptionSnapshot({
        tenantId: partnerTenantId,
        planId: envelopePlanId,
        billingInterval: plan.billing_interval,
        amountCents: plan.price_cents,
        usersCount: seats > 0 ? seats : null,
        billingId: billing.id,
      });
      await linkWholesaleSubscription(partnerTenantId, subId);
      const { syncPartnerWholesaleRecurringAmount } = await import(
        './partnerWholesaleRecurringService.js'
      );
      await syncPartnerWholesaleRecurringAmount(partnerTenantId);
    } catch (e) {
      console.error('[WHOLESALE] falha ao criar snapshot subscription', e);
    }
  }

  console.log('[WHOLESALE] ativado via billing', {
    partnerTenantId,
    wholesalePlanId: plan.id,
    billingId: billing.id,
    seats,
  });
}

/**
 * Admin grant — ativa sem Asaas (W9).
 */
export async function assignWholesalePlanGrant(input: {
  partnerTenantId: string;
  wholesalePlanId: string;
  actorUserId?: string | null;
  note?: string | null;
}): Promise<{
  plan: PartnerWholesalePlan;
  seatsCredited: number;
  purchased_seats: number;
}> {
  const detail = await getPartnerDetail(input.partnerTenantId);
  if (!detail) {
    throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  }

  const plan = await getWholesalePlan(input.wholesalePlanId);
  if (!plan) {
    throw new PartnerAdminError('Plano atacado não encontrado', 'WHOLESALE_NOT_FOUND', 404);
  }
  if (plan.status === 'archived') {
    throw new PartnerAdminError('Plano atacado arquivado', 'WHOLESALE_ARCHIVED', 400);
  }

  const seats = Math.max(0, Math.trunc(plan.seats_included));
  const envelopePlanId = await resolveWholesaleEnvelopePlanId(plan, input.partnerTenantId);

  const client = await pool.connect();
  let seatsCredited = 0;
  let purchased = detail.purchased_seats;

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE partner_profiles
       SET wholesale_plan_id = $1,
           wholesale_status = 'active',
           updated_at = now()
       WHERE partner_tenant_id = $2`,
      [plan.id, input.partnerTenantId]
    );

    if (envelopePlanId) {
      await client.query(
        `UPDATE tenants SET plan_id = $1, updated_at = now() WHERE id = $2`,
        [envelopePlanId, input.partnerTenantId]
      );
    }

    if (seats > 0) {
      const led = await applyPartnerLicenseDelta({
        partnerTenantId: input.partnerTenantId,
        deltaSeats: seats,
        reason: 'grant',
        actorUserId: input.actorUserId ?? null,
        wholesalePlanId: plan.id,
        note: input.note ?? `Grant admin — plano atacado ${plan.slug}`,
        metadata: {
          mode: 'grant',
          seats_included: seats,
          wholesale_plan_slug: plan.slug,
        },
        client,
      });
      seatsCredited = seats;
      purchased = led.balanceAfter;
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  if (envelopePlanId) {
    try {
      const subId = await ensureWholesaleSubscriptionSnapshot({
        tenantId: input.partnerTenantId,
        planId: envelopePlanId,
        billingInterval: plan.billing_interval,
        amountCents: plan.price_cents,
        usersCount: seats > 0 ? seats : null,
        billingId: null,
      });
      await linkWholesaleSubscription(input.partnerTenantId, subId);
      const { syncPartnerWholesaleRecurringAmount } = await import(
        './partnerWholesaleRecurringService.js'
      );
      await syncPartnerWholesaleRecurringAmount(input.partnerTenantId);
    } catch (e) {
      console.error('[WHOLESALE] falha snapshot subscription (grant)', e);
    }
  }

  if (input.actorUserId) {
    await logSuperAdminAction(
      input.actorUserId,
      'partner_wholesale.assign_grant',
      'partner',
      input.partnerTenantId,
      { wholesale_plan_id: plan.id, seats_credited: seatsCredited }
    );
  }

  return { plan, seatsCredited, purchased_seats: purchased };
}
