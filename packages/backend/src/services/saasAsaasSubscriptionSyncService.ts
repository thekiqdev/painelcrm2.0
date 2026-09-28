/**
 * CA S4 — espelha contrato local ↔ Assinatura Asaas (valor/ciclo + cancelamento).
 * Fail-open: falha no gateway não desfaz a mudança comercial local.
 */
import { pool } from '../utils/db.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import type { GatewaySubscriptionCycle } from '../modules/payments/paymentGatewayTypes.js';
import { billingLog } from './billingLogger.js';

export function mapBillingIntervalToGatewayCycle(
  interval: string | null | undefined
): GatewaySubscriptionCycle {
  switch (String(interval || 'monthly').trim()) {
    case 'weekly':
      return 'weekly';
    case 'quarterly':
      return 'quarterly';
    case 'semi_annual':
      return 'semi_annual';
    case 'yearly':
      return 'yearly';
    default:
      return 'monthly';
  }
}

type LocalAsaasLink = {
  id: string;
  tenant_id: string;
  amount_cents: number;
  billing_interval: string;
  next_billing_date: string | null;
  asaas_subscription_id: string;
  asaas_subscription_gateway: string;
  status: string;
};

async function loadLocalAsaasLink(subscriptionId: string): Promise<LocalAsaasLink | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    amount_cents: number;
    billing_interval: string;
    next_billing_date: string | null;
    asaas_subscription_id: string | null;
    asaas_subscription_gateway: string | null;
    status: string;
  }>(
    `SELECT id::text AS id,
            tenant_id::text AS tenant_id,
            amount_cents,
            billing_interval,
            next_billing_date::text AS next_billing_date,
            asaas_subscription_id,
            asaas_subscription_gateway,
            status
     FROM subscriptions
     WHERE id = $1::uuid AND type = 'saas'
     LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0];
  if (!row?.asaas_subscription_id?.trim()) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    amount_cents: row.amount_cents,
    billing_interval: row.billing_interval,
    next_billing_date: row.next_billing_date,
    asaas_subscription_id: row.asaas_subscription_id.trim(),
    asaas_subscription_gateway: (row.asaas_subscription_gateway ?? 'asaas').trim() || 'asaas',
    status: row.status,
  };
}

/**
 * PUT valor/ciclo na Assinatura Asaas após mudança contratual (CS / PATCH / upgrade pago).
 * `updatePendingPayments: true` alinha cobranças abertas do ciclo no Asaas.
 */
export async function syncAsaasSubscriptionFromLocalContract(params: {
  subscriptionId: string;
  /** Override opcional (ex.: valor já calculado no caller). */
  amountCents?: number;
  billingInterval?: string;
  updatePendingPayments?: boolean;
  reason?: string;
}): Promise<{ synced: boolean; detail: string }> {
  const link = await loadLocalAsaasLink(params.subscriptionId);
  if (!link) {
    return { synced: false, detail: 'no_asaas_subscription' };
  }

  const amountCents =
    typeof params.amountCents === 'number' && Number.isFinite(params.amountCents)
      ? Math.round(params.amountCents)
      : link.amount_cents;
  const interval = params.billingInterval ?? link.billing_interval;
  const cycle = mapBillingIntervalToGatewayCycle(interval);

  try {
    const gateway = await getActiveGateway({
      billingType: 'saas',
      tenantId: link.tenant_id,
    });
    if (!gateway || typeof gateway.updateSubscription !== 'function') {
      return { synced: false, detail: 'gateway_unavailable' };
    }

    await gateway.updateSubscription(link.asaas_subscription_id, {
      amountCents,
      cycle,
      updatePendingPayments: params.updatePendingPayments !== false,
      nextDueDate: link.next_billing_date?.slice(0, 10) || undefined,
      externalReference: link.tenant_id,
    });

    billingLog('invoice', 'asaas_subscription_synced', {
      subscription_id: link.id,
      asaas_subscription_id: link.asaas_subscription_id,
      amount_cents: amountCents,
      cycle,
      reason: params.reason ?? 'contract_change',
    });
    return { synced: true, detail: 'updated' };
  } catch (e) {
    console.error('[CA S4] syncAsaasSubscriptionFromLocalContract failed', {
      subscriptionId: params.subscriptionId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      synced: false,
      detail: e instanceof Error ? e.message.slice(0, 200) : 'sync_failed',
    };
  }
}

/**
 * Cancela/inativa Assinatura Asaas quando a assinatura local é cancelada.
 * Também usado em `cancel_at_period_end` para evitar nova cobrança Asaas
 * enquanto o acesso local permanece até o fim do período.
 */
export async function cancelAsaasSubscriptionForLocal(params: {
  subscriptionId: string;
  reason?: string;
}): Promise<{ cancelled: boolean; detail: string }> {
  const link = await loadLocalAsaasLink(params.subscriptionId);
  if (!link) {
    return { cancelled: false, detail: 'no_asaas_subscription' };
  }

  try {
    const gateway = await getActiveGateway({
      billingType: 'saas',
      tenantId: link.tenant_id,
    });
    if (!gateway) {
      return { cancelled: false, detail: 'gateway_unavailable' };
    }

    if (typeof gateway.cancelSubscription === 'function') {
      await gateway.cancelSubscription(link.asaas_subscription_id);
    } else if (typeof gateway.updateSubscription === 'function') {
      await gateway.updateSubscription(link.asaas_subscription_id, { status: 'INACTIVE' });
    } else {
      return { cancelled: false, detail: 'gateway_no_cancel' };
    }

    await pool.query(
      `UPDATE subscriptions
       SET asaas_subscription_id = NULL,
           asaas_subscription_gateway = NULL,
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [link.id, link.tenant_id]
    );

    billingLog('invoice', 'asaas_subscription_cancelled', {
      subscription_id: link.id,
      asaas_subscription_id: link.asaas_subscription_id,
      reason: params.reason ?? 'local_cancel',
    });
    return { cancelled: true, detail: 'cancelled' };
  } catch (e) {
    console.error('[CA S4] cancelAsaasSubscriptionForLocal failed', {
      subscriptionId: params.subscriptionId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      cancelled: false,
      detail: e instanceof Error ? e.message.slice(0, 200) : 'cancel_failed',
    };
  }
}

/** Payload leve para Meu Plano / API. */
export async function getAsaasSubscriptionStatusForLocal(
  subscriptionId: string
): Promise<{
  linked: boolean;
  asaas_subscription_id: string | null;
  gateway: string | null;
} | null> {
  const r = await pool.query<{
    asaas_subscription_id: string | null;
    asaas_subscription_gateway: string | null;
  }>(
    `SELECT asaas_subscription_id, asaas_subscription_gateway
     FROM subscriptions WHERE id = $1::uuid AND type = 'saas' LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const id = row.asaas_subscription_id?.trim() || null;
  return {
    linked: Boolean(id),
    asaas_subscription_id: id,
    gateway: id ? (row.asaas_subscription_gateway ?? 'asaas') : null,
  };
}

/**
 * CA S5 — job/engine não deve criar charge avulsa de cartão quando a Assinatura Asaas
 * já é o executor. Rollback: desligar flag `asaas_subscription_owns_card_renewal`.
 */
export async function shouldSkipSaasCardChargeForAsaasSubscription(
  subscriptionId: string | null | undefined
): Promise<{ skip: boolean; reason: string; asaasSubscriptionId: string | null }> {
  const sid = (subscriptionId ?? '').trim();
  if (!sid) {
    return { skip: false, reason: 'no_subscription_id', asaasSubscriptionId: null };
  }

  const status = await getAsaasSubscriptionStatusForLocal(sid);
  const asaasId = status?.asaas_subscription_id ?? null;
  if (!asaasId) {
    return { skip: false, reason: 'no_asaas_subscription', asaasSubscriptionId: null };
  }

  const { isBilling2FlagEnabled } = await import('./billing2/billingFeatureFlags.js');
  const owns = await isBilling2FlagEnabled('asaas_subscription_owns_card_renewal');
  if (!owns) {
    return {
      skip: false,
      reason: 'flag_asaas_subscription_owns_card_renewal_off',
      asaasSubscriptionId: asaasId,
    };
  }

  return {
    skip: true,
    reason: 'asaas_subscription_owns_card_renewal',
    asaasSubscriptionId: asaasId,
  };
}
