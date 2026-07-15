import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getTenantCompanySingleFlight,
  getTenantCompanyHttpCacheStats,
  resetTenantCompanyHttpCache,
  invalidateTenantCompanyHttpCache,
} from './tenantCompanyHttpCache';
import type { TenantCompanyPayload } from './tenantCompanyTypes';

const sample: TenantCompanyPayload = {
  id: 't1',
  name: 'Acme',
  cpf_cnpj: null,
  billing_phone: null,
  company_whatsapp: null,
  company_address_line: null,
  company_city: null,
  company_state: null,
  company_postal_code: null,
  logo_url: null,
  logo_light_url: null,
  logo_dark_url: null,
};

describe('getTenantCompanySingleFlight (MB-010)', () => {
  beforeEach(() => {
    resetTenantCompanyHttpCache();
  });

  it('collapses parallel Brand∥Settings callers into one HTTP', async () => {
    const fetchFn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 25));
      return { data: sample };
    });

    const [a, b] = await Promise.all([
      getTenantCompanySingleFlight(fetchFn),
      getTenantCompanySingleFlight(fetchFn),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a.data).toEqual(sample);
    expect(b.data).toEqual(sample);
    expect(getTenantCompanyHttpCacheStats().httpExecuted).toBe(1);
    expect(getTenantCompanyHttpCacheStats().inFlightJoins).toBe(1);
  });

  it('uses soft cache after success', async () => {
    const fetchFn = vi.fn(async () => ({ data: sample }));
    await getTenantCompanySingleFlight(fetchFn);
    await getTenantCompanySingleFlight(fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refetches after invalidate', async () => {
    const fetchFn = vi.fn(async () => ({ data: sample }));
    await getTenantCompanySingleFlight(fetchFn);
    invalidateTenantCompanyHttpCache();
    await getTenantCompanySingleFlight(fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
