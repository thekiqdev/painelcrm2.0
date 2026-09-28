import { runProvisionTransaction } from './billingPlanProvisionDb.js';
import { observeProvisionFailure, pgErrorMessage } from './billingPlanProvisionErrors.js';
import {
  getSubscriptionById,
  type SubscriptionRow,
} from '../../services/billingSubscriptionService.js';
import { repairBillingPlanForSubscription } from './billingPlanRepairService.js';
import { synchronizeBillingPlanFromSubscription } from './billingPlanSynchronizationService.js';
import {
  assertBillingPlanValid,
  validateBillingPlanForSubscription,
} from './billingPlanProvisionValidator.js';
import { logBillingProvision } from './billingPlanProvisionLogger.js';
import {
  recordBillingPlanCreated,
  recordBillingPlanProvisionDuration,
  recordBillingPlanRepaired,
  recordBillingItemsCreated,
  recordBillingItemsRepaired,
  recordBillingPlanSync,
} from './billingPlanProvisionMetrics.js';
import type {
  BillingProvisionResult,
  BillingProvisionStatus,
  EnsureBillingPlanOptions,
} from './types.js';
import { BillingPlanProvisionError } from './types.js';

function isCustomerSubscription(subscription: SubscriptionRow): boolean {
  return subscription.type === 'customer';
}

function assertTenant(subscription: SubscriptionRow, tenantId?: string): void {
  if (tenantId && subscription.tenant_id !== tenantId) {
    throw new BillingPlanProvisionError(
      'Assinatura não pertence ao tenant informado',
      'TENANT_MISMATCH',
      { subscription_id: subscription.id, tenant_id: tenantId }
    );
  }
}

async function loadSubscriptionOrThrow(
  subscriptionId: string,
  tenantId?: string
): Promise<SubscriptionRow> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) {
    throw new BillingPlanProvisionError(
      'Assinatura não encontrada',
      'SUBSCRIPTION_NOT_FOUND',
      { subscription_id: subscriptionId }
    );
  }
  assertTenant(subscription, tenantId);
  return subscription;
}

function buildResult(params: {
  ok: boolean;
  action: BillingProvisionResult['action'];
  subscription: SubscriptionRow;
  billing_plan_id: string | null;
  billing_plan: BillingProvisionResult['billing_plan'];
  items: BillingProvisionResult['items'];
  started: number;
  created_plan: boolean;
  created_items: boolean;
  repaired: boolean;
  synchronized: boolean;
  message: string;
}): BillingProvisionResult {
  return {
    ok: params.ok,
    action: params.action,
    subscription_id: params.subscription.id,
    tenant_id: params.subscription.tenant_id,
    billing_plan_id: params.billing_plan_id,
    billing_plan: params.billing_plan,
    items: params.items,
    duration_ms: Date.now() - params.started,
    created_plan: params.created_plan,
    created_items: params.created_items,
    repaired: params.repaired,
    synchronized: params.synchronized,
    message: params.message,
  };
}

export class BillingPlanProvisionService {
  async validate(
    subscriptionId: string,
    options: EnsureBillingPlanOptions = {}
  ): Promise<BillingProvisionStatus> {
    const subscription = await loadSubscriptionOrThrow(subscriptionId, options.tenantId);
    if (!isCustomerSubscription(subscription)) {
      return {
        subscription_id: subscription.id,
        tenant_id: subscription.tenant_id,
        has_billing_plan: false,
        billing_plan_id: null,
        billing_plan_status: null,
        item_count: 0,
        plan_revision: null,
        valid: true,
        issues: [],
      };
    }
    return validateBillingPlanForSubscription(subscription, {
      periodStartYmd: options.periodStartYmd,
    });
  }

  async provision(
    subscriptionId: string,
    options: EnsureBillingPlanOptions = {}
  ): Promise<BillingProvisionResult> {
    const started = Date.now();
    const subscription = await loadSubscriptionOrThrow(subscriptionId, options.tenantId);
    if (!isCustomerSubscription(subscription)) {
      return buildResult({
        ok: true,
        action: 'noop',
        subscription,
        billing_plan_id: null,
        billing_plan: null,
        items: [],
        started,
        created_plan: false,
        created_items: false,
        repaired: false,
        synchronized: false,
        message: 'Assinatura não elegível para provisionamento CRM',
      });
    }

    try {
      const repaired = await runProvisionTransaction(subscription.tenant_id, async (client) => {
        await client.query(`SELECT id FROM subscriptions WHERE id = $1::uuid FOR UPDATE`, [
          subscription.id,
        ]);
        return repairBillingPlanForSubscription(subscription, {
          periodStartYmd: options.periodStartYmd,
          db: client,
        });
      });

      if (repaired.createdPlan) recordBillingPlanCreated();
      if (repaired.createdItems) {
        recordBillingPlanRepaired();
        recordBillingItemsCreated(repaired.items.length);
      }
      recordBillingPlanProvisionDuration(Date.now() - started);

      logBillingProvision('PROVISION', 'complete', {
        subscription_id: subscription.id,
        billing_plan_id: repaired.plan.id,
        created_plan: repaired.createdPlan,
        created_items: repaired.createdItems,
      });

      return buildResult({
        ok: true,
        action: 'provisioned',
        subscription,
        billing_plan_id: repaired.plan.id,
        billing_plan: repaired.plan,
        items: repaired.items,
        started,
        created_plan: repaired.createdPlan,
        created_items: repaired.createdItems,
        repaired: repaired.createdPlan || repaired.createdItems,
        synchronized: false,
        message: 'Billing Plan provisionado com sucesso',
      });
    } catch (err) {
      observeProvisionFailure(err);
      throw new BillingPlanProvisionError(pgErrorMessage(err), 'PROVISION_FAILED', {
        subscription_id: subscriptionId,
      });
    }
  }

  async repair(
    subscriptionId: string,
    options: EnsureBillingPlanOptions = {}
  ): Promise<BillingProvisionResult> {
    const started = Date.now();
    const subscription = await loadSubscriptionOrThrow(subscriptionId, options.tenantId);
    if (!isCustomerSubscription(subscription)) {
      return buildResult({
        ok: true,
        action: 'noop',
        subscription,
        billing_plan_id: null,
        billing_plan: null,
        items: [],
        started,
        created_plan: false,
        created_items: false,
        repaired: false,
        synchronized: false,
        message: 'Assinatura não elegível para reparo CRM',
      });
    }

    const repaired = await repairBillingPlanForSubscription(subscription, {
      periodStartYmd: options.periodStartYmd,
    });
    recordBillingPlanRepaired();
    if (repaired.createdItems) recordBillingItemsRepaired(repaired.items.length);
    recordBillingPlanProvisionDuration(Date.now() - started);

    return buildResult({
      ok: true,
      action: 'repaired',
      subscription,
      billing_plan_id: repaired.plan.id,
      billing_plan: repaired.plan,
      items: repaired.items,
      started,
      created_plan: repaired.createdPlan,
      created_items: repaired.createdItems,
      repaired: true,
      synchronized: false,
      message: 'Billing Plan reparado com sucesso',
    });
  }

  async synchronize(
    subscriptionId: string,
    options: EnsureBillingPlanOptions = {}
  ): Promise<BillingProvisionResult> {
    const started = Date.now();
    const subscription = await loadSubscriptionOrThrow(subscriptionId, options.tenantId);
    if (!isCustomerSubscription(subscription)) {
      return buildResult({
        ok: true,
        action: 'noop',
        subscription,
        billing_plan_id: null,
        billing_plan: null,
        items: [],
        started,
        created_plan: false,
        created_items: false,
        repaired: false,
        synchronized: false,
        message: 'Assinatura não elegível para sincronização CRM',
      });
    }

    const sync = await synchronizeBillingPlanFromSubscription(subscription);
    if (sync.changed) recordBillingPlanSync();
    recordBillingPlanProvisionDuration(Date.now() - started);

    return buildResult({
      ok: true,
      action: 'synchronized',
      subscription,
      billing_plan_id: sync.plan.id,
      billing_plan: sync.plan,
      items: sync.items,
      started,
      created_plan: false,
      created_items: false,
      repaired: false,
      synchronized: sync.changed,
      message: sync.changed
        ? 'Billing Plan sincronizado com a assinatura'
        : 'Billing Plan já estava sincronizado',
    });
  }

  async ensureBillingPlan(
    subscriptionId: string,
    options: EnsureBillingPlanOptions = {}
  ): Promise<BillingProvisionResult> {
    const started = Date.now();
    const subscription = await loadSubscriptionOrThrow(subscriptionId, options.tenantId);

    if (!isCustomerSubscription(subscription)) {
      return buildResult({
        ok: true,
        action: 'noop',
        subscription,
        billing_plan_id: null,
        billing_plan: null,
        items: [],
        started,
        created_plan: false,
        created_items: false,
        repaired: false,
        synchronized: false,
        message: 'Provisionamento não aplicável a assinaturas não-CRM',
      });
    }

    const status = await validateBillingPlanForSubscription(subscription, {
      periodStartYmd: options.periodStartYmd,
    });

    if (status.valid) {
      if (!options.skipSync) {
        const sync = await synchronizeBillingPlanFromSubscription(subscription);
        if (sync.changed) {
          recordBillingPlanSync();
          recordBillingPlanProvisionDuration(Date.now() - started);
          return buildResult({
            ok: true,
            action: 'synchronized',
            subscription,
            billing_plan_id: sync.plan.id,
            billing_plan: sync.plan,
            items: sync.items,
            started,
            created_plan: false,
            created_items: false,
            repaired: false,
            synchronized: true,
            message: 'Billing Plan sincronizado após validação',
          });
        }
      }

      recordBillingPlanProvisionDuration(Date.now() - started);
      return buildResult({
        ok: true,
        action: 'validated',
        subscription,
        billing_plan_id: status.billing_plan_id,
        billing_plan: null,
        items: [],
        started,
        created_plan: false,
        created_items: false,
        repaired: false,
        synchronized: false,
        message: 'Billing Plan válido',
      });
    }

    const provisioned = await this.provision(subscriptionId, options);
    if (!options.skipSync && provisioned.ok) {
      const refreshed = await getSubscriptionById(subscriptionId);
      if (refreshed) {
        const sync = await synchronizeBillingPlanFromSubscription(refreshed);
        if (sync.changed) {
          recordBillingPlanSync();
          const finalStatus = await validateBillingPlanForSubscription(refreshed, {
            periodStartYmd: options.periodStartYmd,
          });
          if (!finalStatus.valid) {
            throw new BillingPlanProvisionError(
              `Billing Plan inválido após sincronização: ${finalStatus.issues.join(', ')}`,
              'VALIDATION_FAILED',
              { issues: finalStatus.issues }
            );
          }
          return buildResult({
            ok: true,
            action: 'synchronized',
            subscription: refreshed,
            billing_plan_id: sync.plan.id,
            billing_plan: sync.plan,
            items: sync.items,
            started,
            created_plan: provisioned.created_plan,
            created_items: provisioned.created_items,
            repaired: provisioned.repaired,
            synchronized: true,
            message: 'Billing Plan provisionado e sincronizado',
          });
        }
      }
    }

    if (provisioned.ok && provisioned.billing_plan_id && provisioned.items.length > 0) {
      recordBillingPlanProvisionDuration(Date.now() - started);
      return provisioned;
    }

    const refreshed = (await getSubscriptionById(subscriptionId)) ?? subscription;
    const finalStatus = await validateBillingPlanForSubscription(refreshed, {
      periodStartYmd: options.periodStartYmd,
    });
    if (!finalStatus.valid) {
      logBillingProvision('PROVISION', 'post_provision_validation_failed', {
        subscription_id: subscriptionId,
        issues: finalStatus.issues,
      });
      const retry = await this.repair(subscriptionId, options);
      if (retry.ok && retry.items.length > 0) {
        return retry;
      }
      const retryStatus = await validateBillingPlanForSubscription(
        (await getSubscriptionById(subscriptionId)) ?? refreshed,
        { periodStartYmd: options.periodStartYmd }
      );
      if (!retryStatus.valid) {
        throw new BillingPlanProvisionError(
          `Billing Plan inválido após reparo: ${retryStatus.issues.join(', ')}`,
          'VALIDATION_FAILED',
          { issues: retryStatus.issues }
        );
      }
      return retry;
    }

    recordBillingPlanProvisionDuration(Date.now() - started);
    return provisioned;
  }
}

export const billingPlanProvisionService = new BillingPlanProvisionService();

export { assertBillingPlanValid, validateBillingPlanForSubscription };
