import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./partnerLicenseService.js', () => ({
  getPartnerLicenseSummary: vi.fn(),
}));

vi.mock('./partnerLicenseLedgerService.js', () => ({
  applyPartnerLicenseDelta: vi.fn().mockResolvedValue({ balanceAfter: 12, ledgerId: 'led-d1' }),
}));

vi.mock('./partnerWholesaleRecurringService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./partnerWholesaleRecurringService.js')>();
  return {
    ...actual,
    syncPartnerWholesaleRecurringAmount: vi.fn().mockResolvedValue(null),
  };
});

import { getPartnerLicenseSummary } from './partnerLicenseService.js';
import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';
import { syncPartnerWholesaleRecurringAmount } from './partnerWholesaleRecurringService.js';
import {
  downgradePartnerLicenseExtras,
  maxDowngradeQty,
  quotePartnerLicenseDowngrade,
} from './partnerLicenseDowngradeService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function summary(over: Partial<Awaited<ReturnType<typeof getPartnerLicenseSummary>>> = {}) {
  return {
    partner_tenant_id: PARTNER_ID,
    purchased_seats: 15,
    used_seats: 12,
    available_seats: 3,
    extra_seats: 5,
    included_seats: 10,
    topup_unit_price_cents: 3500,
    recurring_plan_price_cents: 99900,
    recurring_amount_cents: 117400,
    wholesale_plan_id: 'wp-1',
    ...over,
  } as Awaited<ReturnType<typeof getPartnerLicenseSummary>>;
}

describe('partnerLicenseDowngradeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPartnerLicenseSummary).mockResolvedValue(summary());
  });

  it('maxDowngradeQty = min(extras, purchased − used)', () => {
    expect(maxDowngradeQty({ extra_seats: 5, purchased_seats: 15, used_seats: 12 })).toBe(3);
    expect(maxDowngradeQty({ extra_seats: 2, purchased_seats: 15, used_seats: 10 })).toBe(2);
    expect(maxDowngradeQty({ extra_seats: 0, purchased_seats: 10, used_seats: 8 })).toBe(0);
  });

  it('quote recusa acima do máximo e projeta próximo ciclo', async () => {
    await expect(quotePartnerLicenseDowngrade(PARTNER_ID, 4)).rejects.toMatchObject({
      code: 'DOWNGRADE_EXCEEDS_AVAILABLE',
    });
    const q = await quotePartnerLicenseDowngrade(PARTNER_ID, 3);
    expect(q.extra_seats_after).toBe(2);
    expect(q.purchased_after).toBe(12);
    expect(q.next_recurring_amount_cents).toBe(106900);
    expect(q.recurring_delta_cents).toBe(-10500);
    expect(q.refund_cents).toBe(0);
  });

  it('downgrade aplica ledger negativo e sincroniza recorrência', async () => {
    vi.mocked(getPartnerLicenseSummary)
      .mockResolvedValueOnce(summary())
      .mockResolvedValueOnce(summary())
      .mockResolvedValueOnce(summary({ purchased_seats: 12, extra_seats: 2, used_seats: 12 }));

    const r = await downgradePartnerLicenseExtras({
      partnerTenantId: PARTNER_ID,
      qty: 3,
      actorUserId: 'u1',
    });

    expect(applyPartnerLicenseDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerTenantId: PARTNER_ID,
        deltaSeats: -3,
        reason: 'topup_downgrade',
        wholesalePlanId: 'wp-1',
      })
    );
    expect(syncPartnerWholesaleRecurringAmount).toHaveBeenCalledWith(PARTNER_ID);
    expect(r.extra_seats).toBe(2);
    expect(r.ledger_id).toBe('led-d1');
  });
});
