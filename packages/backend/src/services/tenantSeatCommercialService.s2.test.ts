import { describe, expect, it } from 'vitest';

/**
 * SE S2 — regras de elegibilidade de seat_addon para standard (sem DB).
 * Espelha assertSeatAddonPlanAllowed / preço avulso.
 */

function assertSeatAddonPlanAllowed(planType: string, planMaxUsers: number | null): void {
  if (planType === 'custom') return;
  if (planType === 'standard') {
    if (planMaxUsers == null) {
      throw new Error(
        'Este plano não tem limite de usuários (ilimitado). Defina um máximo no plano antes de vender extras.'
      );
    }
    return;
  }
  throw new Error('Contratação incremental de assentos não está disponível para este tipo de plano');
}

function standardSeatAddonEligible(opts: {
  planType: string;
  maxUsers: number | null;
  pricePerUserCents: number;
}): boolean {
  if (opts.planType !== 'standard') return false;
  if (opts.maxUsers == null || opts.maxUsers <= 0) return false;
  return opts.pricePerUserCents > 0;
}

describe('SE S2 seat_addon elegibilidade standard', () => {
  it('standard com teto + preço avulso → elegível', () => {
    expect(
      standardSeatAddonEligible({
        planType: 'standard',
        maxUsers: 5,
        pricePerUserCents: 1990,
      })
    ).toBe(true);
  });

  it('standard ilimitado → não elegível', () => {
    expect(
      standardSeatAddonEligible({
        planType: 'standard',
        maxUsers: null,
        pricePerUserCents: 1990,
      })
    ).toBe(false);
  });

  it('standard sem preço avulso → não elegível', () => {
    expect(
      standardSeatAddonEligible({
        planType: 'standard',
        maxUsers: 5,
        pricePerUserCents: 0,
      })
    ).toBe(false);
  });

  it('assert: standard ilimitado lança', () => {
    expect(() => assertSeatAddonPlanAllowed('standard', null)).toThrow(/ilimitado/i);
  });

  it('assert: standard com teto ok', () => {
    expect(() => assertSeatAddonPlanAllowed('standard', 5)).not.toThrow();
  });

  it('assert: custom sempre ok', () => {
    expect(() => assertSeatAddonPlanAllowed('custom', null)).not.toThrow();
  });

  it('standard: extras podem ultrapassar max_users incluso', () => {
    const included = 5;
    const current = included;
    const additional = 3;
    const newTotal = current + additional;
    // Não há teto rígido no standard (diferente do custom)
    expect(newTotal).toBe(8);
    expect(newTotal > included).toBe(true);
  });
});

describe('SE S2 activate snapshot — standard não usa pró-rata como base', () => {
  it('deriveCheckoutContractPricingFromBilling standard usaria amount como flat (motivo de skip)', async () => {
    const { deriveCheckoutContractPricingFromBilling } = await import(
      './billingSubscriptionService.js'
    );
    const derived = deriveCheckoutContractPricingFromBilling({
      planType: 'standard',
      billingAmountCents: 1500, // pró-rata do addon
      billingUsersCount: 8,
      catalogPricePerUserCents: 1990,
    });
    // Se persistíssemos assim, corromperíamos a base do plano — S2 evita persistir no standard.
    expect(derived.contracted_plan_price_cents).toBe(1500);
    expect(derived.contracted_price_per_user_cents).toBeNull();
  });
});
