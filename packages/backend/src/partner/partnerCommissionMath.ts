/**
 * M5 S5 — cálculo de comissão (híbrido) com cap no lucro (S5.cap = truncate).
 */

export type CommissionRuleType = 'percent' | 'fixed' | 'hybrid';
export type CommissionAppliesTo = 'first_only' | 'renewals' | 'both';
export type CommissionCycleMode = 'recurring' | 'custom_cycles';

export type CommissionRuleSnapshot = {
  id: string | null;
  name: string;
  rule_type: CommissionRuleType;
  percent_bps: number | null;
  fixed_cents: number | null;
  base_definition: 'profit';
  cycle_mode: CommissionCycleMode;
  custom_cycle_config_json: Record<string, unknown>;
  applies_to: CommissionAppliesTo;
  scope: 'team' | 'seller';
};

export type ComputeCommissionInput = {
  saleAmountCents: number;
  costAmountCents: number;
  rule: CommissionRuleSnapshot;
  cycleNumber: number;
};

export type ComputeCommissionResult = {
  skip: boolean;
  skip_reason?: string;
  profit_amount_cents: number;
  raw_commission_cents: number;
  commission_amount_cents: number;
  commission_capped: boolean;
};

export function computeCommissionAmount(input: ComputeCommissionInput): ComputeCommissionResult {
  const profit = Math.max(0, Math.trunc(input.saleAmountCents) - Math.trunc(input.costAmountCents));
  const cycle = Math.max(1, Math.trunc(input.cycleNumber) || 1);
  const rule = input.rule;

  if (rule.applies_to === 'first_only' && cycle > 1) {
    return {
      skip: true,
      skip_reason: 'applies_first_only',
      profit_amount_cents: profit,
      raw_commission_cents: 0,
      commission_amount_cents: 0,
      commission_capped: false,
    };
  }
  if (rule.applies_to === 'renewals' && cycle === 1) {
    return {
      skip: true,
      skip_reason: 'applies_renewals_only',
      profit_amount_cents: profit,
      raw_commission_cents: 0,
      commission_amount_cents: 0,
      commission_capped: false,
    };
  }

  if (rule.cycle_mode === 'custom_cycles') {
    const max =
      typeof rule.custom_cycle_config_json.max_cycles === 'number'
        ? Math.trunc(rule.custom_cycle_config_json.max_cycles)
        : null;
    if (max != null && max >= 1 && cycle > max) {
      return {
        skip: true,
        skip_reason: 'custom_cycles_exhausted',
        profit_amount_cents: profit,
        raw_commission_cents: 0,
        commission_amount_cents: 0,
        commission_capped: false,
      };
    }
  }

  let raw = 0;
  const pct = rule.percent_bps != null ? Math.max(0, Math.trunc(rule.percent_bps)) : 0;
  const fixed = rule.fixed_cents != null ? Math.max(0, Math.trunc(rule.fixed_cents)) : 0;

  if (rule.rule_type === 'percent') {
    raw = Math.floor((profit * pct) / 10000);
  } else if (rule.rule_type === 'fixed') {
    raw = fixed;
  } else {
    raw = Math.floor((profit * pct) / 10000) + fixed;
  }

  const capped = raw > profit;
  const commission = Math.min(raw, profit);

  return {
    skip: false,
    profit_amount_cents: profit,
    raw_commission_cents: raw,
    commission_amount_cents: commission,
    commission_capped: capped,
  };
}
