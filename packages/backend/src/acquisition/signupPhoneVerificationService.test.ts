import { describe, expect, it } from 'vitest';
import { parseSignupPhone } from './signupPhoneVerificationService.js';

describe('parseSignupPhone', () => {
  it('parses national BR mobile', () => {
    const parsed = parseSignupPhone('11987654321');
    expect(parsed).toEqual({
      ddi: '55',
      phone: '11987654321',
      dialDigits: expect.any(String),
    });
  });

  it('parses E.164-style digits with country code', () => {
    const parsed = parseSignupPhone('5511987654321');
    expect(parsed?.ddi).toBe('55');
    expect(parsed?.phone).toBe('11987654321');
  });

  it('rejects short numbers', () => {
    expect(parseSignupPhone('1198765')).toBeNull();
  });
});
