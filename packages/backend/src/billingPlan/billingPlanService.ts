/**
 * Billing Engine V2 — regras de negócio do Billing Plan (Sprint 2.1).
 * Não integrado ao motor de renovação; uso interno / testes.
 */
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';
import { buildBillingPlanFromSubscription } from './billingPlanFactory.js';
import { BillingPlanRepository, billingPlanRepository } from './billingPlanRepository.js';
import { nextBillingPlanVersion } from './billingPlanVersion.js';
import type { BillingPlanCreateInput, BillingPlanRow } from './types.js';

export class BillingPlanService {
  constructor(private readonly repo: BillingPlanRepository = billingPlanRepository) {}

  async createInitialPlan(
    subscription: SubscriptionRow,
    options: { activate?: boolean } = {}
  ): Promise<BillingPlanRow> {
    const existing = await this.repo.findVersions(subscription.id, subscription.tenant_id);
    if (existing.length > 0) {
      throw new Error('billing_plan_initial_already_exists');
    }
    const draft = buildBillingPlanFromSubscription(subscription, {
      version: 1,
      status: options.activate ? 'active' : 'draft',
    });
    return this.repo.create(draft);
  }

  async duplicatePlan(
    planId: string,
    tenantId: string
  ): Promise<BillingPlanRow> {
    const source = await this.repo.findById(planId, tenantId);
    if (!source) {
      throw new Error('billing_plan_not_found');
    }
    const versions = await this.repo.findVersions(source.subscription_id, tenantId);
    const version = nextBillingPlanVersion(versions);
    const input: BillingPlanCreateInput = {
      tenant_id: source.tenant_id,
      subscription_id: source.subscription_id,
      status: 'draft',
      version,
      currency: source.currency,
      billing_interval: source.billing_interval,
      billing_frequency: source.billing_frequency,
      billing_anchor: source.billing_anchor,
      starts_at: source.starts_at,
      ends_at: source.ends_at,
      trial_until: source.trial_until,
      next_generation_at: source.next_generation_at,
      metadata: {
        ...source.metadata,
        origin: {
          ...(typeof source.metadata.origin === 'object' && source.metadata.origin
            ? (source.metadata.origin as Record<string, unknown>)
            : {}),
          duplicated_from_plan_id: source.id,
          duplicated_from_version: source.version,
        },
      },
      plan_revision: 1,
      plan_state: 'draft',
      created_from: source.created_from,
      engine_version: source.engine_version,
      billing_strategy: source.billing_strategy,
    };
    return this.repo.create(input);
  }

  async activatePlan(planId: string, tenantId: string): Promise<BillingPlanRow> {
    const plan = await this.repo.findById(planId, tenantId);
    if (!plan) {
      throw new Error('billing_plan_not_found');
    }
    if (plan.status === 'active') {
      return plan;
    }
    if (plan.status === 'cancelled') {
      throw new Error('billing_plan_cannot_activate_cancelled');
    }
    await this.repo.archiveActiveForSubscription(plan.subscription_id, tenantId);
    const activated = await this.repo.activate(planId, tenantId);
    if (!activated) {
      throw new Error('billing_plan_activate_failed');
    }
    return activated;
  }

  async archivePlan(planId: string, tenantId: string): Promise<BillingPlanRow> {
    const archived = await this.repo.archive(planId, tenantId);
    if (!archived) {
      throw new Error('billing_plan_not_found');
    }
    return archived;
  }

  async getCurrentPlan(
    subscriptionId: string,
    tenantId: string
  ): Promise<BillingPlanRow | null> {
    return this.repo.findActiveBySubscription(subscriptionId, tenantId);
  }

  async listVersions(subscriptionId: string, tenantId: string): Promise<BillingPlanRow[]> {
    return this.repo.findVersions(subscriptionId, tenantId);
  }

  async updateMetadata(
    planId: string,
    tenantId: string,
    metadata: Record<string, unknown>
  ): Promise<BillingPlanRow> {
    const updated = await this.repo.updateMetadata({
      id: planId,
      tenant_id: tenantId,
      metadata,
    });
    if (!updated) {
      throw new Error('billing_plan_not_found');
    }
    return updated;
  }

  /** Sprint 2.1A placeholder — não utilizado pelo motor. */
  async createRevision(_planId: string, _tenantId: string): Promise<BillingPlanRow> {
    throw new Error('billing_plan_create_revision_not_implemented');
  }

  /** Sprint 2.1A placeholder — não utilizado pelo motor. */
  async archiveVersion(_planId: string, _tenantId: string): Promise<BillingPlanRow> {
    throw new Error('billing_plan_archive_version_not_implemented');
  }

  /** Sprint 2.1A placeholder — não utilizado pelo motor. */
  async promoteVersion(_planId: string, _tenantId: string): Promise<BillingPlanRow> {
    throw new Error('billing_plan_promote_version_not_implemented');
  }
}

export const billingPlanService = new BillingPlanService();
