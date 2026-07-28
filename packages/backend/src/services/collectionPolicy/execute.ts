/**
 * Executores Collection Policy (Sprint 3).
 * Destrutivas e cartão: guardadas por Feature Flags (defaults OFF).
 * Fail-open por action: erro de uma não interrompe as demais.
 */
import { isBilling2FlagEnabled } from '../billing2/billingFeatureFlags.js';
import { billingLog } from '../billingLogger.js';
import { getInvoiceById, updateInvoiceGatewayData } from '../invoiceService.js';
import { getActiveGateway } from '../../modules/payments/gatewayProvider.js';
import { getActiveConfig } from '../paymentGatewayConfigService.js';
import {
  ensureBillingChargeNotificationExists,
} from '../platformNotifications/platformBillingChargeNotification.js';
import {
  publishPlatformBillingChargeOverdue,
} from '../platformNotifications/platformBusinessNotifications.js';
import { activatePlanFromBilling } from '../subscriptionService.js';
import { cancelSubscription } from '../billingSubscriptionService.js';
import { pool } from '../../utils/db.js';
import { writeBillingAuditEvent } from './billingAuditEventWriter.js';
import {
  markCollectionActionExecuted,
  wasCollectionActionExecuted,
} from './idempotency.js';
import type { CollectionAction, CollectionEvent, CollectionPolicy } from './types.js';

export type CollectionActionExecResult = {
  type: CollectionAction['type'];
  idempotency_key?: string;
  status: 'ok' | 'skipped' | 'error' | 'stub';
  detail?: string;
};

export type ExecuteCollectionActionsResult = {
  results: CollectionActionExecResult[];
  executed_count: number;
  skipped_count: number;
  error_count: number;
};

async function loadBillingContext(event: CollectionEvent): Promise<{
  billingId: string | null;
  tenantId: string | null;
  subscriptionId: string | null;
}> {
  let billingId = event.billing_id ?? null;
  let tenantId = event.tenant_id ?? null;
  let subscriptionId = event.subscription_id ?? null;

  if (billingId && (!tenantId || !subscriptionId)) {
    try {
      const inv = await getInvoiceById(billingId);
      if (inv) {
        tenantId = tenantId ?? inv.tenant_id;
        subscriptionId = subscriptionId ?? inv.subscription_id ?? null;
      }
    } catch {
      /* ignore */
    }
  }
  return { billingId, tenantId, subscriptionId };
}

async function execNotifyWhatsapp(
  event: CollectionEvent,
  billingId: string | null
): Promise<CollectionActionExecResult> {
  if (!(await isBilling2FlagEnabled('whatsapp_charge_notify'))) {
    return { type: 'notify_whatsapp', status: 'skipped', detail: 'flag_whatsapp_charge_notify_off' };
  }
  if (!billingId) {
    return { type: 'notify_whatsapp', status: 'skipped', detail: 'missing_billing_id' };
  }
  if (event.type === 'payment.overdue' || event.type === 'grace.elapsed') {
    await publishPlatformBillingChargeOverdue(billingId);
    return { type: 'notify_whatsapp', status: 'ok', detail: 'overdue_notify_published' };
  }
  const ens = await ensureBillingChargeNotificationExists(billingId);
  return {
    type: 'notify_whatsapp',
    status: 'ok',
    detail: ens.reason,
  };
}

async function execNotifyEmail(
  event: CollectionEvent,
  billingId: string | null
): Promise<CollectionActionExecResult> {
  if (!(await isBilling2FlagEnabled('email_charge_notify'))) {
    return { type: 'notify_email', status: 'skipped', detail: 'flag_email_charge_notify_off' };
  }
  if (!billingId) {
    return { type: 'notify_email', status: 'skipped', detail: 'missing_billing_id' };
  }
  if (event.type === 'payment.overdue' || event.type === 'grace.elapsed') {
    await publishPlatformBillingChargeOverdue(billingId);
    return { type: 'notify_email', status: 'ok', detail: 'overdue_notify_published' };
  }
  const ens = await ensureBillingChargeNotificationExists(billingId);
  return {
    type: 'notify_email',
    status: 'ok',
    detail: ens.reason,
  };
}

async function execCreatePix(
  event: CollectionEvent,
  billingId: string | null
): Promise<CollectionActionExecResult> {
  if (!billingId) {
    return { type: 'create_pix', status: 'skipped', detail: 'missing_billing_id' };
  }
  const billing = await getInvoiceById(billingId);
  if (!billing) {
    return { type: 'create_pix', status: 'skipped', detail: 'billing_not_found' };
  }
  if (billing.status === 'paid' || billing.status === 'cancelled') {
    return { type: 'create_pix', status: 'skipped', detail: `billing_status_${billing.status}` };
  }
  if (billing.gateway_reference_id) {
    return { type: 'create_pix', status: 'skipped', detail: 'gateway_charge_already_exists' };
  }
  if (billing.amount_cents === 0) {
    return { type: 'create_pix', status: 'skipped', detail: 'zero_amount' };
  }

  const config = await getActiveConfig('saas', billing.tenant_id);
  const gateway = await getActiveGateway({ billingType: 'saas', tenantId: billing.tenant_id });
  if (!gateway) {
    return { type: 'create_pix', status: 'skipped', detail: 'no_active_gateway' };
  }

  const customerId = await gateway.ensureCustomer?.(billing.tenant_id);
  if (!customerId) {
    return { type: 'create_pix', status: 'error', detail: 'ensure_customer_failed' };
  }

  const periodStart =
    typeof event.metadata?.period_start === 'string'
      ? event.metadata.period_start
      : billing.period_start ?? billing.due_date;
  const idempotencyKey =
    billing.idempotency_key ??
    (billing.subscription_id
      ? `saas_renew_${billing.subscription_id}_${periodStart}`
      : `saas_pix_${billingId}`);

  const chargeResult = await gateway.createCharge({
    customerId,
    amountCents: billing.amount_cents,
    dueDate: billing.due_date,
    paymentMethod: 'PIX',
    description: billing.invoice_number ?? `Cobrança ${billingId}`,
    idempotencyKey,
    externalReference: billing.tenant_id,
  });

  await updateInvoiceGatewayData(billingId, {
    gateway: config?.gateway_key ?? 'asaas',
    payment_method: 'PIX',
    gateway_reference_id: chargeResult.paymentId,
    gateway_status: chargeResult.status,
    idempotency_key: idempotencyKey,
  });

  return { type: 'create_pix', status: 'ok', detail: 'pix_charge_created' };
}

async function execPastDue(
  event: CollectionEvent,
  ctx: { subscriptionId: string | null }
): Promise<CollectionActionExecResult> {
  if (!ctx.subscriptionId) {
    return { type: 'mark_subscription_past_due', status: 'skipped', detail: 'missing_subscription_id' };
  }
  const { markSubscriptionPastDue } = await import('./subscriptionPastDueWriter.js');
  const r = await markSubscriptionPastDue({
    subscriptionId: ctx.subscriptionId,
    reason: event.type,
    correlationId: event.correlation_id ?? null,
  });
  return {
    type: 'mark_subscription_past_due',
    status: r.status === 'ok' ? 'ok' : r.status === 'error' ? 'error' : 'skipped',
    detail: r.detail,
  };
}

async function execReactivate(
  event: CollectionEvent,
  billingId: string | null,
  ctx: { subscriptionId: string | null }
): Promise<CollectionActionExecResult> {
  if (!(await isBilling2FlagEnabled('auto_reactivate'))) {
    return { type: 'reactivate_tenant', status: 'skipped', detail: 'flag_auto_reactivate_off' };
  }
  if (!billingId) {
    return { type: 'reactivate_tenant', status: 'skipped', detail: 'missing_billing_id' };
  }
  await activatePlanFromBilling(billingId);

  let pastDueClear = 'n/a';
  if (ctx.subscriptionId) {
    const { clearSubscriptionPastDueOnPaid } = await import('./subscriptionPastDueWriter.js');
    const cleared = await clearSubscriptionPastDueOnPaid({
      subscriptionId: ctx.subscriptionId,
      billingId,
      correlationId: event.correlation_id ?? null,
    });
    pastDueClear = cleared.detail;
  } else {
    // Tenta resolver subscription_id via fatura
    try {
      const inv = await getInvoiceById(billingId);
      if (inv?.subscription_id) {
        const { clearSubscriptionPastDueOnPaid } = await import('./subscriptionPastDueWriter.js');
        const cleared = await clearSubscriptionPastDueOnPaid({
          subscriptionId: inv.subscription_id,
          billingId,
          correlationId: event.correlation_id ?? null,
        });
        pastDueClear = cleared.detail;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    type: 'reactivate_tenant',
    status: 'ok',
    detail: `activate_plan_from_billing;${pastDueClear}`,
  };
}

async function execSuspend(
  event: CollectionEvent,
  ctx: { tenantId: string | null }
): Promise<CollectionActionExecResult> {
  if (!(await isBilling2FlagEnabled('auto_suspend'))) {
    return { type: 'suspend_tenant', status: 'skipped', detail: 'flag_auto_suspend_off' };
  }
  if (!ctx.tenantId) {
    return { type: 'suspend_tenant', status: 'skipped', detail: 'missing_tenant_id' };
  }
  await pool.query(
    `UPDATE tenants
     SET status = 'suspended',
         suspension_reason = 'payment_overdue',
         suspended_at = COALESCE(suspended_at, now()),
         updated_at = now()
     WHERE id = $1
       AND status <> 'suspended'`,
    [ctx.tenantId]
  );
  await writeBillingAuditEvent({
    actor: 'collection_policy_engine',
    actor_type: 'system',
    action: 'tenant.suspended',
    entity_type: 'tenant',
    entity_id: ctx.tenantId,
    reason: 'payment_overdue',
    origin: 'collection_policy',
    correlation_id: event.correlation_id ?? null,
    payload: {
      suspension_reason: 'payment_overdue',
      event_type: event.type,
      billing_id: event.billing_id ?? null,
      subscription_id: event.subscription_id ?? null,
    },
  });
  return { type: 'suspend_tenant', status: 'ok', detail: 'tenant_suspended_payment_overdue' };
}

async function execCancel(
  _event: CollectionEvent,
  ctx: { tenantId: string | null; subscriptionId: string | null }
): Promise<CollectionActionExecResult> {
  if (!(await isBilling2FlagEnabled('auto_cancel'))) {
    return { type: 'cancel_subscription', status: 'skipped', detail: 'flag_auto_cancel_off' };
  }
  if (!ctx.tenantId || !ctx.subscriptionId) {
    return {
      type: 'cancel_subscription',
      status: 'skipped',
      detail: 'missing_tenant_or_subscription',
    };
  }
  const r = await cancelSubscription(ctx.subscriptionId, ctx.tenantId, { immediate: false });
  if (!r.ok) {
    return { type: 'cancel_subscription', status: 'skipped', detail: r.error ?? 'cancel_failed' };
  }
  return { type: 'cancel_subscription', status: 'ok', detail: 'cancel_at_period_end' };
}

async function execWriteAudit(
  event: CollectionEvent,
  action: CollectionAction
): Promise<CollectionActionExecResult> {
  await writeBillingAuditEvent({
    actor: 'collection_policy_engine',
    actor_type: 'system',
    action: 'collection_policy.interpret',
    entity_type: event.billing_id ? 'tenant_billing' : 'collection_event',
    entity_id: event.billing_id ?? event.subscription_id ?? event.tenant_id ?? null,
    reason: action.reason ?? event.type,
    origin: 'collection_policy',
    correlation_id: event.correlation_id ?? null,
    payload: {
      event_type: event.type,
      reason: action.reason ?? null,
      metadata: event.metadata ?? null,
    },
  });
  return { type: 'write_audit_log', status: 'ok', detail: 'audit_written' };
}

/**
 * Sprint 9 — captura com creditCardToken persistido.
 * Flag card_auto_renew OFF → skip (zero mudança).
 */
async function execChargeCard(
  event: CollectionEvent,
  ctx: { billingId: string | null; tenantId: string | null; subscriptionId: string | null }
): Promise<CollectionActionExecResult> {
  if (!(await isBilling2FlagEnabled('card_auto_renew'))) {
    return { type: 'charge_card', status: 'skipped', detail: 'flag_card_auto_renew_off' };
  }
  if (!ctx.billingId) {
    return { type: 'charge_card', status: 'skipped', detail: 'missing_billing_id' };
  }

  const inv = await getInvoiceById(ctx.billingId);
  if (!inv) {
    return { type: 'charge_card', status: 'error', detail: 'billing_not_found' };
  }
  if (inv.status === 'paid') {
    return { type: 'charge_card', status: 'skipped', detail: 'already_paid' };
  }

  const {
    getActiveSaasCardTokenBySubscriptionId,
    getActiveSaasCardTokenByTenantId,
    markSaasCardTokenInvalid,
    cardTokenAuditSafe,
  } = await import('../billing2/billingCardTokenStore.js');

  const subscriptionId = ctx.subscriptionId ?? inv.subscription_id ?? null;
  const saved = subscriptionId
    ? await getActiveSaasCardTokenBySubscriptionId(subscriptionId)
    : ctx.tenantId
      ? await getActiveSaasCardTokenByTenantId(ctx.tenantId)
      : null;

  if (!saved?.card_token) {
    return { type: 'charge_card', status: 'skipped', detail: 'no_saved_card_token' };
  }

  const gateway = await getActiveGateway({
    billingType: 'saas',
    tenantId: inv.tenant_id,
  });
  if (!gateway?.payWithCreditCard) {
    return { type: 'charge_card', status: 'error', detail: 'gateway_no_pay_with_card' };
  }

  let paymentId = inv.gateway_reference_id?.trim() || '';
  const pm = String(inv.payment_method ?? '').toUpperCase();

  // Garante cobrança CREDIT_CARD aberta no gateway
  if (!paymentId || pm !== 'CREDIT_CARD') {
    const customerId = await gateway.ensureCustomer?.(inv.tenant_id);
    if (!customerId) {
      return { type: 'charge_card', status: 'error', detail: 'ensure_customer_failed' };
    }
    const config = await getActiveConfig('saas');
    const gatewayKey = config?.gateway_key ?? inv.gateway ?? 'asaas';
    const due = String(inv.due_date ?? '').slice(0, 10);
    const idempotencyKey = `saas_card_${ctx.billingId}_${event.attempt ?? 1}`;
    try {
      const charge = await gateway.createCharge({
        customerId,
        amountCents: inv.amount_cents,
        dueDate: due,
        paymentMethod: 'CREDIT_CARD',
        description: inv.invoice_number ?? `Cartão ${ctx.billingId}`,
        idempotencyKey,
        externalReference: inv.tenant_id,
      });
      paymentId = charge.paymentId;
      await updateInvoiceGatewayData(ctx.billingId, {
        gateway: gatewayKey,
        payment_method: 'CREDIT_CARD',
        gateway_reference_id: charge.paymentId,
        gateway_status: charge.status,
        idempotency_key: idempotencyKey,
      });
    } catch (e: unknown) {
      return {
        type: 'charge_card',
        status: 'error',
        detail: e instanceof Error ? e.message : 'create_charge_failed',
      };
    }
  }

  try {
    const result = await gateway.payWithCreditCard({
      paymentId,
      creditCardToken: saved.card_token,
    });
    const { normalizeGatewayStatus } = await import(
      '../../modules/payments/webhook/statusNormalizer.js'
    );
    const { applyPaymentEvent } = await import(
      '../../modules/payments/webhook/paymentDomainService.js'
    );
    const normalized = normalizeGatewayStatus(inv.gateway ?? 'asaas', result.status);
    await applyPaymentEvent({
      entityType: 'tenant_billing',
      entityId: ctx.billingId,
      currentStatus: inv.status,
      internalStatus: normalized,
      gatewayStatus: result.status,
      paidAt: normalized === 'paid' ? (result.paidAt ? new Date(result.paidAt) : new Date()) : null,
    });

    await writeBillingAuditEvent({
      actor: 'collection_policy_engine',
      actor_type: 'system',
      action: 'card.capture_ok',
      entity_type: 'tenant_billing',
      entity_id: ctx.billingId,
      reason: 'charge_card',
      origin: 'collection_policy',
      correlation_id: event.correlation_id ?? null,
      payload: {
        subscription_id: saved.subscription_id,
        brand: saved.card_brand,
        last4: saved.card_last4,
        token_mask: cardTokenAuditSafe(saved.card_token),
        gateway_status: result.status,
      },
    });

    return { type: 'charge_card', status: 'ok', detail: `captured:${result.status}` };
  } catch (e: unknown) {
    await markSaasCardTokenInvalid(saved.subscription_id, 'capture_failed').catch(() => undefined);
    await writeBillingAuditEvent({
      actor: 'collection_policy_engine',
      actor_type: 'system',
      action: 'card.capture_failed',
      entity_type: 'tenant_billing',
      entity_id: ctx.billingId,
      reason: 'charge_card',
      origin: 'collection_policy',
      correlation_id: event.correlation_id ?? null,
      payload: {
        subscription_id: saved.subscription_id,
        last4: saved.card_last4,
        error: e instanceof Error ? e.message : String(e),
      },
    });
    return {
      type: 'charge_card',
      status: 'error',
      detail: e instanceof Error ? e.message : 'pay_with_token_failed',
    };
  }
}

async function dispatchOne(
  action: CollectionAction,
  event: CollectionEvent,
  _policy: CollectionPolicy,
  ctx: { billingId: string | null; tenantId: string | null; subscriptionId: string | null }
): Promise<CollectionActionExecResult> {
  switch (action.type) {
    case 'notify_whatsapp':
      return execNotifyWhatsapp(event, ctx.billingId);
    case 'notify_email':
      return execNotifyEmail(event, ctx.billingId);
    case 'create_pix':
      return execCreatePix(event, ctx.billingId);
    case 'reactivate_tenant':
      return execReactivate(event, ctx.billingId, ctx);
    case 'suspend_tenant':
      return execSuspend(event, ctx);
    case 'cancel_subscription':
      return execCancel(event, ctx);
    case 'mark_subscription_past_due':
      return execPastDue(event, ctx);
    case 'write_audit_log':
      return execWriteAudit(event, action);
    case 'charge_card':
      return execChargeCard(event, ctx);
    case 'create_pix_automatic_instruction':
      return execCreatePixAutomaticInstruction(event, ctx);
    default:
      return { type: action.type, status: 'stub', detail: 'unknown_action' };
  }
}

/**
 * Sprint 10 — instrução Pix Automático (flag OFF → skip; sem auth → jornada consentimento).
 */
async function execCreatePixAutomaticInstruction(
  event: CollectionEvent,
  ctx: { billingId: string | null; tenantId: string | null; subscriptionId: string | null }
): Promise<CollectionActionExecResult> {
  if (!(await isBilling2FlagEnabled('pix_automatic'))) {
    return {
      type: 'create_pix_automatic_instruction',
      status: 'skipped',
      detail: 'flag_pix_automatic_off',
    };
  }
  if (!ctx.billingId) {
    return {
      type: 'create_pix_automatic_instruction',
      status: 'skipped',
      detail: 'missing_billing_id',
    };
  }

  const {
    createPixAutomaticInstructionForBilling,
    startPixAutomaticAuthorizationForBilling,
  } = await import('../billing2/billingPixAutomaticService.js');

  const instruction = await createPixAutomaticInstructionForBilling({
    billingId: ctx.billingId,
    correlationId: event.correlation_id ?? null,
    attempt: event.attempt,
  });
  if (instruction.ok) {
    return {
      type: 'create_pix_automatic_instruction',
      status: 'ok',
      detail: `instruction_created:${instruction.payment_id}`,
    };
  }

  if (instruction.detail === 'auth_not_active') {
    const auth = await startPixAutomaticAuthorizationForBilling({
      billingId: ctx.billingId,
      correlationId: event.correlation_id ?? null,
    });
    if (auth.ok) {
      return {
        type: 'create_pix_automatic_instruction',
        status: 'ok',
        detail: `authorization_journey:${auth.authorization_id}`,
      };
    }
    return {
      type: 'create_pix_automatic_instruction',
      status: 'error',
      detail: auth.detail,
    };
  }

  if (instruction.detail === 'outside_instruction_window') {
    return {
      type: 'create_pix_automatic_instruction',
      status: 'skipped',
      detail: 'outside_instruction_window',
    };
  }

  return {
    type: 'create_pix_automatic_instruction',
    status: 'error',
    detail: instruction.detail,
  };
}

/**
 * Executa actions em ordem. Idempotente por idempotency_key.
 */
export async function executeCollectionActions(
  actions: CollectionAction[],
  event: CollectionEvent,
  policy: CollectionPolicy
): Promise<ExecuteCollectionActionsResult> {
  const ctx = await loadBillingContext(event);
  const results: CollectionActionExecResult[] = [];

  for (const action of actions) {
    const key = action.idempotency_key;
    try {
      if (key && (await wasCollectionActionExecuted(key))) {
        const skipped: CollectionActionExecResult = {
          type: action.type,
          idempotency_key: key,
          status: 'skipped',
          detail: 'idempotent_hit',
        };
        results.push(skipped);
        continue;
      }

      const result = await dispatchOne(action, event, policy, ctx);
      result.idempotency_key = key;
      results.push(result);

      if (key) {
        await markCollectionActionExecuted({
          idempotencyKey: key,
          actionType: action.type,
          event,
          status: result.status,
          detail: result.detail,
          correlation_id: event.correlation_id,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const errResult: CollectionActionExecResult = {
        type: action.type,
        idempotency_key: key,
        status: 'error',
        detail: msg,
      };
      results.push(errResult);
      if (key) {
        await markCollectionActionExecuted({
          idempotencyKey: key,
          actionType: action.type,
          event,
          status: 'error',
          detail: msg,
          correlation_id: event.correlation_id,
        });
      }
    }
  }

  const executed_count = results.filter((r) => r.status === 'ok' || r.status === 'stub').length;
  const skipped_count = results.filter((r) => r.status === 'skipped').length;
  const error_count = results.filter((r) => r.status === 'error').length;

  if (await isBilling2FlagEnabled('detailed_logs')) {
    billingLog('job', 'collection_policy_actions_executed', {
      event_type: event.type,
      actions_count: actions.length,
      executed_count,
      skipped_count,
      error_count,
      correlation_id: event.correlation_id ?? '',
      billing_id: event.billing_id ?? '',
    });
  }

  return { results, executed_count, skipped_count, error_count };
}
