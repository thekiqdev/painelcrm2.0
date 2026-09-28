import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  planManualGenerateCycles,
  planPatchNextBilling,
  planResumeCycle,
  planSchedulerEligibleCycle,
} from './subscriptionCyclePlanner.js';
import {
  ensureSubscriptionCycle,
  updateSubscriptionCycleLifecycle,
} from './subscriptionCycleMaterializer.js';

vi.mock('./subscriptionCyclesWriteFlagService.js', () => ({
  isSubscriptionCyclesWriteEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('./subscriptionService.js', () => ({
  calculateNextBillingDate: vi.fn((start: string) => {
    const [y, m] = start.split('-').map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    return `${nextY}-${String(nextM).padStart(2, '0')}-${start.slice(8, 10)}`;
  }),
}));

describe('subscriptionCyclePlanner Sprint 5.0-23A', () => {
  it('planSchedulerEligibleCycle returns canonical cycle', () => {
    expect(planSchedulerEligibleCycle('2026-08-15')).toEqual([
      { cycleDateYmd: '2026-08-15', source: 'scheduler' },
    ]);
  });

  it('planManualGenerateCycles includes current and optional next', () => {
    expect(planManualGenerateCycles('2026-07-01', '2026-08-01')).toEqual([
      { cycleDateYmd: '2026-07-01', source: 'manual_generate' },
      { cycleDateYmd: '2026-08-01', source: 'manual_generate' },
    ]);
  });

  it('planPatchNextBilling and planResumeCycle share shape', () => {
    expect(planPatchNextBilling('2026-09-01')).toEqual([
      { cycleDateYmd: '2026-09-01', source: 'patch_next_billing' },
    ]);
    expect(planResumeCycle('2026-09-01')).toEqual([
      { cycleDateYmd: '2026-09-01', source: 'resume' },
    ]);
  });
});

describe('subscriptionCycleMaterializer Sprint 5.0-23A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensureSubscriptionCycle inserts when row is absent', async () => {
    const queries: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql.trim().slice(0, 40));
        if (sql.includes('FROM subscriptions')) {
          return { rows: [{ billing_interval: 'monthly', billing_anchor_day: 15, type: 'customer' }] };
        }
        if (sql.includes('SELECT id::text, status FROM subscription_cycles')) {
          return { rows: [] };
        }
        if (sql.startsWith('INSERT INTO subscription_cycles')) {
          return { rows: [{ id: 'cycle-1', status: 'queued' }] };
        }
        return { rows: [] };
      }),
    };

    const result = await ensureSubscriptionCycle(db, {
      tenantId: 't1',
      subscriptionId: 'sub-1',
      cycleDateYmd: '2026-07-15',
      source: 'scheduler',
      jobId: 'job-1',
    });

    expect(result).toMatchObject({
      cycleId: 'cycle-1',
      cycleDate: '2026-07-15',
      status: 'queued',
      created: true,
    });
    expect(queries.some((q) => q.startsWith('INSERT INTO subscription_cycles'))).toBe(true);
  });

  it('updateSubscriptionCycleLifecycle ensures row then updates', async () => {
    let selectCycles = 0;
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM subscriptions')) {
          return { rows: [{ billing_interval: 'monthly', billing_anchor_day: null, type: 'customer' }] };
        }
        if (sql.includes('SELECT 1 FROM subscription_cycles')) {
          selectCycles++;
          return { rows: [], rowCount: selectCycles > 1 ? 1 : 0 };
        }
        if (sql.startsWith('INSERT INTO subscription_cycles')) {
          return { rows: [{ id: 'cycle-2', status: 'pending' }] };
        }
        if (sql.startsWith('UPDATE subscription_cycles')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT id::text, status FROM subscription_cycles')) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await updateSubscriptionCycleLifecycle(db, {
      tenantId: 't1',
      subscriptionId: 'sub-1',
      cycleDate: '2026-07-15',
      status: 'processing',
      jobId: 'job-1',
      invoiceId: null,
      processedAt: false,
      skippedReason: null,
      errorMessage: null,
      extraMeta: null,
    });

    const insertCalls = (db.query as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).startsWith('INSERT INTO subscription_cycles')
    );
    const updateCalls = (db.query as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).startsWith('UPDATE subscription_cycles')
    );
    expect(insertCalls.length).toBe(1);
    expect(updateCalls.length).toBe(1);
  });
});
