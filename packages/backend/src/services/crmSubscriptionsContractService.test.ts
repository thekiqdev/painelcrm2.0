import { describe, expect, it } from 'vitest';
import {
  classifyCrmContractChangeType,
  computeCrmContractDatesAfterIntervalChange,
} from './crmSubscriptionsContractService.js';
import {
  distributeAmountAcrossRecurringItems,
  overlayCrmContractOnRenewalItems,
  parseCrmContractMetadata,
  parseCrmPendingContractMetadata,
} from './crmSubscriptionContractRenewalOverlay.js';

describe('parseCrmContractMetadata', () => {
  it('extrai contrato válido', () => {
    const c = parseCrmContractMetadata({
      crm_contract: {
        amount_cents: 15000,
        billing_interval: 'yearly',
        description: 'Plano Pro',
      },
    });
    expect(c).toEqual({
      amount_cents: 15000,
      billing_interval: 'yearly',
      description: 'Plano Pro',
    });
  });
});

describe('parseCrmPendingContractMetadata', () => {
  it('extrai pendência next_cycle', () => {
    const p = parseCrmPendingContractMetadata({
      pending_crm_contract: {
        amount_cents: 9000,
        billing_interval: 'monthly',
        description: 'Start',
        requested_at: '2026-06-01T00:00:00.000Z',
      },
    });
    expect(p?.effective_at).toBe('next_cycle');
    expect(p?.amount_cents).toBe(9000);
  });
});

describe('distributeAmountAcrossRecurringItems', () => {
  it('atualiza item único para o valor alvo', () => {
    const out = distributeAmountAcrossRecurringItems(
      [{ description: 'A', quantity: 1, unit_price_cents: 9000, discount_cents: 0, total_cents: 9000 }],
      15000
    );
    expect(out[0]?.total_cents).toBe(15000);
    expect(out[0]?.unit_price_cents).toBe(15000);
  });
});

describe('overlayCrmContractOnRenewalItems', () => {
  it('aplica valor e descrição do contrato na renovação', () => {
    const metadata = {
      crm_contract: {
        amount_cents: 15000,
        billing_interval: 'yearly',
        description: 'Plano Pro',
      },
    };
    const out = overlayCrmContractOnRenewalItems(metadata, [
      {
        description: 'Plano Start',
        quantity: 1,
        unit_price_cents: 9000,
        discount_cents: 0,
        total_cents: 9000,
        recurring_interval: 'monthly',
        is_recurring: true,
      },
    ]);
    expect(out[0]?.total_cents).toBe(15000);
    expect(out[0]?.description).toBe('Plano Pro');
    expect(out[0]?.recurring_interval).toBe('yearly');
  });
});

describe('computeCrmContractDatesAfterIntervalChange', () => {
  it('recalcula fim do período e próxima cobrança com novo intervalo', () => {
    const d = computeCrmContractDatesAfterIntervalChange({
      current_period_start: '2026-01-15',
      next_billing_date: '2026-02-15',
      billing_anchor_day: 15,
      new_billing_interval: 'yearly',
    });
    expect(d.current_period_end).toBe('2027-01-15');
    expect(d.next_billing_date).toBe('2027-01-15');
    expect(d.billing_anchor_day).toBe(15);
  });
});

describe('classifyCrmContractChangeType', () => {
  it('identifica upgrade por valor', () => {
    expect(
      classifyCrmContractChangeType({
        previous_amount_cents: 9000,
        previous_billing_interval: 'monthly',
        previous_description: 'Plano Start',
        amount_cents: 15000,
        billing_interval: 'yearly',
        description: 'Plano Pro',
      })
    ).toBe('upgrade');
  });

  it('identifica downgrade por valor', () => {
    expect(
      classifyCrmContractChangeType({
        previous_amount_cents: 15000,
        previous_billing_interval: 'yearly',
        previous_description: 'Plano Pro',
        amount_cents: 9000,
        billing_interval: 'monthly',
        description: 'Plano Start',
      })
    ).toBe('downgrade');
  });
});
