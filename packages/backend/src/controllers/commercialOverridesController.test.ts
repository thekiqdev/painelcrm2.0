import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  deleteTenantCommercialOverride,
  getTenantCommercial,
  postTenantCommercialOverride,
} from './commercialOverridesController.js';
import {
  createTenantCommercialOverride,
  disableTenantCommercialOverride,
  getTenantCommercialSummary,
} from '../commercial/commercialOverridesManagementService.js';

vi.mock('../commercial/commercialOverridesManagementService.js', () => ({
  getTenantCommercialSummary: vi.fn(),
  listTenantCommercialOverrides: vi.fn(),
  createTenantCommercialOverride: vi.fn(),
  patchTenantCommercialOverride: vi.fn(),
  disableTenantCommercialOverride: vi.fn(),
  simulateTenantCommercialPrice: vi.fn(),
}));

function mockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('commercialOverridesController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejeita não superadmin', async () => {
    const req = { user: { id: 'u1', is_super_admin: false } } as AuthRequest;
    const res = mockRes();
    await getTenantCommercial({ ...req, params: { tenantId: 't1' } } as AuthRequest, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('GET commercial retorna resumo', async () => {
    vi.mocked(getTenantCommercialSummary).mockResolvedValue({
      tenant: { id: 't1', name: 'A', status: 'active', plan_id: 'p1' },
      plan: { id: 'p1', name: 'Pro', slug: 'pro', plan_type: 'standard', price_cents: 9900 },
      billing_interval: 'monthly',
      catalog_price_cents: 9900,
      effective_price_cents: 5900,
      price_source: 'Override Comercial',
      active_override: null,
      simulation: {
        catalog_price_cents: 9900,
        override_applied: true,
        override_type: 'fixed_price',
        override_id: 'o1',
        final_price_cents: 5900,
        discount_cents: 4000,
        source: 'Override Comercial',
      },
    });
    const req = {
      user: { id: 'admin', is_super_admin: true },
      params: { tenantId: 't1' },
    } as unknown as AuthRequest;
    const res = mockRes();
    await getTenantCommercial(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ effective_price_cents: 5900 }));
  });

  it('POST cria override', async () => {
    vi.mocked(createTenantCommercialOverride).mockResolvedValue({
      id: 'o1',
      override_type: 'fixed_price',
      status: 'active',
    } as never);
    const req = {
      user: { id: 'admin', is_super_admin: true },
      params: { tenantId: 't1' },
      body: { override_type: 'fixed_price', value_cents: 5900 },
    } as unknown as AuthRequest;
    const res = mockRes();
    await postTenantCommercialOverride(req, res);
    expect(createTenantCommercialOverride).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('DELETE desativa override', async () => {
    vi.mocked(disableTenantCommercialOverride).mockResolvedValue({
      id: 'o1',
      status: 'disabled',
    } as never);
    const req = {
      user: { id: 'admin', is_super_admin: true },
      params: { tenantId: 't1', id: 'o1' },
    } as unknown as AuthRequest;
    const res = mockRes();
    await deleteTenantCommercialOverride(req, res);
    expect(disableTenantCommercialOverride).toHaveBeenCalledWith('t1', 'o1', 'admin');
  });
});
