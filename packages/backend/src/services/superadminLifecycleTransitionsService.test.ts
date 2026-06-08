import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../utils/db.js';
import {
  LIFECYCLE_DASHBOARD_MAX_LIMIT,
  listSuperadminLifecycleTransitions,
} from './superadminLifecycleTransitionsService.js';

const sampleRow = {
  id: 'tx-1',
  created_at: new Date('2026-06-05T15:21:00Z'),
  event_type: 'subscription.activated',
  result: 'moved',
  correlation_id: 'corr-1',
  acquisition_lead_id: 'lead-1',
  tenant_id: 'tenant-1',
  card_id: 'card-1',
  lead_label: 'Maria',
  tenant_label: 'Acme',
  source_board_name: 'Aquisição',
  source_column_name: 'Trial iniciado',
  destination_board_name: 'Expansão',
  destination_column_name: 'Novo Cliente',
  metadata_json: { source: 'billing', reason: 'paid', promotion_enabled: true },
};

describe('listSuperadminLifecycleTransitions', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it('applies pagination defaults (page 1, limit 50)', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [sampleRow] } as never)
      .mockResolvedValueOnce({ rows: [{ c: 1 }] } as never)
      .mockResolvedValueOnce({
        rows: [{ events_observed: 2, promotions_moved: 1, failures: 0 }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            onboarding_completed: 1,
            subscription_activated: 2,
            trial_expired: 0,
            subscription_cancelled: 0,
          },
        ],
      } as never);

    const res = await listSuperadminLifecycleTransitions({});

    expect(res.pagination).toEqual({ page: 1, limit: 50, total: 1, total_pages: 1 });
    expect(pool.query).toHaveBeenCalled();
    const listCall = vi.mocked(pool.query).mock.calls[0];
    expect(String(listCall[0])).toContain('LIMIT $1 OFFSET $2');
    expect(listCall[1]).toEqual([50, 0]);
  });

  it('clamps limit to max 200', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ c: 0 }] } as never)
      .mockResolvedValueOnce({
        rows: [{ events_observed: 0, promotions_moved: 0, failures: 0 }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            onboarding_completed: 0,
            subscription_activated: 0,
            trial_expired: 0,
            subscription_cancelled: 0,
          },
        ],
      } as never);

    const res = await listSuperadminLifecycleTransitions({ limit: 999, page: 2 });

    expect(res.pagination.limit).toBe(LIFECYCLE_DASHBOARD_MAX_LIMIT);
    const listCall = vi.mocked(pool.query).mock.calls[0];
    expect(listCall[1]).toEqual([200, 200]);
  });

  it('applies event_type and result filters', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ c: 0 }] } as never)
      .mockResolvedValueOnce({
        rows: [{ events_observed: 0, promotions_moved: 0, failures: 0 }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            onboarding_completed: 0,
            subscription_activated: 0,
            trial_expired: 0,
            subscription_cancelled: 0,
          },
        ],
      } as never);

    await listSuperadminLifecycleTransitions({
      eventType: 'trial.expired',
      result: 'moved',
    });

    const countSql = String(vi.mocked(pool.query).mock.calls[1][0]);
    expect(countSql).toContain('t.event_type = $1');
    expect(countSql).toContain('t.result = $2');
    expect(vi.mocked(pool.query).mock.calls[1][1]).toEqual(['trial.expired', 'moved']);
  });

  it('serializes metadata_json as object', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [sampleRow] } as never)
      .mockResolvedValueOnce({ rows: [{ c: 1 }] } as never)
      .mockResolvedValueOnce({
        rows: [{ events_observed: 1, promotions_moved: 1, failures: 0 }],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            onboarding_completed: 0,
            subscription_activated: 1,
            trial_expired: 0,
            subscription_cancelled: 0,
          },
        ],
      } as never);

    const res = await listSuperadminLifecycleTransitions({});
    expect(res.items[0]?.metadata_json).toEqual({
      source: 'billing',
      reason: 'paid',
      promotion_enabled: true,
    });
    expect(res.items[0]?.source_board_name).toBe('Aquisição');
    expect(res.items[0]?.destination_column_name).toBe('Novo Cliente');
  });
});
