import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../utils/db.js';
import {
  ensureTenantBillingDocumentForPayment,
  normalizeOptionalBillingDocument,
  PARTNER_CPF_CNPJ_REQUIRED_CODE,
} from './partnerChannelBillingDocument.js';

describe('partnerChannelBillingDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizeOptionalBillingDocument aceita vazio', () => {
    expect(normalizeOptionalBillingDocument(null)).toBeNull();
    expect(normalizeOptionalBillingDocument('')).toBeNull();
  });

  it('normalizeOptionalBillingDocument rejeita inválido', () => {
    expect(() => normalizeOptionalBillingDocument('123')).toThrow(
      expect.objectContaining({ code: 'CPF_CNPJ_INVALID' })
    );
  });

  it('ensureTenantBillingDocumentForPayment usa documento já no tenant', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ cpf_cnpj: '390.533.447-05' }],
    } as never);

    const digits = await ensureTenantBillingDocumentForPayment('ten-1');
    expect(digits).toBe('39053344705');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('ensureTenantBillingDocumentForPayment persiste body quando tenant vazio', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ cpf_cnpj: null }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const digits = await ensureTenantBillingDocumentForPayment('ten-1', '39053344705');
    expect(digits).toBe('39053344705');
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[1][0]).toMatch(/UPDATE tenants SET cpf_cnpj/i);
  });

  it('ensureTenantBillingDocumentForPayment falha sem documento', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ cpf_cnpj: null }] } as never);

    await expect(ensureTenantBillingDocumentForPayment('ten-1')).rejects.toMatchObject({
      code: PARTNER_CPF_CNPJ_REQUIRED_CODE,
    });
  });
});
