import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import {
  getCommercialMetrics,
  getCommercialOverridesReport,
  normalizeAmountToMonthlyCents,
} from './commercialAnalyticsService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

const PLAN_ID = '22222222-2222-4222-8222-222222222222';

function makeTenantRow(partial: {
  tenant_id: string;
  tenant_name: string;
  plan_price_cents?: string;
  contracted_plan_price_cents?: string | null;
  contracted_price_per_user_cents?: string | null;
  users_count?: string | null;
}) {
  return {
    tenant_id: partial.tenant_id,
    tenant_name: partial.tenant_name,
    plan_id: PLAN_ID,
    plan_name: 'Pro',
    plan_type: 'standard',
    plan_price_cents: partial.plan_price_cents ?? '9900',
    plan_billing_interval: 'monthly',
    max_users_override: null,
    subscription_billing_interval: 'monthly',
    users_count: partial.users_count ?? '1',
    contracted_plan_price_cents: partial.contracted_plan_price_cents ?? null,
    contracted_price_per_user_cents: partial.contracted_price_per_user_cents ?? null,
  };
}

function makeOverrideRow(partial: {
  tenant_id: string;
  override_type: string;
  value_cents?: number | null;
  percent_off?: number | null;
  reason?: string | null;
}) {
  return {
    id: `override-${partial.tenant_id}`,
    tenant_id: partial.tenant_id,
    plan_id: null,
    billing_interval: null,
    override_type: partial.override_type,
    value_cents: partial.value_cents ?? null,
    percent_off: partial.percent_off ?? null,
    valid_from: new Date('2026-01-01'),
    valid_until: null,
    reason: partial.reason ?? null,
    metadata_json: null,
    created_by: null,
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
  };
}

function setupPoolMocks(input: {
  tenants: ReturnType<typeof makeTenantRow>[];
  overrides?: ReturnType<typeof makeOverrideRow>[];
  monthlyRevenueCents?: number;
}) {
  vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes('FROM tenants t') && text.includes("t.status = 'active'")) {
      return { rows: input.tenants } as never;
    }
    if (text.includes('FROM tenant_commercial_overrides')) {
      return { rows: input.overrides ?? [] } as never;
    }
    if (text.includes('FROM plan_interval_prices')) {
      return { rows: [] } as never;
    }
    if (text.includes('FROM tenant_billing') && text.includes("status = 'paid'")) {
      return { rows: [{ total_cents: String(input.monthlyRevenueCents ?? 0) }] } as never;
    }
    return { rows: [] } as never;
  });
}

describe('normalizeAmountToMonthlyCents', () => {
  it('mantém valor mensal', () => {
    expect(normalizeAmountToMonthlyCents(9900, 'monthly')).toBe(9900);
  });

  it('normaliza anual', () => {
    expect(normalizeAmountToMonthlyCents(120000, 'yearly')).toBe(10000);
  });
});

describe('getCommercialMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sem overrides: MRR catálogo = contratado e impacto zero', async () => {
    setupPoolMocks({
      tenants: [
        makeTenantRow({ tenant_id: 't1', tenant_name: 'A', plan_price_cents: '9900' }),
        makeTenantRow({ tenant_id: 't2', tenant_name: 'B', plan_price_cents: '9900' }),
      ],
      monthlyRevenueCents: 19800,
    });

    const metrics = await getCommercialMetrics();
    expect(metrics.mrrCatalog).toBe(19800);
    expect(metrics.mrrContracted).toBe(19800);
    expect(metrics.commercialImpact).toBe(0);
    expect(metrics.monthlyRevenue).toBe(19800);
    expect(metrics.activeOverrides).toBe(0);
    expect(metrics.waivedTenants).toBe(0);
  });

  it('fixed_price reduz MRR contratado', async () => {
    setupPoolMocks({
      tenants: [makeTenantRow({ tenant_id: 't1', tenant_name: 'Alpha', plan_price_cents: '9900' })],
      overrides: [makeOverrideRow({ tenant_id: 't1', override_type: 'fixed_price', value_cents: 5900 })],
    });

    const metrics = await getCommercialMetrics();
    expect(metrics.mrrCatalog).toBe(9900);
    expect(metrics.mrrContracted).toBe(5900);
    expect(metrics.commercialImpact).toBe(4000);
    expect(metrics.breakdown.find((b) => b.category_key === 'fixed_discount')?.count).toBe(1);
  });

  it('percent_discount reduz MRR contratado', async () => {
    setupPoolMocks({
      tenants: [makeTenantRow({ tenant_id: 't1', tenant_name: 'Beta', plan_price_cents: '10000' })],
      overrides: [makeOverrideRow({ tenant_id: 't1', override_type: 'percent_discount', percent_off: 20 })],
    });

    const metrics = await getCommercialMetrics();
    expect(metrics.mrrCatalog).toBe(10000);
    expect(metrics.mrrContracted).toBe(8000);
    expect(metrics.commercialImpact).toBe(2000);
    expect(metrics.breakdown.find((b) => b.category_key === 'percent_discount')?.count).toBe(1);
  });

  it('waive zera MRR contratado e conta isenções', async () => {
    setupPoolMocks({
      tenants: [makeTenantRow({ tenant_id: 't1', tenant_name: 'Parceiro', plan_price_cents: '9900' })],
      overrides: [makeOverrideRow({ tenant_id: 't1', override_type: 'waive' })],
    });

    const metrics = await getCommercialMetrics();
    expect(metrics.mrrCatalog).toBe(9900);
    expect(metrics.mrrContracted).toBe(0);
    expect(metrics.commercialImpact).toBe(9900);
    expect(metrics.waivedTenants).toBe(1);
    expect(metrics.breakdown.find((b) => b.category_key === 'free_partners')?.count).toBe(1);
  });

  it('múltiplos tenants: exemplo 70×99 + 20×59 + 10×0', async () => {
    const tenants = [
      ...Array.from({ length: 70 }, (_, i) =>
        makeTenantRow({
          tenant_id: `full-${i}`,
          tenant_name: `Full ${i}`,
          plan_price_cents: '9900',
        }),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        makeTenantRow({
          tenant_id: `disc-${i}`,
          tenant_name: `Disc ${i}`,
          plan_price_cents: '9900',
        }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeTenantRow({
          tenant_id: `free-${i}`,
          tenant_name: `Free ${i}`,
          plan_price_cents: '9900',
        }),
      ),
    ];
    const overrides = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeOverrideRow({
          tenant_id: `disc-${i}`,
          override_type: 'fixed_price',
          value_cents: 5900,
        }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeOverrideRow({ tenant_id: `free-${i}`, override_type: 'waive' }),
      ),
    ];

    setupPoolMocks({ tenants, overrides, monthlyRevenueCents: 742000 });

    const metrics = await getCommercialMetrics();
    expect(metrics.mrrCatalog).toBe(990000);
    expect(metrics.mrrContracted).toBe(811000);
    expect(metrics.commercialImpact).toBe(179000);
    expect(metrics.monthlyRevenue).toBe(742000);
    expect(metrics.activeOverrides).toBe(30);
    expect(metrics.waivedTenants).toBe(10);
  });

  it('receita recebida usa tenant_billing paid últimos 30 dias', async () => {
    setupPoolMocks({
      tenants: [makeTenantRow({ tenant_id: 't1', tenant_name: 'A' })],
      monthlyRevenueCents: 74200,
    });

    const metrics = await getCommercialMetrics();
    expect(metrics.monthlyRevenue).toBe(74200);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("paid_at >= now() - interval '30 days'"));
  });

  it('impacto comercial = catálogo − contratado', async () => {
    setupPoolMocks({
      tenants: [
        makeTenantRow({ tenant_id: 't1', tenant_name: 'A', plan_price_cents: '9900' }),
        makeTenantRow({
          tenant_id: 't2',
          tenant_name: 'B',
          plan_price_cents: '9900',
          contracted_plan_price_cents: '5900',
        }),
      ],
      overrides: [makeOverrideRow({ tenant_id: 't1', override_type: 'fixed_price', value_cents: 5900 })],
    });

    const metrics = await getCommercialMetrics();
    expect(metrics.mrrCatalog).toBe(19800);
    expect(metrics.mrrContracted).toBe(11800);
    expect(metrics.commercialImpact).toBe(8000);
  });
});

describe('getCommercialOverridesReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista tenants com override ou economia mensal', async () => {
    setupPoolMocks({
      tenants: [
        makeTenantRow({ tenant_id: 't1', tenant_name: 'Alpha', plan_price_cents: '9900' }),
        makeTenantRow({ tenant_id: 't2', tenant_name: 'Beta', plan_price_cents: '9900' }),
      ],
      overrides: [makeOverrideRow({ tenant_id: 't1', override_type: 'fixed_price', value_cents: 5900 })],
    });

    const report = await getCommercialOverridesReport();
    expect(report).toHaveLength(1);
    expect(report[0]?.tenant_name).toBe('Alpha');
    expect(report[0]?.catalog_mrr_cents).toBe(9900);
    expect(report[0]?.effective_mrr_cents).toBe(5900);
    expect(report[0]?.monthly_savings_cents).toBe(4000);
  });
});
