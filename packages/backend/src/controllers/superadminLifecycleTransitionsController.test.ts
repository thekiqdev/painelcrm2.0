import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getSuperadminLifecycleTransitions } from './superadminLifecycleTransitionsController.js';

vi.mock('../services/superadminLifecycleTransitionsService.js', () => ({
  listSuperadminLifecycleTransitions: vi.fn(),
}));

import { listSuperadminLifecycleTransitions } from '../services/superadminLifecycleTransitionsService.js';

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

function makeReq(overrides?: Partial<AuthRequest>): AuthRequest {
  return {
    user: { id: 'user-1', is_super_admin: true },
    query: {},
    ...overrides,
  } as AuthRequest;
}

describe('getSuperadminLifecycleTransitions', () => {
  beforeEach(() => {
    vi.mocked(listSuperadminLifecycleTransitions).mockReset();
  });

  it('rejects non-superadmin', async () => {
    const req = makeReq({ user: { id: 'u', is_super_admin: false } as AuthRequest['user'] });
    const res = makeRes();
    await getSuperadminLifecycleTransitions(req, res);
    expect(res.statusCode).toBe(403);
    expect(listSuperadminLifecycleTransitions).not.toHaveBeenCalled();
  });

  it('returns paginated payload for superadmin', async () => {
    vi.mocked(listSuperadminLifecycleTransitions).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 50, total: 0, total_pages: 0 },
      metrics: {
        today: { events_observed: 0, promotions_moved: 0, failures: 0 },
        last_30_days: {
          onboarding_completed: 0,
          subscription_activated: 0,
          trial_expired: 0,
          subscription_cancelled: 0,
        },
      },
    });

    const req = makeReq({
      query: {
        page: '2',
        limit: '25',
        event_type: 'subscription.activated',
        result: 'moved',
      },
    });
    const res = makeRes();
    await getSuperadminLifecycleTransitions(req, res);

    expect(res.statusCode).toBe(200);
    expect(listSuperadminLifecycleTransitions).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 25,
        eventType: 'subscription.activated',
        result: 'moved',
      }),
    );
    expect(res.body).toMatchObject({ pagination: { page: 1, limit: 50 } });
  });
});
