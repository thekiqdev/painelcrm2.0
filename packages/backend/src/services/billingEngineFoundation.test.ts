import { describe, it, expect, vi } from 'vitest';
import { traceNotification } from './notificationTrace.js';
import { classifyBillingRenewalError, logBillingRenewalError } from './billingRenewalError.js';

describe('notificationTrace', () => {
  it('emite NOTIFICATION_QUEUE', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    traceNotification({
      event: 'NOTIFICATION_QUEUE',
      invoice_id: 'inv-1',
      channel: 'whatsapp',
      attempt: 1,
    });
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls[0][1]));
    expect(payload.event).toBe('NOTIFICATION_QUEUE');
    spy.mockRestore();
  });
});

describe('billingRenewalError', () => {
  it('classifica erro de customer', () => {
    const err = classifyBillingRenewalError({
      error_code: 'customer_missing',
      reason: 'Cliente não encontrado',
      stage: 'CUSTOMER',
      correlation_id: 'c1',
    });
    expect(err.classification).toBe('customer');
    expect(err.severity).toBe('critical');
  });

  it('logBillingRenewalError não lança', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logBillingRenewalError(
      classifyBillingRenewalError({
        error_code: 'gateway_timeout',
        reason: 'timeout',
        stage: 'GATEWAY',
      })
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
