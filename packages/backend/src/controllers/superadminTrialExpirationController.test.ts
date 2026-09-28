import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { expireTrialsPastDue } from '../services/subscriptionService.js';
import { postSuperadminTrialExpirationExecute } from './superadminTrialExpirationController.js';

vi.mock('../services/subscriptionService.js', () => ({
  expireTrialsPastDue: vi.fn(),
}));

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('postSuperadminTrialExpirationExecute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(expireTrialsPastDue).mockResolvedValue({
      suspended: 1,
      lifecycle_events: 1,
      promotions_executed: 1,
    });
  });

  it('rejeita usuário não superadmin', async () => {
    const req = { user: { id: 'u1', email: 'a@b.com', is_super_admin: false } } as AuthRequest;
    const res = mockRes();

    await postSuperadminTrialExpirationExecute(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(expireTrialsPastDue).not.toHaveBeenCalled();
  });

  it('executa expireTrialsPastDue e retorna resultado', async () => {
    const req = {
      user: { id: 'admin-1', email: 'admin@test.com', is_super_admin: true },
    } as AuthRequest;
    const res = mockRes();

    await postSuperadminTrialExpirationExecute(req, res);

    expect(expireTrialsPastDue).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      result: { suspended: 1, lifecycle_events: 1, promotions_executed: 1 },
    });
  });
});
