import type { PoolClient } from 'pg';
import { BillingItemDefinitionHasher } from '../../billingPlanItems/definitionHasher.js';
import { BillingPlanRepository } from '../../billingPlan/billingPlanRepository.js';
import type { BillingPlanRow } from '../../billingPlan/types.js';
import { BillingPlanItemService } from '../../billingPlanItems/service.js';
import { BillingPlanItemRepository } from '../../billingPlanItems/repository.js';
import type { BillingPlanItemRow } from '../../billingPlanItems/types.js';
import type { SubscriptionRow } from '../../services/billingSubscriptionService.js';
import { safeParseYmd } from '../../utils/billingSafeDate.js';
import { pool } from '../../utils/db.js';
import {
  buildBillingPlanItemInputsFromSubscription,
  readSubscriptionMetadata,
} from './billingPlanAutoProvision.js';
import { logBillingProvision } from './billingPlanProvisionLogger.js';
import { BillingPlanProvisionError } from './types.js';

type Db = Pick<import('pg').Pool, 'query'> | PoolClient;

function planFieldsDiverge(plan: BillingPlanRow, subscription: SubscriptionRow): boolean {
  const currency = subscription.currency?.trim() || 'BRL';
  return (
    plan.billing_interval !== subscription.billing_interval ||
    plan.currency !== currency ||
    plan.billing_anchor !== subscription.billing_anchor_day
  );
}

export async function synchronizeBillingPlanFromSubscription(
  subscription: SubscriptionRow,
  options: { db?: Db } = {}
): Promise<{ plan: BillingPlanRow; items: BillingPlanItemRow[]; changed: boolean }> {
  const db = options.db ?? pool;
  const planRepo = new BillingPlanRepository(db);
  const itemRepo = new BillingPlanItemRepository(db);
  const itemService = new BillingPlanItemService(itemRepo);

  const plan = await planRepo.findActiveBySubscription(subscription.id, subscription.tenant_id);
  if (!plan) {
    throw new BillingPlanProvisionError(
      'Billing Plan ativo não encontrado para sincronização',
      'SYNC_FAILED',
      { subscription_id: subscription.id }
    );
  }

  let changed = false;
  const startsAt =
    safeParseYmd(subscription.current_period_start) ??
    safeParseYmd(subscription.next_billing_date) ??
    plan.starts_at;
  const endsAt = safeParseYmd(subscription.current_period_end);

  if (planFieldsDiverge(plan, subscription)) {
    const r = await db.query(
      `UPDATE billing_plans
       SET billing_interval = $3,
           currency = $4,
           billing_anchor = $5,
           starts_at = COALESCE($6::date, starts_at),
           ends_at = $7::date,
           plan_revision = plan_revision + 1,
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING *`,
      [
        plan.id,
        subscription.tenant_id,
        subscription.billing_interval,
        subscription.currency?.trim() || 'BRL',
        subscription.billing_anchor_day,
        startsAt,
        endsAt,
      ]
    );
    changed = true;
    logBillingProvision('SYNCHRONIZE', 'plan_fields_updated', {
      subscription_id: subscription.id,
      billing_plan_id: plan.id,
    });
    if (!r.rows[0]) {
      throw new BillingPlanProvisionError('Falha ao sincronizar Billing Plan', 'SYNC_FAILED');
    }
  }

  const updatedPlan = await planRepo.findById(plan.id, subscription.tenant_id);
  if (!updatedPlan) {
    throw new BillingPlanProvisionError('Billing Plan não encontrado após sync', 'SYNC_FAILED');
  }

  const metadata = await readSubscriptionMetadata(subscription.id, db, subscription.tenant_id);
  const expectedInputs = buildBillingPlanItemInputsFromSubscription({
    subscription,
    billingPlanId: updatedPlan.id,
    metadata,
  });
  const expected = expectedInputs[0]!;
  const expectedHash = BillingItemDefinitionHasher.hashFromRow({
    name: expected.name,
    description: expected.description ?? null,
    quantity: expected.quantity ?? 1,
    unit_price: expected.unit_price,
    discount_type: expected.discount_type ?? null,
    discount_value: expected.discount_value ?? 0,
    tax_rate: expected.tax_rate ?? null,
    tax_value: expected.tax_value ?? 0,
    billing_interval: expected.billing_interval ?? null,
    billing_frequency: expected.billing_frequency ?? 1,
    billing_anchor: expected.billing_anchor ?? null,
    trial_until: expected.trial_until ?? null,
    proration_mode: expected.proration_mode ?? null,
    currency: expected.currency,
    metadata: expected.metadata ?? {},
  });

  const current = await itemRepo.findCurrent(updatedPlan.id, 1, subscription.tenant_id);
  let items: BillingPlanItemRow[] = [];

  if (!current) {
    items = [await itemService.createItem(expected)];
    changed = true;
  } else {
    const currentHash =
      current.definition_hash || BillingItemDefinitionHasher.hashFromRow(current);
    if (currentHash !== expectedHash) {
      const revision = await itemService.createRevision(current.id, subscription.tenant_id, {
        name: expected.name,
        description: expected.description,
        unit_price: expected.unit_price,
        total_amount: expected.total_amount,
        billing_interval: expected.billing_interval,
        billing_anchor: expected.billing_anchor,
        currency: expected.currency,
        status: 'active',
        effective_from: expected.effective_from,
      });
      const activated = await itemService.activateItem(revision.id, subscription.tenant_id);
      items = [activated];
      changed = true;
      logBillingProvision('SYNCHRONIZE', 'item_revision_created', {
        subscription_id: subscription.id,
        billing_plan_id: updatedPlan.id,
        item_revision: activated.item_revision,
      });
    } else {
      items = [current];
    }
  }

  const periodStart =
    subscription.current_period_start?.slice(0, 10) ??
    subscription.next_billing_date?.slice(0, 10) ??
    new Date().toISOString().slice(0, 10);
  const effective = await itemRepo.findEffective(
    updatedPlan.id,
    subscription.tenant_id,
    periodStart
  );

  logBillingProvision('SYNCHRONIZE', 'complete', {
    subscription_id: subscription.id,
    billing_plan_id: updatedPlan.id,
    changed,
    item_count: effective.length,
  });

  return { plan: updatedPlan, items: effective.length > 0 ? effective : items, changed };
}
