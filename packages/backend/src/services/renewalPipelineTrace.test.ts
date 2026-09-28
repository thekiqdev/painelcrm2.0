import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MANUAL_JOB_PREPARE_STATUSES_SQL,
  runWithRenewalPipeline,
  traceRenewalPipelineStage,
} from './renewalPipelineTrace.js';

describe('renewalPipelineTrace', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('MANUAL_JOB_PREPARE_STATUSES_SQL inclui processing', () => {
    expect(MANUAL_JOB_PREPARE_STATUSES_SQL).toContain('processing');
    expect(MANUAL_JOB_PREPARE_STATUSES_SQL).toContain('pending');
    expect(MANUAL_JOB_PREPARE_STATUSES_SQL).toContain('failed');
  });

  it('emite [RENEWAL_PIPELINE] com correlation_id', async () => {
    await runWithRenewalPipeline(
      {
        correlation_id: 'corr-test',
        subscription_id: 'sub-1',
        job_id: null,
        invoice_id: null,
        cycle_key: null,
        execution_mode: 'manual',
      },
      async () => {
        traceRenewalPipelineStage('READINESS', { ready: true });
      }
    );
    expect(logSpy).toHaveBeenCalled();
    const payload = JSON.parse(String(logSpy.mock.calls[0][1]));
    expect(payload.stage).toBe('READINESS');
    expect(payload.correlation_id).toBe('corr-test');
  });
});
