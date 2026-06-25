import { describe, it, expect, vi } from 'vitest';
import { resolveAndPersistSubscriptionCustomerId } from './renewalCustomerResolution.js';

describe('renewalCustomerResolution', () => {
  it('usa customer_id existente quando cliente existe', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce({ rows: [{ ok: true }] }),
    };
    const r = await resolveAndPersistSubscriptionCustomerId(db, {
      id: 'sub-1',
      tenant_id: 'tenant-1',
      customer_id: 'client-1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.customer_id).toBe('client-1');
    expect(r.persisted).toBe(false);
  });

  it('reconstrói customer_id a partir de faturas', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ client_id: 'client-from-inv', cnt: '2' }] })
        .mockResolvedValueOnce({ rows: [{ ok: true }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const r = await resolveAndPersistSubscriptionCustomerId(db, {
      id: 'sub-1',
      tenant_id: 'tenant-1',
      customer_id: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.customer_id).toBe('client-from-inv');
    expect(r.persisted).toBe(true);
  });

  it('falha permanente quando não há cliente', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
    };
    const r = await resolveAndPersistSubscriptionCustomerId(db, {
      id: 'sub-1',
      tenant_id: 'tenant-1',
      customer_id: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.permanent).toBe(true);
  });
});
