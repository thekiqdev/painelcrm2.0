import type { PoolClient } from 'pg';
import { buildBillingPlanFromSubscription } from '../../billingPlan/billingPlanFactory.js';
import { BillingPlanRepository } from '../../billingPlan/billingPlanRepository.js';
import type { BillingPlanRow } from '../../billingPlan/types.js';
import { BillingPlanItemService } from '../../billingPlanItems/service.js';
import { BillingPlanItemRepository } from '../../billingPlanItems/repository.js';
import type { BillingPlanItemCreateInput, BillingPlanItemRow } from '../../billingPlanItems/types.js';
import { parseCrmContractMetadata } from '../../services/crmContractMetadata.js';
import type { SubscriptionRow } from '../../services/billingSubscriptionService.js';
import { safeParseYmd } from '../../utils/billingSafeDate.js';
import { pool } from '../../utils/db.js';
import { logBillingProvision } from './billingPlanProvisionLogger.js';

type Db = Pick<import('pg').Pool, 'query'> | PoolClient;

export async function readSubscriptionMetadata(
  subscriptionId: string,
  db: Db = pool,
  tenantId?: string
): Promise<unknown> {
  const r = tenantId
    ? await db.query(
        `SELECT metadata FROM subscriptions WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
        [subscriptionId, tenantId]
      )
    : await db.query(`SELECT metadata FROM subscriptions WHERE id = $1::uuid LIMIT 1`, [
        subscriptionId,
      ]);
  return r.rows[0]?.metadata ?? {};
}

export function resolveItemLabel(subscription: SubscriptionRow, metadata: unknown): string {
  const contract = parseCrmContractMetadata(metadata);
  if (contract?.description) return contract.description;
  return 'Assinatura recorrente';
}

export function buildBillingPlanItemInputsFromSubscription(params: {
  subscription: SubscriptionRow;
  billingPlanId: string;
  metadata?: unknown;
}): BillingPlanItemCreateInput[] {
  const { subscription, billingPlanId } = params;
  const metadata = params.metadata ?? {};
  const name = resolveItemLabel(subscription, metadata);
  const amount = Math.max(1, Math.round(subscription.amount_cents));
  const startsAt =
    safeParseYmd(subscription.current_period_start) ??
    safeParseYmd(subscription.next_billing_date) ??
    subscription.next_billing_date.slice(0, 10);

  return [
    {
      tenant_id: subscription.tenant_id,
      billing_plan_id: billingPlanId,
      sequence: 1,
      status: 'active',
      item_type: 'service',
      origin: 'subscription',
      name,
      description: name,
      quantity: 1,
      unit_price: amount,
      discount_type: 'none',
      discount_value: 0,
      tax_value: 0,
      total_amount: amount,
      currency: subscription.currency?.trim() || 'BRL',
      is_recurring: true,
      billing_interval: subscription.billing_interval,
      billing_frequency: 1,
      billing_anchor: subscription.billing_anchor_day,
      proration_mode: 'none',
      starts_at: startsAt,
      ends_at: safeParseYmd(subscription.current_period_end),
      effective_from: startsAt,
      item_revision: 1,
      snapshot_strategy: 'invoice_snapshot',
      metadata: {
        provisioned_from: 'billing_plan_auto_provision',
        subscription_id: subscription.id,
      },
    },
  ];
}

export async function createActiveBillingPlanForSubscription(
  subscription: SubscriptionRow,
  db: Db = pool
): Promise<BillingPlanRow> {
  const planRepo = new BillingPlanRepository(db);
  const input = buildBillingPlanFromSubscription(subscription, {
    version: 1,
    status: 'active',
  });
  const plan = await planRepo.create(input);
  logBillingProvision('PROVISION', 'plan_created', {
    subscription_id: subscription.id,
    billing_plan_id: plan.id,
    tenant_id: subscription.tenant_id,
  });
  return plan;
}

export async function createBillingPlanItemsForSubscription(
  subscription: SubscriptionRow,
  plan: BillingPlanRow,
  db: Db = pool
): Promise<BillingPlanItemRow[]> {
  const metadata = await readSubscriptionMetadata(subscription.id, db, subscription.tenant_id);
  const inputs = buildBillingPlanItemInputsFromSubscription({
    subscription,
    billingPlanId: plan.id,
    metadata,
  });
  const itemService = new BillingPlanItemService(new BillingPlanItemRepository(db));
  const created: BillingPlanItemRow[] = [];
  for (const input of inputs) {
    const row = await itemService.createItem(input);
    created.push(row);
  }
  logBillingProvision('PROVISION', 'items_created', {
    subscription_id: subscription.id,
    billing_plan_id: plan.id,
    item_count: created.length,
  });
  return created;
}
