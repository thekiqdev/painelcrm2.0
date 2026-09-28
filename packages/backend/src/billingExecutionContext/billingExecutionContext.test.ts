import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingExecutionContextBuilder } from './billingExecutionContextBuilder.js';
import { billingExecutionContextCache } from './contextCache.js';
import { resetContextMetricsForTests } from './contextMetrics.js';
import { resolveBillingItems } from './resolveBillingItems.js';
import { replayBillingExecutionFromContext } from './billingExecutionReplay.js';
import { BillingExecutionContextError } from './errors.js';
import type { BillingExecutionContext } from './types.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';

vi.mock('../services/billingSubscriptionService.js', () => ({
  getSubscriptionById: vi.fn(),
}));

vi.mock('./planItemResolver.js', () => ({
  resolvePlanAndItems: vi.fn(),
}));

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

import { getSubscriptionById } from '../services/billingSubscriptionService.js';
import { resolvePlanAndItems } from './planItemResolver.js';
import { pool } from '../utils/db.js';

function sampleItem(): BillingPlanItemRow {
  return {
    id: 'i1',
    tenant_id: 't1',
    billing_plan_id: 'p1',
    sequence: 1,
    status: 'active',
    item_type: 'service',
    origin: 'subscription',
    name: 'MRR',
    description: null,
    quantity: 1,
    unit_price: 1000,
    discount_type: null,
    discount_value: 0,
    tax_rate: null,
    tax_value: 0,
    total_amount: 1000,
    currency: 'BRL',
    is_recurring: true,
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: null,
    proration_mode: null,
    starts_at: null,
    ends_at: null,
    trial_until: null,
    definition_hash: 'hash',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'logical_snapshot',
    metadata: {},
    created_at: '',
    updated_at: '',
  };
}

function sampleSubscription() {
  return {
    id: 'sub-1',
    tenant_id: 't1',
    type: 'customer' as const,
    customer_id: 'c1',
    currency: 'BRL',
    billing_interval: 'monthly',
    status: 'active',
    next_billing_date: '2026-07-01',
    current_period_start: '2026-06-01',
    current_period_end: '2026-07-01',
    billing_anchor_day: 10,
    amount_cents: 1000,
    plan_id: null,
    billing_cycle_count: 1,
    cancel_at_period_end: false,
    grace_period_days: 0,
    default_payment_method: null,
    users_count: null,
    gateway: null,
    last_job_at: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    cycles_unlimited: true,
    max_cycles: null,
  };
}

function samplePlanResolution() {
  return {
    billingPlan: {
      id: 'p1',
      tenant_id: 't1',
      subscription_id: 'sub-1',
      plan_number: 'BP-1',
      status: 'active' as const,
      version: 1,
      plan_revision: 1,
      plan_state: 'running' as const,
      created_from: 'subscription' as const,
      engine_version: 'v2' as const,
      billing_strategy: 'billing_plan_items' as const,
      currency: 'BRL',
      billing_interval: 'monthly',
      billing_frequency: 1,
      billing_anchor: 10,
      starts_at: '2026-06-01',
      ends_at: null,
      trial_until: null,
      next_generation_at: null,
      metadata: {},
      created_at: '',
      updated_at: '',
    },
    billingPlans: [],
    billingItems: [sampleItem()],
    planSource: 'persisted_plan' as const,
    hasPersistedPlan: true as const,
  };
}

describe('BillingExecutionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billingExecutionContextCache.clear();
    resetContextMetricsForTests();
  });

  it('resolveBillingItems calcula uma vez', () => {
    const resolved = resolveBillingItems([sampleItem()]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolvedPrice).toBe(1000);
    expect(resolved[0].definitionHash).toBe('hash');
  });

  it('builder monta contexto completo certificado', async () => {
    vi.mocked(getSubscriptionById).mockResolvedValueOnce(sampleSubscription());
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ id: 't1', name: 'Tenant' }],
    } as never);
    vi.mocked(resolvePlanAndItems).mockResolvedValueOnce(samplePlanResolution());

    const builder = new BillingExecutionContextBuilder();
    const ctx = await builder.build({
      subscriptionId: 'sub-1',
      tenantId: 't1',
      cycleKey: '2026-06-01',
      periodStartYmd: '2026-06-01',
    });

    expect(ctx.subscription.id).toBe('sub-1');
    expect(ctx.resolvedItems).toHaveLength(1);
    expect(ctx.metadata.plan_source).toBe('persisted_plan');
    expect(ctx.metadata.context_certified).toBe(true);
    expect(ctx.diagnostics.shadowReady).toBe(true);
    expect(ctx.diagnostics.engineReady).toBe(true);
    expect(ctx.diagnostics.context_pure).toBe(true);
    expect(ctx.diagnostics.billing_plan_present).toBe(true);
    expect(ctx.diagnostics.billing_items_present).toBe(true);
  });

  it('builder falha quando resolvePlanAndItems lança BILLING_PLAN_NOT_FOUND', async () => {
    vi.mocked(getSubscriptionById).mockResolvedValueOnce(sampleSubscription());
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 't1', name: 'Tenant' }] } as never);
    vi.mocked(resolvePlanAndItems).mockRejectedValueOnce(
      new BillingExecutionContextError('sem plano', 'BILLING_PLAN_NOT_FOUND')
    );

    const builder = new BillingExecutionContextBuilder();
    await expect(
      builder.build({
        subscriptionId: 'sub-1',
        tenantId: 't1',
        cycleKey: '2026-06-01',
        periodStartYmd: '2026-06-01',
      })
    ).rejects.toMatchObject({ code: 'BILLING_PLAN_NOT_FOUND' });
  });

  it('builder falha quando resolvePlanAndItems lança BILLING_ITEMS_NOT_FOUND', async () => {
    vi.mocked(getSubscriptionById).mockResolvedValueOnce(sampleSubscription());
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 't1', name: 'Tenant' }] } as never);
    vi.mocked(resolvePlanAndItems).mockRejectedValueOnce(
      new BillingExecutionContextError('sem items', 'BILLING_ITEMS_NOT_FOUND')
    );

    const builder = new BillingExecutionContextBuilder();
    await expect(
      builder.build({
        subscriptionId: 'sub-1',
        tenantId: 't1',
        cycleKey: '2026-06-01',
        periodStartYmd: '2026-06-01',
      })
    ).rejects.toMatchObject({ code: 'BILLING_ITEMS_NOT_FOUND' });
  });

  it('cache evita segunda resolução', async () => {
    const builder = new BillingExecutionContextBuilder();
    const input = {
      subscriptionId: 'sub-1',
      tenantId: 't1',
      cycleKey: '2026-06-01',
      periodStartYmd: '2026-06-01',
      correlationId: 'corr-1',
    };

    vi.mocked(getSubscriptionById).mockResolvedValue(sampleSubscription());
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 't1', name: 'T' }] } as never);
    vi.mocked(resolvePlanAndItems).mockResolvedValue(samplePlanResolution());

    await builder.build(input);
    await builder.build(input);
    expect(resolvePlanAndItems).toHaveBeenCalledTimes(1);
  });

  it('replay usa context sem re-resolver', () => {
    const context = {
      subscription: { id: 'sub-1', tenant_id: 't1', customer_id: 'c1', currency: 'BRL', status: 'active' },
      billingPlan: { version: 1, currency: 'BRL', id: 'p1', plan_number: 'BP-1' },
      resolvedItems: [
        {
          item: sampleItem(),
          effectiveRevision: 1,
          effectiveDates: { from: '2026-06-01', until: null },
          resolvedPrice: 1000,
          resolvedQuantity: 1,
          discounts: 0,
          taxes: 0,
          proration: null,
          trial: null,
          metadata: {},
          definitionHash: 'hash',
        },
      ],
      cycle: '2026-06-01',
      dates: {
        dueDate: '2026-06-01',
        periodStart: '2026-06-01',
        periodEnd: null,
        nextBilling: '2026-07-01',
        trialUntil: null,
      },
      gateway: { paymentMethod: null, currency: 'BRL', provider: null, fees: 0, gatewayMetadata: {} },
      notifications: {
        channels: [],
        templates: ['crm_invoice_charge'],
        recipient: 'c1',
        language: 'pt-BR',
        variables: {},
      },
      timeline: { events: [] },
      history: { changes: [] },
      metadata: {
        correlation_id: 'corr-1',
        execution_mode: null,
        plan_source: 'persisted_plan',
        has_persisted_plan: true,
        context_certified: true,
      },
      diagnostics: {
        contextBuildTime: 0,
        warnings: [],
        errors: [],
        sources: {},
        shadowReady: true,
        consistencyReady: true,
        engineReady: true,
        cacheHit: false,
        billing_plan_present: true,
        billing_items_present: true,
        context_certified: true,
        context_pure: true,
        legacy_dependencies_detected: [],
      },
    } as unknown as BillingExecutionContext;

    const replay = replayBillingExecutionFromContext(context);
    expect(replay.replay_only).toBe(true);
    expect(replay.normalized.total).toBe(1000);
  });
});
