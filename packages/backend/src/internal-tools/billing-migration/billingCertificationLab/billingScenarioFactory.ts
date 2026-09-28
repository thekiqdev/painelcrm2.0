/**
 * Billing Engine V2 — Sprint 2.4B: factory de cenários (fixtures alinhadas ao Golden Dataset).
 */
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import { resolveBillingItems } from '../../../billingExecutionContext/resolveBillingItems.js';
import { BillingItemDefinitionHasher } from '../../../billingPlanItems/definitionHasher.js';
import type { BillingPlanItemRow } from '../../../billingPlanItems/types.js';
import type { GoldenScenarioDef } from './types.js';
import { getGoldenScenarioById } from './billingGoldenDataset.js';

function sampleItem(overrides: Partial<BillingPlanItemRow> = {}): BillingPlanItemRow {
  const row: BillingPlanItemRow = {
    id: 'item-1',
    tenant_id: 't1',
    billing_plan_id: 'plan-1',
    sequence: 1,
    status: 'active',
    item_type: 'service',
    origin: 'subscription',
    name: 'MRR',
    description: null,
    quantity: 1,
    unit_price: 9900,
    discount_type: null,
    discount_value: 0,
    tax_rate: null,
    tax_value: 0,
    total_amount: 9900,
    currency: 'BRL',
    is_recurring: true,
    billing_interval: 'monthly',
    billing_frequency: 1,
    billing_anchor: null,
    proration_mode: null,
    starts_at: null,
    ends_at: null,
    trial_until: null,
    definition_hash: '',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'invoice_snapshot',
    metadata: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  };
  row.definition_hash =
    overrides.definition_hash ?? BillingItemDefinitionHasher.hashFromRow(row);
  return row;
}

function normalizeContext(ctx: BillingExecutionContext): BillingExecutionContext {
  const billingPlan = ctx.billingPlan;
  const billingItems = ctx.billingItems;
  const resolvedItems = resolveBillingItems(billingItems);
  const amount = resolvedItems.reduce(
    (sum, r) => sum + r.resolvedPrice * r.resolvedQuantity - r.discounts + r.taxes,
    0
  );
  return {
    ...ctx,
    billingPlans: [billingPlan],
    billingItems,
    resolvedItems,
    contract: { ...ctx.contract, amount_cents: amount },
    subscription: { ...ctx.subscription, amount_cents: amount },
  };
}

function withResolvedItems(
  context: BillingExecutionContext,
  items: BillingPlanItemRow[]
): BillingExecutionContext {
  return normalizeContext({ ...context, billingItems: items });
}

export function buildBaseContext(): BillingExecutionContext {
  const item = sampleItem();
  const items = [item];

  return normalizeContext({
    subscription: {
      id: 'sub-1',
      type: 'customer',
      tenant_id: 't1',
      customer_id: 'c1',
      plan_id: null,
      amount_cents: 9900,
      currency: 'BRL',
      billing_anchor_day: 10,
      billing_cycle_count: 1,
      billing_interval: 'monthly',
      status: 'active',
      next_billing_date: '2026-07-01',
      current_period_start: '2026-06-01',
      current_period_end: '2026-07-01',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: 'boleto',
      users_count: null,
      gateway: 'asaas',
      last_job_at: null,
      created_by: null,
      created_at: '',
      updated_at: '',
      cycles_unlimited: true,
      max_cycles: null,
    },
    tenant: { id: 't1', name: 'Tenant Lab' },
    customer: { id: 'c1', name: 'Cliente Lab', email: 'lab@test.com' },
    billingPlan: {
      id: 'plan-1',
      tenant_id: 't1',
      subscription_id: 'sub-1',
      plan_number: 'BP-LAB-0001',
      status: 'active',
      version: 1,
      plan_revision: 1,
      plan_state: 'running',
      created_from: 'subscription',
      engine_version: 'v2',
      billing_strategy: 'billing_plan_items',
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
    billingItems: items,
    resolvedItems: [],
    contract: {
      billing_interval: 'monthly',
      amount_cents: 9900,
      currency: 'BRL',
      trial_until: null,
      status: 'active',
      metadata: {},
    },
    cycle: '2026-06-01',
    period: {
      cycleKey: '2026-06-01',
      periodStart: '2026-06-01',
      periodEnd: '2026-07-01',
      dueDate: '2026-06-01',
      nextGeneration: '2026-07-01',
      anchor: 10,
      interval: 'monthly',
      frequency: 1,
    },
    dates: {
      periodStart: '2026-06-01',
      periodEnd: '2026-07-01',
      dueDate: '2026-06-01',
      nextBilling: '2026-07-01',
      trialUntil: null,
    },
    gateway: {
      provider: 'asaas',
      currency: 'BRL',
      paymentMethod: 'boleto',
      fees: 0,
      gatewayMetadata: {},
    },
    notifications: {
      channels: ['email'],
      templates: ['crm_invoice_charge'],
      recipient: 'lab@test.com',
      language: 'pt-BR',
      variables: {},
    },
    timeline: { events: [{ event: 'renewal_completed', order: 1 }] },
    history: { changes: [{ change: 'subscription_cycle_advanced', audit: {} }] },
    featureFlags: {},
    diagnostics: {
      contextBuildTime: 3,
      warnings: [],
      errors: [],
      sources: { plan: 'persisted_plan' },
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
    metadata: {
      correlation_id: 'lab-corr',
      execution_mode: 'automatic',
      plan_source: 'persisted_plan',
      has_persisted_plan: true,
      context_certified: true,
    },
  });
}

type ScenarioModifier = (ctx: BillingExecutionContext) => BillingExecutionContext;

const SCENARIO_MODIFIERS: Record<string, ScenarioModifier> = {
  recurrence_monthly: (ctx) => ctx,

  recurrence_annual: (ctx) =>
    withResolvedItems(ctx, [
      sampleItem({
        billing_interval: 'yearly',
        unit_price: 118800,
        total_amount: 118800,
      }),
    ]),

  no_discount: (ctx) =>
    withResolvedItems(ctx, [sampleItem({ discount_type: null, discount_value: 0 })]),

  discount_percent: (ctx) =>
    withResolvedItems(ctx, [
      sampleItem({
        discount_type: 'percent',
        discount_value: 10,
        unit_price: 10000,
        total_amount: 9000,
      }),
    ]),

  discount_fixed: (ctx) =>
    withResolvedItems(ctx, [
      sampleItem({
        discount_type: 'fixed',
        discount_value: 500,
        unit_price: 10000,
        total_amount: 9500,
      }),
    ]),

  with_taxes: (ctx) =>
    withResolvedItems(ctx, [
      sampleItem({
        tax_rate: 10,
        tax_value: 990,
        unit_price: 9900,
        total_amount: 10890,
      }),
    ]),

  no_taxes: (ctx) =>
    withResolvedItems(ctx, [sampleItem({ tax_rate: null, tax_value: 0 })]),

  multiple_items: (ctx) =>
    withResolvedItems(ctx, [
      sampleItem({ id: 'item-1', sequence: 1, name: 'Base', unit_price: 5000, total_amount: 5000 }),
      sampleItem({
        id: 'item-2',
        sequence: 2,
        name: 'Addon',
        unit_price: 4900,
        total_amount: 4900,
      }),
    ]),

  single_item: (ctx) => withResolvedItems(ctx, [sampleItem()]),

  item_paused: (ctx) =>
    withResolvedItems(ctx, [
      sampleItem({ status: 'active', name: 'Ativo', unit_price: 9900, total_amount: 9900 }),
      sampleItem({
        id: 'item-2',
        sequence: 2,
        status: 'paused',
        name: 'Pausado',
        unit_price: 1000,
        total_amount: 1000,
      }),
    ]),

  item_removed: (ctx) =>
    withResolvedItems(ctx, [
      sampleItem(),
      sampleItem({
        id: 'item-2',
        sequence: 2,
        status: 'archived',
        name: 'Removido',
        unit_price: 1000,
        total_amount: 1000,
      }),
    ]),

  contract_updated: (ctx) =>
    withResolvedItems(ctx, [sampleItem({ unit_price: 10900, total_amount: 10900 })]),

  due_date_change: (ctx) => ({
    ...ctx,
    dates: { ...ctx.dates, dueDate: '2026-06-15' },
    period: { ...ctx.period, dueDate: '2026-06-15' },
  }),

  frequency_change: (ctx) => {
    const updated = {
      ...ctx,
      subscription: { ...ctx.subscription, billing_interval: 'weekly' as const },
      billingPlan: { ...ctx.billingPlan, billing_interval: 'weekly' as const, billing_frequency: 1 },
      contract: { ...ctx.contract, billing_interval: 'weekly' },
      period: { ...ctx.period, interval: 'weekly' as const },
    };
    return withResolvedItems(updated, [
      sampleItem({ billing_interval: 'weekly', unit_price: 2500, total_amount: 2500 }),
    ]);
  },

  upgrade: (ctx) => withResolvedItems(ctx, [sampleItem({ unit_price: 14900, total_amount: 14900 })]),

  downgrade: (ctx) => withResolvedItems(ctx, [sampleItem({ unit_price: 4900, total_amount: 4900 })]),

  plan_revision: (ctx) =>
    normalizeContext({
      ...ctx,
      billingPlan: { ...ctx.billingPlan, plan_revision: 2, version: 2 },
    }),

  item_revision: (ctx) =>
    withResolvedItems(ctx, [sampleItem({ item_revision: 2, effective_from: '2026-06-15' })]),

  trial: (ctx) =>
    normalizeContext({
      ...ctx,
      subscription: { ...ctx.subscription, current_period_end: '2026-06-30' },
      billingPlan: { ...ctx.billingPlan, trial_until: '2026-06-30' },
      contract: { ...ctx.contract, trial_until: '2026-06-30' },
      dates: { ...ctx.dates, trialUntil: '2026-06-30' },
    }),

  prorata: (ctx) =>
    withResolvedItems(ctx, [sampleItem({ proration_mode: 'daily', unit_price: 9900, total_amount: 4950 })]),

  no_gateway: (ctx) => ({
    ...ctx,
    subscription: { ...ctx.subscription, gateway: null, default_payment_method: null },
    gateway: {
      provider: null,
      currency: 'BRL',
      paymentMethod: null,
      fees: 0,
      gatewayMetadata: {},
    },
  }),

  gateway_configured: (ctx) => ctx,

  gateway_payment_refused: (ctx) => ({
    ...ctx,
    gateway: {
      ...ctx.gateway,
      gatewayMetadata: { simulated_status: 'refused', lab_only: true },
    },
  }),

  notification_disabled: (ctx) => ({
    ...ctx,
    notifications: { channels: [], templates: [], recipient: '', language: 'pt-BR', variables: {} },
  }),

  notification_enabled: (ctx) => ctx,

  notification_whatsapp: (ctx) => ({
    ...ctx,
    notifications: {
      ...ctx.notifications,
      channels: ['whatsapp'],
      templates: ['crm_invoice_whatsapp'],
    },
  }),

  notification_email: (ctx) => ({
    ...ctx,
    notifications: {
      ...ctx.notifications,
      channels: ['email'],
      templates: ['crm_invoice_charge'],
    },
  }),

  no_channels: (ctx) => ({
    ...ctx,
    notifications: { channels: [], templates: [], recipient: '', language: 'pt-BR', variables: {} },
  }),

  job_delayed: (ctx) => ({
    ...ctx,
    subscription: { ...ctx.subscription, last_job_at: '2026-05-01T00:00:00.000Z' },
  }),

  retry: (ctx) => ({
    ...ctx,
    metadata: { ...ctx.metadata, execution_mode: 'retry', retry_count: 1 },
    diagnostics: { ...ctx.diagnostics, sources: { ...ctx.diagnostics.sources, retry: 'true' } },
  }),

  reprocess: (ctx) => ({
    ...ctx,
    metadata: { ...ctx.metadata, execution_mode: 'reprocess' },
  }),

  manual_execution: (ctx) => ({
    ...ctx,
    metadata: { ...ctx.metadata, execution_mode: 'manual' },
  }),

  scheduler: (ctx) => ({
    ...ctx,
    metadata: { ...ctx.metadata, execution_mode: 'scheduler' },
  }),

  worker: (ctx) => ({
    ...ctx,
    metadata: { ...ctx.metadata, execution_mode: 'worker' },
  }),

  month_change: (ctx) => ({
    ...ctx,
    cycle: '2026-07-01',
    dates: {
      periodStart: '2026-07-01',
      periodEnd: '2026-08-01',
      dueDate: '2026-07-01',
      nextBilling: '2026-08-01',
      trialUntil: null,
    },
    period: {
      ...ctx.period,
      cycleKey: '2026-07-01',
      periodStart: '2026-07-01',
      periodEnd: '2026-08-01',
      dueDate: '2026-07-01',
      nextGeneration: '2026-08-01',
    },
  }),

  leap_year: (ctx) => ({
    ...ctx,
    cycle: '2024-02-01',
    dates: {
      periodStart: '2024-02-01',
      periodEnd: '2024-02-29',
      dueDate: '2024-02-01',
      nextBilling: '2024-03-01',
      trialUntil: null,
    },
    period: {
      ...ctx.period,
      cycleKey: '2024-02-01',
      periodStart: '2024-02-01',
      periodEnd: '2024-02-29',
      dueDate: '2024-02-01',
      nextGeneration: '2024-03-01',
    },
  }),

  day_31: (ctx) => ({
    ...ctx,
    subscription: { ...ctx.subscription, billing_anchor_day: 31 },
    billingPlan: { ...ctx.billingPlan, billing_anchor: 31 },
    period: { ...ctx.period, anchor: 31 },
  }),

  february: (ctx) => ({
    ...ctx,
    cycle: '2026-02-01',
    dates: {
      periodStart: '2026-02-01',
      periodEnd: '2026-03-01',
      dueDate: '2026-02-01',
      nextBilling: '2026-03-01',
      trialUntil: null,
    },
    period: {
      ...ctx.period,
      cycleKey: '2026-02-01',
      periodStart: '2026-02-01',
      periodEnd: '2026-03-01',
      dueDate: '2026-02-01',
      nextGeneration: '2026-03-01',
    },
  }),

  timezone: (ctx) => ({
    ...ctx,
    metadata: { ...ctx.metadata, timezone: 'America/Sao_Paulo' },
  }),

  dst: (ctx) => ({
    ...ctx,
    metadata: { ...ctx.metadata, timezone: 'America/Sao_Paulo', dst_applicable: true },
  }),

  stress_100: (ctx) => ctx,
  stress_500: (ctx) => ctx,
  stress_1000: (ctx) => ctx,
  parallel_execution: (ctx) => ctx,
  concurrency: (ctx) => ctx,
  idempotency: (ctx) => ctx,
  double_click: (ctx) => ctx,
  two_workers: (ctx) => ctx,
};

export function buildScenarioContext(scenarioId: string): BillingExecutionContext {
  const modifier = SCENARIO_MODIFIERS[scenarioId];
  if (!modifier) {
    throw new Error(`billing_cert_lab_unknown_scenario:${scenarioId}`);
  }
  return normalizeContext(modifier(buildBaseContext()));
}

export function buildScenarioContextForDef(scenario: GoldenScenarioDef): BillingExecutionContext {
  return buildScenarioContext(scenario.id);
}

export function listRegisteredScenarioIds(): string[] {
  return Object.keys(SCENARIO_MODIFIERS);
}

export function assertGoldenDatasetComplete(): string[] {
  const missing: string[] = [];
  for (const scenario of Object.keys(SCENARIO_MODIFIERS)) {
    if (!getGoldenScenarioById(scenario)) missing.push(scenario);
  }
  return missing;
}
