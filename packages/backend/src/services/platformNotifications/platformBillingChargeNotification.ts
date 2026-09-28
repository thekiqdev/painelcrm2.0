/**
 * Sprint N.1 — publicação confiável de platform.billing.charge.created para tenant_billing SaaS.
 */
import { pool } from '../../utils/db.js';
import { getInvoiceById } from '../invoiceService.js';
import { publishPlatformBillingChargeCreated } from './platformBusinessNotifications.js';

export const PLATFORM_BILLING_CHARGE_CREATED_EVENT = 'platform.billing.charge.created';

export type BillingChargeNotificationChannels = {
  whatsapp: boolean;
  email: boolean;
};

export async function listBillingChargeCreatedDeliveryChannels(
  billingId: string,
): Promise<BillingChargeNotificationChannels> {
  const r = await pool.query<{ channel: string }>(
    `SELECT channel
     FROM platform_notification_deliveries
     WHERE entity_type = 'tenant_billing'
       AND entity_id = $1::uuid
       AND event_key = $2`,
    [billingId, PLATFORM_BILLING_CHARGE_CREATED_EVENT],
  );
  const channels = new Set(r.rows.map((row) => row.channel));
  return {
    whatsapp: channels.has('whatsapp'),
    email: channels.has('email'),
  };
}

function shouldSkipChargeCreatedNotification(billing: {
  amount_cents: number;
  status: string;
  gateway_metadata: Record<string, unknown> | null;
}): boolean {
  if (billing.amount_cents !== 0) return false;
  const meta =
    billing.gateway_metadata && typeof billing.gateway_metadata === 'object'
      ? billing.gateway_metadata
      : {};
  if (meta.settlement_source === 'zero_amount' || billing.status === 'paid') {
    return true;
  }
  return false;
}

/**
 * Garante deliveries WhatsApp + E-mail para cobrança SaaS criada.
 * Republica apenas se algum canal estiver ausente (idempotência via idempotency_key no engine).
 */
export async function ensureBillingChargeNotificationExists(billingId: string): Promise<{
  republished: boolean;
  reason: 'already_complete' | 'republished' | 'billing_not_found' | 'zero_amount_skip';
  channels: BillingChargeNotificationChannels;
}> {
  const billing = await getInvoiceById(billingId);
  if (!billing) {
    return {
      republished: false,
      reason: 'billing_not_found',
      channels: { whatsapp: false, email: false },
    };
  }

  if (shouldSkipChargeCreatedNotification(billing)) {
    return {
      republished: false,
      reason: 'zero_amount_skip',
      channels: await listBillingChargeCreatedDeliveryChannels(billingId),
    };
  }

  const channels = await listBillingChargeCreatedDeliveryChannels(billingId);
  if (channels.whatsapp && channels.email) {
    return { republished: false, reason: 'already_complete', channels };
  }

  await publishPlatformBillingChargeCreated(billingId);
  const after = await listBillingChargeCreatedDeliveryChannels(billingId);
  return { republished: true, reason: 'republished', channels: after };
}
