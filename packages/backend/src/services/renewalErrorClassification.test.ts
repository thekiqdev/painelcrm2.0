import { describe, it, expect } from 'vitest';
import {
  classifyRenewalError,
  isPermanentRenewalError,
  shouldRetryRenewalError,
  renewalHardeningError,
} from './renewalErrorClassification.js';

describe('renewalErrorClassification', () => {
  it('customer_id ausente é permanente', () => {
    const err = new Error('Subscription customer sem customer_id (client_id)');
    const c = classifyRenewalError(err);
    expect(c.category).toBe('CONFIGURATION_ERROR');
    expect(c.permanent).toBe(true);
    expect(isPermanentRenewalError(err)).toBe(true);
    expect(shouldRetryRenewalError(err, 1, 3)).toBe(false);
  });

  it('fatura anterior ausente é permanente', () => {
    const c = classifyRenewalError(new Error('Fatura anterior não encontrada'));
    expect(c.category).toBe('DATA_INCONSISTENCY');
    expect(c.permanent).toBe(true);
  });

  it('timeout é transitório com retry', () => {
    const c = classifyRenewalError(new Error('connection timeout ECONNRESET'));
    expect(c.category).toBe('TRANSIENT');
    expect(c.permanent).toBe(false);
    expect(shouldRetryRenewalError(c, 1, 3)).toBe(true);
    expect(shouldRetryRenewalError(c, 3, 3)).toBe(false);
  });

  it('gateway error retenta', () => {
    const c = classifyRenewalError(new Error('gateway createCharge failed'));
    expect(c.category).toBe('GATEWAY_ERROR');
    expect(shouldRetryRenewalError(c, 2, 3)).toBe(true);
  });

  it('RenewalHardeningError preserva classificação', () => {
    const err = renewalHardeningError('x', 'test', 'CONFIGURATION_ERROR');
    expect(classifyRenewalError(err).reason_code).toBe('test');
  });
});
