import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  emitBillingJobTrace,
  runWithBillingJobTraceContext,
  traceBillingJobPhase,
} from './billingJobLifecycleTrace.js';

describe('billingJobLifecycleTrace', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    vi.stubEnv('BILLING_JOB_LIFECYCLE_TRACE', 'true');
    logSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('emite prefixo [BILLING_JOB_TRACE]', () => {
    emitBillingJobTrace('test_event', { foo: 'bar' });
    expect(logSpy).toHaveBeenCalledOnce();
    const line = String(logSpy.mock.calls[0][0]);
    expect(line).toBe('[BILLING_JOB_TRACE]');
    const payload = JSON.parse(String(logSpy.mock.calls[0][1]));
    expect(payload.event).toBe('test_event');
    expect(payload.foo).toBe('bar');
    expect(payload.ts).toBeTruthy();
  });

  it('propaga correlation_id no AsyncLocalStorage', async () => {
    await runWithBillingJobTraceContext(
      {
        correlation_id: 'corr-1',
        worker_id: 'w1',
        subscription_id: 'sub-1',
        job_id: 'job-1',
        execution_mode: 'manual',
      },
      async () => {
        traceBillingJobPhase('inside_context');
      }
    );
    const payload = JSON.parse(String(logSpy.mock.calls[0][1]));
    expect(payload.correlation_id).toBe('corr-1');
    expect(payload.worker_id).toBe('w1');
    expect(payload.job_id).toBe('job-1');
  });
});
