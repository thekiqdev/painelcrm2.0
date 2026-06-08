import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expireTrialsPastDue } from '../services/subscriptionService.js';
import { runTrialExpirationOnce, TRIAL_EXPIRATION_INTERVAL_MS } from './trialExpirationJob.js';

vi.mock('../services/subscriptionService.js', () => ({
  expireTrialsPastDue: vi.fn(),
}));

describe('trialExpirationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa expireTrialsPastDue como única rotina', async () => {
    vi.mocked(expireTrialsPastDue).mockResolvedValue({
      suspended: 2,
      lifecycle_events: 2,
      promotions_executed: 2,
    });

    const result = await runTrialExpirationOnce();

    expect(expireTrialsPastDue).toHaveBeenCalledTimes(1);
    expect(result.suspended).toBe(2);
  });

  it('intervalo fixo de 1 hora', () => {
    expect(TRIAL_EXPIRATION_INTERVAL_MS).toBe(3_600_000);
  });
});
