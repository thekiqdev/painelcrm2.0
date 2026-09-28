import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { BillingProjectionEngine } from '../billingProjection/billingProjectionEngine.js';
import { BillingEngine, BillingEngineError } from './billingEngine.js';
import { DEPRECATED_BILLING_STRATEGY_INVOICE_COPY } from '../billingPlan/deprecatedBillingStrategies.js';
import { buildBaseContext } from '../internal-tools/billing-migration/billingCertificationLab/billingScenarioFactory.js';

const __dir = dirname(fileURLToPath(import.meta.url));

function productionContext(): BillingExecutionContext {
  return buildBaseContext();
}

describe('BillingEngine', () => {
  it('executa pipeline completo sem consultar invoices anteriores', () => {
    const context = productionContext();
    const result = BillingEngine.execute({ context });

    expect(result.approved).toBe(true);
    expect(result.invoice.amount_cents).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.invoice.billing_plan_id).toBe(context.billingPlan.id);
    expect(result.items.every((i) => i.billing_plan_item_id)).toBe(true);
    expect(result.diagnostics.projection_hash).toBeTruthy();
    expect(result.gateway).toBeTruthy();
    expect(result.notifications.length).toBeGreaterThanOrEqual(0);
    expect(result.timeline.length).toBeGreaterThan(0);
  });

  it('totais alinhados com Projection Engine (mesma fonte de cálculo)', () => {
    const context = productionContext();
    const v2 = BillingEngine.execute({ context });
    const projection = BillingProjectionEngine.project({ context, skipCache: true });

    expect(v2.invoice.amount_cents).toBe(projection.projectedInvoice.grandTotal);
    expect(v2.invoice.subtotal_cents).toBe(projection.projectedInvoice.subtotal);
    expect(v2.items.length).toBe(projection.projectedInvoice.invoiceItems.length);
  });

  it('rejeita contexto não certificado', () => {
    const context = productionContext();
    context.metadata.context_certified = false;

    expect(() => BillingEngine.execute({ context })).toThrow(BillingEngineError);
    try {
      BillingEngine.execute({ context });
    } catch (e) {
      expect((e as BillingEngineError).code).toBe('CONTEXT_NOT_CERTIFIED');
    }
  });

  it('rejeita estratégia legada de cópia de fatura', () => {
    const context = productionContext();
    context.billingPlan = {
      ...context.billingPlan,
      billing_strategy: DEPRECATED_BILLING_STRATEGY_INVOICE_COPY as typeof context.billingPlan.billing_strategy,
    };

    expect(() => BillingEngine.execute({ context })).toThrow(BillingEngineError);
    try {
      BillingEngine.execute({ context });
    } catch (e) {
      expect((e as BillingEngineError).code).toBe('LEGACY_STRATEGY_FORBIDDEN');
    }
  });

  it('rejeita contexto sem billing items', () => {
    const context = productionContext();
    context.billingItems = [];
    context.resolvedItems = [];

    expect(() => BillingEngine.execute({ context })).toThrow(BillingEngineError);
    try {
      BillingEngine.execute({ context });
    } catch (e) {
      expect((e as BillingEngineError).code).toBe('BILLING_ITEMS_REQUIRED');
    }
  });

  it('rejeita contexto com dependências legadas detectadas', () => {
    const context = productionContext();
    context.diagnostics.context_pure = false;
    context.diagnostics.legacy_dependencies_detected = ['plan.metadata.context_virtual'];

    expect(() => BillingEngine.execute({ context })).toThrow(BillingEngineError);
    try {
      BillingEngine.execute({ context });
    } catch (e) {
      expect((e as BillingEngineError).code).toBe('LEGACY_DEPENDENCIES_DETECTED');
    }
  });
});

describe('BillingEngine — dependências proibidas', () => {
  const prohibited = [
    'resolveCrmRenewalPreviousInvoice',
    'getCustomerInvoiceItems',
    'overlayCrmContractOnRenewalItems',
    'crmRenewalCustomerResolver',
    'legacyRenewalNormalizer',
  ];

  const files = readdirSync(__dir).filter(
    (f) => f.endsWith('.ts') && f !== 'billingEngine.test.ts' && f !== 'legacyRemovalVerification.test.ts'
  );

  for (const file of files) {
    it(`${file} não importa resolvers legados`, () => {
      const content = readFileSync(join(__dir, file), 'utf8');
      for (const sym of prohibited) {
        expect(content.includes(sym)).toBe(false);
      }
    });
  }
});
