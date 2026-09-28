import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertContextIndependence,
  certifyPlanAndItems,
  detectLegacyItemMarkers,
  detectLegacyPlanMarkers,
} from './contextIndependenceGuard.js';
import { BillingExecutionContextError } from './errors.js';
import {
  DEPRECATED_BILLING_STRATEGY_INVOICE_COPY,
  DEPRECATED_METADATA_MARKERS,
} from '../billingPlan/deprecatedBillingStrategies.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { BillingPlanRow } from '../billingPlan/types.js';

const __dir = dirname(fileURLToPath(import.meta.url));

function basePlan(overrides: Partial<BillingPlanRow> = {}): BillingPlanRow {
  return {
    id: 'plan-1',
    tenant_id: 't1',
    subscription_id: 'sub-1',
    plan_number: 'BP-1',
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
    billing_anchor: null,
    starts_at: '2026-06-01',
    ends_at: null,
    trial_until: null,
    next_generation_at: null,
    metadata: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function baseItem(overrides: Partial<BillingPlanItemRow> = {}): BillingPlanItemRow {
  return {
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
    definition_hash: 'h1',
    item_revision: 1,
    effective_from: '2026-06-01',
    effective_until: null,
    created_from_revision: null,
    superseded_by_revision: null,
    snapshot_strategy: 'logical_snapshot',
    metadata: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('certifyPlanAndItems', () => {
  it('certifica plano e items puros', () => {
    const result = certifyPlanAndItems(basePlan(), [baseItem()]);
    expect(result.context_certified).toBe(true);
    expect(result.context_pure).toBe(true);
    expect(result.legacy_dependencies_detected).toHaveLength(0);
  });

  it('detecta estratégia legada no plano', () => {
    const result = certifyPlanAndItems(
      basePlan({ billing_strategy: DEPRECATED_BILLING_STRATEGY_INVOICE_COPY as BillingPlanRow['billing_strategy'] }),
      [baseItem()]
    );
    expect(result.context_certified).toBe(false);
    expect(result.legacy_dependencies_detected).toContain(
      `plan.billing_strategy:${DEPRECATED_BILLING_STRATEGY_INVOICE_COPY}`
    );
  });

  it('detecta plano virtual-plan-*', () => {
    const markers = detectLegacyPlanMarkers(basePlan({ id: 'virtual-plan-sub-1' }));
    expect(markers.some((m) => m.includes('virtual_plan_id'))).toBe(true);
  });

  it('detecta metadata.context_virtual no plano', () => {
    const markers = detectLegacyPlanMarkers(basePlan({ metadata: { context_virtual: true } }));
    expect(markers).toContain('plan.metadata.context_virtual');
  });

  it('detecta item ctx-item-*', () => {
    const markers = detectLegacyItemMarkers(baseItem({ id: 'ctx-item-plan-1-1' }));
    expect(markers.some((m) => m.includes('virtual_item_id'))).toBe(true);
  });

  it('detecta item metadata.context_virtual', () => {
    const markers = detectLegacyItemMarkers(baseItem({ metadata: { context_virtual: true } }));
    expect(markers.some((m) => m.includes('context_virtual'))).toBe(true);
  });

  it('permite snapshot_strategy invoice_snapshot em item persistido', () => {
    const markers = detectLegacyItemMarkers(
      baseItem({ snapshot_strategy: 'invoice_snapshot', id: 'db-item-1' })
    );
    expect(markers).toHaveLength(0);
  });

  it('assertContextIndependence lança LEGACY_PLAN_STRATEGY', () => {
    expect(() =>
      assertContextIndependence(
        basePlan({ billing_strategy: DEPRECATED_BILLING_STRATEGY_INVOICE_COPY as BillingPlanRow['billing_strategy'] }),
        [baseItem()]
      )
    ).toThrow(BillingExecutionContextError);
  });

  it('assertContextIndependence lança LEGACY_ITEM_DETECTED', () => {
    expect(() =>
      assertContextIndependence(basePlan(), [baseItem({ id: 'ctx-item-x' })])
    ).toThrow(BillingExecutionContextError);
  });
});

const legacyMetadataKeys = [...DEPRECATED_METADATA_MARKERS];

describe.each(legacyMetadataKeys)('detectLegacyItemMarkers metadata.%s', (key) => {
  it(`detecta ${key}`, () => {
    const markers = detectLegacyItemMarkers(baseItem({ metadata: { [key]: true } }));
    expect(markers.length).toBeGreaterThan(0);
  });
});

describe.each(legacyMetadataKeys)('detectLegacyPlanMarkers metadata.%s', (key) => {
  it(`detecta ${key}`, () => {
    const markers = detectLegacyPlanMarkers(basePlan({ metadata: { [key]: true } }));
    expect(markers.length).toBeGreaterThan(0);
  });
});

describe('contextIndependenceGuard — combinações', () => {
  const strategies = ['billing_plan_items', 'mixed', 'future'] as const;

  describe.each(strategies)('billing_strategy %s', (strategy) => {
    it('certifica quando puro', () => {
      const result = certifyPlanAndItems(basePlan({ billing_strategy: strategy }), [baseItem()]);
      expect(result.context_pure).toBe(true);
    });
  });

  const sequences = Array.from({ length: 10 }, (_, i) => i + 1);
  describe.each(sequences)('item sequence %i', (seq) => {
    it('items puros por sequence', () => {
      const item = baseItem({ id: `item-${seq}`, sequence: seq });
      const markers = detectLegacyItemMarkers(item);
      expect(markers).toHaveLength(0);
    });
  });
});

const prohibited = [
  'resolveCrmRenewalPreviousInvoice',
  'getCustomerInvoiceItems',
  'buildBillingItemsFromInvoice',
  'crmRenewalCustomerResolver',
  'customerInvoiceService',
  'overlayCrmContractOnRenewalItems',
  'virtual_from_invoice_template',
  'virtual_from_subscription',
  'virtualPlanFromSubscription',
];

const packageFiles = readdirSync(__dir).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
);

const guardExemptFiles = new Set(['contextIndependenceGuard.ts', 'errors.ts']);

describe('billingExecutionContext — varredura estática', () => {
  for (const file of packageFiles) {
    for (const sym of prohibited) {
      it(`${file} não referencia ${sym}`, () => {
        if (guardExemptFiles.has(file) && sym === 'virtual_from_invoice_template') return;
        const content = readFileSync(join(__dir, file), 'utf8');
        expect(content.includes(sym)).toBe(false);
      });
    }
  }
});

describe('billingExecutionContext — plan_source', () => {
  it('types.ts restringe plan_source a persisted_plan', () => {
    const content = readFileSync(join(__dir, 'types.ts'), 'utf8');
    expect(content.includes("'persisted_plan'")).toBe(true);
    expect(content.includes('virtual_from_subscription')).toBe(false);
    expect(content.includes('virtual_from_invoice_template')).toBe(false);
    expect(content.includes('invoice_items_snapshot')).toBe(false);
  });
});

describe('billingExecutionContext — diagnostics', () => {
  it('types.ts inclui campos de independência', () => {
    const content = readFileSync(join(__dir, 'types.ts'), 'utf8');
    for (const field of [
      'billing_plan_present',
      'billing_items_present',
      'context_certified',
      'context_pure',
      'legacy_dependencies_detected',
    ]) {
      expect(content.includes(field)).toBe(true);
    }
  });
});
