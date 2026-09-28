import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSignupEntryCache,
  invalidateSignupCaches,
  loadSignupEntryConfig,
  SIGNUP_CACHE_EPOCH_KEY,
} from './signupEntry';
import {
  clearSignupStrategyCache,
  getCachedSignupStrategy,
  isSignupSessionCacheValid,
  loadSignupStrategy,
  SIGNUP_CACHE_EPOCH_KEY as STRATEGY_EPOCH_KEY,
} from './signupStrategy';

describe('signup cache invalidation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearSignupStrategyCache();
    clearSignupEntryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks session cache stale after invalidateSignupCaches', () => {
    sessionStorage.setItem('painelcrm_signup_strategy_v1', JSON.stringify({
      flow: 'exclusive_signup',
      entry_url: '/cadastro',
      closed_trial: true,
      features: {},
    }));
    sessionStorage.setItem('painelcrm_signup_strategy_session_epoch', '0');
    localStorage.setItem(STRATEGY_EPOCH_KEY, '0');

    expect(isSignupSessionCacheValid()).toBe(true);

    invalidateSignupCaches();

    expect(isSignupSessionCacheValid()).toBe(false);
    expect(sessionStorage.getItem('painelcrm_signup_strategy_v1')).toBeNull();
    expect(getCachedSignupStrategy().entry_url).toBe('/checkout');
  });

  it('bumps epoch key for cross-tab invalidation', () => {
    invalidateSignupCaches();
    const epoch = localStorage.getItem(SIGNUP_CACHE_EPOCH_KEY);
    expect(epoch).toBeTruthy();
    expect(epoch).not.toBe('0');
  });
});
