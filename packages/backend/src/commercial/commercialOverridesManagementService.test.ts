import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import { calculateInvoiceAmount } from '../services/billingService.js';
import {
  computeOverrideStatus,
  createTenantCommercialOverride,
  disableTenantCommercialOverride,
  getTenantCommercialSummary,
  listTenantCommercialOverrides,
  patchTenantCommercialOverride,
  simulateTenantCommercialPrice,
} from './commercialOverridesManagementService.js';
import {
  disableCommercialOverride,
  findCommercialOverrideById,
  insertCommercialOverride,
  listCommercialOverridesForTenant,
  updateCommercialOverride,
} from './tenantCommercialOverrideRepository.js';
import { findActiveCommercialOverrideCandidates } from './tenantCommercialOverrideRepository.js';
import { insertCommercialOverrideAudit } from './tenantCommercialOverrideAuditRepository.js';
import { resolveTenantCommercialPrice } from './tenantCommercialOverrideService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../services/billingService.js', () => ({
  calculateInvoiceAmount: vi.fn(),
}));

vi.mock('./tenantCommercialOverrideRepository.js', () => ({
  findActiveCommercialOverrideCandidates: vi.fn(),
  listCommercialOverridesForTenant: vi.fn(),
  findCommercialOverrideById: vi.fn(),
  insertCommercialOverride: vi.fn(),
  updateCommercialOverride: vi.fn(),
  disableCommercialOverride: vi.fn(),
}));

vi.mock('./tenantCommercialOverrideAuditRepository.js', () => ({
  insertCommercialOverrideAudit: vi.fn(),
}));

vi.mock('./tenantCommercialOverrideService.js', () => ({
  resolveTenantCommercialPrice: vi.fn(),
  applyCommercialOverrideToAmount: vi.fn((catalog: number, row: { override_type: string; value_cents?: number | null }) => {
    if (row.override_type === 'fixed_price') return row.value_cents ?? catalog;
    return catalog;
  }),
  isValidCommercialOverrideType: vi.fn(() => true),
  pickBestCommercialOverride: vi.fn((rows: unknown[]) => rows[0] ?? null),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const OVERRIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function mockTenantContext(catalog = 9900) {
  vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM tenants t WHERE')) {
      return {
        rows: [
          {
            id: TENANT_ID,
            name: 'Empresa Teste',
            status: 'active',
            plan_id: PLAN_ID,
            max_users_override: null,
          },
        ],
      } as never;
    }
    if (s.includes('FROM plans WHERE')) {
      return {
        rows: [
          {
            id: PLAN_ID,
            name: 'Pro',
            slug: 'pro',
            plan_type: 'standard',
            price_cents: catalog,
            billing_interval: 'monthly',
            max_users: null,
          },
        ],
      } as never;
    }
    if (s.includes('FROM subscriptions')) {
      return { rows: [{ billing_interval: 'monthly', users_count: null }] } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });
  vi.mocked(calculateInvoiceAmount).mockResolvedValue(catalog);
}

const baseOverride = {
  id: OVERRIDE_ID,
  tenant_id: TENANT_ID,
  plan_id: PLAN_ID,
  billing_interval: null,
  override_type: 'fixed_price' as const,
  value_cents: 5900,
  percent_off: null,
  valid_from: '2026-01-01T00:00:00.000Z',
  valid_until: null,
  reason: 'Parceiro',
  metadata_json: { created_by_email: 'admin@test.com' },
  created_by: 'user-1',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('commercialOverridesManagementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertCommercialOverrideAudit).mockResolvedValue('audit-1');
    vi.mocked(resolveTenantCommercialPrice).mockResolvedValue({
      finalAmountCents: 5900,
      source: 'tenant_override',
      overrideId: OVERRIDE_ID,
      overrideType: 'fixed_price',
    });
    vi.mocked(findActiveCommercialOverrideCandidates).mockResolvedValue([baseOverride]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resumo com override ativo', async () => {
    mockTenantContext();
    const summary = await getTenantCommercialSummary(TENANT_ID);
    expect(summary.catalog_price_cents).toBe(9900);
    expect(summary.effective_price_cents).toBe(5900);
    expect(summary.price_source).toBe('Override Comercial');
  });

  it('simulação usa resolveTenantCommercialPrice sem draft', async () => {
    mockTenantContext();
    const sim = await simulateTenantCommercialPrice(TENANT_ID);
    expect(resolveTenantCommercialPrice).toHaveBeenCalled();
    expect(sim.final_price_cents).toBe(5900);
  });

  it('criação grava override e auditoria', async () => {
    mockTenantContext();
    vi.mocked(insertCommercialOverride).mockResolvedValue(baseOverride);
    const created = await createTenantCommercialOverride(
      TENANT_ID,
      { override_type: 'fixed_price', value_cents: 5900 },
      'user-1',
    );
    expect(created.final_price_cents).toBe(5900);
    expect(insertCommercialOverrideAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'created' }),
    );
  });

  it('edição gera auditoria updated', async () => {
    mockTenantContext();
    vi.mocked(findCommercialOverrideById).mockResolvedValue(baseOverride);
    vi.mocked(updateCommercialOverride).mockResolvedValue({
      ...baseOverride,
      value_cents: 6900,
    });
    await patchTenantCommercialOverride(
      TENANT_ID,
      OVERRIDE_ID,
      { value_cents: 6900 },
      'user-1',
    );
    expect(insertCommercialOverrideAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'updated' }),
    );
  });

  it('desativação soft disable', async () => {
    mockTenantContext();
    vi.mocked(findCommercialOverrideById).mockResolvedValue(baseOverride);
    vi.mocked(disableCommercialOverride).mockResolvedValue({
      ...baseOverride,
      is_active: false,
    });
    const disabled = await disableTenantCommercialOverride(TENANT_ID, OVERRIDE_ID, 'user-1');
    expect(disabled.status).toBe('disabled');
    expect(insertCommercialOverrideAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'disabled' }),
    );
  });

  it('histórico lista overrides', async () => {
    mockTenantContext();
    vi.mocked(listCommercialOverridesForTenant).mockResolvedValue([baseOverride]);
    const list = await listTenantCommercialOverrides(TENANT_ID);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.status).toBe('active');
  });

  it('computeOverrideStatus: expirado e desativado', () => {
    expect(computeOverrideStatus({ ...baseOverride, is_active: false })).toBe('disabled');
    expect(
      computeOverrideStatus({
        ...baseOverride,
        valid_until: '2020-01-01T00:00:00.000Z',
      }),
    ).toBe('expired');
  });

  it('fallback catálogo quando resolve retorna catalog', async () => {
    mockTenantContext();
    vi.mocked(findActiveCommercialOverrideCandidates).mockResolvedValue([]);
    vi.mocked(resolveTenantCommercialPrice).mockResolvedValue({
      finalAmountCents: 9900,
      source: 'catalog',
      overrideId: null,
      overrideType: null,
    });
    const summary = await getTenantCommercialSummary(TENANT_ID);
    expect(summary.price_source).toBe('Catálogo');
    expect(summary.effective_price_cents).toBe(9900);
  });
});
