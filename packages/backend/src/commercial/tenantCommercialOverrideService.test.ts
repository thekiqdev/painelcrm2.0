import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findActiveCommercialOverrideCandidates } from './tenantCommercialOverrideRepository.js';
import {
  applyCommercialOverrideToAmount,
  pickBestCommercialOverride,
  resolveTenantCommercialPrice,
  scoreCommercialOverrideSpecificity,
} from './tenantCommercialOverrideService.js';
import type { TenantCommercialOverrideRow } from './tenantCommercialTypes.js';

vi.mock('./tenantCommercialOverrideRepository.js', () => ({
  findActiveCommercialOverrideCandidates: vi.fn(),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const OVERRIDE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OVERRIDE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeOverride(
  partial: Partial<TenantCommercialOverrideRow> & Pick<TenantCommercialOverrideRow, 'override_type'>,
): TenantCommercialOverrideRow {
  return {
    id: partial.id ?? OVERRIDE_A,
    tenant_id: partial.tenant_id ?? TENANT_ID,
    plan_id: partial.plan_id ?? null,
    billing_interval: partial.billing_interval ?? null,
    override_type: partial.override_type,
    value_cents: partial.value_cents ?? null,
    percent_off: partial.percent_off ?? null,
    valid_from: partial.valid_from ?? '2026-01-01T00:00:00.000Z',
    valid_until: partial.valid_until ?? null,
    reason: partial.reason ?? null,
    metadata_json: partial.metadata_json ?? null,
    created_by: partial.created_by ?? null,
    is_active: partial.is_active ?? true,
    created_at: partial.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('applyCommercialOverrideToAmount', () => {
  it('fixed_price', () => {
    const result = applyCommercialOverrideToAmount(
      9900,
      makeOverride({ override_type: 'fixed_price', value_cents: 5900 }),
    );
    expect(result).toBe(5900);
  });

  it('percent_discount', () => {
    const result = applyCommercialOverrideToAmount(
      9900,
      makeOverride({ override_type: 'percent_discount', percent_off: 20 }),
    );
    expect(result).toBe(7920);
  });

  it('amount_discount', () => {
    const result = applyCommercialOverrideToAmount(
      9900,
      makeOverride({ override_type: 'amount_discount', value_cents: 3000 }),
    );
    expect(result).toBe(6900);
  });

  it('waive', () => {
    const result = applyCommercialOverrideToAmount(9900, makeOverride({ override_type: 'waive' }));
    expect(result).toBe(0);
  });

  it('valor nunca negativo', () => {
    const result = applyCommercialOverrideToAmount(
      1000,
      makeOverride({ override_type: 'amount_discount', value_cents: 5000 }),
    );
    expect(result).toBe(0);
  });
});

describe('pickBestCommercialOverride', () => {
  it('prioridade: plano+intervalo > plano > global', () => {
    const global = makeOverride({ id: OVERRIDE_A, override_type: 'fixed_price', value_cents: 8000 });
    const planOnly = makeOverride({
      id: OVERRIDE_B,
      override_type: 'fixed_price',
      value_cents: 7000,
      plan_id: PLAN_ID,
    });
    const planInterval = makeOverride({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      override_type: 'fixed_price',
      value_cents: 5900,
      plan_id: PLAN_ID,
      billing_interval: 'monthly',
    });

    const picked = pickBestCommercialOverride([global, planOnly, planInterval], PLAN_ID, 'monthly');
    expect(picked?.id).toBe(planInterval.id);
    expect(scoreCommercialOverrideSpecificity(planInterval, PLAN_ID, 'monthly')).toBe(3);
  });

  it('múltiplos overrides: desempate por created_at mais recente', () => {
    const older = makeOverride({
      id: OVERRIDE_A,
      override_type: 'fixed_price',
      value_cents: 8000,
      plan_id: PLAN_ID,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const newer = makeOverride({
      id: OVERRIDE_B,
      override_type: 'fixed_price',
      value_cents: 5900,
      plan_id: PLAN_ID,
      created_at: '2026-06-01T00:00:00.000Z',
    });

    const picked = pickBestCommercialOverride([older, newer], PLAN_ID, 'monthly');
    expect(picked?.id).toBe(OVERRIDE_B);
  });
});

describe('resolveTenantCommercialPrice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem override retorna catálogo', async () => {
    vi.mocked(findActiveCommercialOverrideCandidates).mockResolvedValue([]);

    const result = await resolveTenantCommercialPrice({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      billingInterval: 'monthly',
      catalogAmountCents: 9900,
      context: 'checkout',
    });

    expect(result).toEqual({
      finalAmountCents: 9900,
      source: 'catalog',
      overrideId: null,
      overrideType: null,
    });
  });

  it('override inativo / expirado: repositório não retorna candidatos', async () => {
    vi.mocked(findActiveCommercialOverrideCandidates).mockResolvedValue([]);

    const result = await resolveTenantCommercialPrice({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      billingInterval: 'monthly',
      catalogAmountCents: 9900,
      context: 'renewal',
    });

    expect(result.source).toBe('catalog');
    expect(result.finalAmountCents).toBe(9900);
  });

  it('fixed_price no checkout', async () => {
    vi.mocked(findActiveCommercialOverrideCandidates).mockResolvedValue([
      makeOverride({ override_type: 'fixed_price', value_cents: 5900, plan_id: PLAN_ID }),
    ]);

    const result = await resolveTenantCommercialPrice({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      billingInterval: 'monthly',
      catalogAmountCents: 9900,
      context: 'checkout',
    });

    expect(result.finalAmountCents).toBe(5900);
    expect(result.source).toBe('tenant_override');
    expect(result.overrideType).toBe('fixed_price');
  });

  it('waive na renovação', async () => {
    vi.mocked(findActiveCommercialOverrideCandidates).mockResolvedValue([
      makeOverride({ override_type: 'waive', plan_id: PLAN_ID }),
    ]);

    const result = await resolveTenantCommercialPrice({
      tenantId: TENANT_ID,
      planId: PLAN_ID,
      billingInterval: 'monthly',
      catalogAmountCents: 9900,
      context: 'renewal',
    });

    expect(result.finalAmountCents).toBe(0);
    expect(result.overrideType).toBe('waive');
  });
});
