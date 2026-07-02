/**
 * Billing Engine V2 — regras de negócio Billing Plan Items (uso interno / testes).
 */
import { BillingItemDefinitionHasher } from './definitionHasher.js';
import { BillingPlanItemRepository, billingPlanItemRepository } from './repository.js';
import { assertBillingPlanItemStatusTransition } from './stateMachine.js';
import type {
  BillingPlanItemCreateInput,
  BillingPlanItemRevisionCompareResult,
  BillingPlanItemRow,
  BillingPlanItemUpdateInput,
} from './types.js';

function withDefinitionHash(input: BillingPlanItemCreateInput): BillingPlanItemCreateInput {
  if (input.definition_hash) return input;
  return {
    ...input,
    definition_hash: BillingItemDefinitionHasher.hashFromRow({
      name: input.name,
      description: input.description ?? null,
      quantity: input.quantity ?? 1,
      unit_price: input.unit_price,
      discount_type: input.discount_type ?? null,
      discount_value: input.discount_value ?? 0,
      tax_rate: input.tax_rate ?? null,
      tax_value: input.tax_value ?? 0,
      billing_interval: input.billing_interval ?? null,
      billing_frequency: input.billing_frequency ?? 1,
      billing_anchor: input.billing_anchor ?? null,
      trial_until: input.trial_until ?? null,
      proration_mode: input.proration_mode ?? null,
      currency: input.currency,
      metadata: input.metadata ?? {},
    }),
  };
}

export class BillingPlanItemService {
  constructor(private readonly repo: BillingPlanItemRepository = billingPlanItemRepository) {}

  async createItem(input: BillingPlanItemCreateInput): Promise<BillingPlanItemRow> {
    return this.repo.create(withDefinitionHash(input));
  }

  async duplicateItems(
    sourcePlanId: string,
    targetPlanId: string,
    tenantId: string
  ): Promise<BillingPlanItemRow[]> {
    return this.repo.duplicateItems(sourcePlanId, targetPlanId, tenantId);
  }

  async archiveItem(id: string, tenantId: string): Promise<BillingPlanItemRow> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new Error('billing_plan_item_not_found');
    assertBillingPlanItemStatusTransition(existing.status, 'archived');
    const row = await this.repo.archive(id, tenantId);
    if (!row) throw new Error('billing_plan_item_not_found');
    return row;
  }

  async pauseItem(id: string, tenantId: string): Promise<BillingPlanItemRow> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new Error('billing_plan_item_not_found');
    assertBillingPlanItemStatusTransition(existing.status, 'paused');
    const row = await this.repo.setStatus(id, tenantId, 'paused');
    if (!row) throw new Error('billing_plan_item_not_found');
    return row;
  }

  async activateItem(id: string, tenantId: string): Promise<BillingPlanItemRow> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new Error('billing_plan_item_not_found');
    assertBillingPlanItemStatusTransition(existing.status, 'active');
    const row = await this.repo.setStatus(id, tenantId, 'active');
    if (!row) throw new Error('billing_plan_item_not_found');
    return row;
  }

  async listItems(billingPlanId: string, tenantId: string): Promise<BillingPlanItemRow[]> {
    return this.repo.findByBillingPlan(billingPlanId, tenantId);
  }

  async updateItem(input: BillingPlanItemUpdateInput): Promise<BillingPlanItemRow> {
    const row = await this.repo.update(input);
    if (!row) throw new Error('billing_plan_item_not_found');
    return row;
  }

  async createRevision(
    sourceItemId: string,
    tenantId: string,
    overrides: Partial<BillingPlanItemCreateInput> = {}
  ): Promise<BillingPlanItemRow> {
    const revision = await this.repo.duplicateRevision(sourceItemId, tenantId, overrides);
    const hash = BillingItemDefinitionHasher.hashFromRow(revision);
    if (hash !== revision.definition_hash) {
      return (
        (await this.repo.update({
          id: revision.id,
          tenant_id: tenantId,
          definition_hash: hash,
        })) ?? revision
      );
    }
    return revision;
  }

  async activateRevision(id: string, tenantId: string): Promise<BillingPlanItemRow> {
    return this.activateItem(id, tenantId);
  }

  async archiveRevision(id: string, tenantId: string): Promise<BillingPlanItemRow> {
    return this.archiveItem(id, tenantId);
  }

  async getCurrentRevision(
    billingPlanId: string,
    sequence: number,
    tenantId: string
  ): Promise<BillingPlanItemRow | null> {
    return this.repo.findCurrent(billingPlanId, sequence, tenantId);
  }

  async compareRevision(
    billingPlanId: string,
    sequence: number,
    leftRevision: number,
    rightRevision: number,
    tenantId: string
  ): Promise<BillingPlanItemRevisionCompareResult> {
    const left = await this.repo.findRevision(billingPlanId, sequence, leftRevision, tenantId);
    const right = await this.repo.findRevision(billingPlanId, sequence, rightRevision, tenantId);
    if (!left || !right) throw new Error('billing_plan_item_revision_not_found');
    const leftHash = left.definition_hash || BillingItemDefinitionHasher.hashFromRow(left);
    const rightHash = right.definition_hash || BillingItemDefinitionHasher.hashFromRow(right);
    return {
      leftRevision,
      rightRevision,
      definitionHashEqual: leftHash === rightHash,
      leftHash,
      rightHash,
    };
  }
}

export const billingPlanItemService = new BillingPlanItemService();
