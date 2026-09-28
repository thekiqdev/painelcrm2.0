import { describe, expect, it } from 'vitest';
import { computeCommissionAmount } from './partnerCommissionMath.js';

const baseRule = {
  id: 'r1',
  name: 'equipe',
  rule_type: 'percent' as const,
  percent_bps: 2000, // 20%
  fixed_cents: null,
  base_definition: 'profit' as const,
  cycle_mode: 'recurring' as const,
  custom_cycle_config_json: {},
  applies_to: 'both' as const,
  scope: 'team' as const,
};

describe('computeCommissionAmount', () => {
  it('percent sobre lucro', () => {
    const r = computeCommissionAmount({
      saleAmountCents: 10000,
      costAmountCents: 3000,
      rule: baseRule,
      cycleNumber: 1,
    });
    expect(r.skip).toBe(false);
    expect(r.profit_amount_cents).toBe(7000);
    expect(r.commission_amount_cents).toBe(1400);
    expect(r.commission_capped).toBe(false);
  });

  it('S5.cap: trunca se raw > lucro', () => {
    const r = computeCommissionAmount({
      saleAmountCents: 10000,
      costAmountCents: 9000,
      rule: {
        ...baseRule,
        rule_type: 'fixed',
        percent_bps: null,
        fixed_cents: 5000,
      },
      cycleNumber: 1,
    });
    expect(r.profit_amount_cents).toBe(1000);
    expect(r.raw_commission_cents).toBe(5000);
    expect(r.commission_amount_cents).toBe(1000);
    expect(r.commission_capped).toBe(true);
  });

  it('hybrid = % + fixo', () => {
    const r = computeCommissionAmount({
      saleAmountCents: 10000,
      costAmountCents: 2000,
      rule: {
        ...baseRule,
        rule_type: 'hybrid',
        percent_bps: 1000,
        fixed_cents: 500,
      },
      cycleNumber: 1,
    });
    // profit 8000; 10% = 800 + 500 = 1300
    expect(r.commission_amount_cents).toBe(1300);
  });

  it('first_only pula renovação', () => {
    const r = computeCommissionAmount({
      saleAmountCents: 10000,
      costAmountCents: 0,
      rule: { ...baseRule, applies_to: 'first_only' },
      cycleNumber: 2,
    });
    expect(r.skip).toBe(true);
    expect(r.skip_reason).toBe('applies_first_only');
  });

  it('custom_cycles respeita max_cycles', () => {
    const r = computeCommissionAmount({
      saleAmountCents: 10000,
      costAmountCents: 0,
      rule: {
        ...baseRule,
        cycle_mode: 'custom_cycles',
        custom_cycle_config_json: { max_cycles: 2 },
      },
      cycleNumber: 3,
    });
    expect(r.skip).toBe(true);
    expect(r.skip_reason).toBe('custom_cycles_exhausted');
  });
});
