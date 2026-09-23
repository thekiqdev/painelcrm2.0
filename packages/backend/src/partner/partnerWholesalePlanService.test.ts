import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerAdminError } from './partnerErrors.js';
import {
  createWholesalePlan,
  listWholesalePlans,
  updateWholesalePlan,
} from './partnerWholesalePlanService.js';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: {
    query: (...args: unknown[]) => query(...args),
  },
}));

vi.mock('../services/auditLogService.js', () => ({
  logSuperAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const ENVELOPE_ID = '22222222-2222-4222-8222-222222222222';

describe('partnerWholesalePlanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createWholesalePlan valida envelope e persiste', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM plans WHERE id')) {
        return { rows: [{ id: ENVELOPE_ID }] };
      }
      if (sql.includes('INSERT INTO partner_wholesale_plans')) {
        return {
          rows: [
            {
              id: PLAN_ID,
              name: 'Partner 50',
              slug: 'partner-50',
              description: null,
              status: 'active',
              seats_included: 50,
              price_cents: 99900,
              billing_interval: 'monthly',
              envelope_plan_id: ENVELOPE_ID,
              unit_overage_cents: 4900,
              sort_order: 0,
              metadata: {},
              created_at: '2026-09-08T00:00:00.000Z',
              updated_at: '2026-09-08T00:00:00.000Z',
            },
          ],
        };
      }
      if (sql.includes('FROM partner_wholesale_plans w')) {
        return {
          rows: [
            {
              id: PLAN_ID,
              name: 'Partner 50',
              slug: 'partner-50',
              description: null,
              status: 'active',
              seats_included: 50,
              price_cents: 99900,
              billing_interval: 'monthly',
              envelope_plan_id: ENVELOPE_ID,
              unit_overage_cents: 4900,
              sort_order: 0,
              metadata: {},
              created_at: '2026-09-08T00:00:00.000Z',
              updated_at: '2026-09-08T00:00:00.000Z',
              envelope_plan_name: 'Pro',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const created = await createWholesalePlan(
      {
        name: 'Partner 50',
        slug: 'partner-50',
        seats_included: 50,
        price_cents: 99900,
        status: 'active',
        envelope_plan_id: ENVELOPE_ID,
        unit_overage_cents: 4900,
      },
      'admin-1'
    );

    expect(created.id).toBe(PLAN_ID);
    expect(created.seats_included).toBe(50);
    expect(created.envelope_plan_name).toBe('Pro');
  });

  it('createWholesalePlan rejeita envelope inexistente', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      createWholesalePlan(
        {
          name: 'X',
          slug: 'x',
          seats_included: 1,
          price_cents: 100,
          envelope_plan_id: ENVELOPE_ID,
        },
        null
      )
    ).rejects.toMatchObject({ code: 'ENVELOPE_PLAN_NOT_FOUND' } satisfies Partial<PartnerAdminError>);
  });

  it('listWholesalePlans omite arquivados por padrão', async () => {
    query.mockResolvedValue({ rows: [] });
    await listWholesalePlans();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('partner_wholesale_plans'), [false]);
  });

  it('updateWholesalePlan arquiva', async () => {
    let status = 'active';
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE partner_wholesale_plans')) {
        status = 'archived';
        return { rows: [] };
      }
      if (sql.includes('FROM partner_wholesale_plans w') && sql.includes('WHERE w.id')) {
        return {
          rows: [
            {
              id: PLAN_ID,
              name: 'Partner 50',
              slug: 'partner-50',
              description: null,
              status,
              seats_included: 50,
              price_cents: 99900,
              billing_interval: 'monthly',
              envelope_plan_id: null,
              unit_overage_cents: null,
              sort_order: 0,
              metadata: {},
              created_at: '2026-09-08T00:00:00.000Z',
              updated_at: '2026-09-08T00:00:00.000Z',
              envelope_plan_name: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const updated = await updateWholesalePlan(PLAN_ID, { status: 'archived' }, null);
    expect(updated.status).toBe('archived');
  });
});
