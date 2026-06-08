import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import { insertCommercialOverrideAudit } from './tenantCommercialOverrideAuditRepository.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

describe('commercialOverridesAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'audit-uuid' }] } as never);
  });

  it('grava auditoria created', async () => {
    const id = await insertCommercialOverrideAudit({
      overrideId: 'override-1',
      tenantId: 'tenant-1',
      action: 'created',
      beforeJson: null,
      afterJson: { override_type: 'fixed_price', value_cents: 5900 },
      createdBy: 'admin-1',
    });
    expect(id).toBe('audit-uuid');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_commercial_override_audit'),
      expect.arrayContaining(['override-1', 'tenant-1', 'created']),
    );
  });

  it('grava auditoria updated com before/after', async () => {
    await insertCommercialOverrideAudit({
      overrideId: 'override-1',
      tenantId: 'tenant-1',
      action: 'updated',
      beforeJson: { value_cents: 5900 },
      afterJson: { value_cents: 6900 },
      createdBy: 'admin-1',
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('before_json'),
      expect.arrayContaining(['updated']),
    );
  });

  it('grava auditoria disabled', async () => {
    await insertCommercialOverrideAudit({
      overrideId: 'override-1',
      tenantId: 'tenant-1',
      action: 'disabled',
      beforeJson: { is_active: true },
      afterJson: { is_active: false },
      createdBy: 'admin-1',
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_commercial_override_audit'),
      expect.arrayContaining(['disabled']),
    );
  });
});
