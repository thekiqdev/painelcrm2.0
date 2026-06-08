import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getSuperadminCommercialMetrics,
  getSuperadminCommercialOverridesReport,
} from './commercialAnalyticsController.js';
import * as commercialAnalyticsService from '../services/commercialAnalyticsService.js';

vi.mock('../services/commercialAnalyticsService.js', () => ({
  getCommercialMetrics: vi.fn(),
  getCommercialOverridesReport: vi.fn(),
}));

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('commercialAnalyticsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET metrics retorna payload do serviço', async () => {
    vi.mocked(commercialAnalyticsService.getCommercialMetrics).mockResolvedValue({
      mrrCatalog: 990000,
      mrrContracted: 811000,
      monthlyRevenue: 742000,
      commercialImpact: 179000,
      activeOverrides: 30,
      waivedTenants: 10,
      breakdown: [],
    });

    const res = mockRes();
    await getSuperadminCommercialMetrics({} as AuthRequest, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ mrrCatalog: 990000, mrrContracted: 811000 }),
    );
  });

  it('GET overrides/report retorna items', async () => {
    vi.mocked(commercialAnalyticsService.getCommercialOverridesReport).mockResolvedValue([
      {
        tenant_id: 't1',
        tenant_name: 'Alpha',
        plan_name: 'Pro',
        catalog_mrr_cents: 9900,
        effective_mrr_cents: 5900,
        override_type: 'fixed_price',
        monthly_savings_cents: 4000,
      },
    ]);

    const res = mockRes();
    await getSuperadminCommercialOverridesReport({} as AuthRequest, res);

    expect(res.json).toHaveBeenCalledWith({
      items: expect.arrayContaining([expect.objectContaining({ tenant_name: 'Alpha' })]),
    });
  });
});
