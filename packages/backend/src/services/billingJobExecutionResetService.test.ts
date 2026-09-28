import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('./billingRecurringJobPersistence.js', () => ({
  billingJobsTableHasOutcomeColumns: vi.fn().mockResolvedValue(true),
}));

vi.mock('./billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

import { billingJobsTableHasOutcomeColumns } from './billingRecurringJobPersistence.js';
import {
  resetJobExecutionForReopenedCompetency,
  resetJobExecutionForReopenedCompetencies,
  repairJobExecutionForOpenCycles,
} from './billingJobExecutionResetService.js';

describe('billingJobExecutionResetService Sprint 5.0-24E', () => {
  const db = { query: queryMock };

  beforeEach(() => {
    queryMock.mockReset();
    vi.mocked(billingJobsTableHasOutcomeColumns).mockResolvedValue(true);
  });

  it('resetJobExecutionForReopenedCompetency clears completed job with orphan invoice', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'job-1' }] });

    const result = await resetJobExecutionForReopenedCompetency(db, {
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      cycleDateYmd: '2026-07-21',
      reason: 'competency_reopened',
    });

    expect(result).toEqual({ jobs_reset: 1, job_ids: ['job-1'] });
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('result_invoice_id = NULL');
    expect(sql).toContain("ci.id IS NULL");
    expect(queryMock.mock.calls[0][1]).toEqual(['sub-1', 'tenant-1', '2026-07-21']);
  });

  it('resetJobExecutionForReopenedCompetency returns empty for invalid cycle date', async () => {
    const result = await resetJobExecutionForReopenedCompetency(db, {
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      cycleDateYmd: 'invalid',
    });
    expect(result).toEqual({ jobs_reset: 0, job_ids: [] });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('resetJobExecutionForReopenedCompetencies deduplicates cycle dates', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'job-1' }] });

    const result = await resetJobExecutionForReopenedCompetencies(db, {
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      cycleDatesYmd: ['2026-07-21', '2026-07-21', '2026-07-22'],
    });

    expect(result.jobs_reset).toBe(2);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('repairJobExecutionForOpenCycles resets jobs for open cycles', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ cycle_date: '2026-07-21' }, { cycle_date: '2026-07-28' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'job-a' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-b' }] });

    const result = await repairJobExecutionForOpenCycles(db, {
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      cycleId: 'cycle-1',
    });

    expect(result.jobs_reset).toBe(2);
    const selSql = String(queryMock.mock.calls[0][0]);
    expect(selSql).toContain('sc.invoice_id IS NULL');
    expect(selSql).toContain('AND sc.id = $3::uuid');
  });
});
