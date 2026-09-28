import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPartnerLicenseDelta, nextSeatBreakdown } from './partnerLicenseLedgerService.js';

const query = vi.fn();
const connect = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: {
    query: (...args: unknown[]) => query(...args),
    connect: (...args: unknown[]) => connect(...args),
  },
}));

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('partnerLicenseLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applyPartnerLicenseDelta credita seats e grava ledger', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) {
        return { rows: [] };
      }
      if (sql.includes('FROM partner_license_pool') && sql.includes('FOR UPDATE')) {
        return { rows: [{ purchased_seats: 10, used_seats_cache: 2, included_seats: 10, extra_seats: 0 }] };
      }
      if (sql.includes('UPDATE partner_license_pool')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO partner_license_ledger')) {
        return { rows: [{ id: 'led-1' }] };
      }
      if (sql.includes('UPDATE partner_profiles')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const r = await applyPartnerLicenseDelta({
      partnerTenantId: PARTNER_ID,
      deltaSeats: 5,
      reason: 'grant',
      actorUserId: 'u1',
      note: 'cortesia',
    });

    expect(r.balanceAfter).toBe(15);
    expect(r.ledgerId).toBe('led-1');
  });

  it('nextSeatBreakdown: topup vai para extra; grant com plano vai para included', () => {
    expect(
      nextSeatBreakdown({
        included: 10,
        extra: 0,
        delta: 5,
        reason: 'topup_purchase',
        wholesalePlanId: 'wp',
      })
    ).toEqual({ included: 10, extra: 5 });
    expect(
      nextSeatBreakdown({
        included: 10,
        extra: 0,
        delta: 10,
        reason: 'grant',
        wholesalePlanId: 'wp',
      })
    ).toEqual({ included: 20, extra: 0 });
    expect(
      nextSeatBreakdown({
        included: 10,
        extra: 3,
        delta: -2,
        reason: 'admin_adjust',
        wholesalePlanId: null,
      })
    ).toEqual({ included: 10, extra: 1 });
    expect(
      nextSeatBreakdown({
        included: 10,
        extra: 5,
        delta: -3,
        reason: 'topup_downgrade',
        wholesalePlanId: 'wp',
      })
    ).toEqual({ included: 10, extra: 2 });
  });

  it('topup_downgrade não come seats do pacote', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return { rows: [] };
      if (sql.includes('FROM partner_license_pool') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{ purchased_seats: 12, used_seats_cache: 8, included_seats: 10, extra_seats: 2 }],
        };
      }
      return { rows: [] };
    });

    await expect(
      applyPartnerLicenseDelta({
        partnerTenantId: PARTNER_ID,
        deltaSeats: -3,
        reason: 'topup_downgrade',
      })
    ).rejects.toMatchObject({ code: 'DOWNGRADE_INCLUDED_FORBIDDEN' });
  });

  it('rejeita saldo abaixo de used_seats', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return { rows: [] };
      if (sql.includes('FROM partner_license_pool') && sql.includes('FOR UPDATE')) {
        return { rows: [{ purchased_seats: 10, used_seats_cache: 8 }] };
      }
      return { rows: [] };
    });

    await expect(
      applyPartnerLicenseDelta({
        partnerTenantId: PARTNER_ID,
        deltaSeats: -5,
        reason: 'admin_adjust',
      })
    ).rejects.toMatchObject({ code: 'SEATS_BELOW_USED' });
  });
});
