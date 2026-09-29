import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkDomainVerifyRateLimit,
  resetDomainVerifyRateLimitStore,
} from './domainVerifyRateLimit.js';

describe('domainVerifyRateLimit', () => {
  beforeEach(() => {
    resetDomainVerifyRateLimitStore();
    delete process.env.RATE_LIMIT_DOMAIN_VERIFY_MAX;
  });

  it('permite até 5 por chave', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkDomainVerifyRateLimit('tenant:t1')).toBe(true);
    }
    expect(checkDomainVerifyRateLimit('tenant:t1')).toBe(false);
  });

  it('chaves isoladas', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkDomainVerifyRateLimit('tenant:a')).toBe(true);
    }
    expect(checkDomainVerifyRateLimit('tenant:b')).toBe(true);
  });
});
