/**
 * M5-W Block Sprint 2 — paywall helpers.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

vi.mock('./partnerWholesaleStatusService.js', () => ({
  getPartnerWholesaleStatusRow: vi.fn(),
}));

import { getPartnerWholesaleStatusRow } from './partnerWholesaleStatusService.js';
import {
  getPartnerWholesalePaywallState,
  isPartnerWholesalePaywallActive,
  listPartnerPlatformOpenInvoices,
} from './partnerWholesalePaywallService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('partnerWholesalePaywallService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isPartnerWholesalePaywallActive', () => {
    expect(isPartnerWholesalePaywallActive('past_due')).toBe(true);
    expect(isPartnerWholesalePaywallActive('canceled')).toBe(true);
    expect(isPartnerWholesalePaywallActive('active')).toBe(false);
    expect(isPartnerWholesalePaywallActive('none')).toBe(false);
  });

  it('listPartnerPlatformOpenInvoices ordena overdue primeiro', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: '1',
          amount_cents: 1000,
          status: 'overdue',
          payment_method: 'PIX',
          billing_reason: 'partner_wholesale',
          due_date: '2026-09-01',
          created_at: '2026-08-01',
        },
      ],
    });
    const items = await listPartnerPlatformOpenInvoices(PARTNER_ID);
    expect(items).toHaveLength(1);
    expect(query.mock.calls[0][1][0]).toBe(PARTNER_ID);
  });

  it('getPartnerWholesalePaywallState marca paywall_active', async () => {
    vi.mocked(getPartnerWholesaleStatusRow).mockResolvedValue({
      wholesale_status: 'past_due',
      wholesale_subscription_id: 'sub-1',
      wholesale_plan_id: 'plan-1',
    });
    query.mockResolvedValueOnce({ rows: [] });
    const state = await getPartnerWholesalePaywallState(PARTNER_ID);
    expect(state.paywall_active).toBe(true);
    expect(state.wholesale_status).toBe('past_due');
  });
});
