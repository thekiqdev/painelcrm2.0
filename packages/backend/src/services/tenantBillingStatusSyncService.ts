/**
 * Sincroniza status da cobrança SaaS com o gateway e devolve payload estável para API (polling).
 */
import { pool } from '../utils/db.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { runPostPaidCleanupForTenantBilling } from './billingGatewayChargeService.js';
import {
  hasTenantBillingPaymentAttemptsTable,
  listTenantBillingAttemptsOpenForGatewaySync,
} from './tenantBillingPaymentAttemptsService.js';

const STATUSES_SYNC_PAYMENT_FROM_GATEWAY = new Set([
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
]);

function isGatewayPaidStatus(raw: string): boolean {
  const u = raw.toUpperCase();
  return u === 'RECEIVED' || u === 'CONFIRMED';
}

export type TenantBillingStatusJson = {
  billing_id: string;
  status: string;
  tenant_status: string | null;
};

export async function syncAndGetTenantBillingStatusJson(billingId: string): Promise<TenantBillingStatusJson | null> {
  const result = await pool.query<{
    id: string;
    status: string;
    tenant_id: string;
    gateway_reference_id: string | null;
    gateway: string | null;
    payment_method: string | null;
    tenant_status: string | null;
  }>(
    `SELECT b.id, b.status, b.tenant_id, b.gateway_reference_id, b.gateway, b.payment_method, t.status AS tenant_status
     FROM tenant_billing b
     LEFT JOIN tenants t ON t.id = b.tenant_id
     WHERE b.id = $1`,
    [billingId],
  );

  const row = result.rows[0];
  if (!row) return null;

  if (row.status === 'paid') {
    return {
      billing_id: row.id,
      status: 'paid',
      tenant_status: row.tenant_status ?? null,
    };
  }

  if (!STATUSES_SYNC_PAYMENT_FROM_GATEWAY.has(row.status) || !row.gateway) {
    return {
      billing_id: row.id,
      status: row.status,
      tenant_status: row.tenant_status ?? null,
    };
  }

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId: row.tenant_id });
  if (!gateway?.getPayment) {
    return {
      billing_id: row.id,
      status: row.status,
      tenant_status: row.tenant_status ?? null,
    };
  }

  const tryRef = async (ref: string, paidAttemptId: string | null): Promise<boolean> => {
    const payment = await gateway.getPayment!(ref);
    const gatewayStatus = payment?.status?.toUpperCase?.() ?? '';
    if (!isGatewayPaidStatus(gatewayStatus)) return false;
    await runPostPaidCleanupForTenantBilling({
      billingId,
      tenantId: row.tenant_id,
      paidAttemptId,
      paidGatewayReferenceId: ref,
      gatewayStatusRaw: payment?.status ?? null,
      paidAt: new Date(),
      paymentMethodFallback: row.payment_method,
    });
    return true;
  };

  if (await hasTenantBillingPaymentAttemptsTable()) {
    const attempts = await listTenantBillingAttemptsOpenForGatewaySync(billingId);
    const seenRefs = new Set<string>();
    for (const att of attempts) {
      const ref = att.gateway_reference_id?.trim();
      if (!ref || seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      if (await tryRef(ref, att.id)) {
        const updated = await pool.query<{ tenant_status: string | null }>(
          `SELECT t.status AS tenant_status FROM tenant_billing b LEFT JOIN tenants t ON t.id = b.tenant_id WHERE b.id = $1`,
          [billingId],
        );
        return {
          billing_id: row.id,
          status: 'paid',
          tenant_status: updated.rows[0]?.tenant_status ?? 'active',
        };
      }
    }

    const mainRef = row.gateway_reference_id?.trim();
    if (mainRef && !seenRefs.has(mainRef)) {
      if (await tryRef(mainRef, null)) {
        const updated = await pool.query<{ tenant_status: string | null }>(
          `SELECT t.status AS tenant_status FROM tenant_billing b LEFT JOIN tenants t ON t.id = b.tenant_id WHERE b.id = $1`,
          [billingId],
        );
        return {
          billing_id: row.id,
          status: 'paid',
          tenant_status: updated.rows[0]?.tenant_status ?? 'active',
        };
      }
    }
  } else {
    const mainRef = row.gateway_reference_id?.trim();
    if (mainRef && (await tryRef(mainRef, null))) {
      const updated = await pool.query<{ tenant_status: string | null }>(
        `SELECT t.status AS tenant_status FROM tenant_billing b LEFT JOIN tenants t ON t.id = b.tenant_id WHERE b.id = $1`,
        [billingId],
      );
      return {
        billing_id: row.id,
        status: 'paid',
        tenant_status: updated.rows[0]?.tenant_status ?? 'active',
      };
    }
  }

  return {
    billing_id: row.id,
    status: row.status,
    tenant_status: row.tenant_status ?? null,
  };
}
