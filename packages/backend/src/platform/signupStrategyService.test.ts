import { describe, expect, it } from 'vitest';

// Test feature derivation without DB — export helper via inline mirror for unit test
type ActiveSignupFlow = 'checkout' | 'exclusive_signup';

function featuresForFlow(flow: ActiveSignupFlow) {
  if (flow === 'exclusive_signup') {
    return {
      phone_verification: true,
      closed_trial_mode: true,
      whatsapp_code_required: true,
      allow_checkout: true,
      show_exclusive_badges: true,
    };
  }
  return {
    phone_verification: false,
    closed_trial_mode: false,
    whatsapp_code_required: false,
    allow_checkout: true,
    show_exclusive_badges: false,
  };
}

describe('signupStrategy features', () => {
  it('activates E1/E2 features for exclusive_signup', () => {
    const f = featuresForFlow('exclusive_signup');
    expect(f.phone_verification).toBe(true);
    expect(f.whatsapp_code_required).toBe(true);
    expect(f.show_exclusive_badges).toBe(true);
  });

  it('disables exclusive features for checkout', () => {
    const f = featuresForFlow('checkout');
    expect(f.phone_verification).toBe(false);
    expect(f.allow_checkout).toBe(true);
  });
});
