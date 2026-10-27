import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

vi.mock('./apiKeyFlags.js', () => ({
  isApiKeysEnabled: vi.fn(),
}));
vi.mock('../utils/tenant.js', () => ({
  isTenantAdmin: vi.fn(),
}));

import { isApiKeysEnabled } from './apiKeyFlags.js';
import { isTenantAdmin } from '../utils/tenant.js';
import { requireApiKeysEnabled, requireTenantAdminForApiKeys } from './apiKeyAuth.js';

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('apiKeyAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flag off → 404', async () => {
    vi.mocked(isApiKeysEnabled).mockResolvedValue(false);
    const res = mockRes();
    const next = vi.fn();
    await requireApiKeysEnabled({ tenantId: 't', userId: 'u' } as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found', code: 'API_KEYS_DISABLED' });
  });

  it('flag on segue', async () => {
    vi.mocked(isApiKeysEnabled).mockResolvedValue(true);
    const res = mockRes();
    const next = vi.fn();
    await requireApiKeysEnabled({ tenantId: 't', userId: 'u' } as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('não-admin → 403', async () => {
    vi.mocked(isTenantAdmin).mockResolvedValue(false);
    const res = mockRes();
    const next = vi.fn();
    await requireTenantAdminForApiKeys({ userId: 'u' } as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('admin segue', async () => {
    vi.mocked(isTenantAdmin).mockResolvedValue(true);
    const res = mockRes();
    const next = vi.fn();
    await requireTenantAdminForApiKeys({ userId: 'u' } as AuthRequest, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
