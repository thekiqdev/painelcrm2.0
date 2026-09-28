import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { BillingProjectionEngine } from './billingProjectionEngine.js';
import { buildProjectedInvoice } from './billingProjectionBuilder.js';
import { normalizeProjectedInvoice } from './projectionNormalizer.js';
import { computeProjectionHash } from './projectionHash.js';
import { clearProjectionCacheForTests } from './projectionCache.js';
import { resetProjectionMetricsForTests } from './projectionMetrics.js';
import { renewalComparisonService } from '../internal-tools/billing-migration/billingShadow/renewalComparisonService.js';

function mockContext(overrides: Partial<BillingExecutionContext> = {}): BillingExecutionContext {
  return {
    subscription: {
      id: 'sub-1',
      type: 'customer',
      tenant_id: 't1',
      customer_id: 'c1',
      currency: 'BRL',
      status: 'active',
      billing_interval: 'monthly',
      default_payment_method: null,
      gateway: null,
      current_period_end: null,
    } as BillingExecutionContext['subscription'],
    tenant: { id: 't1', name: 'Tenant' },
    customer: { id: 'c1', name: 'Cliente', email: 'a@b.com' },
    billingPlan: {
      id: 'p1',
      version: 2,
      currency: 'BRL',
      plan_number: 'BP-1',
      plan_revision: 1,
    } as BillingExecutionContext['billingPlan'],
    billingPlans: [],
    billingItems: [],
    resolvedItems: [
      {
        item: {
          sequence: 1,
          total_amount: 10000,
          name: 'Plano Mensal',
          currency: 'BRL',
          unit_price: 10000,
          discount_value: 0,
          tax_value: 0,
          quantity: 1,
          billing_interval: 'monthly',
        } as never,
        effectiveRevision: 1,
        effectiveDates: { from: '2026-06-01', until: null },
        resolvedPrice: 10000,
        resolvedQuantity: 1,
        discounts: 0,
        taxes: 0,
        proration: null,
        trial: null,
        metadata: {},
        definitionHash: 'abc123',
      },
    ],
    contract: {
      billing_interval: 'monthly',
      amount_cents: 10000,
      currency: 'BRL',
      trial_until: null,
      status: 'active',
      metadata: {},
    },
    cycle: '2026-06-01',
    period: {
      cycleKey: '2026-06-01',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      dueDate: '2026-06-01',
      nextGeneration: '2026-07-01',
      anchor: 1,
      interval: 'monthly',
      frequency: 1,
    },
    dates: {
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      dueDate: '2026-06-01',
      nextBilling: '2026-07-01',
      trialUntil: null,
    },
    gateway: {
      paymentMethod: 'pix',
      currency: 'BRL',
      provider: 'asaas',
      fees: 0,
      gatewayMetadata: {},
    },
    notifications: {
      channels: ['email'],
      templates: ['crm_invoice_charge'],
      recipient: 'c1',
      language: 'pt-BR',
      variables: {},
    },
    timeline: { events: [{ event: 'renewal_completed', order: 1 }] },
    history: { changes: [{ change: 'subscription_cycle_advanced', audit: {} }] },
    featureFlags: {},
    metadata: {
      correlation_id: 'corr-1',
      execution_mode: 'automatic',
      plan_source: 'persisted_plan',
      has_persisted_plan: true,
      context_certified: true,
    },
    diagnostics: {
      contextBuildTime: 5,
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
    ...overrides,
  };
}

describe('BillingProjectionEngine', () => {
  beforeEach(() => {
    clearProjectionCacheForTests();
    resetProjectionMetricsForTests();
  });

  it('gera ProjectedInvoice completo', () => {
    const result = BillingProjectionEngine.project({ context: mockContext() });
    expect(result.approved).toBe(true);
    expect(result.projectedInvoice.invoiceItems).toHaveLength(1);
    expect(result.projectedInvoice.grandTotal).toBe(10000);
    expect(result.projectedInvoice.diagnostics.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('cache evita segunda projeção', () => {
    const ctx = mockContext();
    BillingProjectionEngine.project({ context: ctx });
    const cached = BillingProjectionEngine.project({ context: ctx });
    expect(cached.diagnostics.cacheHit).toBe(true);
  });

  it('normalizer produz formato compatível com legacy', () => {
    const result = buildProjectedInvoice(mockContext());
    const normalized = normalizeProjectedInvoice(result.projectedInvoice);
    expect(normalized.items[0].definition_hash).toBe('abc123');
    expect(normalized.total).toBe(10000);
    expect(normalized.metadata.source).toBe('billing_projection_engine');
  });

  it('hash é determinístico', () => {
    const inv1 = buildProjectedInvoice(mockContext()).projectedInvoice;
    const inv2 = buildProjectedInvoice(mockContext()).projectedInvoice;
    expect(computeProjectionHash(inv1)).toBe(computeProjectionHash(inv2));
  });

  it('compareWithProjection compara legacy vs projeção', () => {
    const projection = BillingProjectionEngine.project({ context: mockContext() });
    const legacy = normalizeProjectedInvoice(projection.projectedInvoice);
    const comparison = renewalComparisonService.compareWithProjection(legacy, projection);
    expect(comparison.approved).toBe(true);
    expect(comparison.score).toBe(100);
  });
});
