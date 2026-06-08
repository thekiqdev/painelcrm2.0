import { describe, it, expect, vi } from 'vitest';
import { scheduleBillingNotificationSideEffect } from './billingNotificationFlush.js';

describe('scheduleBillingNotificationSideEffect', () => {
  it('does not leave an unhandled rejection when fn fails', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    scheduleBillingNotificationSideEffect('test.fail', async () => {
      throw new Error('simulated db failure');
    });

    await new Promise((r) => setTimeout(r, 50));
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toHaveLength(0);
  });

  it('logs and swallows errors from fn', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    scheduleBillingNotificationSideEffect('test.logged', async () => {
      throw new Error('logged failure');
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
