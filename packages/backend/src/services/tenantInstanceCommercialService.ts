/**
 * WI3: contratação de conexões WhatsApp extras (instance_addon) — espelho de seat_addon.
 */
import { pool } from '../utils/db.js';
import {
  calculateInstanceAddonProrata,
  type BillingInterval,
  type InstanceAddonProrataBreakdown,
} from './billingService.js';
import { getInvoiceById } from './invoiceService.js';
import { getActiveSaasSubscriptionByTenantAutoRepair } from './billingSubscriptionService.js';
import {
  ensureUsableSaasSubscriptionForActivePaidTenant,
  subscribeInstanceAddon,
} from './subscriptionService.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { getTenantLimit } from './tenantLimitService.js';

const OPEN_INSTANCE_ADDON_STATUSES = ['pending', 'waiting_payment', 'processing', 'overdue'] as const;

export async function repairInstanceAddonPendingPointer(tenantId: string): Promise<void> {
  const r = await pool.query<{ b: string | null }>(
    `SELECT instance_addon_pending_billing_id AS b FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const bid = r.rows[0]?.b;
  if (!bid) return;
  const inv = await getInvoiceById(bid);
  const open =
    inv &&
    OPEN_INSTANCE_ADDON_STATUSES.includes(inv.status as (typeof OPEN_INSTANCE_ADDON_STATUSES)[number]);
  if (!open) {
    await pool.query(
      `UPDATE tenants SET instance_addon_pending_billing_id = NULL, updated_at = now() WHERE id = $1`,
      [tenantId]
    );
  }
}

/** Limite contratado efetivo (override ou plano). null = ilimitado (extras não se aplicam). */
export async function effectiveContractedWhatsAppInstances(tenantId: string): Promise<number | null> {
  return getTenantLimit(tenantId, 'max_whatsapp_instances', 'max_whatsapp_instances_override');
}

export async function previewInstanceAddonPurchase(params: {
  tenantId: string;
  planId: string;
  additionalInstances: number;
}): Promise<{
  current_contracted: number;
  new_total: number;
  breakdown: InstanceAddonProrataBreakdown;
  billing_interval: BillingInterval;
}> {
  const { tenantId, planId, additionalInstances } = params;
  if (!Number.isInteger(additionalInstances) || additionalInstances < 1) {
    throw new Error('Informe um número inteiro de novas conexões (mínimo 1)');
  }

  await ensureUsableSaasSubscriptionForActivePaidTenant(tenantId);
  const sub = await getActiveSaasSubscriptionByTenantAutoRepair(tenantId);
  if (!sub?.current_period_start || !sub.current_period_end) {
    throw new Error(
      'Não foi possível calcular o valor proporcional agora. Atualize a página em instantes ou entre em contato com o suporte se continuar.'
    );
  }

  const currentContracted = await effectiveContractedWhatsAppInstances(tenantId);
  if (currentContracted == null) {
    throw new Error(
      'Este plano não tem limite de conexões WhatsApp (ilimitado). Defina um máximo no plano ou override antes de vender extras.'
    );
  }

  const newTotal = currentContracted + additionalInstances;
  const billingInterval = (sub.billing_interval ?? 'monthly') as BillingInterval;
  const contractedRow = await pool.query<{ c: number | null }>(
    `SELECT contracted_price_per_instance_cents AS c FROM subscriptions WHERE id = $1`,
    [sub.id]
  );
  const contractedPi = contractedRow.rows[0]?.c ?? null;

  const breakdown = await calculateInstanceAddonProrata(
    planId,
    billingInterval,
    additionalInstances,
    sub.current_period_start,
    sub.current_period_end,
    { contractedPricePerInstanceCents: contractedPi }
  );

  return {
    current_contracted: currentContracted,
    new_total: newTotal,
    breakdown,
    billing_interval: billingInterval,
  };
}

export async function startInstanceAddonCheckout(params: {
  tenantId: string;
  planId: string;
  additionalInstances: number;
  paymentMethod?: PaymentMethod;
}) {
  await repairInstanceAddonPendingPointer(params.tenantId);

  const pending = await pool.query<{ b: string | null }>(
    `SELECT instance_addon_pending_billing_id AS b FROM tenants WHERE id = $1`,
    [params.tenantId]
  );
  const bid = pending.rows[0]?.b;
  if (bid) {
    const inv = await getInvoiceById(bid);
    if (
      inv &&
      OPEN_INSTANCE_ADDON_STATUSES.includes(inv.status as (typeof OPEN_INSTANCE_ADDON_STATUSES)[number])
    ) {
      throw new Error(
        'Já existe uma cobrança de conexões WhatsApp em aberto. Conclua o pagamento no checkout ou aguarde a confirmação.'
      );
    }
  }

  const preview = await previewInstanceAddonPurchase({
    tenantId: params.tenantId,
    planId: params.planId,
    additionalInstances: params.additionalInstances,
  });

  const breakdownPayload: Record<string, unknown> = {
    ...preview.breakdown,
    previous_contracted: preview.current_contracted,
    new_total_instances: preview.new_total,
  };

  return subscribeInstanceAddon({
    tenantId: params.tenantId,
    planId: params.planId,
    billingInterval: preview.billing_interval,
    newTotalInstances: preview.new_total,
    amountCents: preview.breakdown.amount_cents,
    instanceAddonBreakdown: breakdownPayload,
    paymentMethod: params.paymentMethod,
    source: 'self_service',
  });
}

export async function scheduleInstanceDowngradeNextCycle(params: {
  tenantId: string;
  targetInstances: number;
  instancesInUse: number;
}): Promise<{ scheduled: number | null }> {
  const { tenantId, targetInstances, instancesInUse } = params;

  await repairInstanceAddonPendingPointer(tenantId);

  const pending = await pool.query<{ b: string | null }>(
    `SELECT instance_addon_pending_billing_id AS b FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const bid = pending.rows[0]?.b;
  if (bid) {
    const inv = await getInvoiceById(bid);
    if (
      inv &&
      OPEN_INSTANCE_ADDON_STATUSES.includes(inv.status as (typeof OPEN_INSTANCE_ADDON_STATUSES)[number])
    ) {
      throw new Error(
        'Há cobrança de conexões WhatsApp em aberto. Conclua ou aguarde antes de agendar redução.'
      );
    }
  }

  if (!Number.isInteger(targetInstances) || targetInstances < 1) {
    throw new Error('A quantidade alvo deve ser um inteiro maior ou igual a 1');
  }
  if (targetInstances < instancesInUse) {
    throw new Error(
      `Não é possível agendar menos conexões (${targetInstances}) do que as em uso (${instancesInUse}). Remova conexões antes ou ajuste o valor.`
    );
  }

  const planRow = await pool.query<{ max_whatsapp_instances: number | null }>(
    `SELECT p.max_whatsapp_instances
     FROM tenants t
     JOIN plans p ON p.id = t.plan_id
     WHERE t.id = $1`,
    [tenantId]
  );
  const planIncluded = planRow.rows[0]?.max_whatsapp_instances ?? null;
  const currentContracted = await effectiveContractedWhatsAppInstances(tenantId);
  if (currentContracted == null) {
    throw new Error(
      'Este plano não tem limite de conexões WhatsApp (ilimitado). Redução agendada não se aplica.'
    );
  }
  /** Piso do pacote; NULL no custom = 0 (quantidade contratada vem do override). */
  const planFloor = planIncluded ?? 0;
  if (targetInstances < planFloor) {
    throw new Error(
      `Não é possível agendar abaixo das ${planFloor} conexões inclusas no plano. Para menos, altere o plano.`
    );
  }

  if (targetInstances >= currentContracted) {
    await pool.query(
      `UPDATE tenants SET max_whatsapp_instances_scheduled_next_cycle = NULL, updated_at = now() WHERE id = $1`,
      [tenantId]
    );
    return { scheduled: null };
  }

  await pool.query(
    `UPDATE tenants SET max_whatsapp_instances_scheduled_next_cycle = $1, updated_at = now() WHERE id = $2`,
    [targetInstances, tenantId]
  );
  return { scheduled: targetInstances };
}
